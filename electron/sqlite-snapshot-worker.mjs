import { parentPort, workerData } from "node:worker_threads";
import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync(workerData.databasePath);
try {
  db.exec("PRAGMA busy_timeout = 5000");
  db.prepare("VACUUM INTO ?").run(workerData.snapshotPath);
  parentPort.postMessage({ ok: true });
} catch (error) {
  parentPort.postMessage({ error: String(error) });
} finally {
  db.close();
}
