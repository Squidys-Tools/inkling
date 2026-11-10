import { type ChildProcess, spawn } from "node:child_process";
import type { Plugin } from "vite";

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
 * from another machine. Anyone with the address can read the worktree's source.
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
      const toggle = () => {
        if (child) {
          close();
          logger.info("  Tunnel closed");
          return;
        }
        const local = server.httpServer?.address();
        if (!local || typeof local === "string") return;
        const started = spawn(
          "cloudflared",
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
        started.on("error", () => {
          logger.error("  cloudflared is not on PATH: winget install Cloudflare.cloudflared");
        });
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
