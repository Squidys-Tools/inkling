import { expect, mock, test } from "bun:test";
import { parseHTML } from "linkedom";
import { act } from "react";
import { createRoot } from "react-dom/client";
// Vite's compile-time personal seed glob is not part of this native-only hook test.
mock.module("./seed", () => ({ demoSeedItems: [] }));
const { useLibraryData } = await import("./useLibraryData");
import type { StoredLibraryCard } from "../../lib/libraryApi";

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
function card(id: string) {
  return {
    id,
    kind: "note",
    title: id,
    description: "",
    metadata: {},
    sourceUrl: null,
    sourceLabel: "local",
    thumbnailPath: null,
    localAssetPath: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    archived: false,
    ocrText: "",
    hasArticleContent: false,
  } as StoredLibraryCard;
}

test("text matches paint before a held model and late semantic results never overwrite a newer query", async () => {
  const { window: dom } = parseHTML("<html><body><div id='root'></div></body></html>");
  const previous = new Map<string, PropertyDescriptor | undefined>();
  const held = new Map<string, (value: unknown) => void>();
  const calls: string[] = [];
  const commands = {
    initialize_storage: async () => null,
    count_active_items: async () => 8,
    list_active_items: async () => [card("all")],
    get_change_count: async () => 1,
    count_active_jobs: async () => 0,
    get_search_progress: async () => ({ ready: 8, total: 8 }),
    get_jobs_for_items: async () => [],
    search_items_detailed: async ({
      query,
      lexicalOnly,
    }: {
      query: string;
      lexicalOnly: boolean;
    }) => {
      calls.push(`${query}:${lexicalOnly}`);
      if (lexicalOnly) return { items: [card(`${query}-text`)], message: null, status: "ready" };
      return new Promise((resolve) => held.set(query, resolve));
    },
  };
  // Linkedom proxies share descriptors with earlier suites; restore exactly.
  for (const [key, value] of Object.entries({
    location: { search: "" },
    inkling: { commands, onJobUpdated: () => () => {} },
  })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(dom, key, { configurable: true, writable: true, value });
  }
  const globals = {
    window: dom,
    document: dom.document,
    HTMLElement: dom.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  for (const [key, value] of Object.entries(globals)) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const setSelectedItem = () => {},
    setCaptureError = () => {};
  let latest: ReturnType<typeof useLibraryData>;
  function Probe({ query }: { query: string }) {
    latest = useLibraryData({
      canUseDesktopBackend: true,
      query,
      activeSpaceId: null,
      setSelectedItem,
      setCaptureError,
    });
    return <p>{latest.items.map((item) => item.id).join(",")}</p>;
  }
  const root = createRoot(document.getElementById("root")!);
  try {
    await act(async () => {
      root.render(<Probe query="" />);
    });
    await act(async () => {
      await pause(10);
    });
    await act(async () => {
      root.render(<Probe query="cat" />);
    });
    await act(async () => {
      await pause(90);
    });
    expect(document.querySelector("p")?.textContent).toBe("cat-text");
    expect(held.has("cat")).toBe(true);
    await act(async () => {
      root.render(<Probe query="dog" />);
    });
    await act(async () => {
      await pause(90);
    });
    expect(document.querySelector("p")?.textContent).toBe("dog-text");
    await act(async () => {
      held.get("cat")!({ items: [card("stale-cat")], message: null });
    });
    expect(document.querySelector("p")?.textContent).toBe("dog-text");
    await act(async () => {
      held.get("dog")!({ items: [card("dog-semantic")], message: null });
    });
    expect(document.querySelector("p")?.textContent).toBe("dog-semantic");
    expect(calls).toEqual(["cat:true", "cat:false", "dog:true", "dog:false"]);
  } finally {
    await act(async () => root.unmount());
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
