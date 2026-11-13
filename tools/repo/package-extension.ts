// Builds the Chrome extension and zips extension/dist for the Chrome Web Store: `bun run package:extension`.
// The zip is written by hand with node:zlib so it needs no dependency and behaves the same on every OS.

import { readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { crc32, deflateRawSync } from "node:zlib";

export type ZipFile = { name: string; data: Buffer };

const extensionDir = join(import.meta.dirname, "..", "..", "extension");

// Chrome rejects entry names with backslashes, so names are cut on the OS separator and rejoined with "/".
export const collectFiles = (dir: string) =>
  readdirSync(dir, { recursive: true, encoding: "utf8" })
    .map((path) => path.split(sep))
    .filter((parts) => !parts.includes(".vite") && !parts.at(-1)?.endsWith(".map"))
    .filter((parts) => statSync(join(dir, ...parts)).isFile())
    .map((parts) => parts.join("/"))
    .sort();

// Fixed 1980-01-01 timestamps keep the same input producing the same bytes.
const dosDate = (1 << 5) | 1;
const utf8Names = 0x0800;
const deflate = 8;

export const zip = (files: ZipFile[]) => {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const { name, data } of files) {
    const nameBytes = Buffer.from(name);
    const packed = deflateRawSync(data);
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(utf8Names, 6);
    local.writeUInt16LE(deflate, 8);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(utf8Names, 8);
    central.writeUInt16LE(deflate, 10);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);

    locals.push(local, nameBytes, packed);
    centrals.push(central, nameBytes);
    offset += local.length + nameBytes.length + packed.length;
  }

  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
};

const main = async () => {
  const build = Bun.spawn(["bun", "run", "--cwd", extensionDir, "build"], {
    stdio: ["inherit", "inherit", "inherit"],
  });
  if ((await build.exited) !== 0) process.exit(1);

  const manifest: { version?: string } = await Bun.file(
    join(extensionDir, "manifest.chrome.json"),
  ).json();
  if (!manifest.version) throw new Error("extension/manifest.chrome.json has no version");

  const dist = join(extensionDir, "dist");
  const names = collectFiles(dist);
  if (!names.includes("manifest.json")) throw new Error("extension/dist has no manifest.json");

  const out = join(extensionDir, `inkling-extension-${manifest.version}.zip`);
  const files = await Promise.all(
    names.map(async (name) => ({
      name,
      data: Buffer.from(await Bun.file(join(dist, name)).bytes()),
    })),
  );
  await Bun.write(out, zip(files));
  console.log(`${relative(process.cwd(), out)} (${names.length} files)`);
};

if (import.meta.main) await main();
