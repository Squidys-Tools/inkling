import { expect, test } from "bun:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { DeepLinkCapture } from "../../lib/deepLink";
import { installTestDom } from "../testDom";
import { useCapture } from "./useCapture";

function resolvable<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

// linkedom's window is a proxy over globalThis, so the bridge is a global too.
function installGlobals(values: Record<string, unknown>) {
  const previous = Object.keys(values).map(
    (name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const,
  );
  for (const [name, value] of Object.entries(values)) {
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  return () => {
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  };
}

test("a deep link quote that fails to save shows the capture error", async () => {
  const { restore } = installTestDom();
  const subscribed = resolvable<(captures: DeepLinkCapture[]) => void>();
  const shownError = resolvable<string>();
  const restoreGlobals = installGlobals({
    location: { search: "" },
    inkling: {
      commands: {
        initialize_storage: async () => ({}),
        "plugin:deep-link|get_current": async () => [],
        create_quote: async () => {
          throw new Error("The library is read-only.");
        },
      },
      onDeepLink: async (listener: (captures: DeepLinkCapture[]) => void) => {
        subscribed.resolve(listener);
        return () => {};
      },
    },
  });
  function Probe() {
    useCapture({
      canUseDesktopBackend: true,
      setItems: () => {},
      setSelectedItem: () => {},
      setCaptureError: (value) => {
        if (typeof value === "string") shownError.resolve(value);
      },
    });
    return null;
  }

  const root = createRoot(document.getElementById("root")!);
  try {
    await act(async () => root.render(<Probe />));
    const deliver = await subscribed.promise;
    await act(async () => {
      deliver([
        { kind: "quote", url: "https://example.com/", selection: "Keep this", attribution: "Ex" },
      ]);
      expect(await shownError.promise).toBe("The library is read-only.");
    });
  } finally {
    await act(async () => root.unmount());
    restoreGlobals();
    restore();
  }
});
