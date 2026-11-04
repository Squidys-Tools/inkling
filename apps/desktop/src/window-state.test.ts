import { expect, test } from "bun:test";
import { channels } from "./channels.ts";
import { bindMaximizedState } from "./window-state.ts";

test("maximize and unmaximize report the owning window's real state only", () => {
  let maximized = false,
    destroyed = false;
  const handlers = new Map<string, () => void>();
  const messages: unknown[] = [];
  bindMaximizedState({
    isDestroyed: () => destroyed,
    isMaximized: () => maximized,
    on: (event, listener) => handlers.set(event, listener),
    webContents: {
      send: (...args) => {
        messages.push(args);
      },
    },
  });
  maximized = true;
  handlers.get("maximize")?.();
  maximized = false;
  handlers.get("unmaximize")?.();
  destroyed = true;
  handlers.get("maximize")?.();
  expect(messages).toEqual([
    [channels.windowMaximized, true],
    [channels.windowMaximized, false],
  ]);
});
