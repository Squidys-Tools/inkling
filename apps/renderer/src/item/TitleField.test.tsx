import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { fitsTitleEdit, nameEnd, singleLine } from "./titleEdit.ts";

test("a title refetch cannot replace an active draft or reset its caret", async () => {
  const dom = new JSDOM("<div id='root'></div>", { pretendToBeVisual: true });
  const names = [
    "window",
    "document",
    "NodeFilter",
    "InputEvent",
    "matchMedia",
    "IS_REACT_ACT_ENVIRONMENT",
  ] as const;
  const before = names.map((name) => Object.getOwnPropertyDescriptor(globalThis, name));
  const values = [
    dom.window,
    dom.window.document,
    dom.window.NodeFilter,
    dom.window.InputEvent,
    () => ({ matches: true }),
    true,
  ];
  names.forEach((name, index) =>
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value: values[index],
    }),
  );
  // Execute the real component/hooks with only StyleX's build-time token boundary stubbed.
  const source = readFileSync(new URL("./TitleField.tsx", import.meta.url), "utf8")
    .replace(/^import[\s\S]*?from ["'][^"']+["'];\n/gm, "")
    .replace("export function TitleField", "function TitleField");
  const code = new Bun.Transpiler({
    loader: "tsx",
    tsconfig: {
      compilerOptions: { jsx: "react", jsxFactory: "React.createElement" },
    },
  }).transformSync(source);
  const Component = new Function(
    "React",
    "useLayoutEffect",
    "useRef",
    "useState",
    "stylex",
    "color",
    "font",
    "motion",
    "radius",
    "space",
    "fitsTitleEdit",
    "nameEnd",
    "singleLine",
    `${code}\nreturn TitleField;`,
  )(
    React,
    React.useLayoutEffect,
    React.useRef,
    React.useState,
    { create: (value: object) => value, props: () => ({}) },
    {},
    {},
    {},
    {},
    {},
    fitsTitleEdit,
    nameEnd,
    singleLine,
  ) as React.ComponentType<{
    title: string;
    onRename: (value: string) => void;
  }>;
  const root = createRoot(dom.window.document.getElementById("root")!);
  const renamed: string[] = [];
  const onRename = (value: string) => renamed.push(value);
  try {
    await act(async () => root.render(<Component title="Original.png" onRename={onRename} />));
    await act(async () => dom.window.document.querySelector("button")!.click());
    const editor = dom.window.document.querySelector<HTMLElement>("[role=textbox]")!;
    editor.textContent = "My draft.png";
    const range = dom.window.document.createRange();
    range.setStart(editor.firstChild!, 3);
    range.collapse(true);
    dom.window.getSelection()!.removeAllRanges();
    dom.window.getSelection()!.addRange(range);
    await act(async () =>
      root.render(<Component title="Background refetch.png" onRename={onRename} />),
    );
    expect(editor.textContent).toBe("My draft.png");
    expect(dom.window.getSelection()!.anchorNode).toBe(editor.firstChild);
    expect(dom.window.getSelection()!.anchorOffset).toBe(3);
    await act(async () =>
      editor.dispatchEvent(
        new dom.window.KeyboardEvent("keydown", {
          key: "Enter",
          bubbles: true,
        }),
      ),
    );
    expect(renamed).toEqual(["My draft.png"]);
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
