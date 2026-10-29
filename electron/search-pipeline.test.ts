import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createAiJobProcessors } from "./ai-jobs.ts";
import { openTestLibrary } from "./storage/test-library.ts";

const vector = () => {
  const result = new Float32Array(768);
  result[0] = 1;
  return result;
};

test("new capture indexes the image before OCR, idle captions preserve user text, and reindex reuses image bytes", async () => {
  const root = mkdtempSync(join(tmpdir(), "inkling-search-pipeline-"));
  const library = await openTestLibrary(join(root, "library.sqlite3"));
  const calls: string[] = [];
  const ai = createAiJobProcessors({
    modelCacheDirectory: join(root, "models"),
    ocr: {
      recognize: async () => {
        calls.push("ocr");
        return "Exact invoice A314";
      },
    },
    searchModels: {
      embedImage: async () => {
        calls.push("image");
        return vector();
      },
      embedText: async () => {
        calls.push("text");
        return vector();
      },
      embedQuery: async () => vector(),
      caption: async () => {
        calls.push("caption");
        return "A cat beside a ball.";
      },
      close: async () => {},
    },
  });
  try {
    const item = await library.saveFile({
      fileName: "untitled.png",
      bytes: new Uint8Array([1, 2, 3]),
      kind: "image",
    });
    const worker = await library.worker({ processors: ai.processors, onIdle: ai.onIdle });
    await worker.drain();
    expect(calls.indexOf("image")).toBeLessThan(calls.indexOf("ocr"));
    expect(calls.indexOf("caption")).toBeGreaterThan(calls.indexOf("ocr"));
    expect(calls.filter((x) => x === "image")).toHaveLength(1);
    expect((await library.getItem(item.id))?.ocrText).toBe("Exact invoice A314");
    expect((await library.getItem(item.id))?.title).toBe("untitled.png");
    expect((await library.getSearchAnnotation(item.id))?.tags).toContain("cat");
    expect((await library.searchIndexProgress()).ready).toBe(1);
    expect((await library.searchItems("cat")).map((x) => x.id)).toEqual([item.id]);
  } finally {
    await ai.close();
    await library.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("query failure is distinct from no matches and keeps the legacy lane available", async () => {
  const unavailable = async () => {
    throw new Error("models unavailable");
  };
  const legacy = {
    embedQuery: async () => ({ vector: vector(), model: "legacy", bytes: Buffer.alloc(3072) }),
    embedImage: unavailable,
    embedText: unavailable,
  };
  const models = {
    embedQuery: unavailable,
    embedImage: unavailable,
    embedText: unavailable,
    caption: unavailable,
    close: async () => {},
  };
  const ai = createAiJobProcessors({
    modelCacheDirectory: "unused",
    embeddings: legacy,
    searchModels: models,
    ocr: { recognize: async () => "" },
  });
  try {
    const fallback = await ai.queryVectors("cat");
    expect(fallback.status).toBe("fallback");
    expect(fallback.message).toContain("unavailable");
    expect(fallback.vectors.legacy).toHaveLength(768);
    legacy.embedQuery = unavailable;
    const failed = await ai.queryVectors("dog");
    expect(failed.status).toBe("unavailable");
    expect(failed.vectors.current).toBeUndefined();
    expect(failed.message).not.toBeNull();
  } finally {
    await ai.close();
  }
});
