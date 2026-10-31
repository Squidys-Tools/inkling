import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connect, pageTarget } from "./cdp.ts";

// Launches the built app (or a packaged executable given as the first argument)
// against a scratch library and checks the page reached the library process.
const executable = process.argv[2];
const port = 9300 + Math.floor(Math.random() * 500);
const dataDirectory = await mkdtemp(join(tmpdir(), "inkling-smoke-"));
const electron = (await import("electron")).default as unknown as string;
const command = executable ? [executable] : [electron, "."];
const app = Bun.spawn(
  [
    ...command,
    `--user-data-dir=${dataDirectory}`,
    `--remote-debugging-port=${port}`,
    ...(process.platform === "linux" ? ["--no-sandbox"] : []),
  ],
  { stdout: "inherit", stderr: "inherit" },
);

try {
  const page = await connect(await pageTarget(port));
  const deadline = Date.now() + 30_000;
  let text = "";
  while (Date.now() < deadline) {
    text = await page.evaluate<string>(`document.body?.innerText ?? ""`);
    if (/\d+ items/.test(text)) break;
    await Bun.sleep(200);
  }
  page.close();
  if (!/\d+ items/.test(text)) throw new Error(`the library page never loaded:\n${text}`);
  console.log("smoke: the page reached the library process");
} finally {
  app.kill();
  await app.exited;
  await rm(dataDirectory, { recursive: true, force: true });
}
