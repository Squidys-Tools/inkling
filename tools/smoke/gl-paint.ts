import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Runs the renderer's WebGL painters in Electron's Chromium and checks each frame against
// the CPU painter it replaces. Linux needs a display: run it under xvfb-run there.
const scratch = await mkdtemp(join(tmpdir(), "inkling-gl-smoke-"));
const timeout = setTimeout(() => {
  throw new Error("the WebGL smoke page never reported");
}, 60_000);
try {
  const built = await Bun.build({
    entrypoints: [resolve(import.meta.dirname, "gl-paint-page.ts")],
    outdir: scratch,
    naming: "page.js",
    target: "browser",
  });
  assert.ok(built.success, built.logs.join("\n"));
  await writeFile(
    join(scratch, "index.html"),
    `<!doctype html><meta charset="utf-8"><body><script src="./page.js"></script></body>`,
  );
  // The page reports through its title, so the check needs no preload or IPC.
  await writeFile(
    join(scratch, "main.cjs"),
    `const { app, BrowserWindow } = require("electron");
app.commandLine.appendSwitch("enable-unsafe-swiftshader");
app.whenReady().then(() => {
  const win = new BrowserWindow({ show: false });
  win.webContents.on("page-title-updated", (_event, title) => {
    if (!title.startsWith("{")) return;
    process.stdout.write("RESULT " + title + "\\n");
    app.quit();
  });
  win.webContents.on("console-message", (event) => process.stdout.write("[page] " + event.message + "\\n"));
  win.loadFile(require("node:path").join(__dirname, "index.html"));
});
`,
  );
  // The electron package throws on import when installed with --ignore-scripts.
  const electron = (await import("electron")).default as unknown as string;
  const child = Bun.spawn(
    [
      electron,
      join(scratch, "main.cjs"),
      ...(process.platform === "linux" ? ["--no-sandbox"] : []),
    ],
    { stdout: "pipe", stderr: "inherit", env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined } },
  );
  const output = await new Response(child.stdout).text();
  await child.exited;
  const line = output.split("\n").find((entry) => entry.startsWith("RESULT "));
  assert.ok(line, `no result from the page:\n${output}`);
  const report: {
    contexts: number;
    results: { name: string; usedGl: boolean; worst: number; detail: string }[];
  } = JSON.parse(line.slice("RESULT ".length));
  for (const result of report.results)
    console.log(`${result.name}: gl=${result.usedGl} worst=${result.worst} ${result.detail}`);
  assert.equal(report.contexts, 1, "every painter shares one WebGL2 context");
  for (const result of report.results) {
    assert.ok(result.usedGl, `${result.name} fell back to the CPU`);
    // A wrong y flip or offset moves whole blobs and differs by up to 255.
    assert.ok(result.worst <= 2, `${result.name} differs from the CPU painter by ${result.worst}`);
  }
  console.log("WebGL painters match their CPU painters.");
} finally {
  clearTimeout(timeout);
  await rm(scratch, { recursive: true, force: true });
}
