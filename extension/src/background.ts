// Ephemeral dispatcher: no module-level mutable state (the service worker may
// be killed between invocations). Every save re-resolves the tab, injects on
// invoke (activeTab only for the on-demand extractors; content.js is a
// declarative content script required by context-menu collect), and persists
// the full v1 payload before delivering it over loopback. If the app is closed
// or not paired, the payload remains queued for a later flush.
import browser from "webextension-polyfill";
import {
  isPageCapturePayload,
  type PageCapturePayloadV1,
} from "@inkling/ingestion-shared";
import { trimCaptureQueue } from "./capture-queue";
import { postPayloadToLoopback } from "./transport";
import {
  INKLING_MENU_SAVE_IMAGE,
  INKLING_MENU_SAVE_SELECTION,
  INKLING_MENU_SAVE_VIDEO,
  isCaptureMessage,
  payloadToDeepLink,
} from "./payload";

// Emitted at dist/ root by vite.content-main/isolated.config.ts — keep in sync.
const CONTENT_MAIN_FILE = "content-main.js";
const CONTENT_ISOLATED_FILE = "content-isolated.js";

const QUEUE_KEY = "inkling:pending-captures-v1";
const LAST_STATUS_KEY = "inkling:last-save-status";
// Same keys the options page writes; the token never leaves the machine
// except to the app on loopback.
const TOKEN_KEY = "inkling.token";
const BASE_URL_KEY = "inkling.base-url";

export interface SaveStatus {
  state: "saved" | "queued" | "failed";
  title?: string;
  detail?: string;
  at: string;
}

async function readQueue(): Promise<PageCapturePayloadV1[]> {
  const stored = await browser.storage.local.get(QUEUE_KEY);
  const raw = stored[QUEUE_KEY];
  if (!Array.isArray(raw)) return [];
  return raw.filter(isPageCapturePayload);
}

async function enqueue(payload: PageCapturePayloadV1): Promise<number> {
  const queue = await readQueue();
  queue.push(payload);
  // Count + byte budget first so a full queue cannot blow the ~10MB local
  // quota; if other keys still push the write over, drop oldest until it fits.
  trimCaptureQueue(queue);
  for (;;) {
    try {
      await browser.storage.local.set({ [QUEUE_KEY]: queue });
      return queue.length;
    } catch {
      if (queue.length <= 1) return queue.length;
      queue.shift();
      trimCaptureQueue(queue);
    }
  }
}

async function writeStatus(status: SaveStatus): Promise<void> {
  await browser.storage.local.set({ [LAST_STATUS_KEY]: status });
}

export async function injectExtractor(tabId: number): Promise<unknown> {
  await browser.scripting.executeScript({
    target: { tabId },
    files: [CONTENT_MAIN_FILE],
    world: "MAIN",
  });
  await browser.scripting.executeScript({
    target: { tabId },
    files: [CONTENT_ISOLATED_FILE],
    world: "ISOLATED",
  });
  // The isolated bundle's IIFE discards the async extractor's return value,
  // so the file injection above surfaces nothing useful. The content script
  // parks its Promise on globalThis; a func injection can return that
  // Promise, which executeScript awaits (func is stringified into the page —
  // the key must be a literal, kept in sync with extract-promise-key.ts).
  const results = await browser.scripting.executeScript({
    target: { tabId },
    world: "ISOLATED",
    func: () => {
      const host = globalThis as { __inklingExtractPayloadPromise?: Promise<unknown> };
      const pending = host.__inklingExtractPayloadPromise;
      delete host.__inklingExtractPayloadPromise;
      return pending;
    },
  });
  return results[0]?.result;
}

async function readLoopbackConfig(): Promise<{ baseUrl: string; token: string } | null> {
  const stored = await browser.storage.local.get([BASE_URL_KEY, TOKEN_KEY]);
  const baseUrl = stored[BASE_URL_KEY];
  const token = stored[TOKEN_KEY];
  if (typeof baseUrl !== "string" || !baseUrl || typeof token !== "string" || !token) return null;
  return { baseUrl, token };
}

/**
 * Loopback-first delivery: POST the v1 payload to the app's capture server
 * (`POST {baseUrl}/v1/captures`, per-install bearer). Returns true on 201.
 * Any failure (unpaired, app closed, network) leaves the payload queued.
 */
async function tryLoopback(payload: PageCapturePayloadV1): Promise<boolean> {
  const config = await readLoopbackConfig();
  if (!config) return false;
  try {
    await postPayloadToLoopback(config.baseUrl, config.token, payload);
    return true;
  } catch {
    return false;
  }
}

/** Retry queued payloads against the loopback server; keeps what still fails. */
export async function flushQueue(): Promise<{ delivered: number; pending: number }> {
  const config = await readLoopbackConfig();
  if (!config) return { delivered: 0, pending: (await readQueue()).length };
  const queue = await readQueue();
  const remaining: PageCapturePayloadV1[] = [];
  let delivered = 0;
  for (const payload of queue) {
    try {
      await postPayloadToLoopback(config.baseUrl, config.token, payload);
      delivered += 1;
    } catch {
      remaining.push(payload);
    }
  }
  await browser.storage.local.set({ [QUEUE_KEY]: remaining });
  return { delivered, pending: remaining.length };
}

export async function saveTab(tabId: number): Promise<SaveStatus> {
  void flushQueue();
  let raw: unknown;
  try {
    raw = await injectExtractor(tabId);
  } catch (error) {
    const status: SaveStatus = {
      state: "failed",
      detail: error instanceof Error ? error.message : "injection failed",
      at: new Date().toISOString(),
    };
    await writeStatus(status);
    return status;
  }
  if (!isPageCapturePayload(raw)) {
    const status: SaveStatus = {
      state: "failed",
      detail:
        raw === undefined
          ? "extractor returned no result"
          : "page extraction produced no usable content",
      at: new Date().toISOString(),
    };
    await writeStatus(status);
    return status;
  }
  if (await tryLoopback(raw)) {
    const status: SaveStatus = {
      state: "saved",
      title: raw.title,
      at: new Date().toISOString(),
    };
    await writeStatus(status);
    return status;
  }
  const queued = await enqueue(raw);
  const status: SaveStatus = {
    state: "queued",
    title: raw.title,
    detail: `${queued} pending — Inkling is unavailable`,
    at: new Date().toISOString(),
  };
  await writeStatus(status);
  return status;
}

async function saveActiveTab(): Promise<SaveStatus> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) {
    const status: SaveStatus = {
      state: "failed",
      detail: "no active tab",
      at: new Date().toISOString(),
    };
    await writeStatus(status);
    return status;
  }
  return saveTab(tab.id);
}

/** Selection/image/video dispatch: the loopback server only takes page
 * payloads, so these travel by deep link (dataUrl never fits a URL and is
 * reported instead of silently dropped). */
async function dispatchCapturePayload(payload: unknown, tabId: number): Promise<SaveStatus> {
  void tabId;
  const message = { type: "inkling/capture", payload };
  if (!isCaptureMessage(message)) {
    const status: SaveStatus = {
      state: "failed",
      detail: "unrecognized capture payload",
      at: new Date().toISOString(),
    };
    await writeStatus(status);
    return status;
  }
  const deepLink = payloadToDeepLink(message.payload);
  if (!deepLink) {
    const status: SaveStatus = {
      state: "failed",
      detail: "this capture needs the paired app (open inkling once, then retry)",
      at: new Date().toISOString(),
    };
    await writeStatus(status);
    return status;
  }
  // Deep-link-only payloads never enter the queue: the queue is for
  // loopback re-POST of page payloads, and readQueue drops anything that
  // fails isPageCapturePayload.
  try {
    await browser.tabs.create({ url: deepLink });
    const status: SaveStatus = { state: "saved", at: new Date().toISOString() };
    await writeStatus(status);
    return status;
  } catch (error) {
    // App closed or no protocol handler: payload stays queued for later flush.
    const status: SaveStatus = {
      state: "failed",
      detail: error instanceof Error ? error.message : "deep link refused",
      at: new Date().toISOString(),
    };
    await writeStatus(status);
    return status;
  }
}

async function collectFromTab(tabId: number, collect: "selection" | "image" | "video", srcUrl?: string) {
  try {
    const response = await browser.tabs.sendMessage(tabId, {
      type: "inkling/collect",
      collect,
      ...(srcUrl ? { srcUrl } : {}),
    });
    if (response && typeof response === "object" && "payload" in response) {
      await dispatchCapturePayload((response as { payload: unknown }).payload, tabId);
    }
  } catch {
    // No content script on this page (or it refused): status already reflects
    // the failure via the collect path; stay quiet here.
  }
}

browser.runtime.onInstalled.addListener(() => {
  void browser.contextMenus.create({
    id: "inkling-save-page",
    title: "Save page to inkling",
    contexts: ["page"],
  });
  void browser.contextMenus.create({
    id: INKLING_MENU_SAVE_SELECTION,
    title: "Save selection as quote",
    contexts: ["selection"],
  });
  void browser.contextMenus.create({
    id: INKLING_MENU_SAVE_IMAGE,
    title: "Save image to inkling",
    contexts: ["image"],
  });
  void browser.contextMenus.create({
    id: INKLING_MENU_SAVE_VIDEO,
    title: "Save video to inkling",
    contexts: ["page", "video"],
  });
  // Opportunistic drain: a previously queued save may now be deliverable.
  void flushQueue();
});

browser.runtime.onStartup.addListener(() => {
  void flushQueue();
});

browser.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "inkling-save-page") {
    void saveActiveTab();
    return;
  }
  if (tab?.id === undefined) return;
  if (info.menuItemId === INKLING_MENU_SAVE_SELECTION) {
    void collectFromTab(tab.id, "selection");
  } else if (info.menuItemId === INKLING_MENU_SAVE_IMAGE) {
    void collectFromTab(tab.id, "image", typeof info.srcUrl === "string" ? info.srcUrl : undefined);
  } else if (info.menuItemId === INKLING_MENU_SAVE_VIDEO) {
    void collectFromTab(tab.id, "video");
  }
});

browser.commands.onCommand.addListener((command) => {
  if (command === "inkling-save-page") void saveActiveTab();
});

browser.runtime.onMessage.addListener((message: unknown) => {
  if (typeof message === "object" && message !== null && "type" in message) {
    const type = (message as { type: string }).type;
    if (type === "inkling:save-page") {
      return saveActiveTab();
    }
    if (type === "inkling:flush-queue") {
      return flushQueue();
    }
  }
  return undefined;
});
