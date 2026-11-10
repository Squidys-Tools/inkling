// Packs the custom setup front end: builds the Rust stub, appends the filled
// UI html and the NSIS installer electron-builder just produced, and writes
// inkling-setup-<version>-win-<arch>.exe beside it. dist.ts runs this after a
// Windows build; `bun tools/installer/pack.ts` runs it alone.

import { createReadStream, createWriteStream } from "node:fs";
import { appendFile, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";

const workspace = resolve(import.meta.dir, "../..");
const electronOut = join(workspace, ".artifacts/electron");
const stubExe = join(workspace, ".artifacts/setup-target/release/inkling-setup.exe");
const MAGIC = Buffer.from("INKSETUP", "ascii");

async function cargoBuild() {
  const proc = Bun.spawn(
    [
      "cargo",
      "build",
      "--release",
      "--locked",
      "--manifest-path",
      join(workspace, "apps/setup/Cargo.toml"),
      "--target-dir",
      join(workspace, ".artifacts/setup-target"),
    ],
    { stdio: ["inherit", "inherit", "inherit"] },
  );
  const code = await proc.exited;
  if (code !== 0) throw new Error(`cargo build --release failed with exit code ${code}`);
}

async function findNsisInstaller() {
  const entries = await readdir(electronOut);
  const exes = entries.filter(
    (name) => name.endsWith(".exe") && !name.startsWith("inkling-setup-"),
  );
  if (exes.length !== 1) {
    throw new Error(
      `Expected exactly one NSIS installer in ${electronOut}, found ${exes.length}: ${exes.join(", ")}`,
    );
  }
  return join(electronOut, exes[0]);
}

async function dirBytes(dir: string): Promise<number> {
  let total = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) total += await dirBytes(path);
    else if (entry.isFile()) total += (await stat(path)).size;
  }
  return total;
}

async function setupHtml(version: string) {
  const ui = await readFile(join(workspace, "apps/setup/ui/index.html"), "utf8");
  // The splash loop is drawn for a light surface; swap its paper and ink so the
  // blot reads on the dark window (body stays window-dark, eyes take the ink).
  const mascotSvg = (
    await readFile(join(workspace, "docs/assets/mascots/inkling-splash-loop.svg"), "utf8")
  )
    .replaceAll("#faf9f6", "#0c0c0b")
    .replaceAll("#1a1a1a", "#e5ddd2");
  const mascot = `data:image/svg+xml;base64,${Buffer.from(mascotSvg, "utf8").toString("base64")}`;
  const fontSans = (
    await readFile(
      join(
        workspace,
        "node_modules/@fontsource-variable/dm-sans/files/dm-sans-latin-wght-normal.woff2",
      ),
    )
  ).toString("base64");
  const fontMono = (
    await readFile(
      join(workspace, "node_modules/@fontsource/dm-mono/files/dm-mono-latin-500-normal.woff2"),
    )
  ).toString("base64");
  return Buffer.from(
    ui
      .replaceAll("{{MASCOT}}", mascot)
      .replaceAll("{{FONT_SANS}}", fontSans)
      .replaceAll("{{FONT_MONO}}", fontMono)
      .replaceAll("{{VERSION}}", version),
    "utf8",
  );
}

// The verify-inkling skill passes its test-identity NSIS and a scratch output path.
export async function packSetup(
  options: { nsisPath?: string; unpackedDir?: string; outPath?: string } = {},
) {
  await cargoBuild();
  const pkg = JSON.parse(await readFile(join(workspace, "package.json"), "utf8")) as {
    version: string;
  };
  const nsisPath = options.nsisPath ?? (await findNsisInstaller());
  const nsisBytes = (await stat(nsisPath)).size;
  const installedBytes = await dirBytes(options.unpackedDir ?? join(electronOut, "win-unpacked"));
  const html = await setupHtml(pkg.version);
  const arch = /-win-(x64|arm64|ia32)\.exe$/u.exec(nsisPath)?.[1] ?? "x64";
  const outPath =
    options.outPath ?? join(electronOut, `inkling-setup-${pkg.version}-win-${arch}.exe`);

  // Layout the stub reads back from the tail: html, nsis, three u64 lengths,
  // magic. The stub exe itself is first so Windows sees a normal PE file.
  await writeFile(outPath, await readFile(stubExe));
  await appendFile(outPath, html);
  await pipeline(createReadStream(nsisPath), createWriteStream(outPath, { flags: "a" }));
  const trailer = Buffer.alloc(32);
  trailer.writeBigUInt64LE(BigInt(html.length), 0);
  trailer.writeBigUInt64LE(BigInt(nsisBytes), 8);
  trailer.writeBigUInt64LE(BigInt(installedBytes), 16);
  MAGIC.copy(trailer, 24);
  await appendFile(outPath, trailer);

  const { size } = await stat(outPath);
  console.log(
    `Wrote ${outPath} (${(size / 1024 / 1024).toFixed(1)} MB, html ${(html.length / 1024).toFixed(0)} KB)`,
  );
  return outPath;
}

if (import.meta.main) await packSetup();
