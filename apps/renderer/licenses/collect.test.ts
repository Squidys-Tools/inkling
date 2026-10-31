import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { collectThirdPartyLicenses, packageDirOf, sourceUrlOf } from "./collect.ts";

let root: string;

function write(path: string, content: unknown) {
  const file = join(root, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, typeof content === "string" ? content : JSON.stringify(content));
}

const notices = [{ name: "vendored", license: "MIT", sourceUrl: null, noticeFile: "VENDORED.md" }];

function fixture(dependencies: Record<string, string>) {
  root = realpathSync(mkdtempSync(join(tmpdir(), "inkling-licenses-")));
  write("package.json", { name: "inkling", dependencies, devDependencies: { vite: "1" } });
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

    const { entries, warnings } = collectThirdPartyLicenses(root, [], notices);

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

  test("adds the packages the renderer bundled, once per version, without first-party ones", () => {
    fixture({ d: "1" });
    write("node_modules/d/package.json", { name: "d", version: "1.0.0", license: "MIT" });
    write("node_modules/d/LICENSE", "d license");
    write("node_modules/.bun/react@19.0.0/node_modules/react/package.json", {
      name: "react",
      version: "19.0.0",
      license: "MIT",
    });
    write("node_modules/.bun/react@19.0.0/node_modules/react/LICENSE", "react license");
    write("node_modules/.bun/react@19.0.0+peer/node_modules/react/package.json", {
      name: "react",
      version: "19.0.0",
      license: "MIT",
    });
    write("node_modules/@inkling/ui/package.json", { name: "@inkling/ui" });
    // Module ids as Vite writes them: forward slashes, queries, virtual prefixes.
    const id = (path: string) => `${root.replaceAll("\\", "/")}/${path}`;
    const bundled = [
      id("node_modules/.bun/react@19.0.0/node_modules/react/cjs/react.production.js"),
      id("node_modules/.bun/react@19.0.0+peer/node_modules/react/index.js"),
      `\0${id("node_modules/d/index.js?url")}`,
      id("node_modules/@inkling/ui/src/Button.tsx"),
      id("apps/renderer/src/main.tsx"),
    ].flatMap((moduleId) => packageDirOf(moduleId) ?? []);

    const names = collectThirdPartyLicenses(root, new Set(bundled), notices).entries.map(
      (entry) => entry.name,
    );

    expect(names).toEqual(["d", "react", "vendored"]);
  });

  test("warns about packages with no license, and ignores missing optional ones", () => {
    fixture({ e: "1" });
    write("node_modules/e/package.json", {
      name: "e",
      version: "1.0.0",
      optionalDependencies: { "e-win32": "1" },
    });

    const { entries, warnings } = collectThirdPartyLicenses(root, [], notices);

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
  ])("%o", (manifest, url) => {
    expect(sourceUrlOf(manifest)).toBe(url);
  });
});
