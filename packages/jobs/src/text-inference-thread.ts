import { parentPort, workerData } from "node:worker_threads";
import * as ort from "onnxruntime-node";
import type { TextInferenceRequest, TextInferenceResponse } from "./text-inference.ts";

const { modelPath } = workerData as { modelPath: string };
const session = await ort.InferenceSession.create(modelPath, {
  // Documents vary in length, so an arena would keep the peak of the longest one.
  enableCpuMemArena: false,
  // A long window takes 33 s on four threads and 31 s on twelve; the rest starve every other job.
  intraOpNumThreads: 4,
});
const tensor = (values: number[]) =>
  new ort.Tensor(
    "int64",
    BigInt64Array.from(values, (value) => BigInt(value)),
    [1, values.length],
  );

parentPort?.on("message", async ({ id, ids, typeIds, mask }: TextInferenceRequest) => {
  let response: TextInferenceResponse;
  try {
    const output = await session.run({
      input_ids: tensor(ids),
      token_type_ids: tensor(typeIds),
      attention_mask: tensor(mask),
    });
    const hidden = output.last_hidden_state as ort.Tensor | undefined;
    response = { id, dims: hidden?.dims, data: hidden?.data as Float32Array | undefined };
  } catch (error) {
    response = { id, error: error instanceof Error ? error.message : String(error) };
  }
  parentPort?.postMessage(response);
});
