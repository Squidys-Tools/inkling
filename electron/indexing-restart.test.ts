import { expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createAiJobProcessors } from "./ai-jobs.ts";
import { openTestLibrary, type TestLibrary } from "./storage/test-library.ts";

const vector = () => {
  const values = new Float32Array(768);
  values[0] = 1;
  return values;
};

test("a killed indexer resumes unexpired jobs on exclusive startup and reuses its committed image checkpoint", async () => {
  const root = mkdtempSync(join(tmpdir(), "inkling-killed-indexer-"));
  const databasePath = join(root, "library.sqlite3");
  let library: TestLibrary | undefined = await openTestLibrary(databasePath);
  const image = await library.saveFile({
    fileName: "untitled.png",
    bytes: new Uint8Array([1, 2, 3]),
    kind: "image",
  });
  const note = await library.createNote({ title: "Retained note", body: "local original body" });
  await library.close();
  library = undefined;
  const fixture = fileURLToPath(new URL("./fixtures/indexing-restart-child.ts", import.meta.url));
  const child = spawn(process.execPath, [fixture, databasePath], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  const exited = once(child, "exit");
  const errors: Buffer[] = [];
  child.stderr.on("data", (part: Buffer) => errors.push(part));
  let ai: ReturnType<typeof createAiJobProcessors> | undefined;
  try {
    const checkpoint = await new Promise<{
      processing: {
        id: string;
        item_id: string;
        kind: string;
        worker_id: string;
        lease_until: number;
      }[];
      cachedImages: { item_id: string }[];
    }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Indexer checkpoint timed out")), 8000);
      let buffer = "";
      child.stdout.on("data", (part: Buffer) => {
        buffer += part.toString();
        if (buffer.includes("\n")) {
          clearTimeout(timer);
          try {
            resolve(JSON.parse(buffer.slice(0, buffer.indexOf("\n"))));
          } catch (error) {
            reject(error);
          }
        }
      });
      child.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once("exit", (code, signal) => {
        clearTimeout(timer);
        reject(
          new Error(
            `Indexer exited before checkpoint: ${code}/${signal}: ${Buffer.concat(errors)}`,
          ),
        );
      });
    });
    expect(checkpoint.processing).toHaveLength(1);
    expect(checkpoint.processing[0].kind).toBe("generate_embedding");
    expect(checkpoint.processing[0].item_id).toBe(image.id);
    expect(checkpoint.processing[0].lease_until).toBeGreaterThan(Date.now());
    expect(checkpoint.cachedImages).toEqual([{ item_id: image.id }]);
    child.kill("SIGKILL");
    const [code, signal] = await exited;
    expect(code).toBeNull();
    expect(signal).toBe("SIGKILL");

    library = await openTestLibrary(databasePath);
    // No lease-expiry sleep: this is the exclusive startup path used by main.ts.
    expect(await library.jobs.recoverExpired()).toBe(0);
    expect(await library.jobs.recoverAfterExclusiveStartup()).toBe(1);
    const previous = checkpoint.processing[0];
    expect(previous.worker_id.length).toBeGreaterThan(0);
    const successor = "restart-successor";
    expect(previous.worker_id).not.toBe(successor);
    const reclaimed = await library.jobs.claimNext(successor, ["generate_embedding"]);
    expect(reclaimed?.id).toBe(previous.id);
    expect(await library.jobs.complete(previous.id, previous.worker_id)).toBe(false);
    expect(
      library.db.prepare("SELECT status,worker_id FROM jobs WHERE id = ?").get(previous.id),
    ).toEqual({ status: "processing", worker_id: successor });
    expect(await library.jobs.release(previous.id, successor)).toBe(true);
    let imageCalls = 0;
    const calls: string[] = [];
    ai = createAiJobProcessors({
      modelCacheDirectory: join(root, "models"),
      ocr: {
        recognize: async () => {
          calls.push("ocr");
          return "Restart invoice A314";
        },
      },
      searchModels: {
        embedImage: async () => {
          imageCalls++;
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
    const worker = await library.worker({ processors: ai.processors, onIdle: ai.onIdle });
    await worker.drain();
    expect(imageCalls).toBe(0);
    expect(calls).toContain("ocr");
    expect(calls).toContain("caption");
    expect((await library.getItem(image.id))?.ocrText).toBe("Restart invoice A314");
    expect((await library.getItem(note.id))?.body).toBe("local original body");
    expect((await library.getSearchAnnotation(image.id))?.caption).toBe("A cat beside a ball.");
    expect((await library.searchIndexProgress()).ready).toBe(2);
    expect((await library.searchItems("cat")).map((item) => item.id)).toEqual([image.id]);
    expect(await library.jobs.countActive()).toBe(0);
    const jobs = library.db
      .prepare(
        "SELECT id,status,retry_count,worker_id,lease_until FROM jobs WHERE kind != 'image_thumbnail'",
      )
      .all();
    expect(
      jobs.every(
        (job) =>
          job.status === "completed" &&
          job.retry_count === 0 &&
          job.worker_id == null &&
          job.lease_until == null,
      ),
    ).toBe(true);
    const duplicateVectors = library.db
      .prepare(
        "SELECT item_id,kind,chunk_id,COUNT(*) AS n FROM search_vectors GROUP BY item_id,index_version,kind,chunk_id HAVING COUNT(*) > 1",
      )
      .all();
    expect(duplicateVectors).toEqual([]);
    const count = jobs.length;
    await worker.drain();
    expect(
      library.db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE kind != 'image_thumbnail'").get()?.n,
    ).toBe(count);
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    await exited.catch(() => {});
    await ai?.close();
    await library?.close();
    rmSync(root, { recursive: true, force: true });
  }
}, 15000);
