import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

// Drives the update controller against loopback feeds with the real electron-updater:
// SHA-512 download, AppImage replacement and Debian metadata, all in a scratch folder.
// Pass an unpacked Linux app directory to run the packaged module on its Electron runtime.
const root = resolve(import.meta.dirname, "../..");
const packaged = process.argv[2] && resolve(process.argv[2]);
if (packaged && !process.versions.electron) {
  const child = spawnSync(join(packaged, "inkling"), [fileURLToPath(import.meta.url), packaged], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    stdio: "inherit",
  });
  assert.equal(child.status, 0, `packaged updater smoke: ${child.signal}`);
} else {
  const rootRequire = createRequire(join(root, "package.json"));
  const require = packaged
    ? createRequire(join(packaged, "resources/app.asar/package.json"))
    : rootRequire;
  const { AppImageUpdater, DebUpdater } = require("electron-updater");
  const { NodeHttpExecutor } = rootRequire(
    rootRequire.resolve("builder-util/out/nodeHttpExecutor.js", {
      paths: [rootRequire.resolve("electron-builder")],
    }),
  );
  const modulePath = packaged
    ? join(packaged, "resources/app.asar/dist/desktop/updates.mjs")
    : join(root, "apps/desktop/src/updates/controller.ts");
  const { createUpdateController, createUpdatePreferences } = await import(
    pathToFileURL(modulePath).href
  );
  const scratch = await mkdtemp(join(tmpdir(), "inkling-real-update-"));
  const previousImage = process.env.APPIMAGE;
  const imageBytes = Buffer.from("#!/bin/sh\nexit 0\n");
  const packageRoot = join(scratch, "fixture-package");
  await mkdir(join(packageRoot, "DEBIAN"), { recursive: true });
  await writeFile(
    join(packageRoot, "DEBIAN/control"),
    "Package: inkling\nVersion: 0.1.1\nArchitecture: amd64\nMaintainer: inkling tests\nDescription: Local update test only\n",
  );
  const debPath = join(scratch, "fixture.deb");
  assert.equal(
    spawnSync("dpkg-deb", ["--build", "--root-owner-group", packageRoot, debPath], {
      stdio: "ignore",
    }).status,
    0,
  );
  const debBytes = await readFile(debPath);
  let mode = "ok";
  let version = "0.1.1";
  let requested;
  let onRequested = () => {};
  const server = createServer((req, res) => {
    // Node's reused sockets accumulate upstream timeout hooks; Electron net uses its own session.
    res.setHeader("Connection", "close");
    const pathname = new URL(req.url, "http://localhost").pathname;
    if (pathname.endsWith(".yml")) {
      if (mode === "offline") {
        res.writeHead(503).end("unavailable");
        return;
      }
      const hash = (bytes) => createHash("sha512").update(bytes).digest("base64");
      const files = [
        ["inkling-test.AppImage", imageBytes],
        ["inkling-test.deb", debBytes],
      ].map(([url, bytes]) => ({
        url,
        size: bytes.length,
        sha512: mode === "corrupt" ? hash(Buffer.from("wrong")) : hash(bytes),
      }));
      res.setHeader("Content-Type", "application/yaml");
      res.end(JSON.stringify({ version, releaseDate: new Date(0).toISOString(), files }));
      return;
    }
    const bytes = pathname.endsWith(".deb") ? debBytes : imageBytes;
    if (mode === "cancel") {
      res.writeHead(200, { "Content-Length": 1000000 });
      res.write("x");
      requested = res;
      onRequested();
      return;
    }
    res.writeHead(200, { "Content-Length": bytes.length, Connection: "close" });
    res.end(bytes);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const feed = `http://127.0.0.1:${server.address().port}`;
  let sequence = 0;
  async function setup(Kind, installer) {
    const dir = join(scratch, String(sequence++));
    await mkdir(dir);
    const oldImage = join(dir, "inkling.AppImage");
    await writeFile(oldImage, "old image");
    process.env.APPIMAGE = oldImage;
    const config = join(dir, "app-update.yml");
    await writeFile(
      config,
      JSON.stringify({ provider: "generic", url: feed, updaterCacheDirName: "updates" }),
    );
    const app = {
      version: "0.1.0",
      name: "inkling-test",
      isPackaged: true,
      appUpdateConfigPath: config,
      userDataPath: dir,
      baseCachePath: dir,
      whenReady: async () => {},
      onQuit: () => {},
      quit: () => {},
      relaunch: () => {},
    };
    const updater = new Kind({ provider: "generic", url: feed }, app);
    updater.httpExecutor = new NodeHttpExecutor();
    updater.httpExecutor.download =
      require("electron-updater/out/electronHttpExecutor.js").ElectronHttpExecutor.prototype.download;
    updater.disableDifferentialDownload = true;
    updater.logger = null;
    updater.setFeedURL({ provider: "generic", url: feed });
    updater.on("error", (error) => console.error("Local feed diagnostic:", error.message));
    const controller = createUpdateController({
      autoUpdater: updater,
      currentVersion: app.version,
      preferences: createUpdatePreferences(join(dir, "preferences.json")),
      install:
        installer ??
        (async () => {
          assert(updater.install(false, false), "actual AppImage replacement succeeded");
        }),
    });
    return { controller, updater, oldImage };
  }
  try {
    const f = await setup(AppImageUpdater);
    assert.equal((await f.controller.checkForUpdates()).version, version);
    assert.equal((await f.controller.downloadUpdate(version)).status, "downloaded");
    assert.equal((await f.controller.installUpdate(version)).status, "installing");
    assert.deepEqual(await readFile(f.oldImage), imageBytes);
    console.log(
      "PASS real local feed → SHA512 download → AppImage replacement and harmless fixture execution (scratch only)",
    );

    const deb = await setup(DebUpdater, async (file) => {
      assert.deepEqual(await readFile(file), debBytes);
      const result = spawnSync("dpkg-deb", ["--field", file, "Package"], { encoding: "utf8" });
      assert.equal(result.stdout.trim(), "inkling");
      throw new Error("OS authorization canceled (no privileged install attempted)");
    });
    await deb.controller.checkForUpdates();
    assert.equal((await deb.controller.downloadUpdate(version)).status, "downloaded");
    assert.equal((await deb.controller.installUpdate(version)).errorContext, "install");
    console.log(
      "PASS real Debian feed/download/metadata with canceled install boundary; no sudo, pkexec or dpkg install executed",
    );

    mode = "corrupt";
    const bad = await setup(DebUpdater);
    await bad.controller.checkForUpdates();
    assert.equal((await bad.controller.downloadUpdate(version)).errorContext, "download");
    await assert.rejects(() => bad.controller.installUpdate(version));
    console.log(
      "PASS corrupted downloaded artifact rejected by actual updater SHA512 verification",
    );

    mode = "cancel";
    const canceled = await setup(DebUpdater);
    await canceled.controller.checkForUpdates();
    const started = new Promise((resolve) => {
      onRequested = resolve;
    });
    const downloading = canceled.controller.downloadUpdate(version);
    await started;
    await assert.rejects(() => canceled.controller.setChannel("nightly"));
    await canceled.controller.cancelDownload();
    requested.destroy();
    assert.equal((await downloading).status, "cancelled");
    console.log(
      "PASS actual in-flight HTTP cancellation, no installer admission, single-flight channel guard",
    );

    mode = "ok";
    version = "0.2.0-nightly.20261028.1";
    const nightly = await setup(DebUpdater);
    assert.equal(await nightly.controller.checkForUpdates(), null);
    await nightly.controller.setChannel("nightly");
    assert.equal((await nightly.controller.checkForUpdates()).version, version);
    assert.equal(nightly.updater.allowDowngrade, false);
    mode = "offline";
    assert.equal(await nightly.controller.checkForUpdates(), null);
    assert.equal((await nightly.controller.getState()).errorContext, "check");
    console.log("PASS real latest/nightly channel manifests and unavailable-feed errors");
    assert((await readdir(scratch)).length > 0);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    if (previousImage === undefined) delete process.env.APPIMAGE;
    else process.env.APPIMAGE = previousImage;
    await rm(scratch, { recursive: true, force: true });
  }
}
