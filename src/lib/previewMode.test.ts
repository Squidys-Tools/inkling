import { describe, expect, test } from "bun:test";
import { shouldUseSeedLibrary } from "./previewMode";

describe("shouldUseSeedLibrary", () => {
  test("desktop without query never uses seeds", () => {
    expect(shouldUseSeedLibrary({ desktop: true, search: "", dev: true })).toBe(false);
    expect(shouldUseSeedLibrary({ desktop: true, search: "", previewBuild: true })).toBe(false);
  });

  test("desktop with preview query only in dev or preview builds", () => {
    expect(shouldUseSeedLibrary({ desktop: true, search: "?preview=1", dev: true })).toBe(true);
    expect(
      shouldUseSeedLibrary({ desktop: true, search: "?preview=1", dev: false, previewBuild: true }),
    ).toBe(true);
    expect(
      shouldUseSeedLibrary({
        desktop: true,
        search: "?preview=1",
        dev: false,
        previewBuild: false,
      }),
    ).toBe(false);
  });
});
