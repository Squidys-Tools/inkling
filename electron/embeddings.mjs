import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, rename, rm, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import sharp from "sharp";
import { Tokenizer } from "@huggingface/tokenizers";
import * as ort from "onnxruntime-node";
import { IMAGE_DIMENSION, IMAGE_MODEL, TEXT_DIMENSION, TEXT_MODEL } from "./embedding-contract.mjs";
import { sharpImageInput, validateImageDimensions } from "./thumbnail.mjs";

const maxTokens = 8192;
const imageEdge = 224;
const imageMean = [0.4814547, 0.4578275, 0.4082107];
const imageStd = [0.26862954, 0.2613026, 0.2757771];
const defaultManifestPath = fileURLToPath(
  new URL("../src-tauri/model-manifest.json", import.meta.url),
);

async function sha256(path) {
  const hash = createHash("sha256");
  await pipeline(createReadStream(path), hash);
  return hash.digest("hex");
}

async function ensureAsset(path, { url, sha256: expectedHash }) {
  if (
    await stat(path).then(
      () => true,
      () => false,
    )
  ) {
    if ((await sha256(path)) === expectedHash) return;
    await rm(path, { force: true });
  }

  await mkdir(dirname(path), { recursive: true });
  const partialPath = `${path}.${process.pid}.part`;
  try {
    const response = await fetch(url);
    if (!response.ok || !response.body) {
      throw new Error(`model download failed with HTTP ${response.status}`);
    }
    await pipeline(
      Readable.fromWeb(response.body),
      createWriteStream(partialPath, { flags: "wx" }),
    );
    if ((await sha256(partialPath)) !== expectedHash) {
      throw new Error("model asset failed its SHA-256 check");
    }
    await rename(partialPath, path);
  } catch (error) {
    await rm(partialPath, { force: true });
    throw error;
  }
}

function layerNormalize(vector) {
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

function l2Normalize(vector) {
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

function floatVectorBytes(vector) {
  const bytes = Buffer.allocUnsafe(vector.length * Float32Array.BYTES_PER_ELEMENT);
  for (let index = 0; index < vector.length; index += 1) {
    bytes.writeFloatLE(vector[index], index * Float32Array.BYTES_PER_ELEMENT);
  }
  return bytes;
}

function textTokens(tokenizer, text) {
  const encoding = tokenizer.encode(text, { return_token_type_ids: true });
  const ids = encoding.ids.slice(0, maxTokens);
  const typeIds = (encoding.token_type_ids ?? new Array(encoding.ids.length).fill(0)).slice(
    0,
    maxTokens,
  );
  if (ids.length === 0) throw new Error("Nomic tokenizer produced no tokens");
  return { ids, typeIds, mask: ids.map(() => 1) };
}

function imageTensor(bytes) {
  return sharpImageInput(bytes).then(async (input) => {
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
  });
}

export function createEmbeddingEngine(modelCacheDirectory, manifestPath = defaultManifestPath) {
  const modelCache = resolve(modelCacheDirectory);
  let manifestPromise;
  let textRuntimePromise;
  let imageSessionPromise;

  async function manifest() {
    manifestPromise ??= readFile(manifestPath, "utf8")
      .then(JSON.parse)
      .catch((error) => {
        manifestPromise = undefined;
        throw error;
      });
    return manifestPromise;
  }

  async function openTextRuntime() {
    const models = await manifest();
    const definition = models.text;
    const modelRoot = join(modelCache, definition.name);
    const modelPath = join(modelRoot, definition.model.path);
    const tokenizerPath = join(modelRoot, definition.tokenizer.path);
    await Promise.all([
      ensureAsset(modelPath, definition.model),
      ensureAsset(tokenizerPath, definition.tokenizer),
    ]);
    const tokenizerJson = JSON.parse(await readFile(tokenizerPath, "utf8"));
    const tokenizer = new Tokenizer(tokenizerJson, {});
    const session = await ort.InferenceSession.create(modelPath);
    return { tokenizer, session };
  }

  async function openImageSession() {
    const models = await manifest();
    const definition = models.image;
    const modelPath = join(modelCache, definition.name, definition.model.path);
    await ensureAsset(modelPath, definition.model);
    return ort.InferenceSession.create(modelPath);
  }

  async function embedText(text, prefix = "search_document:") {
    const content = String(text ?? "").trim();
    if (!content || !/[^\W_]/u.test(content))
      throw new Error("text contains no embeddable characters");
    textRuntimePromise ??= openTextRuntime().catch((error) => {
      textRuntimePromise = undefined;
      throw error;
    });
    const { tokenizer, session } = await textRuntimePromise;
    const { ids, typeIds, mask } = textTokens(tokenizer, `${prefix} ${content}`);
    const tensor = (values) =>
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
    const hidden = output.last_hidden_state;
    if (
      hidden?.dims.length !== 3 ||
      hidden.dims[0] !== 1 ||
      hidden.dims[1] !== ids.length ||
      hidden.dims[2] !== TEXT_DIMENSION
    ) {
      throw new Error(`Nomic text output has unexpected shape ${JSON.stringify(hidden?.dims)}`);
    }
    const vector = new Float32Array(TEXT_DIMENSION);
    for (let tokenIndex = 0; tokenIndex < ids.length; tokenIndex += 1) {
      const offset = tokenIndex * TEXT_DIMENSION;
      for (let dimension = 0; dimension < TEXT_DIMENSION; dimension += 1) {
        vector[dimension] += hidden.data[offset + dimension];
      }
    }
    for (let index = 0; index < vector.length; index += 1) {
      vector[index] = Math.fround(vector[index] / ids.length);
    }
    layerNormalize(vector);
    l2Normalize(vector);
    return { vector, model: TEXT_MODEL, bytes: floatVectorBytes(vector) };
  }

  async function embedImage(bytes) {
    if (!bytes?.length) throw new Error("cannot embed empty image");
    imageSessionPromise ??= openImageSession().catch((error) => {
      imageSessionPromise = undefined;
      throw error;
    });
    const [session, pixels] = await Promise.all([imageSessionPromise, imageTensor(bytes)]);
    const output = await session.run({
      pixel_values: new ort.Tensor("float32", pixels, [1, 3, imageEdge, imageEdge]),
    });
    const hidden = output.last_hidden_state;
    if (
      hidden?.dims.length !== 3 ||
      hidden.dims[0] !== 1 ||
      hidden.dims[1] < 1 ||
      hidden.dims[2] !== IMAGE_DIMENSION
    ) {
      throw new Error(`Nomic vision output has unexpected shape ${JSON.stringify(hidden?.dims)}`);
    }
    const vector = Float32Array.from(hidden.data.slice(0, IMAGE_DIMENSION));
    l2Normalize(vector);
    return { vector, model: IMAGE_MODEL, bytes: floatVectorBytes(vector) };
  }

  return {
    embedText,
    embedQuery: (text) => embedText(text, "search_query:"),
    embedImage,
  };
}

export { floatVectorBytes, layerNormalize, l2Normalize, textTokens };
