import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import sharp from "sharp";
import { Tokenizer } from "@huggingface/tokenizers";
import * as ort from "onnxruntime-node";
import { IMAGE_DIMENSION, IMAGE_MODEL, TEXT_DIMENSION, TEXT_MODEL } from "@inkling/contracts/jobs";
import { downloadModelAsset, hasSha256, type ModelAsset } from "./model-assets.ts";
import models from "./model-manifest.json" with { type: "json" };
import { startTextInference } from "./text-inference.ts";
import { sharpImageInput, validateImageDimensions } from "./thumbnail.ts";

const maxTokens = 8192;
const documentLaneIdleMillis = 30_000;
const imageEdge = 224;
const imageMean = [0.4814547, 0.4578275, 0.4082107];
const imageStd = [0.26862954, 0.2613026, 0.2757771];

type TokenizerLike = {
  encode(
    text: string,
    options: { return_token_type_ids: boolean },
  ): { ids: number[]; token_type_ids?: number[] };
};

async function ensureAsset(
  path: string,
  asset: ModelAsset,
  allowDownload: boolean,
  bundledPath?: string,
) {
  if (await hasSha256(path, asset.sha256)) return path;
  if (bundledPath && (await hasSha256(bundledPath, asset.sha256))) return bundledPath;
  if (!allowDownload) throw new Error("model assets are unavailable for search");
  return downloadModelAsset(path, asset);
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

// Text longer than the model's window is split into windows that each keep the
// opening and closing special tokens. At most maxWindows are embedded (about
// 65k tokens), so a book-length text cannot hold the jobs worker for minutes.
const maxWindows = 8;
const windowed = (values: number[]) => {
  if (values.length <= maxTokens) return [values];
  const first = values[0] ?? 0;
  const last = values.at(-1) ?? 0;
  const body = values.slice(1, -1);
  const step = maxTokens - 2;
  const windows: number[][] = [];
  for (let start = 0; start < body.length && windows.length < maxWindows; start += step)
    windows.push([first, ...body.slice(start, start + step), last]);
  return windows;
};

function textTokenWindows(tokenizer: TokenizerLike, text: string) {
  const encoding = tokenizer.encode(text, { return_token_type_ids: true });
  if (encoding.ids.length === 0) throw new Error("Nomic tokenizer produced no tokens");
  const typeIds = windowed(encoding.token_type_ids ?? new Array(encoding.ids.length).fill(0));
  return windowed(encoding.ids).map((ids, index) => ({
    ids,
    typeIds: typeIds[index],
    mask: ids.map(() => 1),
  }));
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

type TextRuntime = { tokenizer: TokenizerLike; infer: ReturnType<typeof startTextInference> };

export function createEmbeddingEngine(modelCacheDirectory: string, bundledModelDirectory?: string) {
  const modelCache = resolve(modelCacheDirectory);
  const bundledModels = bundledModelDirectory ? resolve(bundledModelDirectory) : null;
  let imageSessionPromise: Promise<ort.InferenceSession> | undefined;

  const modelAsset = (name: string, asset: ModelAsset, allowDownload: boolean) =>
    ensureAsset(
      join(modelCache, name, asset.path),
      asset,
      allowDownload,
      bundledModels ? join(bundledModels, name, asset.path) : undefined,
    );

  async function openTextModel(allowDownload: boolean) {
    const { name, model, tokenizer: tokenizerAsset } = models.text;
    const [modelPath, tokenizerPath] = await Promise.all([
      modelAsset(name, model, allowDownload),
      modelAsset(name, tokenizerAsset, allowDownload),
    ]);
    const tokenizerJson = JSON.parse(await readFile(tokenizerPath, "utf8"));
    const tokenizer = new Tokenizer(tokenizerJson, {});
    return { tokenizer, modelPath };
  }

  // Each lane has its own thread: a search must not queue behind a document's window, which
  // can take a minute, when it has five seconds before it falls back to text alone. Each thread
  // holds 160 MB, so the document lane closes between runs; search stays open to answer at once.
  function textLane(allowDownload: boolean, idleMillis?: number) {
    let runtime: TextRuntime | undefined;
    let opening: Promise<TextRuntime> | undefined;
    return () =>
      runtime ??
      (opening ??= openTextModel(allowDownload)
        .then(({ tokenizer, modelPath }) => {
          // A stopped thread answers nothing more, so the next embedding opens a new one.
          const started: TextRuntime = {
            tokenizer,
            infer: startTextInference(
              modelPath,
              () => {
                if (runtime === started) runtime = undefined;
              },
              { idleMillis },
            ),
          };
          runtime = started;
          return started;
        })
        .finally(() => {
          opening = undefined;
        }));
  }
  const documentLane = textLane(true, documentLaneIdleMillis);
  const queryLane = textLane(false);

  async function openImageSession() {
    const { name, model } = models.image;
    // Only indexing embeds images, and it runs several jobs at once beside the OCR
    // workers: two threads each beat one call holding every core. Vectors are unchanged.
    return ort.InferenceSession.create(await modelAsset(name, model, true), {
      intraOpNumThreads: 2,
    });
  }

  async function embedText(text: string, prefix = "search_document:", lane = documentLane) {
    const content = text.trim();
    if (!content || !hasEmbeddableCharacters(content))
      throw new Error("text contains no embeddable characters");
    const { tokenizer, infer } = await lane();
    // Mean of every token's state across all windows; one window is the plain mean pool.
    const vector = new Float32Array(TEXT_DIMENSION);
    let tokens = 0;
    for (const window of textTokenWindows(tokenizer, `${prefix} ${content}`)) {
      const { ids } = window;
      const { dims, data: hiddenData } = await infer(window);
      if (
        !hiddenData ||
        dims?.length !== 3 ||
        dims[0] !== 1 ||
        dims[1] !== ids.length ||
        dims[2] !== TEXT_DIMENSION
      ) {
        throw new Error(`Nomic text output has unexpected shape ${JSON.stringify(dims)}`);
      }
      for (let tokenIndex = 0; tokenIndex < ids.length; tokenIndex += 1) {
        const offset = tokenIndex * TEXT_DIMENSION;
        for (let dimension = 0; dimension < TEXT_DIMENSION; dimension += 1) {
          vector[dimension] += hiddenData[offset + dimension];
        }
      }
      tokens += ids.length;
    }
    for (let index = 0; index < vector.length; index += 1) {
      vector[index] = Math.fround(vector[index] / tokens);
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
    embedQuery: (text: string) => embedText(text, "search_query:", queryLane),
    embedImage,
  };
}

export { floatVectorBytes, layerNormalize, l2Normalize, textTokenWindows };
