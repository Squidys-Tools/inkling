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
    let ok = false;
    worker.once("message", (message: { ok?: boolean; error?: string }) => {
      if (message.error) reject(new Error(message.error));
      else ok = message.ok === true;
    });
    worker.once("error", reject);
    worker.once("exit", (code) => {
      if (code !== 0) reject(new Error(`SQLite snapshot worker exited with code ${code}`));
      else if (!ok) reject(new Error("SQLite snapshot worker exited without a result"));
      else resolve();
    });
  });
}
