import { expect, test } from "bun:test";
import { selectSitePreviewBase } from "../../.github/scripts/site-preview-base.mjs";

test("compares only the latest push while its previous head is an ancestor", () => {
  expect(
    selectSitePreviewBase({
      before: "previous-head",
      base: "main",
      head: "new-head",
      isAncestor: (ancestor: string, descendant: string) =>
        ancestor === "previous-head" && descendant === "new-head",
    }),
  ).toBe("previous-head");
});

test("falls back to the PR base after a force-push rebase", () => {
  expect(
    selectSitePreviewBase({
      before: "old-pr-head",
      base: "current-main",
      head: "rebased-head",
      isAncestor: () => false,
    }),
  ).toBe("current-main");
});

test("falls back to the PR base when there is no previous head", () => {
  expect(
    selectSitePreviewBase({
      before: "",
      base: "current-main",
      head: "first-head",
      isAncestor: () => false,
    }),
  ).toBe("current-main");
});
