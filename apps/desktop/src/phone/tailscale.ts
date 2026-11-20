// Adapted from t3code's packages/tailscale (MIT, Copyright (c) 2026 T3 Tools Inc.).
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { createConnection } from "node:net";

/** Serve allows HTTPS only on 443, 8443 and 10000; 443 is left to apps such as t3code. */
const phoneServePort = 8443;
const STATUS_TIMEOUT = 3_500;
const SERVE_TIMEOUT = 10_000;

// The macOS app and the Windows installer don't put the CLI on PATH.
const cliCandidates: Partial<Record<NodeJS.Platform, readonly string[]>> = {
  darwin: ["/Applications/Tailscale.app/Contents/MacOS/Tailscale", "/usr/local/bin/tailscale"],
  win32: ["C:\\Program Files\\Tailscale\\tailscale.exe"],
};

export const tailscaleCli = (platform = process.platform, exists = existsSync) =>
  (cliCandidates[platform] ?? []).find((path) => exists(path)) ??
  (platform === "win32" ? "tailscale.exe" : "tailscale");

/** Stderr can hold auth keys and node names, so failures carry a label, never the raw text. */
export class TailscaleError extends Error {
  constructor(
    readonly reason:
      | "not-installed"
      | "not-running"
      | "not-logged-in"
      | "https-disabled"
      | "port-taken"
      | "failed",
  ) {
    super(`tailscale: ${reason}`);
  }
}

const diagnose = (stderr: string): TailscaleError["reason"] =>
  /not logged in|logged out|needs? login/iu.test(stderr)
    ? "not-logged-in"
    : /doesn't appear to be running|tailscale is stopped|failed to connect to local tailscale/iu.test(
          stderr,
        )
      ? "not-running"
      : "failed";

function run(args: readonly string[], timeout: number, cli = tailscaleCli()) {
  return new Promise<string>((resolve, reject) => {
    execFile(cli, args, { timeout, windowsHide: true }, (error, stdout, stderr) => {
      if (!error) return resolve(stdout);
      const code = (error as NodeJS.ErrnoException).code;
      reject(new TailscaleError(code === "ENOENT" ? "not-installed" : diagnose(String(stderr))));
    });
  });
}

export type TailscaleStatus = { running: boolean; magicDnsName: string | null; https: boolean };

export function parseTailscaleStatus(json: string): TailscaleStatus {
  const status = JSON.parse(json) as {
    BackendState?: unknown;
    Self?: { DNSName?: unknown; CapMap?: unknown };
  };
  const dnsName = status.Self?.DNSName;
  const capMap = status.Self?.CapMap;
  return {
    running: status.BackendState === "Running",
    magicDnsName: typeof dnsName === "string" ? dnsName.trim().replace(/\.$/u, "") || null : null,
    // An older CLI reports no capability map; let `serve` decide then.
    https: typeof capMap === "object" && capMap !== null ? Object.hasOwn(capMap, "https") : true,
  };
}

type ServeConfig = { Web?: Record<string, { Handlers?: Record<string, { Proxy?: string }> }> };

/** The loopback ports that handlers at the root of `servePort` dial; `null` for a non-HTTP one. */
export function serveRootTargets(json: string, servePort: number) {
  const config = JSON.parse(json || "null") as ServeConfig | null;
  return Object.entries(config?.Web ?? {})
    .filter(([hostPort]) => hostPort.endsWith(`:${servePort}`))
    .flatMap(([, site]) => {
      const root = site.Handlers?.["/"];
      if (root === undefined) return [];
      // A file or text root has no Proxy and can't be probed, so it counts as taken.
      const proxy = root.Proxy ?? "";
      const port = /^(?:https?:\/\/)?(?:127\.0\.0\.1|localhost|\[::1\]):(\d+)\/?$/u.exec(
        proxy,
      )?.[1];
      return [port === undefined ? null : Number(port)];
    });
}

const answers = (host: string, port: number) =>
  new Promise<boolean>((resolve) => {
    const socket = createConnection({ host, port });
    const settle = (live: boolean) => {
      socket.destroy();
      resolve(live);
    };
    socket.setTimeout(500);
    socket.once("connect", () => settle(true));
    socket.once("error", () => settle(false));
    socket.once("timeout", () => settle(false));
  });

// A root proxy may name 127.0.0.1, localhost or [::1], so a server on either loopback counts.
const listening = async (port: number) =>
  (await answers("127.0.0.1", port)) || (await answers("::1", port));

/**
 * Publishes the loopback server at `localPort` on the tailnet at https://<machine>.ts.net:8443.
 * Another live server at that root is left alone; one left by an unclean exit is replaced.
 */
export async function ensureTailscaleServe(localPort: number) {
  const status = parseTailscaleStatus(await run(["status", "--json"], STATUS_TIMEOUT));
  if (!status.running || !status.magicDnsName) throw new TailscaleError("not-running");
  // Without the capability `serve` prints an enablement notice and configures nothing.
  if (!status.https) throw new TailscaleError("https-disabled");
  const holders = serveRootTargets(
    await run(["serve", "status", "--json"], STATUS_TIMEOUT),
    phoneServePort,
  ).filter((port) => port !== localPort);
  for (const port of holders)
    if (port === null || (await listening(port))) throw new TailscaleError("port-taken");
  await run(
    ["serve", "--bg", `--https=${phoneServePort}`, `http://127.0.0.1:${localPort}`],
    SERVE_TIMEOUT,
  );
  return `https://${status.magicDnsName}:${phoneServePort}`;
}

/** Removes only the root handler on our port; without `--set-path` the CLI drops every handler. */
export const disableTailscaleServe = () =>
  run(["serve", `--https=${phoneServePort}`, "--set-path=/", "off"], SERVE_TIMEOUT).then(
    () => {},
    () => {},
  );
