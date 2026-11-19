import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createElement, act, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import type { PhoneCard } from "../desktop";
import type { Pairing } from "../pairing";

test("a recycled card never displays another item's thumbnail, including failed and out-of-order loads", async () => {
  const dom = new JSDOM("<div id='root'></div>");
  const names = ["window", "document", "IS_REACT_ACT_ENVIRONMENT"] as const;
  const before = names.map((name) => Object.getOwnPropertyDescriptor(globalThis, name));
  const values = [dom.window, dom.window.document, true];
  names.forEach((name, index) =>
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value: values[index],
    }),
  );
  const requests: { resolve: (uri: string) => void; reject: () => void }[] = [];
  // Run the real hook, replacing only the native desktop transport with controlled requests.
  const source = readFileSync(new URL("./useCardImage.ts", import.meta.url), "utf8")
    .replace(/^import[^\n]+\n/gmu, "")
    .replace("export function useCardImage", "function useCardImage");
  const code = new Bun.Transpiler({ loader: "ts" }).transformSync(source);
  const hook = new Function(
    "useEffect",
    "useState",
    "thumbnailUri",
    `${code}\nreturn useCardImage;`,
  )(
    useEffect,
    useState,
    () => new Promise<string>((resolve, reject) => requests.push({ resolve, reject })),
  ) as typeof import("./useCardImage").useCardImage;
  const pairing = { address: "desktop.example", token: "fixture" };
  const card = (id: string): PhoneCard => ({
    id,
    kind: "image",
    title: id,
    description: null,
    sourceUrl: null,
    createdAt: 0,
    hasThumbnail: true,
  });
  function Probe({ item, desktop = pairing }: { item: PhoneCard; desktop?: Pairing }) {
    return createElement("output", null, hook(desktop, item) ?? "none");
  }
  const root = createRoot(dom.window.document.getElementById("root")!);
  const visible = () => dom.window.document.querySelector("output")?.textContent;
  try {
    await act(async () => root.render(createElement(Probe, { item: card("A") })));
    await act(async () => requests[0]!.resolve("file:///A.webp"));
    expect(visible()).toBe("file:///A.webp");
    await act(async () => root.render(createElement(Probe, { item: card("B") })));
    expect(visible()).toBe("none");
    await act(async () => root.render(createElement(Probe, { item: card("C") })));
    await act(async () => requests[1]!.resolve("file:///late-B.webp"));
    expect(visible()).toBe("none");
    await act(async () => requests[2]!.reject());
    expect(visible()).toBe("none");
    await act(async () =>
      root.render(
        createElement(Probe, {
          item: { ...card("web"), hasThumbnail: false, imageUrl: "https://example.com/image.jpg" },
        }),
      ),
    );
    expect(visible()).toBe("https://example.com/image.jpg");
    await act(async () =>
      root.render(
        createElement(Probe, {
          item: card("A"),
          desktop: { ...pairing, address: "another.example" },
        }),
      ),
    );
    expect(visible()).toBe("none");
    await act(async () => requests[3]!.resolve("file:///other-A.webp"));
    expect(visible()).toBe("file:///other-A.webp");
  } finally {
    await act(async () => root.unmount());
    names.forEach((name, index) => {
      const descriptor = before[index];
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    });
    dom.window.close();
  }
});
