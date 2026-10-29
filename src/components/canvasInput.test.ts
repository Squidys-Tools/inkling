import { expect, test } from "bun:test";
import { parseHTML } from "linkedom";
import { canvasAllowsDomInput } from "./canvasInput";

for (const target of ["canvas", "content", "descendant", "none"] as const) {
  test(`canvas input probe ${target} preserves input or selects the DOM fallback`, () => {
    const { document } = parseHTML("<html><body><main>Library</main></body></html>");
    Object.defineProperty(document, "elementFromPoint", {
      value: () => {
        const canvas = document.querySelector("canvas")!;
        const content = canvas.firstElementChild!;
        if (target === "none") return null;
        if (target === "canvas") return canvas;
        if (target === "content") return content;
        const child = document.createElement("span");
        content.append(child);
        return child;
      },
    });
    expect(canvasAllowsDomInput(document)).toBe(target === "content" || target === "descendant");
    expect(document.querySelector("canvas")).toBeNull();
    expect(document.body.textContent).toBe("Library");
  });
}

test("a failed probe cannot leave an invisible pointer blocker behind", () => {
  const { document } = parseHTML("<html><body></body></html>");
  Object.defineProperty(document, "elementFromPoint", {
    value: () => {
      throw Error("probe failure");
    },
  });
  expect(() => canvasAllowsDomInput(document)).toThrow("probe failure");
  expect(document.querySelector("canvas")).toBeNull();
});
