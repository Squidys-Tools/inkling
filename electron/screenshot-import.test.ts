import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { constants, openSync, closeSync } from "node:fs";
import { mkdtemp, mkdir, readFile, rm, symlink, truncate, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createScreenshotImporter } from "./screenshot-import.ts";
import { openTestLibrary } from "./storage/test-library.ts";

const pause = (ms: number) => new Promise((done) => setTimeout(done, ms));
async function until(check: () => Promise<boolean>) {
  const start = Date.now();
  while (Date.now() - start < 4000) {
    if (await check()) return;
    await pause(20);
  }
  throw new Error("Screenshot assertion timed out");
}
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "inkling-screenshot-import-"));
  const directory = join(root, "Screenshots");
  await mkdir(directory);
  const library = await openTestLibrary(join(root, "library.sqlite3"));
  const options = {
    preferencesPath: join(root, "preferences.json"),
    defaultDirectory: directory,
    pollMillis: 25,
    save: async (input: { id: string; fileName: string; kind: "image"; bytes: Buffer }) => {
      if (await library.getItem(input.id)) return false;
      await library.saveFile(input);
      return true;
    },
  };
  return { root, directory, library, options };
}

test.skipIf(process.platform === "win32")(
  "a regular file replaced by a FIFO cannot block Off or shutdown",
  async () => {
    for (const action of ["off", "close"] as const) {
      const root = await mkdtemp(join(tmpdir(), "inkling-screenshot-fifo-"));
      const directory = join(root, "Screenshots");
      await mkdir(directory);
      const path = join(directory, "swap.png");
      let saves = 0;
      const importer = createScreenshotImporter({
        preferencesPath: join(root, "preferences.json"),
        defaultDirectory: directory,
        pollMillis: 1000000,
        save: async () => {
          saves++;
          return true;
        },
      });
      let operation: Promise<unknown> | undefined;
      let scan: Promise<unknown> | undefined;
      try {
        await importer.configure(true);
        await importer.scanNow();
        await writeFile(path, "regular candidate before stabilization");
        scan = importer.scanNow();
        await pause(30);
        await rm(path);
        execFileSync("mkfifo", [path]);
        await pause(200);
        operation = action === "off" ? importer.configure(false) : importer.close();
        const completed = await Promise.race([
          Promise.all([scan, operation]).then(() => true),
          pause(500).then(() => false),
        ]);
        expect(completed).toBe(true);
        expect(saves).toBe(0);
        if (action === "off") expect((await importer.getState()).enabled).toBe(false);
      } finally {
        // Cleanup only: a failing old-version regression must not strand its FIFO reader.
        // The assertion above must finish without this writer being opened.
        try {
          const fd = openSync(path, constants.O_WRONLY | constants.O_NONBLOCK);
          closeSync(fd);
        } catch (error) {
          if (!["ENOENT", "ENXIO"].includes((error as NodeJS.ErrnoException).code ?? ""))
            throw error;
        }
        await scan;
        await operation;
        await importer.close();
        await rm(root, { recursive: true, force: true });
      }
    }
  },
);

test("off by default, enable skips old files, new screenshots save once and Off ignores its interval", async () => {
  const f = await fixture();
  const importer = createScreenshotImporter(f.options);
  try {
    expect((await importer.getState()).enabled).toBe(false);
    await writeFile(join(f.directory, "existing.png"), "old pixels");
    await importer.scanNow();
    expect((await f.library.listActiveItems()).length).toBe(0);
    await importer.configure(true);
    await writeFile(join(f.directory, "new.png"), "new screenshot pixels");
    await until(async () => (await f.library.listActiveItems()).length === 1);
    await writeFile(join(f.directory, "same-pixels.png"), "new screenshot pixels");
    await pause(300);
    expect((await f.library.listActiveItems()).length).toBe(1);
    const item = (await f.library.listActiveItems())[0];
    await f.library.archiveItem(item.id);
    await writeFile(join(f.directory, "same-again.png"), "new screenshot pixels");
    await pause(300);
    expect((await f.library.getItem(item.id))?.archived).toBe(true);
    expect((await f.library.listActiveItems()).length).toBe(0);
    await importer.configure(false);
    await writeFile(join(f.directory, "while-off.png"), "private off period pixels");
    await importer.scanNow();
    await importer.configure(true);
    await pause(200);
    expect((await f.library.listActiveItems()).length).toBe(0);
    await writeFile(join(f.directory, "after-on.png"), "post reenable pixels");
    await until(async () => (await f.library.listActiveItems()).length === 1);
    expect(JSON.parse(await readFile(f.options.preferencesPath, "utf8")).enabled).toBe(true);
  } finally {
    await importer.close();
    await f.library.close();
    await rm(f.root, { recursive: true, force: true });
  }
});

test("enabled restart imports offline arrivals without reimporting committed files; Off restart stays off", async () => {
  const f = await fixture();
  let importer = createScreenshotImporter(f.options);
  try {
    await importer.configure(true);
    await writeFile(join(f.directory, "one.png"), "one");
    await until(async () => (await f.library.listActiveItems()).length === 1);
    await importer.close();
    await writeFile(join(f.directory, "two.png"), "two");
    importer = createScreenshotImporter(f.options);
    expect((await importer.getState()).enabled).toBe(true);
    await until(async () => (await f.library.listActiveItems()).length === 2);
    expect((await f.library.listActiveItems()).map((x) => x.title).sort()).toEqual([
      "one.png",
      "two.png",
    ]);
    await importer.configure(false);
    await importer.close();
    await writeFile(join(f.directory, "three.png"), "three");
    importer = createScreenshotImporter(f.options);
    expect((await importer.getState()).enabled).toBe(false);
    await importer.scanNow();
    expect((await f.library.listActiveItems()).length).toBe(2);
  } finally {
    await importer.close();
    await f.library.close();
    await rm(f.root, { recursive: true, force: true });
  }
});

test("links, oversize, hidden and non-image files are ignored; a rejected image does not block the next one", async () => {
  const f = await fixture();
  const importer = createScreenshotImporter({
    ...f.options,
    save: async (input) => {
      if (input.fileName === "bad.png") throw new Error("Invalid image header");
      return f.options.save(input);
    },
  });
  try {
    await importer.configure(true);
    const external = join(f.root, "private.png");
    await writeFile(external, "outside screenshot folder");
    await symlink(external, join(f.directory, "link.png"));
    await writeFile(join(f.directory, "big.png"), "");
    await truncate(join(f.directory, "big.png"), 50 * 1024 * 1024 + 1);
    await writeFile(join(f.directory, ".temp.png"), "hidden");
    await writeFile(join(f.directory, "note.txt"), "not an image");
    await writeFile(join(f.directory, "bad.png"), "rejected");
    await writeFile(join(f.directory, "good.png"), "valid accepted pixels");
    await until(async () => (await f.library.listActiveItems()).length === 1);
    expect((await f.library.listActiveItems())[0].title).toBe("good.png");
    // The SQLite commit precedes the scan's checkpoint/status publication.
    await importer.scanNow();
    expect((await importer.getState()).status).toBe("error");
  } finally {
    await importer.close();
    await f.library.close();
    await rm(f.root, { recursive: true, force: true });
  }
});

test("disable drains a held save, fences a concurrent setting change, and stops new admission", async () => {
  const f = await fixture();
  let release!: () => void;
  let entered!: () => void;
  const held = new Promise<void>((done) => {
    release = done;
  });
  const started = new Promise<void>((done) => {
    entered = done;
  });
  let active = 0,
    peak = 0;
  const importer = createScreenshotImporter({
    ...f.options,
    save: async (input) => {
      peak = Math.max(peak, ++active);
      entered();
      await held;
      try {
        return await f.options.save(input);
      } finally {
        active--;
      }
    },
  });
  try {
    await importer.configure(true);
    await writeFile(join(f.directory, "held.png"), "held screenshot");
    await started;
    const off = importer.configure(false);
    await pause(10);
    await expect(importer.configure(true)).rejects.toThrow("already changing");
    release();
    expect((await off).enabled).toBe(false);
    await writeFile(join(f.directory, "after-off.png"), "not permitted");
    await importer.scanNow();
    expect((await f.library.listActiveItems()).length).toBe(1);
    expect(peak).toBe(1);
    expect(JSON.parse(await readFile(f.options.preferencesPath, "utf8")).enabled).toBe(false);
  } finally {
    release();
    await importer.close();
    await f.library.close();
    await rm(f.root, { recursive: true, force: true });
  }
});

test("missing folder and corrupted preferences fail closed", async () => {
  const f = await fixture();
  let importer = createScreenshotImporter(f.options);
  try {
    await expect(importer.configure(true, join(f.root, "missing"))).rejects.toThrow();
    expect((await importer.getState()).enabled).toBe(false);
    await importer.close();
    await writeFile(f.options.preferencesPath, "not-json");
    importer = createScreenshotImporter(f.options);
    const state = await importer.getState();
    expect(state.enabled).toBe(false);
    expect(state.status).toBe("error");
    await writeFile(join(f.directory, "secret.png"), "not allowed while off");
    await importer.scanNow();
    expect((await f.library.listActiveItems()).length).toBe(0);
  } finally {
    await importer.close();
    await f.library.close();
    await rm(f.root, { recursive: true, force: true });
  }
});
