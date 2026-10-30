import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { cpus, homedir, loadavg, platform, release } from "node:os";
import { basename, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { setTimeout as pause } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { connect, freePort } from "./bench-library-grid/cdp.mjs";
import { installProbe } from "./bench-library-grid/probe.mjs";

const harnessRoot = resolve(import.meta.dirname, "..");
const harnessModules = join(import.meta.dirname, "bench-library-grid");
const { values } = parseArgs({
  options: {
    "app-root": { type: "string" },
    output: { type: "string" },
    runs: { type: "string", default: "5" },
    items: { type: "string", default: "800" },
    profile: { type: "boolean", default: false },
  },
});
if (!values["app-root"] || !values.output)
  throw new Error(
    "Usage: bun scripts/bench-library-grid.mjs --app-root <built repo> --output <new result directory> [--runs 5] [--items 800] [--profile]",
  );
const appRoot = resolve(values["app-root"]);
const output = resolve(values.output);
const runs = Number(values.runs);
const items = Number(values.items);
if (!Number.isSafeInteger(runs) || runs < 1 || !Number.isSafeInteger(items) || items < 16)
  throw new Error("--runs must be positive and --items must be an integer of at least 16");
const electron = join(appRoot, "node_modules/electron/dist/electron");
for (const file of [electron, join(appRoot, "dist/index.html")])
  if (!existsSync(file)) throw new Error(`Missing ${file}. Supply a prebuilt production app.`);
if (existsSync(output)) throw new Error(`Output already exists: ${output}`);
mkdirSync(output, { recursive: true });
const scratchRoot = join(homedir(), ".capy/work");
mkdirSync(scratchRoot, { recursive: true });
const library = mkdtempSync(join(scratchRoot, "inkling-grid-bench-"));
const database = join(library, "library.sqlite3");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function seedLibrary() {
  const { personalSeedItems } = await import(
    pathToFileURL(join(harnessRoot, "src/seedPersonal.ts"))
  );
  const { openTestLibrary } = await import(
    pathToFileURL(join(appRoot, "electron/storage/test-library.ts"))
  );
  const require = createRequire(join(harnessRoot, "package.json"));
  const sharp = require("sharp");
  const images = [];
  for (const item of personalSeedItems.filter((item) => item.image?.startsWith("/seed-demo/"))) {
    const path = join(harnessRoot, "public", item.image);
    const bytes = readFileSync(path);
    const metadata = await sharp(bytes).metadata();
    const rotated = metadata.orientation >= 5 && metadata.orientation <= 8;
    const thumbnail = await sharp(bytes)
      .rotate()
      .resize({ width: 512, height: 512, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
    images.push({
      item,
      path,
      width: rotated ? metadata.height : metadata.width,
      height: rotated ? metadata.width : metadata.height,
      thumbnail,
      sourceHash: hash(bytes),
      thumbnailHash: hash(thumbnail),
    });
  }
  assert(images.length > 0, "No committed demo images found");
  const pdfObjects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>",
  ];
  let pdf = "%PDF-1.4\n";
  const pdfOffsets = [0];
  for (const [index, object] of pdfObjects.entries()) {
    pdfOffsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 4\n0000000000 65535 f \n${pdfOffsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("")}trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  const pattern = [
    "image",
    "image",
    "article-image",
    "note",
    "image",
    "quote",
    "pdf",
    "article",
    "image",
    "video",
    "file",
    "post",
    "image",
    "article-image",
    "note",
    "image",
  ];
  const storage = await openTestLibrary(database);
  const manifest = [];
  let listPayload;
  try {
    const insert = storage.db.prepare(`INSERT INTO items
      (id, kind, title, description, body, source_label, local_asset_path, thumbnail_path,
       metadata, created_at, updated_at, ocr_text)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    storage.db.exec("BEGIN IMMEDIATE");
    for (let index = 0; index < items; index += 1) {
      const variant = pattern[index % pattern.length];
      const image = images[index % images.length];
      const id = `bench-${String(index).padStart(6, "0")}`;
      const directory = join(library, "assets/items", id);
      mkdirSync(directory, { recursive: true });
      const hasThumbnail = ["image", "article-image", "pdf", "video"].includes(variant);
      const thumbnail = hasThumbnail ? `assets/items/${id}/thumbnail.jpg` : null;
      if (thumbnail) writeFileSync(join(library, thumbnail), image.thumbnail);
      let localAsset = null;
      if (variant === "image") {
        localAsset = `assets/items/${id}/${basename(image.path)}`;
        copyFileSync(image.path, join(library, localAsset));
      } else if (variant === "video") {
        localAsset = `assets/items/${id}/clip.mp4`;
        copyFileSync(
          join(harnessRoot, "public/seed-demo/saved-clip.mp4"),
          join(library, localAsset),
        );
      } else if (variant === "file") {
        localAsset = `assets/items/${id}/reference.txt`;
        writeFileSync(join(library, localAsset), "A local benchmark reference file.\n");
      } else if (variant === "pdf") {
        localAsset = `assets/items/${id}/reference.pdf`;
        writeFileSync(join(library, localAsset), pdf);
      }
      const kind = variant === "article-image" ? "article" : variant;
      const title = `${image.item.title} ${String(index).padStart(4, "0")}`;
      const description = image.item.description || "A saved reference from the demo library.";
      const metadata = {
        tags: image.item.tags,
        ...(hasThumbnail ? { mediaWidth: image.width, mediaHeight: image.height } : {}),
        ...(kind === "pdf" ? { pdfPageCount: 1 } : {}),
        ...(kind === "article"
          ? { html: `<p>${description}</p>`.repeat(40), author: "Demo author" }
          : {}),
      };
      const body =
        kind === "note" ? `# ${title}\n\n${description}\n\nKeep this idea for later.` : "";
      const timestamp = 1_760_000_000_000 - index * 60_000;
      insert.run(
        id,
        kind,
        title,
        description,
        body,
        "Demo library",
        localAsset,
        thumbnail,
        JSON.stringify(metadata),
        timestamp,
        timestamp,
        ["image", "pdf"].includes(kind) ? `Demo extracted text for ${title}` : "",
      );
      manifest.push({
        id,
        variant,
        title,
        metadata,
        sourceHash: image.sourceHash,
        thumbnailHash: hasThumbnail ? image.thumbnailHash : null,
      });
    }
    storage.db.exec("COMMIT");
    storage.db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    const listItems = await storage.listActiveItems();
    listPayload = {
      itemCount: listItems.length,
      jsonBytes: Buffer.byteLength(JSON.stringify(listItems)),
    };
  } finally {
    await storage.close();
  }
  return {
    sha256: hash(JSON.stringify(manifest)),
    seedSourceSha256: hash(readFileSync(join(harnessRoot, "src/seedPersonal.ts"))),
    items,
    variants: Object.fromEntries(
      pattern.map((variant) => [
        variant,
        manifest.filter((entry) => entry.variant === variant).length,
      ]),
    ),
    uniqueDemoImages: images.length,
    thumbnail:
      "JPEG quality 80, auto-oriented, inside 512x512, no enlargement; metadata uses original oriented pixel dimensions",
    embeddings:
      "None. Raw inserts enqueue no work; stale-image migration only selects existing stale vectors. Image/PDF OCR text is preseeded to prevent lazy OCR on detail open. Every PDF has a thumbnail, so idle PDF backfill has no candidate.",
    sharpVersion: sharp.versions.sharp,
    listPayload,
  };
}

function databaseProof() {
  const db = new DatabaseSync(database, { readOnly: true });
  try {
    const itemCount = db.prepare("SELECT count(*) AS count FROM items").get().count;
    const jobs = db.prepare("SELECT status, count(*) AS count FROM jobs GROUP BY status").all();
    assert(itemCount === items, `Database has ${itemCount} items, expected ${items}`);
    assert(
      jobs.length === 0,
      `Background jobs appeared: ${JSON.stringify(db.prepare("SELECT item_id, kind, status FROM jobs").all())}`,
    );
    return { itemCount, jobCount: 0, jobs };
  } finally {
    db.close();
  }
}

async function reload(cdp) {
  const previousOrigin = await cdp.evaluate("performance.timeOrigin");
  await cdp.send("Page.reload", { ignoreCache: false });
  const deadline = performance.now() + 30_000;
  while (performance.now() < deadline) {
    try {
      if (
        await cdp.evaluate(`performance.timeOrigin !== ${previousOrigin} && !!window.__gridBench`)
      )
        return await cdp.evaluate("window.__gridBench.ready");
    } catch (error) {
      if (!/context|navigat/iu.test(error.message)) throw error;
    }
    await pause(25);
  }
  throw new Error("Timed out waiting for a fresh instrumented navigation");
}

async function trial(cdp, name) {
  const ready = await reload(cdp);
  const point = await cdp.evaluate(`(() => {
    const card = document.querySelector('.library-card[data-library-item-id="bench-000000"]');
    if (!card) throw new Error('First seeded card is missing');
    const rect = card.querySelector('.library-card-media').getBoundingClientRect();
    const bounds = document.querySelector('.library-scroll').getBoundingClientRect();
    const top = Math.max(rect.top, bounds.top);
    const bottom = Math.min(rect.bottom, bounds.bottom);
    const point = {x: rect.left + rect.width / 2, y: (top + bottom) / 2};
    if (bottom <= top || document.elementFromPoint(point.x, point.y)?.closest('.library-card') !== card)
      throw new Error('First card is not clickable inside the visible viewport');
    return point;
  })()`);
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", ...point });
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    ...point,
    button: "left",
    clickCount: 1,
  });
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    ...point,
    button: "left",
    clickCount: 1,
  });
  const interactive = await cdp.evaluate("window.__gridBench.interactive()");
  await cdp.evaluate("document.querySelector('button[aria-label=\"Close details\"]').click()");
  await cdp.evaluate(
    "window.__gridBench.wait(() => !document.querySelector('.expanded-overlay'), 'overlay closed')",
  );
  const scrolling = await cdp.evaluate("window.__gridBench.scroll()");
  assert(
    scrolling.brokenLocalThumbnails.length === 0,
    `Broken local thumbnails: ${scrolling.brokenLocalThumbnails.join()}`,
  );
  return {
    name,
    gridReadyMs: ready.gridReadyMs,
    ...interactive,
    initialGrid: ready,
    scrolling,
    database: databaseProof(),
  };
}

function summary(results) {
  const stats = (numbers) => {
    const sorted = [...numbers].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return {
      median: sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2,
      min: sorted[0],
      max: sorted.at(-1),
    };
  };
  return Object.fromEntries(
    [
      "gridReadyMs",
      "clickResponseMs",
      "navigationToInteractiveMs",
      "meanFps",
      "medianFrameMs",
      "p95FrameMs",
      "elapsedWallMs",
    ].map((key) => [key, stats(results.map((result) => result[key] ?? result.scrolling[key]))]),
  );
}

const record = {
  schemaVersion: 1,
  appRoot,
  harnessSha256: hash(
    [
      import.meta.filename,
      ...readdirSync(harnessModules)
        .sort()
        .map((f) => join(harnessModules, f)),
    ]
      .map((file) => readFileSync(file))
      .join(""),
  ),
  startedAt: new Date().toISOString(),
  environment: {
    runtime: process.version,
    bun: globalThis.Bun?.version,
    platform: platform(),
    release: release(),
    logicalCpus: cpus().length,
    cpu: cpus()[0]?.model,
    loadAverageBefore: loadavg(),
  },
  window: { width: 960, height: 540, deviceScaleFactor: 1 },
  definitions: {
    gridReadyMs:
      "Renderer performance.now() from navigation start, after all item data reaches the grid, visible thumbnails finish loading, fonts settle, two identical rAF layout samples, then one paint opportunity. Excludes Electron process startup and CDP attachment.",
    clickResponseMs:
      "Trusted CDP mouse pointerdown on the first card to a nonzero-opacity overlay plus two rAF paint opportunities. Includes app detail loading, excludes host command dispatch latency.",
    navigationToInteractiveMs:
      "Navigation start to the same painted overlay. Includes the CDP round trips between grid readiness and mouse input; use gridReadyMs and clickResponseMs separately for comparisons.",
    scrolling:
      "100 scrollTop increments of 120px, one per requestAnimationFrame, exactly 12000px. FPS is 100 intervals / sum of actual rAF intervals. Median and p95 use those intervals, not assumed display refresh. Wall time includes the initial rAF alignment. Settlement and screenshots are outside this timed region.",
    visibility:
      "IntersectionObserver tracks visible cards during scrolling without reading every card rectangle on every frame. MutationObserver tracks peak mounted cards. Exact visible IDs/counts use rectangle intersection before and after settlement. Any observer-reported empty frame or empty settled viewport fails.",
    cache:
      "One discarded warmup, then reloads in the same Electron process and scratch library. Browser/resource/OS caches remain warm. No cache-busting, builds, screenshots, or profiler in reported trials.",
    network:
      "HTTP(S) requests intercepted and fulfilled empty before timed navigations. External DNS disabled at launch. Remote fonts use deterministic local fallback; no remote content, models, social embeds, or video playback. Initial attachment navigation is excluded.",
    coverage:
      "Synthetic deterministic mix of all eight item kinds, article cards with/without images, local video posters, and real demo image thumbnails. PDF uses a minimal one-page local fixture with a demo-image thumbnail; post is a plain saved post, not a remote X widget. This tests browsing, not capture, search, native media decoding, model work, or process cold start.",
  },
  results: [],
  failures: [],
};
let child;
let cdp;
let interrupted = null;
const onInterrupt = (signal) => {
  interrupted = signal;
  if (child?.pid) {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {}
  }
  cdp?.close();
};
process.on("SIGINT", onInterrupt);
process.on("SIGTERM", onInterrupt);
try {
  record.dataset = await seedLibrary();
  record.databaseBefore = databaseProof();
  const git = spawnSync("git", ["rev-parse", "HEAD"], { cwd: appRoot, encoding: "utf8" });
  record.appCommit = git.status === 0 ? git.stdout.trim() : null;
  record.distIndexSha256 = hash(readFileSync(join(appRoot, "dist/index.html")));
  const port = await freePort();
  const args = [
    "-a",
    "-s",
    "-screen 0 960x540x24",
    electron,
    ".",
    "--no-sandbox",
    `--user-data-dir=${library}`,
    `--remote-debugging-port=${port}`,
    "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost",
  ];
  child = spawn("xvfb-run", args, {
    cwd: appRoot,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.on("error", (error) => {
    child.launchError = error;
  });
  for (const stream of [child.stdout, child.stderr])
    stream.on("data", (chunk) => appendFileSync(join(output, "electron.log"), chunk));
  record.childProcessGroup = child.pid;
  cdp = await connect(port, child);
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `(${installProbe.toString()})(${items})`,
  });
  cdp.errors.length = 0;
  cdp.remoteRequests.length = 0;
  record.warmup = await trial(cdp, "warmup-discarded");
  for (let index = 0; index < runs; index += 1) {
    const result = await trial(cdp, `run-${index + 1}`);
    record.results.push(result);
    console.log(
      JSON.stringify({
        run: index + 1,
        gridReadyMs: result.gridReadyMs,
        clickResponseMs: result.clickResponseMs,
        meanFps: result.scrolling.meanFps,
      }),
    );
    writeFileSync(join(output, "results.json"), JSON.stringify(record, null, 2));
  }
  await reload(cdp);
  const screenshot = async (name) => {
    const shot = await cdp.send("Page.captureScreenshot", { format: "png" });
    writeFileSync(join(output, `${name}.png`), Buffer.from(shot.data, "base64"));
  };
  await screenshot("grid");
  await cdp.evaluate("document.querySelector('button[aria-label=\"List view\"]').click()");
  await cdp.evaluate(
    "window.__gridBench.wait(() => document.querySelector('.library-grid.list-mode:not([data-entering])'), 'list view selected')",
  );
  await cdp.evaluate("window.__gridBench.settle()");
  await screenshot("list");
  if (values.profile) {
    await cdp.send("Profiler.enable");
    await cdp.send("Profiler.start");
    record.profileRun = await trial(cdp, "profile-excluded-from-summary");
    const { profile } = await cdp.send("Profiler.stop");
    writeFileSync(join(output, "grid.cpuprofile"), JSON.stringify(profile));
    await cdp.send("Profiler.disable");
  }
  record.databaseAfter = databaseProof();
  record.summary = summary(record.results);
  record.consoleErrors = cdp.errors;
  record.interceptedRemoteRequests = cdp.remoteRequests;
  assert(cdp.errors.length === 0, `Renderer errors: ${cdp.errors.join(" | ")}`);
} catch (error) {
  record.failures.push(error.stack ?? String(error));
  console.error(error.stack ?? error);
  process.exitCode = 1;
} finally {
  record.consoleErrors = cdp?.errors ?? [];
  record.interceptedRemoteRequests = cdp?.remoteRequests ?? [];
  cdp?.close();
  if (child?.pid) {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch (error) {
      if (error.code !== "ESRCH") record.failures.push(`Cleanup SIGTERM: ${error.message}`);
    }
    const deadline = performance.now() + 5000;
    while (performance.now() < deadline) {
      try {
        process.kill(-child.pid, 0);
      } catch {
        break;
      }
      await pause(50);
    }
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch (error) {
      if (error.code !== "ESRCH") record.failures.push(`Cleanup SIGKILL: ${error.message}`);
    }
  }
  rmSync(library, { recursive: true, force: true });
  record.scratchLibraryRemoved = !existsSync(library);
  record.interrupted = interrupted;
  record.completedRuns = record.results.length;
  record.failedRuns = runs - record.results.length;
  record.failureCount = record.failures.length;
  record.environment.loadAverageAfter = loadavg();
  record.finishedAt = new Date().toISOString();
  if (record.failureCount || interrupted) process.exitCode = 1;
  writeFileSync(join(output, "results.json"), JSON.stringify(record, null, 2));
  console.log(
    JSON.stringify({
      output,
      completedRuns: record.completedRuns,
      failedRuns: record.failedRuns,
      failureCount: record.failureCount,
      summary: record.summary,
    }),
  );
  process.off("SIGINT", onInterrupt);
  process.off("SIGTERM", onInterrupt);
}
