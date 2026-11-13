import { describe, expect, mock, test } from "bun:test";

const badgeTexts: string[] = [];
type MenuClick = (
  info: { menuItemId: string; pageUrl?: string },
  tab: { url?: string; title?: string },
) => void;
let onMenuClicked: MenuClick | undefined;
let tabsCreateFails = false;
let stored: Record<string, string> = {};
const openedLinks: string[] = [];
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
    },
    runtime: { onInstalled: { addListener: () => {} } },
    contextMenus: {
      removeAll: async () => {},
      create: () => {},
      onClicked: {
        addListener: (listener: MenuClick) => {
          onMenuClicked = listener;
        },
      },
    },
    storage: { local: { get: async () => stored, set: async () => {} } },
    tabs: {
      create: async ({ url }: { url: string }) => {
        if (tabsCreateFails) throw new Error("could not open the capture link");
        openedLinks.push(url);
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
      if (!onMenuClicked) throw new Error("background did not register a menu listener");
      const savePage = { menuItemId: "inkling-save-page" };

      onMenuClicked(savePage, { url: "https://example.com/a", title: "A" });
      await successTimerArmed;
      const [successTimerId] = armedTimerIds;

      tabsCreateFails = true;
      onMenuClicked(savePage, { url: "https://example.com/b", title: "B" });
      await failureShown;

      timers.get(successTimerId)?.();
      expect(badgeTexts).not.toContain("");
    } finally {
      globalThis.setTimeout = originalSetTimeout;
      globalThis.clearTimeout = originalClearTimeout;
    }
  });
});

describe("delivery", () => {
  test("a stale pairing falls back to the link, and a refusal the link would share does not", async () => {
    const { buildUrlCapturePayload } = await import("./capture");
    const { deliver } = await import("./deliver");
    stored = { "inkling.token": "a".repeat(64) };
    tabsCreateFails = false;
    const originalFetch = globalThis.fetch;
    let status = 401;
    // The app is found on its first port; `status` is how it answers the capture itself.
    globalThis.fetch = (async (url: string) =>
      new Response(null, { status: url.endsWith("/v1/health") ? 200 : status })) as typeof fetch;
    try {
      const page = buildUrlCapturePayload("https://example.com/a", "A");
      openedLinks.length = 0;
      for (status of [401, 429]) expect(await deliver(page)).toBe("sent");
      expect(openedLinks).toHaveLength(2);

      status = 503;
      await expect(deliver(page)).rejects.toThrow("HTTP 503");
      status = 201;
      expect(await deliver(page)).toBe("saved");
      expect(openedLinks).toHaveLength(2);

      // The app drops a link to the user's own network, so the popup must not say it went.
      status = 401;
      await expect(
        deliver(buildUrlCapturePayload("http://192.168.1.20:8080/wiki", "Wiki")),
      ).rejects.toThrow("own network");
      expect(openedLinks).toHaveLength(2);
    } finally {
      globalThis.fetch = originalFetch;
      stored = {};
    }
  });
});
