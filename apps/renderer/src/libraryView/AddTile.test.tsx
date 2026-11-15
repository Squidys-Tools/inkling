import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";

test("the add tile keeps its words through a scroll-away and a failed save, and takes pasted text over a picture of it", async () => {
  const dom = new JSDOM("<div id='root'></div>", { pretendToBeVisual: true });
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
  const saves: { text: string; settle: (saved: boolean) => void }[] = [];
  const captureText = (text: string) =>
    new Promise<boolean>((settle) => saves.push({ text, settle }));
  const pictures: File[][] = [];
  // The real component, with StyleX's build-time tokens and the library client stubbed.
  const source = readFileSync(new URL("./AddTile.tsx", import.meta.url), "utf8")
    .replace(/^import[\s\S]*?from ["'][^"']+["'];\n/gm, "")
    .replace("export function AddTile", "function AddTile");
  const code = new Bun.Transpiler({
    loader: "tsx",
    tsconfig: { compilerOptions: { jsx: "react", jsxFactory: "React.createElement" } },
  }).transformSync(source);
  const AddTile = new Function(
    "React",
    "useState",
    "stylex",
    "color",
    "font",
    "motion",
    "radius",
    "captureText",
    "captureFiles",
    `${code}\nreturn AddTile;`,
  )(
    React,
    React.useState,
    { create: (value: object) => value, props: () => ({}) },
    {},
    {},
    {},
    {},
    captureText,
    (files: File[]) => pictures.push(files),
  ) as React.ComponentType;

  const root = createRoot(dom.window.document.getElementById("root")!);
  const field = () => dom.window.document.querySelector("textarea")!;
  // react-dom loaded before this window existed, so its change detection is unreliable here;
  // the field's own handlers are called instead.
  const handlers = () => {
    const key = Object.keys(field()).find((name) => name.startsWith("__reactProps$"))!;
    return Reflect.get(field(), key) as {
      onChange: (event: { currentTarget: { value: string } }) => void;
      onKeyDown: (event: object) => void;
      onPaste: (event: object) => void;
    };
  };
  const type = (value: string) =>
    act(async () => handlers().onChange({ currentTarget: { value } }));
  const press = (shiftKey = false) =>
    act(async () =>
      handlers().onKeyDown({
        key: "Enter",
        shiftKey,
        nativeEvent: { isComposing: false },
        currentTarget: field(),
        preventDefault: () => {},
      }),
    );
  const paste = (files: File[], text: string, types: string[] = []) =>
    act(async () =>
      handlers().onPaste({
        clipboardData: { files, types, getData: () => text },
        preventDefault: () => {},
      }),
    );
  try {
    await act(async () => root.render(<AddTile />));
    await type("a thought");
    await act(async () => root.render(<div />));
    await act(async () => root.render(<AddTile />));
    expect(field().value).toBe("a thought");

    await press(true);
    expect(saves).toHaveLength(0);

    await press();
    expect(saves.map((save) => save.text)).toEqual(["a thought"]);
    expect(field().value).toBe("");
    await act(async () => saves[0].settle(false));
    expect(field().value).toBe("a thought");

    await press();
    await type("the next one");
    await act(async () => saves[1].settle(false));
    expect(field().value).toBe("a thought\nthe next one");

    const picture = new File(["png"], "shot.png", { type: "image/png" });
    await paste([picture], "");
    await paste([picture], "a copied cell", ["text/plain", "text/html", "Files"]);
    await paste([picture], "shot.png", ["text/plain", "Files"]);
    expect(pictures).toEqual([[picture], [picture]]);
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
