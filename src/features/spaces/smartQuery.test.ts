import { expect, test } from "bun:test";
import type { StoredSpace } from "../../lib/libraryApi";
import type { LibraryItem } from "../../lib/types";
import { visibleLibraryItems } from "./smartQuery";

const item = (id: string, title: string): LibraryItem => ({
  id,
  kind: "Note",
  title,
  description: "",
  source: "",
  date: "",
  tags: [],
});
const items = [item("a", "Alpha"), item("b", "Beta")];
const space = (name: string): StoredSpace => ({
  id: "space-1",
  name,
  color: "blue",
  query: {},
  kind: "regular",
  position: 1,
  createdAt: 0,
  updatedAt: 0,
});

test.each(["Reading", "Everything"])(
  "preview shows only the open regular Space's items when it is named %p",
  (name) => {
    const visible = visibleLibraryItems(items, {
      canUseDesktopBackend: false,
      query: "",
      activeSpace: space(name),
      localSpaceItems: new Map([["space-1", new Set(["b"])]]),
    });

    expect(visible.map((candidate) => candidate.id)).toEqual(["b"]);
  },
);
