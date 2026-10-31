import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connect, pageTarget } from "./cdp.ts";

// Launches the built app (or a packaged executable given as the first argument)
// against a scratch library and checks the page reached the library process.
const executable = process.argv[2];
const port = 9300 + Math.floor(Math.random() * 500);
const dataDirectory = await mkdtemp(join(tmpdir(), "inkling-smoke-"));
// The electron package throws on import when installed with --ignore-scripts, as CI's packaging jobs do.
const command = executable
  ? [executable]
  : [(await import("electron")).default as unknown as string, "."];
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
  const until = async (expression: string, what: string) => {
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      if (await page.evaluate<boolean>(expression)) return;
      await Bun.sleep(200);
    }
    const text = await page.evaluate<string>(`document.body?.innerText ?? ""`);
    throw new Error(`${what} never happened:\n${text}`);
  };
  // A scratch library has not seen the welcome, so the library process's answer opens it.
  await until(
    `document.querySelector('[aria-label="Welcome to inkling"]') !== null`,
    "the welcome opening",
  );
  await until(`document.visibilityState === "visible"`, "the window showing");
  await page.evaluate(`window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))`);
  await until(`/\\d+ items/.test(document.body?.innerText ?? "")`, "the library loading");
  page.close();
  console.log("smoke: the page reached the library process and left the welcome for the library");
} finally {
  app.kill();
  await app.exited;
  await rm(dataDirectory, { recursive: true, force: true });
}
