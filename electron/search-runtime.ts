import {
  AutoConfig,
  AutoModel,
  AutoProcessor,
  EmbeddingGemma2Processor,
  Florence2ForConditionalGeneration,
  Florence2Processor,
  RawImage,
  env,
} from "@huggingface/transformers";
import type { PreTrainedModel, Tensor } from "@huggingface/transformers";
import { normalizedVector } from "./search-core.ts";
import sharp from "sharp";
import { sharpImageInput, validateImageDimensions } from "./thumbnail.ts";
import { searchSessionOptions, type SearchDevice } from "./search-device.ts";

export type SearchModelRequest =
  | { kind: "query"; text: string }
  | { kind: "text"; text: string; title?: string }
  | { kind: "image"; bytes: Uint8Array }
  | { kind: "caption"; bytes: Uint8Array };
export function createSearchRuntime(device: SearchDevice = "cpu", textOnly = false) {
  const options = {
    device: "cpu",
    dtype: "q8",
    local_files_only: true,
    session_options: searchSessionOptions(device),
  } as const;
  env.allowRemoteModels = false;
  env.allowLocalModels = true;
  env.useFSCache = false;
  let model: PreTrainedModel | undefined;
  let processor: EmbeddingGemma2Processor | Florence2Processor | undefined;
  let loaded = "";
  const close = async () => {
    await model?.dispose();
    model = undefined;
    processor = undefined;
    loaded = "";
  };
  const run = async (
    directory: string,
    request: SearchModelRequest,
  ): Promise<Float32Array | string> => {
    if (loaded !== directory) {
      await close();
      if (request.kind === "caption") {
        model = await Florence2ForConditionalGeneration.from_pretrained(directory, options);
        processor = (await AutoProcessor.from_pretrained(directory, {
          local_files_only: true,
        })) as Florence2Processor;
      } else {
        const config = await AutoConfig.from_pretrained(directory, { local_files_only: true });
        Object.assign(config, { audio_config: null });
        if (textOnly) Object.assign(config, { vision_config: null });
        model = await AutoModel.from_pretrained(directory, { ...options, config });
        processor = (await AutoProcessor.from_pretrained(directory, {
          local_files_only: true,
        })) as EmbeddingGemma2Processor;
      }
      loaded = directory;
    }
    if (!model || !processor) throw new Error("Search runtime failed to initialize");
    if (request.kind === "caption" || request.kind === "image") {
      const bytes = await sharpImageInput(Buffer.from(request.bytes));
      const { width, height } = await sharp(bytes, { limitInputPixels: 32_000_000 }).metadata();
      validateImageDimensions(width, height);
      const image = await RawImage.fromBlob(new Blob([new Uint8Array(bytes)]));
      if (request.kind === "caption") {
        const captionProcessor = processor as Florence2Processor;
        const captionModel = model as Florence2ForConditionalGeneration;
        const task = "<MORE_DETAILED_CAPTION>";
        const inputs = await captionProcessor(image, captionProcessor.construct_prompts(task));
        const ids = await captionModel.generate({
          ...inputs,
          max_new_tokens: 96,
          do_sample: false,
          num_beams: 1,
        });
        const decoded = captionProcessor.batch_decode(ids as Tensor, {
          skip_special_tokens: false,
        })[0];
        const result = captionProcessor.post_process_generation(
          decoded,
          task,
          image.size,
        ) as Record<string, unknown>;
        const caption = result[task];
        if (typeof caption !== "string" || !caption.trim())
          throw new Error("Caption model returned no description");
        return caption.trim().slice(0, 1200);
      }
      const output = (await model(await (processor as EmbeddingGemma2Processor)(null, image))) as {
        sentence_embedding: Tensor;
      };
      return normalizedVector(output.sentence_embedding.data as Float32Array);
    }
    const text =
      request.kind === "query"
        ? `task: search result | query: ${request.text}`
        : `title: ${request.title?.trim() || "none"} | text: ${request.text}`;
    const output = (await model(
      await (processor as EmbeddingGemma2Processor)(text, null, null, null, {
        truncation: true,
        max_length: 2048,
      }),
    )) as { sentence_embedding: Tensor };
    return normalizedVector(output.sentence_embedding.data as Float32Array);
  };
  return { run, close };
}
