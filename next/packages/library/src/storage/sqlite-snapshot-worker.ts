import { parentPort, workerData } from "node:worker_threads";
import { DatabaseSync } from "node:sqlite";

const { databasePath, snapshotPath } = workerData as { databasePath: string; snapshotPath: string };
const db = new DatabaseSync(databasePath);
try {
  db.exec("PRAGMA busy_timeout = 5000");
  db.prepare("VACUUM INTO ?").run(snapshotPath);
  parentPort?.postMessage({ ok: true });
} catch (error) {
  parentPort?.postMessage({ error: String(error) });
} finally {
  db.close();
}
