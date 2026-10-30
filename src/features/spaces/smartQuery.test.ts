import { expect, test } from "bun:test";
import type { StoredSpace } from "../../lib/libraryApi";
import type { LibraryItem } from "../../lib/types";
import { visibleLibraryItems } from "./smartQuery";

test("preview exclusions stay local to their Smart Space after filtering moves out of App", () => {
  const items = ["kept", "excluded"].map((id) => ({
    id,
    kind: "Note",
    title: "coding",
    description: "coding",
    source: "Notes",
    tags: [],
    date: "Now",
  })) as LibraryItem[];
  const smart: StoredSpace = {
    id: "smart",
    name: "Coding",
    kind: "smart",
    color: "blue",
    query: { text: "coding" },
    position: 0,
    createdAt: 0,
    updatedAt: 0,
  };
  const localSpaceItems = new Map([["regular", new Set(["excluded"])]]);
  const localSpaceExclusions = new Map([[smart.id, new Set(["excluded"])]]);
  const options = {
    canUseDesktopBackend: false,
    query: "",
    activeView: "Coding",
    activeSpace: smart,
    localSpaceItems,
    localSpaceExclusions,
  };
  const ids = (rows: LibraryItem[]) => rows.map((row) => row.id);
  expect(ids(visibleLibraryItems(items, options))).toEqual(["kept"]);
  expect(
    ids(visibleLibraryItems(items, { ...options, activeView: "Everything", activeSpace: null })),
  ).toEqual(["kept", "excluded"]);
  expect(
    ids(visibleLibraryItems(items, { ...options, activeSpace: { ...smart, id: "other" } })),
  ).toEqual(["kept", "excluded"]);
  expect(
    ids(
      visibleLibraryItems(items, {
        ...options,
        activeSpace: { ...smart, id: "regular", kind: "regular" },
      }),
    ),
  ).toEqual(["excluded"]);
  // The desktop result is already scoped by storage; preview state cannot filter it twice.
  expect(ids(visibleLibraryItems(items, { ...options, canUseDesktopBackend: true }))).toEqual([
    "kept",
    "excluded",
  ]);
  expect([...localSpaceExclusions.get(smart.id)!]).toEqual(["excluded"]);
});
