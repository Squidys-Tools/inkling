import { extname } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";

// Source runs as .ts under Bun and as bundled .mjs in the app; the worker sits beside it either way.
const workerUrl = new URL(
  `./sqlite-snapshot-worker${extname(fileURLToPath(import.meta.url))}`,
  import.meta.url,
);

export function snapshotDatabase(databasePath: string, snapshotPath: string) {
  return new Promise<void>((resolve, reject) => {
    const worker = new Worker(workerUrl, {
      workerData: { databasePath, snapshotPath },
    });
    let result: { ok?: boolean } | undefined;
    let settled = false;
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    worker.once("message", (message: { ok?: boolean; error?: string }) => {
      if (message.error) fail(new Error(message.error));
      else result = message;
    });
    worker.once("error", fail);
    worker.once("exit", (code) => {
      if (settled) return;
      settled = true;
      if (code !== 0) reject(new Error(`SQLite snapshot worker exited with code ${code}`));
      else if (result?.ok !== true)
        reject(new Error("SQLite snapshot worker exited without a result"));
      else resolve();
    });
  });
}
