import { afterAll, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateRawSync } from "node:zlib";
import { collectFiles, zip } from "./package-extension.ts";

const dir = mkdtempSync(join(tmpdir(), "inkling-package-extension-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const readEntries = (archive: Buffer) => {
  const entries: Record<string, string> = {};
  const count = archive.readUInt16LE(archive.length - 22 + 10);
  let at = archive.readUInt32LE(archive.length - 22 + 16);
  for (let i = 0; i < count; i++) {
    const packedSize = archive.readUInt32LE(at + 20);
    const nameLength = archive.readUInt16LE(at + 28);
    const localAt = archive.readUInt32LE(at + 42);
    const name = archive.toString("utf8", at + 46, at + 46 + nameLength);
    const dataAt = localAt + 30 + archive.readUInt16LE(localAt + 26);
    entries[name] = inflateRawSync(archive.subarray(dataAt, dataAt + packedSize)).toString();
    at += 46 + nameLength;
  }
  return entries;
};

describe("package-extension", () => {
  it("lists nested files with forward slashes and skips source maps and .vite", () => {
    mkdirSync(join(dir, "assets"), { recursive: true });
    mkdirSync(join(dir, ".vite"), { recursive: true });
    writeFileSync(join(dir, "manifest.json"), "{}");
    writeFileSync(join(dir, "assets", "popup.js"), "x");
    writeFileSync(join(dir, "assets", "popup.js.map"), "x");
    writeFileSync(join(dir, ".vite", "manifest.json"), "{}");

    expect(collectFiles(dir)).toEqual(["assets/popup.js", "manifest.json"]);
  });

  it("round-trips entry names and contents through the central directory", () => {
    const entries = readEntries(
      zip([
        { name: "manifest.json", data: Buffer.from('{"name":"inkling"}') },
        { name: "assets/popup.js", data: Buffer.from("console.log(1)") },
      ]),
    );

    expect(entries).toEqual({
      "manifest.json": '{"name":"inkling"}',
      "assets/popup.js": "console.log(1)",
    });
  });
});
