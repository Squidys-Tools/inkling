import { describe, expect, test } from "bun:test";
import { appKeyboardShortcut } from "./keyboardShortcuts";

function keyEvent(key: string, overrides: Partial<KeyboardEvent> = {}) {
  return {
    key,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    isComposing: false,
    ...overrides,
  };
}

describe("appKeyboardShortcut", () => {
  test("does not steal keys from editors or modified text input", () => {
    expect(appKeyboardShortcut(keyEvent("/"), true)).toBeNull();
    expect(appKeyboardShortcut(keyEvent("k", { ctrlKey: true }), true)).toBeNull();
    expect(appKeyboardShortcut(keyEvent("n", { shiftKey: true }), false)).toBeNull();
    expect(appKeyboardShortcut(keyEvent("k", { ctrlKey: true, shiftKey: true }), false)).toBeNull();
    expect(appKeyboardShortcut(keyEvent("n", { altKey: true }), false)).toBeNull();
    expect(appKeyboardShortcut(keyEvent("n", { isComposing: true }), false)).toBeNull();
  });
});
