import { expect, test } from "bun:test";
import { windowChrome } from "./chrome.ts";

test("Linux and Windows use custom caption buttons without a duplicate native overlay", () => {
  for (const platform of ["linux", "win32"] as const) {
    const { chrome, options } = windowChrome(platform);
    expect(chrome).toEqual({ controls: "custom-right", titlebarHeight: 32, controlsInset: 138 });
    expect(options.frame).toBe(false);
    expect(options.titleBarOverlay).toBeUndefined();
  }
});

test("macOS keeps its existing native traffic lights", () => {
  const { chrome, options } = windowChrome("darwin");
  expect(chrome.controls).toBe("native-left");
  expect(options).toEqual({ titleBarStyle: "hidden", trafficLightPosition: { x: 12, y: 10 } });
});
