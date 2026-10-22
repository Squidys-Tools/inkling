import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { collectThirdPartyLicenses, sourceUrlOf } from "./collect.mjs";

let root: string;

function write(path: string, content: unknown) {
  const file = join(root, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, typeof content === "string" ? content : JSON.stringify(content));
}

function fixture(dependencies: Record<string, string>) {
  root = mkdtempSync(join(tmpdir(), "inkling-licenses-"));
  write("package.json", { name: "inkling", dependencies, devDependencies: { vite: "1" } });
  write("scripts/third-party-licenses/notices.json", [
    { name: "vendored", license: "MIT", sourceUrl: null, noticeFile: "VENDORED.md" },
  ]);
  write("VENDORED.md", "Vendored license\n");
}

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("collectThirdPartyLicenses", () => {
  test("follows the production closure once, including nested copies", () => {
    fixture({ a: "1", b: "1" });
    write("node_modules/a/package.json", {
      name: "a",
      version: "1.0.0",
      license: "MIT",
      dependencies: { c: "1" },
    });
    write("node_modules/a/LICENSE", "a license");
    write("node_modules/b/package.json", {
      name: "b",
      version: "1.0.0",
      license: "ISC",
      dependencies: { c: "2" },
    });
    write("node_modules/b/LICENSE.md", "b license");
    write("node_modules/b/node_modules/c/package.json", {
      name: "c",
      version: "2.0.0",
      license: "MIT",
    });
    write("node_modules/b/node_modules/c/LICENSE", "c2 license");
    write("node_modules/c/package.json", { name: "c", version: "1.0.0", license: "MIT" });
    write("node_modules/c/LICENSE", "c1 license");
    write("node_modules/vite/package.json", { name: "vite", version: "1.0.0", license: "MIT" });

    const { entries, warnings } = collectThirdPartyLicenses(root);

    expect(entries.map((entry) => `${entry.name}@${entry.version}`)).toEqual([
      "a@1.0.0",
      "b@1.0.0",
      "c@1.0.0",
      "c@2.0.0",
      "vendored@null",
    ]);
    expect(entries.find((entry) => entry.version === "2.0.0")?.noticeText).toBe("c2 license");
    expect(entries.at(-1)?.noticeText).toBe("Vendored license");
    // electron is always followed, and is missing in this fixture.
    expect(warnings).toEqual(["electron is a dependency but is not installed."]);
  });

  test("skips first-party packages but keeps what they pull in", () => {
    fixture({ "@inkling/shared": "workspace:*" });
    write("node_modules/@inkling/shared/package.json", {
      name: "@inkling/shared",
      dependencies: { d: "1" },
    });
    write("node_modules/d/package.json", { name: "d", version: "1.0.0", license: "MIT" });
    write("node_modules/d/LICENSE", "d license");

    const names = collectThirdPartyLicenses(root).entries.map((entry) => entry.name);

    expect(names).toEqual(["d", "vendored"]);
  });

  test("warns about packages with no license, and ignores missing optional ones", () => {
    fixture({ e: "1" });
    write("node_modules/e/package.json", {
      name: "e",
      version: "1.0.0",
      optionalDependencies: { "e-win32": "1" },
    });

    const { entries, warnings } = collectThirdPartyLicenses(root);

    expect(entries[0]).toMatchObject({ name: "e", license: "Unknown", noticeText: "" });
    expect(warnings).toContain("e@1.0.0 declares no license.");
    expect(warnings).toContain("e@1.0.0 has no license file.");
    expect(warnings.some((warning) => warning.includes("e-win32"))).toBe(false);
  });
});

describe("sourceUrlOf", () => {
  test.each([
    [{ repository: "git+https://github.com/a/b.git" }, "https://github.com/a/b"],
    [{ repository: { url: "git://github.com/a/b.git" } }, "https://github.com/a/b"],
    [{ repository: "git@github.com:a/b.git" }, "https://github.com/a/b"],
    [{ repository: "github:a/b" }, "https://github.com/a/b"],
    [{ repository: "a/b" }, "https://github.com/a/b"],
    [{ homepage: "https://example.com" }, "https://example.com"],
    [{ repository: "file:../x" }, null],
  ])("%o", (pkg, url) => {
    expect(sourceUrlOf(pkg)).toBe(url);
  });
});
