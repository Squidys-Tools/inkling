import { createHash } from "node:crypto";
import { constants, watch, type FSWatcher } from "node:fs";
import {
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import type { ScreenshotImportState } from "@inkling/contracts";

const MAX_BYTES = 50 * 1024 * 1024;
const MAX_FILES = 4096;
const extensions = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const pause = (ms: number) => new Promise((done) => setTimeout(done, ms));
const signature = (info: { size: number; mtimeMs: number; ino: number }) =>
  `${info.ino}:${info.size}:${info.mtimeMs}`;

type Preferences = { enabled: boolean; directory: string; seen: Record<string, string> };
export function createScreenshotImporter({
  preferencesPath,
  defaultDirectory,
  save,
  pollMillis = 2000,
}: {
  preferencesPath: string;
  defaultDirectory: string;
  save: (input: { id: string; fileName: string; kind: "image"; bytes: Buffer }) => Promise<boolean>;
  pollMillis?: number;
}) {
  let preferences: Preferences = { enabled: false, directory: resolve(defaultDirectory), seen: {} };
  let state: ScreenshotImportState = {
    enabled: false,
    directory: preferences.directory,
    status: "off",
    imported: 0,
    message: null,
  };
  let watcher: FSWatcher | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let serial = Promise.resolve();
  let generation = 0;
  let queued = false;
  let closed = false;
  let changing = false;
  let acceptedRoot: string | undefined;
  const snapshot = () => ({ ...state });
  const persist = async (next: Preferences) => {
    await mkdir(dirname(preferencesPath), { recursive: true });
    const temporary = `${preferencesPath}.${process.pid}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify(next) + "\n", { mode: 0o600 });
      await rename(temporary, preferencesPath);
    } finally {
      await rm(temporary, { force: true });
    }
  };
  const files = async () => {
    const entries = await readdir(preferences.directory, { withFileTypes: true });
    if (entries.length > MAX_FILES)
      throw new Error("This folder has too many files. Choose a smaller screenshots folder.");
    const rows: { name: string; stamp: string; size: number }[] = [];
    for (const entry of entries) {
      if (
        !entry.isFile() ||
        entry.name.startsWith(".") ||
        !extensions.has(extname(entry.name).toLowerCase())
      )
        continue;
      try {
        const info = await lstat(join(preferences.directory, entry.name));
        if (info.isFile() && !info.isSymbolicLink())
          rows.push({ name: entry.name, stamp: signature(info), size: info.size });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    return rows;
  };
  const stop = () => {
    generation++;
    watcher?.close();
    watcher = undefined;
    if (timer) clearInterval(timer);
    timer = undefined;
  };
  const failure = (error: unknown) => {
    state.status = (error as NodeJS.ErrnoException).code === "ENOENT" ? "missing-folder" : "error";
    state.message =
      state.status === "missing-folder"
        ? "Screenshots folder not found. Choose a folder to watch."
        : error instanceof Error && error.message.startsWith("This folder")
          ? error.message
          : "Screenshot import could not read or save a file. Check the folder and try again.";
  };
  const scan = async (epoch: number) => {
    if (closed || !preferences.enabled || epoch !== generation) return;
    try {
      const currentRoot = await realpath(preferences.directory);
      if (acceptedRoot && acceptedRoot !== currentRoot)
        throw new Error("Screenshots folder changed its target.");
      acceptedRoot = currentRoot;
      const rows = await files();
      const names = new Set(rows.map((row) => row.name));
      for (const name of Object.keys(preferences.seen))
        if (!names.has(name)) delete preferences.seen[name];
      let rejected = false;
      for (const row of rows) {
        if (closed || epoch !== generation || !preferences.enabled) return;
        if (preferences.seen[row.name] === row.stamp) continue;
        if (row.size <= 0 || row.size > MAX_BYTES) continue;
        try {
          const path = join(preferences.directory, row.name);
          await pause(100);
          if (closed || epoch !== generation || !preferences.enabled) return;
          const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
          try {
            const before = await handle.stat();
            if (!before.isFile() || signature(before) !== row.stamp) continue;
            const bytes = Buffer.alloc(row.size);
            let offset = 0;
            while (offset < bytes.length) {
              const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, offset);
              if (!bytesRead) break;
              offset += bytesRead;
            }
            if (offset !== bytes.length) continue;
            const after = await handle.stat();
            const current = await lstat(path);
            if (
              signature(after) !== row.stamp ||
              signature(current) !== row.stamp ||
              current.isSymbolicLink() ||
              bytes.length !== row.size
            )
              continue;
            if (closed || epoch !== generation || !preferences.enabled) return;
            const id = `screenshot-${createHash("sha256").update(bytes).digest("hex")}`;
            if ((await realpath(preferences.directory)) !== acceptedRoot) continue;
            const added = await save({ id, fileName: row.name, kind: "image", bytes });
            // Content-derived ids let the storage callback reject duplicate delivery
            // if the process stops after the item commit but before this checkpoint.
            const next = { ...preferences, seen: { ...preferences.seen, [row.name]: row.stamp } };
            await persist(next);
            preferences = next;
            if (added) state.imported++;
          } finally {
            await handle.close();
          }
        } catch (error) {
          if (epoch === generation && preferences.enabled) {
            rejected = true;
            failure(error);
          }
        }
      }
      if (epoch === generation && preferences.enabled && !rejected) {
        state.status = "watching";
        state.message = null;
      }
    } catch (error) {
      if (epoch === generation && preferences.enabled) failure(error);
    }
  };
  const schedule = () => {
    if (queued || closed || !preferences.enabled) return;
    queued = true;
    const epoch = generation;
    serial = serial
      .then(() => scan(epoch))
      .finally(() => {
        queued = false;
      });
  };
  const start = () => {
    if (closed || !preferences.enabled) return;
    try {
      watcher = watch(preferences.directory, schedule);
      watcher.on("error", (error) => {
        failure(error);
        watcher?.close();
        watcher = undefined;
      });
    } catch (error) {
      failure(error);
    }
    timer = setInterval(schedule, pollMillis);
    timer.unref();
    schedule();
  };
  const ready = (async () => {
    try {
      const saved = JSON.parse(await readFile(preferencesPath, "utf8"));
      if (
        typeof saved.enabled !== "boolean" ||
        typeof saved.directory !== "string" ||
        !saved.seen ||
        typeof saved.seen !== "object" ||
        Array.isArray(saved.seen)
      )
        throw new Error("Invalid screenshot preferences");
      if (
        Object.keys(saved.seen).length > MAX_FILES ||
        Object.values(saved.seen).some((value) => typeof value !== "string")
      )
        throw new Error("Invalid screenshot checkpoint");
      preferences = {
        enabled: saved.enabled,
        directory: resolve(saved.directory),
        seen: saved.seen,
      };
      state = {
        ...state,
        enabled: preferences.enabled,
        directory: preferences.directory,
        status: preferences.enabled ? "watching" : "off",
      };
      start();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        state.status = "error";
        state.message = "Screenshot preferences could not be read. Import remains off.";
      }
    }
  })();
  return {
    getState: async () => {
      await ready;
      return snapshot();
    },
    configure: async (enabled: boolean, directory?: string) => {
      await ready;
      if (closed) throw new Error("Screenshot importer is closed.");
      if (changing) throw new Error("Screenshot settings are already changing.");
      changing = true;
      stop();
      await serial;
      const before = preferences;
      const next: Preferences = {
        enabled,
        directory: directory ? resolve(directory) : before.directory,
        seen: {},
      };
      preferences = next;
      acceptedRoot = undefined;
      try {
        // Switching on never ingests an existing folder or files created while off.
        if (enabled) {
          acceptedRoot = await realpath(next.directory);
          next.seen = Object.fromEntries((await files()).map((row) => [row.name, row.stamp]));
        }
        await persist(next);
      } catch (error) {
        preferences = before;
        state.enabled = false;
        state.status = "error";
        state.message = "Could not change screenshot import. Check the folder and try again.";
        // Fail closed in this process even if the previous preference was enabled.
        preferences.enabled = false;
        changing = false;
        throw error;
      }
      state = {
        ...state,
        enabled,
        directory: next.directory,
        status: enabled ? "watching" : "off",
        message: null,
      };
      start();
      changing = false;
      return snapshot();
    },
    scanNow: async () => {
      await ready;
      schedule();
      await serial;
      return snapshot();
    },
    close: async () => {
      closed = true;
      stop();
      await ready;
      await serial;
    },
  };
}
