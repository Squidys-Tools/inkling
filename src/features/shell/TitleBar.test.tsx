import { afterEach, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { customWindowChrome } from "../../../electron/window-chrome";
import { TitleBar } from "./TitleBar";

const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
afterEach(() => {
  if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
  else Reflect.deleteProperty(globalThis, "window");
});
function setWindow(value: object) {
  Object.defineProperty(globalThis, "window", { configurable: true, writable: true, value });
}

test("custom captions retain the original design without competing native chrome", () => {
  setWindow({ inkling: { windowControls: {} } });
  const markup = renderToStaticMarkup(<TitleBar />);
  expect((markup.match(/<button/g) ?? []).length).toBe(3);
  for (const label of ["Minimize", "Maximize or restore", "Close window"])
    expect(markup).toContain(`aria-label="${label}"`);
  expect(markup).toContain("-webkit-app-region:drag");
  expect(markup).toContain("-webkit-app-region:no-drag");
  expect(markup).toContain("right-[138px]");
  expect(customWindowChrome).toEqual({
    frame: false,
    titleBarStyle: process.platform === "linux" ? "default" : "hidden",
    titleBarOverlay: false,
  });
});

test("ordinary browser preview does not gain desktop captions", () => {
  setWindow({});
  expect(renderToStaticMarkup(<TitleBar />)).toBe("");
});
