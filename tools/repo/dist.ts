// Packages the app with electron-builder: `bun run dist [dir|win|linux|mac]`.
// `dir` (the default) writes the unpacked build the packaged smokes check.
// A Windows build is followed by the custom setup front end (tools/installer/pack.ts).

import { packSetup } from "../installer/pack.ts";

export const targets: Record<string, string[]> = {
  dir: ["--dir"],
  win: ["--win", "nsis"],
  linux: ["--linux", "deb", "AppImage"],
  mac: ["--mac", "dmg"],
};

async function main() {
  const target = process.argv[2] ?? "dir";
  const args = targets[target];
  if (!args) {
    console.error(
      `Unknown dist target "${target}". Expected one of: ${Object.keys(targets).join(", ")}`,
    );
    process.exit(1);
  }
  const proc = Bun.spawn(["bun", "x", "electron-builder", "--publish", "never", ...args], {
    stdio: ["inherit", "inherit", "inherit"],
  });
  const code = await proc.exited;
  if (target === "win" && code === 0) await packSetup();
  process.exit(code);
}

if (import.meta.main) await main();
