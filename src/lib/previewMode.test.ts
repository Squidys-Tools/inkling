import { describe, expect, test } from "bun:test";
import { hasPreviewQuery, isDevFlag, isPreviewBuildFlag, shouldUseSeedLibrary } from "./previewMode";

describe("hasPreviewQuery", () => {
  test("matches only preview=1", () => {
    expect(hasPreviewQuery("?preview=1")).toBe(true);
    expect(hasPreviewQuery("?preview=0")).toBe(false);
    expect(hasPreviewQuery("")).toBe(false);
    expect(hasPreviewQuery("?foo=1&preview=1")).toBe(true);
  });
});

describe("env flags", () => {
  test("reads explicit flag values", () => {
    expect(isPreviewBuildFlag({ VITE_INKLING_PREVIEW: "1" })).toBe(true);
    expect(isPreviewBuildFlag({})).toBe(false);
    expect(isPreviewBuildFlag(null)).toBe(false);
    expect(isDevFlag({ DEV: true })).toBe(true);
    expect(isDevFlag({ DEV: false })).toBe(false);
  });
});

describe("shouldUseSeedLibrary", () => {
  test("plain browser always uses seeds", () => {
    expect(shouldUseSeedLibrary({ tauri: false })).toBe(true);
  });

  test("tauri without query never uses seeds", () => {
    expect(shouldUseSeedLibrary({ tauri: true, search: "", dev: true })).toBe(false);
    expect(shouldUseSeedLibrary({ tauri: true, search: "", previewBuild: true })).toBe(false);
  });

  test("tauri with preview query only in dev or preview builds", () => {
    expect(shouldUseSeedLibrary({ tauri: true, search: "?preview=1", dev: true })).toBe(true);
    expect(
      shouldUseSeedLibrary({ tauri: true, search: "?preview=1", dev: false, previewBuild: true }),
    ).toBe(true);
    expect(
      shouldUseSeedLibrary({ tauri: true, search: "?preview=1", dev: false, previewBuild: false }),
    ).toBe(false);
  });
});
