import { expect, test } from "bun:test";
import { act, useLayoutEffect, type Dispatch, type SetStateAction } from "react";
import { createRoot } from "react-dom/client";
import type { CaptureSpace } from "./captureSpace";
import type { LibraryItem } from "../../lib/types";
import { installTestDom } from "../testDom";
import { useCapture } from "./useCapture";

function signal() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test("external URL, quote and image deep links enter Everything while in-app captures retain their Regular destination", async () => {
  const dom = installTestDom();
  const originalFetch = globalThis.fetch;
  let listener!: (payload: unknown) => void;
  let controller!: ReturnType<typeof useCapture>;
  let activeSpace: CaptureSpace = { id: "project", kind: "regular" };
  let done = signal();
  const memberships: string[] = [];
  const saved: string[] = [];
  const errors: Array<string | null> = [];
  let items: LibraryItem[] = [];
  let imageFails = false;
  const item = (kind: string, input: Record<string, unknown>) => {
    const id = `saved-${saved.length}`;
    saved.push(kind);
    return {
      id,
      kind,
      title: String(input.title ?? input.fileName ?? "Saved"),
      description: "",
      body: String(input.body ?? ""),
      bodyFormat: "md",
      sourceUrl: input.sourceUrl ?? null,
      sourceLabel: "fixture",
      localAssetPath: kind === "image" ? `assets/items/${id}/image.png` : null,
      thumbnailPath: null,
      ocrText: "",
      metadata: input.metadata ?? {},
      createdAt: 1,
      updatedAt: 1,
      archived: false,
    };
  };
  Object.defineProperty(window, "location", { configurable: true, value: { search: "" } });
  Object.defineProperty(window, "inkling", {
    configurable: true,
    value: {
      commands: {
        initialize_storage: async () => ({
          databasePath: "fixture",
          fts5Enabled: true,
          schemaVersion: 9,
        }),
        "plugin:deep-link|get_current": async () => [
          { kind: "url", url: "https://example.com/initial" },
        ],
        capture_url: async ({ input }: { input: Record<string, unknown> }) => item("url", input),
        create_quote: async ({ input }: { input: Record<string, unknown> }) => item("quote", input),
        create_note: async ({ input }: { input: Record<string, unknown> }) => item("note", input),
        save_file: async ({ input }: { input: Record<string, unknown> }) => item("image", input),
        add_space_item: async ({ spaceId, itemId }: { spaceId: string; itemId: string }) => {
          memberships.push(`${spaceId}:${itemId}`);
        },
      },
      onDeepLink: (handler: (payload: unknown) => void) => {
        listener = handler;
        return () => {};
      },
    },
  });
  globalThis.fetch = (async () =>
    new Response(imageFails ? "not found" : new Uint8Array([1, 2]), {
      status: imageFails ? 404 : 200,
      headers: { "content-type": "image/png" },
    })) as typeof fetch;
  // React dispatches are stable in App; preserve that identity so a fixture
  // re-render cannot reconnect and replay startup deep links.
  const setCaptureError: Dispatch<SetStateAction<string | null>> = (update) => {
    errors.push(typeof update === "function" ? update(null) : update);
  };
  function Probe() {
    const current = useCapture({
      canUseDesktopBackend: true,
      activeSpace,
      reload: () => done.resolve(),
      onLocalSpaceCapture: () => {},
      setItems: (update) => {
        items = typeof update === "function" ? update(items) : update;
      },
      setSelectedItem: () => {},
      setCaptureError,
      setIsSidebarOpen: () => {},
    });
    useLayoutEffect(() => {
      controller = current;
    }, [current]);
    return null;
  }
  const root = createRoot(document.getElementById("root")!);
  const external = async (payload: unknown) => {
    done = signal();
    await act(async () => {
      listener(payload);
      await done.promise;
    });
    expect(memberships).toEqual([]);
    expect(items).toEqual([]); // Never inject into the currently displayed Space.
  };
  try {
    await act(async () => {
      root.render(<Probe />);
    });
    await done.promise; // Startup/current deep links obey the same boundary.
    expect(saved).toEqual(["url"]);
    expect(memberships).toEqual([]);
    await external({ kind: "url", url: "https://example.com/article", title: "From browser" });
    await external({
      kind: "quote",
      url: "https://example.com/quote",
      selection: "Quoted text",
      attribution: "Author",
    });
    await external({
      kind: "image",
      pageUrl: "https://example.com/page",
      imageUrl: "https://example.com/image.png",
      alt: "Image",
    });
    imageFails = true;
    await external({
      kind: "image",
      pageUrl: "https://example.com/fallback",
      imageUrl: "https://example.com/missing.png",
      alt: "Missing",
    });
    expect(saved).toEqual(["url", "url", "quote", "image", "url"]);
    await act(async () => {
      await controller.saveNote("In-app note");
    });
    await act(async () => {
      await controller.saveLink("https://example.com/manual");
    });
    await act(async () => {
      await controller.saveQuote("In-app quote", "Author", "");
    });
    done = signal();
    await act(async () => {
      controller.captureFiles(
        [new File([new Uint8Array([1])], "manual.png", { type: "image/png" })],
        "file picker",
      );
      await done.promise;
    });
    expect(memberships).toEqual([
      "project:saved-5",
      "project:saved-6",
      "project:saved-7",
      "project:saved-8",
    ]);
    activeSpace = { id: "smart", kind: "smart" };
    await act(async () => {
      root.render(<Probe />);
    });
    done = signal();
    await act(async () => {
      listener({ kind: "url", url: "https://example.com/smart" });
      await done.promise;
    });
    expect(memberships).toHaveLength(4);
    expect(items).toEqual([]);
    expect(errors.filter(Boolean)).toEqual([]);
  } finally {
    await act(async () => {
      root.unmount();
    });
    globalThis.fetch = originalFetch;
    Reflect.deleteProperty(window, "inkling");
    dom.restore();
  }
});
