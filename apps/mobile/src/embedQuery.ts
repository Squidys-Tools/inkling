import { Tokenizer } from "@huggingface/tokenizers";
import { File, Paths } from "expo-file-system";
import InklingNative from "../modules/inkling-native/src/InklingNativeModule";

// Must stay identical to packages/jobs/src/embeddings.ts so phone queries land in the
// same vector space as desktop documents: prefix, mean pool, layer norm, then L2.
const TEXT_DIMENSION = 768;

let tokenizer: Promise<Tokenizer> | undefined;

const modelFile = () =>
  new File(Paths.document, "models/nomic-embed-text-v1.5/onnx/model_int8.onnx");
const tokenizerFile = () => new File(Paths.document, "models/nomic-embed-text-v1.5/tokenizer.json");

export const modelInstalled = () => modelFile().exists && tokenizerFile().exists;

function openTokenizer() {
  return (tokenizer ??= tokenizerFile()
    .text()
    .then((json) => new Tokenizer(JSON.parse(json), {}))
    .catch((error) => {
      tokenizer = undefined;
      throw error;
    }));
}

export async function embedQuery(text: string) {
  const encoding = (await openTokenizer()).encode(`search_query: ${text.trim()}`, {
    return_token_type_ids: true,
  });
  const ids = encoding.ids;
  const hidden = await InklingNative.textHiddenStates(
    decodeURI(modelFile().uri.replace("file://", "")),
    ids,
    encoding.token_type_ids ?? ids.map(() => 0),
  );
  const vector = new Float32Array(TEXT_DIMENSION);
  for (let token = 0; token < ids.length; token += 1)
    for (let d = 0; d < TEXT_DIMENSION; d += 1) vector[d] += hidden[token * TEXT_DIMENSION + d];
  for (let d = 0; d < TEXT_DIMENSION; d += 1) vector[d] = Math.fround(vector[d] / ids.length);
  layerNormalize(vector);
  l2Normalize(vector);
  return vector;
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
