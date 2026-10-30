import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rename, rm, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import sharp from "sharp";
import { Tokenizer } from "@huggingface/tokenizers";
import * as ort from "onnxruntime-node";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { IMAGE_DIMENSION, IMAGE_MODEL, TEXT_DIMENSION, TEXT_MODEL } from "./embedding-contract.ts";
import models from "./model-manifest.json" with { type: "json" };
import { sharpImageInput, validateImageDimensions } from "./thumbnail.ts";

const maxTokens = 8192;
const imageEdge = 224;
const imageMean = [0.4814547, 0.4578275, 0.4082107];
const imageStd = [0.26862954, 0.2613026, 0.2757771];

type ModelAsset = { path: string; url: string; sha256: string };
type TokenizerLike = {
  encode(
    text: string,
    options: { return_token_type_ids: boolean },
  ): { ids: number[]; token_type_ids?: number[] };
};

async function sha256(path: string) {
  const hash = createHash("sha256");
  await pipeline(createReadStream(path), hash);
  return hash.digest("hex");
}

export async function ensureAsset(
  path: string,
  { url, sha256: expectedHash }: ModelAsset,
  allowDownload: boolean,
  bundledPath?: string,
) {
  const cachedAssetExists = await stat(path).then(
    () => true,
    () => false,
  );
  if (cachedAssetExists && (await sha256(path)) === expectedHash) return path;

  if (bundledPath) {
    const bundledAssetExists = await stat(bundledPath).then(
      () => true,
      () => false,
    );
    if (bundledAssetExists && (await sha256(bundledPath)) === expectedHash) return bundledPath;
  }

  if (!allowDownload) throw new Error("model assets are unavailable for search");
  if (cachedAssetExists) await rm(path, { force: true });
  await mkdir(dirname(path), { recursive: true });
  const partialPath = `${path}.${process.pid}.part`;
  try {
    const response = await fetch(url);
    if (!response.ok || !response.body) {
      throw new Error(`model download failed with HTTP ${response.status}`);
    }
    await pipeline(
      Readable.fromWeb(response.body as WebReadableStream<Uint8Array>),
      createWriteStream(partialPath, { flags: "wx" }),
    );
    if ((await sha256(partialPath)) !== expectedHash) {
      throw new Error("model asset failed its SHA-256 check");
    }
    await rename(partialPath, path);
    return path;
  } catch (error) {
    await rm(partialPath, { force: true });
    throw error;
  }
}

function layerNormalize(vector: Float32Array) {
  let sum = 0;
  for (const value of vector) sum = Math.fround(sum + value);
  const mean = Math.fround(sum / vector.length);
  let squaredDifferenceSum = 0;
  for (const value of vector) {
    const difference = Math.fround(value - mean);
    squaredDifferenceSum = Math.fround(squaredDifferenceSum + Math.fround(difference * difference));
  }
  const variance = Math.fround(squaredDifferenceSum / vector.length);
  const scale = Math.fround(Math.sqrt(Math.fround(variance + 1e-12)));
  for (let index = 0; index < vector.length; index += 1) {
    vector[index] = Math.fround((vector[index] - mean) / scale);
  }
}

function l2Normalize(vector: Float32Array) {
  let squaredMagnitude = 0;
  for (const value of vector)
    squaredMagnitude = Math.fround(squaredMagnitude + Math.fround(value * value));
  const magnitude = Math.fround(Math.sqrt(squaredMagnitude));
  if (magnitude > 1.1920928955078125e-7) {
    for (let index = 0; index < vector.length; index += 1) {
      vector[index] = Math.fround(vector[index] / magnitude);
    }
  }
}

function floatVectorBytes(vector: Float32Array) {
  const bytes = Buffer.allocUnsafe(vector.length * Float32Array.BYTES_PER_ELEMENT);
  for (let index = 0; index < vector.length; index += 1) {
    bytes.writeFloatLE(vector[index], index * Float32Array.BYTES_PER_ELEMENT);
  }
  return bytes;
}

// Truncation keeps the final special token, which the model expects at the end.
const truncateTokens = (values: number[]) =>
  values.length > maxTokens ? [...values.slice(0, maxTokens - 1), values.at(-1) ?? 0] : values;

function textTokens(tokenizer: TokenizerLike, text: string) {
  const encoding = tokenizer.encode(text, { return_token_type_ids: true });
  const ids = truncateTokens(encoding.ids);
  const typeIds = truncateTokens(encoding.token_type_ids ?? new Array(encoding.ids.length).fill(0));
  if (ids.length === 0) throw new Error("Nomic tokenizer produced no tokens");
  return { ids, typeIds, mask: ids.map(() => 1) };
}

export function hasEmbeddableCharacters(value: string) {
  return /[\p{L}\p{N}]/u.test(value);
}

async function imageTensor(bytes: Buffer) {
  const input = await sharpImageInput(bytes);
  const { width, height } = await sharp(input, { limitInputPixels: 32_000_000 }).metadata();
  validateImageDimensions(width, height);
  const { data } = await sharp(input, { limitInputPixels: 32_000_000 })
    .rotate()
    .resize(imageEdge, imageEdge, { fit: "cover", kernel: "cubic" })
    .removeAlpha()
    .toColourspace("srgb")
    .raw()
    .toBuffer({ resolveWithObject: true });
  const planeSize = imageEdge * imageEdge;
  const values = new Float32Array(3 * planeSize);
  for (let index = 0; index < planeSize; index += 1) {
    for (let channel = 0; channel < 3; channel += 1) {
      const normalized = data[index * 3 + channel] / 255;
      values[channel * planeSize + index] = (normalized - imageMean[channel]) / imageStd[channel];
    }
  }
  return values;
}

type TextRuntime = { tokenizer: TokenizerLike; session: ort.InferenceSession };

export function createEmbeddingEngine(modelCacheDirectory: string, bundledModelDirectory?: string) {
  const modelCache = resolve(modelCacheDirectory);
  const bundledModels = bundledModelDirectory ? resolve(bundledModelDirectory) : null;
  let textRuntimePromise: Promise<TextRuntime> | undefined;
  let textQueryRuntimePromise: Promise<TextRuntime> | undefined;
  let textRuntime: TextRuntime | undefined;
  let imageSessionPromise: Promise<ort.InferenceSession> | undefined;

  const modelAsset = (name: string, asset: ModelAsset, allowDownload: boolean) =>
    ensureAsset(
      join(modelCache, name, asset.path),
      asset,
      allowDownload,
      bundledModels ? join(bundledModels, name, asset.path) : undefined,
    );

  async function openTextRuntime(allowDownload: boolean): Promise<TextRuntime> {
    const { name, model, tokenizer: tokenizerAsset } = models.text;
    const [modelPath, tokenizerPath] = await Promise.all([
      modelAsset(name, model, allowDownload),
      modelAsset(name, tokenizerAsset, allowDownload),
    ]);
    const tokenizerJson = JSON.parse(await readFile(tokenizerPath, "utf8"));
    const tokenizer = new Tokenizer(tokenizerJson, {});
    const session = await ort.InferenceSession.create(modelPath);
    return { tokenizer, session };
  }

  const keepTextRuntime = (runtime: TextRuntime) => (textRuntime ??= runtime);

  function loadTextRuntime(allowDownload: boolean) {
    if (allowDownload) {
      textRuntimePromise ??= (async () => {
        const cachedRuntime = textQueryRuntimePromise
          ? await textQueryRuntimePromise.catch(() => null)
          : null;
        return cachedRuntime ?? openTextRuntime(true);
      })()
        .then(keepTextRuntime)
        .finally(() => {
          textRuntimePromise = undefined;
        });
      return textRuntimePromise;
    }
    textQueryRuntimePromise ??= openTextRuntime(false)
      .then(keepTextRuntime)
      .catch((error) => {
        textQueryRuntimePromise = undefined;
        throw error;
      });
    return textQueryRuntimePromise;
  }

  async function openImageSession() {
    const { name, model } = models.image;
    return ort.InferenceSession.create(await modelAsset(name, model, true));
  }

  async function embedText(text: string, prefix = "search_document:", allowDownload = true) {
    const content = text.trim();
    if (!content || !hasEmbeddableCharacters(content))
      throw new Error("text contains no embeddable characters");
    const { tokenizer, session } = textRuntime ?? (await loadTextRuntime(allowDownload));
    const { ids, typeIds, mask } = textTokens(tokenizer, `${prefix} ${content}`);
    const tensor = (values: number[]) =>
      new ort.Tensor(
        "int64",
        BigInt64Array.from(values, (value) => BigInt(value)),
        [1, values.length],
      );
    const output = await session.run({
      input_ids: tensor(ids),
      token_type_ids: tensor(typeIds),
      attention_mask: tensor(mask),
    });
    const hidden = output.last_hidden_state as ort.Tensor | undefined;
    if (
      hidden?.dims.length !== 3 ||
      hidden.dims[0] !== 1 ||
      hidden.dims[1] !== ids.length ||
      hidden.dims[2] !== TEXT_DIMENSION
    ) {
      throw new Error(`Nomic text output has unexpected shape ${JSON.stringify(hidden?.dims)}`);
    }
    const vector = new Float32Array(TEXT_DIMENSION);
    const hiddenData = hidden.data as Float32Array;
    for (let tokenIndex = 0; tokenIndex < ids.length; tokenIndex += 1) {
      const offset = tokenIndex * TEXT_DIMENSION;
      for (let dimension = 0; dimension < TEXT_DIMENSION; dimension += 1) {
        vector[dimension] += hiddenData[offset + dimension];
      }
    }
    for (let index = 0; index < vector.length; index += 1) {
      vector[index] = Math.fround(vector[index] / ids.length);
    }
    layerNormalize(vector);
    l2Normalize(vector);
    return { vector, model: TEXT_MODEL, bytes: floatVectorBytes(vector) };
  }

  async function embedImage(bytes: Buffer) {
    if (!bytes.length) throw new Error("cannot embed empty image");
    imageSessionPromise ??= openImageSession().catch((error) => {
      imageSessionPromise = undefined;
      throw error;
    });
    const [session, pixels] = await Promise.all([imageSessionPromise, imageTensor(bytes)]);
    const output = await session.run({
      pixel_values: new ort.Tensor("float32", pixels, [1, 3, imageEdge, imageEdge]),
    });
    const hidden = output.last_hidden_state as ort.Tensor | undefined;
    if (
      hidden?.dims.length !== 3 ||
      hidden.dims[0] !== 1 ||
      hidden.dims[1] < 1 ||
      hidden.dims[2] !== IMAGE_DIMENSION
    ) {
      throw new Error(`Nomic vision output has unexpected shape ${JSON.stringify(hidden?.dims)}`);
    }
    const vector = Float32Array.from((hidden.data as Float32Array).slice(0, IMAGE_DIMENSION));
    l2Normalize(vector);
    return { vector, model: IMAGE_MODEL, bytes: floatVectorBytes(vector) };
  }

  return {
    embedText,
    embedQuery: (text: string) => embedText(text, "search_query:", false),
    embedImage,
  };
}

export { floatVectorBytes, layerNormalize, l2Normalize, textTokens };
