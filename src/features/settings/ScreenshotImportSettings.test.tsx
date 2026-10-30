import { expect, test } from "bun:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { installTestDom } from "../testDom";
import { ScreenshotImportSettings } from "./ScreenshotImportSettings";

test("a rejected Off keeps the backend restart warning visible in the actual Settings consumer", async () => {
  const dom = installTestDom();
  const previous = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({
    CSS: { escape: (text: string) => text },
    ResizeObserver: class {
      observe() {}
      disconnect() {}
    },
  })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const warning =
    "Screenshot import is off for this session, but Off could not be saved. It may resume after restart; check the preferences file permissions.";
  let failed = false;
  Object.defineProperty(window, "inkling", {
    configurable: true,
    value: {
      commands: {
        get_screenshot_import_state: async () => ({
          enabled: !failed,
          directory: "/isolated/Screenshots",
          status: failed ? "error" : "watching",
          imported: 0,
          message: failed ? warning : null,
        }),
        set_screenshot_import_enabled: async ({ enabled }: { enabled: boolean }) => {
          expect(enabled).toBe(false);
          failed = true;
          throw new Error("EACCES");
        },
      },
    },
  });
  const root = createRoot(document.getElementById("root")!);
  try {
    await act(async () => {
      root.render(<ScreenshotImportSettings />);
    });
    const off = document.querySelector<HTMLInputElement>('input[value="off"]')!;
    await act(async () => {
      off.checked = true;
      off.dispatchEvent(new dom.window.Event("click", { bubbles: true }));
    });
    expect(failed).toBe(true);
    expect(document.querySelector('[role="status"]')?.textContent).toBe(warning);
    expect(document.querySelector('[data-value="off"]')?.hasAttribute("data-checked")).toBe(true);
    expect(document.querySelector('[role="status"]')?.textContent).not.toContain(
      "Could not change screenshot import.",
    );
  } finally {
    await act(async () => {
      root.unmount();
    });
    Reflect.deleteProperty(window, "inkling");
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
    dom.restore();
  }
});
