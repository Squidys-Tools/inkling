import { Worker } from "node:worker_threads";

export function snapshotDatabase(databasePath, snapshotPath) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./sqlite-snapshot-worker.mjs", import.meta.url), {
      workerData: { databasePath, snapshotPath },
    });
    let result;
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    worker.once("message", (message) => {
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
