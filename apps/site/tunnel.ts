import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

const VERSION = "2026.10.7";
// SHA-256 of each release file, from the release page. Change them together with VERSION.
const builds: Record<string, { file: string; sha256: string }> = {
  "win32-x64": {
    file: "cloudflared-windows-amd64.exe",
    sha256: "2493dbc168923bb3e59e5e7716f71deced92992eea9acd6e9d74f84ac7751343",
  },
  "linux-x64": {
    file: "cloudflared-linux-amd64",
    sha256: "1f99fb518b83dec2ba8d870a7cc991d82a77e6196295a3d2754ba17ab9f91872",
  },
  "linux-arm64": {
    file: "cloudflared-linux-arm64",
    sha256: "3df43aedc9ff291d1735b5cb576cb97e0b157488796db2e32b28aecabb445775",
  },
  "darwin-x64": {
    file: "cloudflared-darwin-amd64.tgz",
    sha256: "02f3edfd87684dd5b705607688e4eb4b323f6e777b81e7b3a85af556aa356848",
  },
  "darwin-arm64": {
    file: "cloudflared-darwin-arm64.tgz",
    sha256: "3586ccf397e98e5f437e60e7c307ca6ac463e110580503af8bb8e6f9ebf831bd",
  },
};

// Under the root node_modules, which the worktree's settle action (tools/repo/clean-worktree.ts) deletes.
const cache = fileURLToPath(
  new URL(`../../node_modules/.cache/cloudflared/${VERSION}`, import.meta.url),
);

/** The pinned cloudflared, downloaded on first use and checked against its checksum. */
async function cloudflared(log: (message: string) => void) {
  const build = builds[`${process.platform}-${process.arch}`];
  if (!build) throw new Error(`no cloudflared build for ${process.platform}-${process.arch}`);
  const binary = join(cache, process.platform === "win32" ? "cloudflared.exe" : "cloudflared");
  if (existsSync(binary)) return binary;
  log(`  Downloading cloudflared ${VERSION}...`);
  const url = `https://github.com/cloudflare/cloudflared/releases/download/${VERSION}/${build.file}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`cloudflared download failed: ${response.status} ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (createHash("sha256").update(bytes).digest("hex") !== build.sha256)
    throw new Error(`cloudflared download does not match its checksum: ${url}`);
  mkdirSync(cache, { recursive: true });
  // Written beside the final name and renamed, so an interrupted download is never run.
  const partial = join(cache, `partial-${process.pid}`);
  if (build.file.endsWith(".tgz")) {
    mkdirSync(partial);
    writeFileSync(join(partial, build.file), bytes);
    execFileSync("tar", ["-xzf", build.file], { cwd: partial });
    chmodSync(join(partial, "cloudflared"), 0o755);
    renameSync(join(partial, "cloudflared"), binary);
  } else {
    writeFileSync(partial, bytes, { mode: 0o755 });
    renameSync(partial, binary);
  }
  return binary;
}

const address = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/u;

// Asked over HTTPS: a lookup through the system resolver before the name exists gets cached as missing.
async function resolves(url: string) {
  const query = `https://cloudflare-dns.com/dns-query?type=A&name=${new URL(url).hostname}`;
  try {
    const response = await fetch(query, { headers: { accept: "application/dns-json" } });
    const { Answer } = (await response.json()) as { Answer?: unknown[] };
    return Boolean(Answer?.length);
  } catch {
    return false;
  }
}

/**
 * Dev server only. `t + enter`, or `INKLING_TUNNEL=1` at start, serves the dev
 * site at a public trycloudflare.com address through `cloudflared`, to open it
 * from another machine. `cloudflared` is downloaded on first use. Anyone with the address can read the worktree's source.
 */
export function tunnel(): Plugin {
  return {
    name: "inkling:tunnel",
    apply: "serve",
    configureServer(server) {
      const { logger } = server.config;
      let child: ChildProcess | undefined;
      const close = () => {
        child?.kill();
        child = undefined;
      };
      let opening = false;
      const fail = (error: unknown) => logger.error(`  Tunnel failed: ${(error as Error).message}`);
      const toggle = async () => {
        if (opening) return;
        if (child) {
          close();
          logger.info("  Tunnel closed");
          return;
        }
        const local = server.httpServer?.address();
        if (!local || typeof local === "string") return;
        opening = true;
        const binary = await cloudflared((message) => logger.info(message)).catch(fail);
        opening = false;
        if (!binary || !server.httpServer?.listening) return;
        const started = spawn(
          binary,
          // Vite answers only hosts it knows, so requests arrive named localhost.
          ["tunnel", "--url", `http://localhost:${local.port}`, "--http-host-header", "localhost"],
          { stdio: ["ignore", "ignore", "pipe"] },
        );
        child = started;
        logger.info("  Opening a tunnel...");
        let output = "";
        let found = false;
        // cloudflared prints the address before its name resolves.
        const announce = async (url: string) => {
          for (let tries = 0; tries < 60 && child === started && !(await resolves(url)); tries++) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
          if (child !== started) return;
          logger.info(`  ➜  Tunnel:  ${url}  (public; t + enter closes it)`);
        };
        started.stderr.setEncoding("utf8").on("data", (chunk: string) => {
          if (found) return;
          output += chunk;
          const url = address.exec(output)?.[0];
          if (!url) return;
          found = true;
          void announce(url);
        });
        started.on("error", fail);
        started.on("close", () => {
          if (child !== started) return;
          child = undefined;
          logger.info(address.test(output) ? "  Tunnel closed" : `  Tunnel failed\n${output}`);
        });
      };
      server.bindCLIShortcuts({
        customShortcuts: [
          { key: "t", description: "open or close a public tunnel", action: toggle },
        ],
      });
      server.httpServer?.once("close", close);
      process.once("exit", close);
      if (process.env.INKLING_TUNNEL) server.httpServer?.once("listening", toggle);
    },
  };
}
