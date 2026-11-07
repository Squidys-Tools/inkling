import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { Toast } from "@base-ui/react/toast";
import { bindingsFor, shortcuts } from "@inkling/contracts/shortcuts";
import { useHotkey, useHotkeys } from "@tanstack/react-hotkeys";
import { createAtom } from "@tanstack/react-store";
import { createNotifications } from "./toasts.ts";

function load<T>(path: string, inject: Record<string, unknown>, exports: string): T {
  const source = readFileSync(new URL(path, import.meta.url), "utf8")
    .replace(/^import[\s\S]*?from ["'][^"']+["'];\n/gm, "")
    .replace(/export /gu, "");
  const code = new Bun.Transpiler({
    loader: path.endsWith(".tsx") ? "tsx" : "ts",
    tsconfig: { compilerOptions: { jsx: "react" } },
  }).transformSync(source);
  return new Function(...Object.keys(inject), `${code}\nreturn {${exports}};`)(
    ...Object.values(inject),
  ) as T;
}

function fixture() {
  const dom = new JSDOM('<button id="page">Page</button><div id="root"></div>', {
    pretendToBeVisual: true,
  });
  const names = [
    "window",
    "document",
    "navigator",
    "HTMLElement",
    "Element",
    "Node",
    "NodeFilter",
    "MutationObserver",
    "Event",
    "KeyboardEvent",
    "MouseEvent",
    "FocusEvent",
    "ShadowRoot",
    "DocumentFragment",
    "getComputedStyle",
    "requestAnimationFrame",
    "cancelAnimationFrame",
    "IS_REACT_ACT_ENVIRONMENT",
  ];
  const previous = names.map((name) => Object.getOwnPropertyDescriptor(globalThis, name));
  const bound = new Set(["getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame"]);
  for (const name of names) {
    const value = name === "IS_REACT_ACT_ENVIRONMENT" ? true : Reflect.get(dom.window, name);
    Object.defineProperty(globalThis, name, {
      configurable: true,
      value: bound.has(name) ? value.bind(dom.window) : value,
    });
  }
  return {
    dom,
    restore: () => {
      dom.window.close();
      names.forEach((name, i) => {
        const old = previous[i];
        if (old) Object.defineProperty(globalThis, name, old);
        else Reflect.deleteProperty(globalThis, name);
      });
    },
  };
}

test("nonmodal notifications preserve commands and page Escape, but own focused Escape without closing the page", async () => {
  const f = fixture();
  const notices = createNotifications();
  const calls: string[] = [];
  let fromMenu = (_command: string) => {};
  let escaped = 0;
  const router = {
    state: { location: { pathname: "/" } },
    navigate: ({ to }: { to: string }) => calls.push(to),
    history: { back: () => calls.push("back"), forward: () => {} },
  };
  const { useCommands } = load<{ useCommands: () => void }>(
    "../shell/useCommands.ts",
    {
      useEffect: React.useEffect,
      useHotkeys,
      useRouter: () => router,
      desktop: {
        onCommand: (fn: typeof fromMenu) => {
          fromMenu = fn;
          return () => {};
        },
      },
      platform: "linux",
      bindingsFor,
      shortcuts,
      runHandledCommand: (command: string) => calls.push(command),
    },
    "useCommands",
  );
  const { useEscape } = load<{ useEscape: (run: () => void) => void }>(
    "../item/useEscape.ts",
    { useHotkey },
    "useEscape",
  );
  // Root/events are real; StyleX and the SSR-safe Portal boundary are inert in JSDOM.
  const { Toaster } = load<{ Toaster: React.ComponentType }>(
    "./Toaster.tsx",
    {
      React,
      Toast: { ...Toast, Portal: ({ children }: { children: React.ReactNode }) => <>{children}</> },
      notifications: notices,
      HugeiconsIcon: () => null,
      Cancel01Icon: {},
      stylex: { create: (value: object) => value, props: () => ({}) },
      color: {},
      font: {},
      motion: {},
      radius: {},
    },
    "Toaster",
  );
  function App() {
    useCommands();
    useEscape(() => {
      escaped++;
    });
    return <Toaster />;
  }
  const root = createRoot(document.getElementById("root")!);
  const page = document.getElementById("page")!;
  const escape = (target: Element) => {
    const e = new f.dom.window.KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    });
    target.dispatchEvent(e);
    return e;
  };
  const sideBack = () => {
    const e = new f.dom.window.MouseEvent("mouseup", {
      button: 3,
      bubbles: true,
      cancelable: true,
    });
    page.dispatchEvent(e);
    return e;
  };
  try {
    await act(async () => root.render(<App />));
    await act(async () =>
      notices.notify("Archived", { id: "archive", action: { label: "Undo", run: () => {} } }),
    );
    await act(async () => {
      fromMenu("search");
      fromMenu("openSettings");
      page.dispatchEvent(
        new f.dom.window.KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }),
      );
      expect(sideBack().defaultPrevented).toBe(true);
      escape(page);
    });
    expect(calls).toEqual(["search", ".", "search", "back"]);
    expect(escaped).toBe(1);
    const modal = document.createElement("div");
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    document.body.append(modal);
    await act(async () => {
      fromMenu("search");
      page.dispatchEvent(
        new f.dom.window.KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }),
      );
      sideBack();
      escape(page);
    });
    expect(calls).toHaveLength(4);
    expect(escaped).toBe(1);
    modal.id = "settings-sheet";
    await act(async () => {
      fromMenu("search");
      sideBack();
    });
    expect(calls.slice(4)).toEqual(["back"]);
    modal.remove();
    // A bare key runs from the page but stays text in a field.
    const field = document.createElement("input");
    document.body.append(field);
    await act(async () => {
      page.dispatchEvent(new f.dom.window.KeyboardEvent("keydown", { key: "n", bubbles: true }));
      field.focus();
      field.dispatchEvent(new f.dom.window.KeyboardEvent("keydown", { key: "n", bubbles: true }));
    });
    expect(calls.slice(5)).toEqual(["/add/note"]);
    field.remove();
    // The welcome demos these shortcuts; running one would leave onboarding unfinished.
    router.state.location.pathname = "/welcome";
    await act(async () => {
      fromMenu("search");
      page.dispatchEvent(
        new f.dom.window.KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }),
      );
      sideBack();
    });
    expect(calls).toHaveLength(6);
    router.state.location.pathname = "/";
    for (const error of [false, true]) {
      await act(async () => {
        notices.dismiss("archive");
        if (error) notices.notifyError("Failed", undefined, "focused");
        else notices.notify("Saved", { id: "focused" });
      });
      const toast = [...document.querySelectorAll<HTMLElement>('[aria-modal="false"]')].find(
        (node) => node.textContent?.includes(error ? "Failed" : "Saved"),
      )!;
      expect(toast).toBeDefined();
      await act(async () => toast.focus());
      await act(async () => expect(escape(toast).defaultPrevented).toBe(true));
      expect(escaped).toBe(1);
    }
  } finally {
    await act(async () => root.unmount());
    f.restore();
  }
});

test("on macOS desktop, Cmd shortcuts reach commands only through the menu", async () => {
  const f = fixture();
  const calls: string[] = [];
  const { useCommands } = load<{ useCommands: () => void }>(
    "../shell/useCommands.ts",
    {
      useEffect: React.useEffect,
      useHotkeys,
      useRouter: () => ({ state: { location: { pathname: "/" } } }),
      desktop: { onCommand: () => () => {} },
      platform: "darwin",
      bindingsFor,
      shortcuts,
      runHandledCommand: (command: string) => calls.push(command),
    },
    "useCommands",
  );
  function App() {
    useCommands();
    return null;
  }
  const root = createRoot(document.getElementById("root")!);
  const key = (init: KeyboardEventInit) =>
    document.body.dispatchEvent(
      new f.dom.window.KeyboardEvent("keydown", { ...init, bubbles: true }),
    );
  try {
    await act(async () => root.render(<App />));
    await act(async () => {
      key({ key: "k", metaKey: true });
      key({ key: "/" });
    });
    expect(calls).toEqual(["search"]);
  } finally {
    await act(async () => root.unmount());
    f.restore();
  }
});

test("form failure replacing a paste failure releases capture ownership on close or eviction without clearing a newer error", async () => {
  const notices = createNotifications();
  const cap = load<{
    reportCaptureError: (message: string) => void;
    useCaptureState: (select: (value: { error: string | null }) => string | null) => string | null;
  }>(
    "../capture/capture.ts",
    {
      createAtom,
      useSelector: (store: { get: () => unknown }, select: (value: unknown) => unknown) =>
        select(store.get()),
      errorMessage: (e: Error) => e.message,
      notifications: notices,
      notify: notices.notify,
      notifyError: notices.notifyError,
    },
    "reportCaptureError,useCaptureState",
  );
  const { useAddPage } = load<{
    useAddPage: () => { save: (write: () => Promise<unknown>) => Promise<boolean> };
  }>(
    "../item/add/useAddPage.ts",
    {
      useNavigate: () => () => {},
      useStepBack: () => () => {},
      useState: () => [null, () => {}],
      useRef: (initial: unknown) => ({ current: initial }),
      captureDestination: () => null,
      reportCaptureError: cap.reportCaptureError,
      notifyError: notices.notifyError,
      useMounted: () => ({ current: true }),
      useEscape: () => {},
      saveCaptured: () => Promise.reject(new Error("Form failed")),
      errorMessage: (e: Error) => e.message,
    },
    "useAddPage",
  );
  const error = () => cap.useCaptureState((state) => state.error);
  cap.reportCaptureError("Paste failed");
  await expect(useAddPage().save(async () => {})).rejects.toThrow("Form failed");
  expect(error()).toBe("Form failed");
  notices.dismiss("capture-error");
  expect(error()).toBeNull();
  cap.reportCaptureError("Evicted form failure");
  for (let i = 0; i < 3; i++) notices.notify(`Other ${i}`);
  expect(error()).toBeNull();
  cap.reportCaptureError("Newer failure");
  notices.dismiss("unrelated");
  expect(error()).toBe("Newer failure");
});
