import { expect, test } from "bun:test";
import { parseHTML } from "linkedom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { AppRecovery } from "./AppRecovery";

test("an unexpected render error keeps a visible recovery action instead of a blank root", async () => {
  const { window: dom } = parseHTML("<html><body><div id='root'></div></body></html>");
  const prior = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({
    window: dom,
    document: dom.document,
    HTMLElement: dom.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    prior.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const messages: unknown[][] = [],
    oldError = console.error;
  console.error = (...args) => {
    messages.push(args);
  };
  const root = createRoot(document.getElementById("root")!);
  function Broken(): never {
    throw new Error("missing grid revision");
  }
  try {
    await act(async () =>
      root.render(
        <AppRecovery>
          <Broken />
        </AppRecovery>,
      ),
    );
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("Your saved library");
    expect(document.querySelector("button")?.textContent).toContain("safe graphics");
    expect(messages.length).toBeGreaterThan(0);
  } finally {
    await act(async () => root.unmount());
    console.error = oldError;
    for (const [key, descriptor] of prior) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
