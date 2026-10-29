import { describe, expect, mock, test } from "bun:test";

const badgeTexts: string[] = [];
let onActionClicked: ((tab: { url?: string; title?: string }) => void) | undefined;
let tabsCreateFails = false;
let resolveFailureShown: () => void = () => {};
const failureShown = new Promise<void>((resolve) => {
  resolveFailureShown = resolve;
});
let resolveSuccessTimerArmed: () => void = () => {};
const successTimerArmed = new Promise<void>((resolve) => {
  resolveSuccessTimerArmed = resolve;
});

mock.module("webextension-polyfill", () => ({
  default: {
    action: {
      setBadgeBackgroundColor: async () => {},
      setBadgeText: async ({ text }: { text: string }) => {
        badgeTexts.push(text);
        if (text === "!") resolveFailureShown();
      },
      setTitle: async () => {},
      onClicked: {
        addListener: (listener: (tab: { url?: string; title?: string }) => void) => {
          onActionClicked = listener;
        },
      },
    },
    runtime: { onInstalled: { addListener: () => {} } },
    contextMenus: {
      removeAll: async () => {},
      create: () => {},
      onClicked: { addListener: () => {} },
    },
    storage: { local: { get: async () => ({}) } },
    tabs: {
      create: async () => {
        if (tabsCreateFails) throw new Error("could not open the capture link");
        return {};
      },
    },
  },
}));

describe("background badge state", () => {
  test("a failed save is not cleared by an earlier save's success timer", async () => {
    const timers = new Map<number, () => void>();
    const armedTimerIds: number[] = [];
    let nextTimerId = 0;
    const originalSetTimeout = globalThis.setTimeout;
    const originalClearTimeout = globalThis.clearTimeout;
    globalThis.setTimeout = ((callback: () => void) => {
      const id = ++nextTimerId;
      timers.set(id, callback);
      armedTimerIds.push(id);
      resolveSuccessTimerArmed();
      return id;
    }) as typeof setTimeout;
    globalThis.clearTimeout = ((id?: number) => {
      if (typeof id === "number") timers.delete(id);
    }) as typeof clearTimeout;

    try {
      await import("./background");
      if (!onActionClicked) throw new Error("background did not register a click listener");

      onActionClicked({ url: "https://example.com/a", title: "A" });
      await successTimerArmed;
      const [successTimerId] = armedTimerIds;

      tabsCreateFails = true;
      onActionClicked({ url: "https://example.com/b", title: "B" });
      await failureShown;

      timers.get(successTimerId)?.();
      expect(badgeTexts).not.toContain("");
    } finally {
      globalThis.setTimeout = originalSetTimeout;
      globalThis.clearTimeout = originalClearTimeout;
    }
  });
});
