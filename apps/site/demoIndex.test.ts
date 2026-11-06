import { afterAll, beforeAll, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, type ViteDevServer } from "vite";
import { demoIndex } from "./demoIndex.ts";

const root = mkdtempSync(join(tmpdir(), "demo-index-"));
let server: ViteDevServer;
let origin: string;

beforeAll(async () => {
  mkdirSync(join(root, "public/demo"), { recursive: true });
  writeFileSync(join(root, "public/demo/index.html"), "<title>the demo</title>");
  server = await createServer({
    configFile: false,
    root,
    logLevel: "silent",
    appType: "custom",
    server: { port: 0, host: "127.0.0.1", ws: false },
    plugins: [demoIndex()],
  });
  await server.listen();
  origin = server.resolvedUrls?.local[0] ?? "";
});

afterAll(async () => {
  await server.close();
  rmSync(root, { recursive: true, force: true });
});

it("serves the demo's page at /demo/ without redirecting", async () => {
  const response = await fetch(`${origin}demo/`, { redirect: "manual" });
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("text/html");
  expect(await response.text()).toContain("the demo");
});
