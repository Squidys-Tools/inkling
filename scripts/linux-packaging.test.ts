import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

test("Linux packaging preserves Windows NSIS and standard sandbox maintainer scripts", () => {
  expect(pkg.build.win).toMatchObject({ icon: "build/icon.ico", target: ["nsis"] });
  expect(pkg.build.linux.target).toEqual(["deb", "AppImage"]);
  expect(pkg.build.deb.afterInstall).toBeUndefined();
  expect(pkg.build.deb.afterRemove).toBeUndefined();
  expect(pkg.build.deb.appArmorProfile).toBeUndefined();
  expect(pkg.build.linux.executableArgs).toBeUndefined();
  expect(pkg.scripts["build:linux"]).toContain("--publish never --linux deb AppImage");
});

test("desktop identity and capture scheme agree", () => {
  expect(pkg.desktopName).toBe("inkling.desktop");
  expect(pkg.build.linux.syncDesktopName).toBe(true);
  expect(pkg.build.linux.desktop.entry.StartupWMClass).toBe("inkling");
  expect(pkg.build.linux.desktop.entry.MimeType).toBe("x-scheme-handler/inkling;");
  expect(pkg.build.protocols[0].schemes).toContain("inkling");
});

test("sharp WASM dependency is pinned with the Linux Electron-only patch", async () => {
  expect(pkg.dependencies.sharp).toBe("0.35.5");
  expect(pkg.dependencies["@img/sharp-wasm32"]).toBe(pkg.dependencies.sharp);
  const patch = await readFile(
    new URL(`../${pkg.patchedDependencies["sharp@0.35.5"]}`, import.meta.url),
    "utf8",
  );
  expect(patch).toContain("a/dist/sharp.cjs");
  expect(patch).toContain("a/dist/sharp.mjs");
  expect(patch.match(/process\.platform === 'linux' && process\.versions\.electron/g)).toHaveLength(
    2,
  );
  expect(patch.match(/require\('@img\/sharp-wasm32\/sharp\.node'\)/g)).toHaveLength(2);
});
