import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { enrichmentMethods } from "./storage/enrichment.mjs";
import { exportMethods } from "./storage/export-library.mjs";
import { importMethods } from "./storage/import-library.mjs";
import { itemMethods } from "./storage/items.mjs";
import { JobQueue } from "./storage/jobs.mjs";
import { openDatabase, SCHEMA_VERSION } from "./storage/schema.mjs";
import { searchMethods } from "./storage/search.mjs";
import { spaceMethods } from "./storage/spaces.mjs";

export {
  IMAGE_PALETTE_JOB,
  IMAGE_THUMBNAIL_JOB,
  JOB_LEASE_MILLIS,
  JobQueue,
  JobWorker,
  PDF_THUMBNAIL_JOB,
  URL_ENRICHMENT_JOB,
  VIDEO_POSTER_JOB,
} from "./storage/jobs.mjs";
export { markdownToPlainText } from "./storage/shared.mjs";

export function resolveLibraryDataDirectory({
  executablePath,
  appDataDirectory,
  identifier = "com.inkling.library",
  portable = false,
  overrideDirectory,
}) {
  if (portable) return join(dirname(executablePath), "data");
  if (overrideDirectory) return resolve(overrideDirectory);
  return join(appDataDirectory, identifier);
}

export function openLibraryStorage(databasePath, options = {}) {
  const database = resolve(databasePath);
  mkdirSync(dirname(database), { recursive: true });
  const { db, fts5Enabled } = openDatabase(database);
  db.function("inkling_unicode_lower", { deterministic: true }, (value) =>
    String(value ?? "").toLowerCase(),
  );
  const jobQueue = new JobQueue(db, options.jobQueue);
  const library = new LibraryStorage(database, db, fts5Enabled, jobQueue, options);
  return library;
}

class LibraryStorage {
  constructor(
    databasePath,
    db,
    fts5Enabled,
    jobs,
    { createThumbnail, inspectImage, createSnapshot } = {},
  ) {
    this.databasePath = databasePath;
    this.assetsRoot = join(dirname(databasePath), "assets");
    this.assetsDirectory = join(this.assetsRoot, "items");
    this.db = db;
    this.fts5Enabled = fts5Enabled;
    this.jobs = jobs;
    this.createThumbnail = createThumbnail;
    this.inspectImage = inspectImage;
    this.createSnapshot = createSnapshot;
  }

  status() {
    return {
      databasePath: this.databasePath,
      fts5Enabled: this.fts5Enabled,
      schemaVersion: SCHEMA_VERSION,
    };
  }

  // Rows written through this connection since it opened. The main process is
  // the only writer, so an unchanged count means the library has not changed.
  changeCount() {
    return this.db.prepare("SELECT total_changes() AS changes").get().changes;
  }

  hasCompletedOnboarding() {
    return (
      this.db.prepare("SELECT 1 FROM app_settings WHERE key = 'onboarding_completed'").get() !==
      undefined
    );
  }

  completeOnboarding() {
    this.db
      .prepare(
        "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('onboarding_completed', '1')",
      )
      .run();
  }
}

Object.assign(
  LibraryStorage.prototype,
  itemMethods,
  enrichmentMethods,
  searchMethods,
  spaceMethods,
  exportMethods,
  importMethods,
);
