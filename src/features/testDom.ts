import { parseHTML } from "linkedom";
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";

// Gives React a linkedom document with a #root to render into. The returned
// restore puts back whatever globals were there before.
export function installTestDom() {
  const { window } = parseHTML("<!doctype html><html><body><div id='root'></div></body></html>");
  const previous = new Map<string, PropertyDescriptor | undefined>();
  for (const [name, value] of Object.entries({
    window,
    document: window.document,
    HTMLElement: window.HTMLElement,
    Element: window.Element,
    SVGElement: window.SVGElement,
    Node: window.Node,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  return {
    window,
    restore() {
      for (const [name, descriptor] of previous) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else Reflect.deleteProperty(globalThis, name);
      }
    },
  };
}

// Renders `content` into a fresh test DOM, runs `check` on it, then unmounts.
export async function mountInTestDom(
  content: ReactNode,
  check: (doc: Document) => void | Promise<void>,
) {
  const { restore } = installTestDom();
  const root = createRoot(document.getElementById("root")!);
  try {
    await act(async () => root.render(content));
    await check(document);
  } finally {
    await act(async () => root.unmount());
    restore();
  }
}
