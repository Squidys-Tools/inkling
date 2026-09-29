// Ephemeral dispatcher: no module-level mutable state (the service worker may
// be killed between invocations). Every save re-resolves the tab and injects
// what it needs on invoke under activeTab (the extractors for a page save, the
// collector for a context-menu selection/image/video), so nothing runs on
// pages the user never captures from. The full v1 payload is persisted before
// delivery over loopback; if the app is closed or not paired, it stays queued
// for a later flush.
import browser from "webextension-polyfill";
import {
  isPageCapturePayload,
  type PageCapturePayloadV1,
} from "@inkling/ingestion-shared";
import { trimCaptureQueue } from "./capture-queue";
import { isQueuedCapturePayload } from "./queue-payload";
import { postPayloadToLoopback } from "./transport";
import {
  INKLING_MENU_SAVE_IMAGE,
  INKLING_MENU_SAVE_SELECTION,
  INKLING_MENU_SAVE_VIDEO,
  isCaptureMessage,
  type ExtensionCapturePayload,
} from "./payload";

// Emitted at dist/ root by vite.content-main/isolated/collect.config.ts — keep
// in sync.
const CONTENT_MAIN_FILE = "content-main.js";
const CONTENT_ISOLATED_FILE = "content-isolated.js";
const CONTENT_COLLECT_FILE = "content-collect.js";

const QUEUE_KEY = "inkling:pending-captures-v1";
const LAST_STATUS_KEY = "inkling:last-save-status";
// Same keys the options page writes; the token never leaves the machine
// except to the app on loopback.
const TOKEN_KEY = "inkling.token";
const BASE_URL_KEY = "inkling.base-url";
type LoopbackCapturePayload = PageCapturePayloadV1 | ExtensionCapturePayload;

export interface SaveStatus {
  state: "saved" | "queued" | "failed";
  title?: string;
  detail?: string;
  at: string;
}

async function readQueue(): Promise<LoopbackCapturePayload[]> {
  const stored = await browser.storage.local.get(QUEUE_KEY);
  const raw = stored[QUEUE_KEY];
  if (!Array.isArray(raw)) return [];
  return raw.filter(isQueuedCapturePayload);
}

// Every queue read-modify-write runs through this chain. flushQueue can take
// seconds; without it, an enqueue landing mid-flush is overwritten by the
// flush's stale write and the capture is silently dropped.
let queueChain: Promise<unknown> = Promise.resolve();

function withQueueLock<T>(operation: () => Promise<T>): Promise<T> {
  const result = queueChain.then(operation, operation);
  queueChain = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

async function enqueue(payload: LoopbackCapturePayload): Promise<number> {
  return withQueueLock(async () => {
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
  });
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
  // The isolated world parks the extraction promise on its own globalThis. That
  // world is not reachable from the page, so this is the only channel a capture
  // travels over.
  //
  // There is deliberately no DOM fallback. The page shares the DOM, so a result
  // published there could be planted by the page to forge a capture; a nonce
  // handshake would narrow that window without closing it, because the page can
  // read the node as soon as it appears. A page that cannot reach the isolated
  // world gets a plain extraction failure instead.
  let result: unknown;
  try {
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
    result = results[0]?.result;
  } catch (error) {
    // The injected func returns the extraction promise, so a rejected
    // extraction surfaces here. Report the extractor's own reason rather than
    // a generic failure, so the popup says what actually went wrong.
    throw new Error(error instanceof Error ? error.message : "page extraction failed");
  }
  if (isPageCapturePayload(result)) return result;
  throw new Error("extractor returned no result");
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
 * (`POST {baseUrl}/v1/captures`, per-install bearer). Returns null on success
 * or a delivery error to show in the popup.
 */
async function tryLoopback(payload: LoopbackCapturePayload): Promise<string | null> {
  const config = await readLoopbackConfig();
  if (!config) return "pairing is not configured";
  try {
    await postPayloadToLoopback(config.baseUrl, config.token, payload);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

/** Retry queued payloads against the loopback server; keeps what still fails. */
export async function flushQueue(): Promise<{ delivered: number; pending: number }> {
  return withQueueLock(async () => {
    const config = await readLoopbackConfig();
    if (!config) return { delivered: 0, pending: (await readQueue()).length };
    const queue = await readQueue();
    const remaining: LoopbackCapturePayload[] = [];
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
  });
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
  const deliveryError = await tryLoopback(raw);
  if (deliveryError === null) {
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
    detail: `${queued} pending — ${deliveryError}`,
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

/** Selection/image/video dispatch through the same authenticated local receiver. */
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
  if (message.payload.kind === "image" && !/^https?:\/\//iu.test(message.payload.srcUrl)) {
    const status: SaveStatus = {
      state: "failed",
      detail: "image captures require an http(s) image URL",
      at: new Date().toISOString(),
    };
    await writeStatus(status);
    return status;
  }
  const deliveryError = await tryLoopback(message.payload);
  if (deliveryError === null) {
    const status: SaveStatus = { state: "saved", at: new Date().toISOString() };
    await writeStatus(status);
    return status;
  }
  // Queue like a page save. A media capture that arrives while the app is
  // closed is exactly the case a local library must not lose, and these
  // payloads are small (a URL, a quote, or an image URL) compared to a page.
  const queued = await enqueue(message.payload);
  const status: SaveStatus = {
    state: "queued",
    detail: `${queued} pending — ${deliveryError}`,
    at: new Date().toISOString(),
  };
  await writeStatus(status);
  return status;
}

async function collectFromTab(tabId: number, collect: "selection" | "image" | "video", srcUrl?: string) {
  try {
    // Injected on invoke rather than declared on <all_urls>: nothing runs on
    // pages the user never captures from.
    await browser.scripting.executeScript({
      target: { tabId },
      files: [CONTENT_COLLECT_FILE],
    });
    const response = await browser.tabs.sendMessage(tabId, {
      type: "inkling/collect",
      collect,
      ...(srcUrl ? { srcUrl } : {}),
    });
    if (response && typeof response === "object" && "payload" in response) {
      await dispatchCapturePayload((response as { payload: unknown }).payload, tabId);
    } else if (response && typeof response === "object" && "reason" in response) {
      const status: SaveStatus = {
        state: "failed",
        detail: String((response as { reason: unknown }).reason),
        at: new Date().toISOString(),
      };
      await writeStatus(status);
    }
  } catch (error) {
    const status: SaveStatus = {
      state: "failed",
      detail: error instanceof Error ? error.message : "page collector unavailable",
      at: new Date().toISOString(),
    };
    await writeStatus(status);
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
  const pageUrl = tab?.url ?? info.pageUrl ?? "";
  if (info.menuItemId === INKLING_MENU_SAVE_IMAGE && typeof info.srcUrl === "string") {
    void dispatchCapturePayload(
      { kind: "image", pageUrl, srcUrl: info.srcUrl },
      tab?.id ?? 0,
    );
    return;
  }
  if (tab?.id !== undefined && info.menuItemId === INKLING_MENU_SAVE_SELECTION) {
    // Always go through the collector: it reads the selected markup and the
    // page title. The context-menu event has already fired by the time the
    // collector is injected, but the live selection is still readable, and
    // losing attribution on a quote is not an acceptable fallback.
    void collectFromTab(tab.id, "selection");
  } else if (info.menuItemId === INKLING_MENU_SAVE_SELECTION) {
    // No tab (rare), so the collector cannot run. The plain text still saves.
    if (typeof info.selectionText === "string") {
      void dispatchCapturePayload(
        { kind: "selection", sourceUrl: pageUrl, selectedHtml: "", selectedText: info.selectionText },
        tab?.id ?? 0,
      );
    }
  } else if (tab?.id !== undefined && info.menuItemId === INKLING_MENU_SAVE_IMAGE) {
    void collectFromTab(tab.id, "image", info.srcUrl);
  } else if (tab?.id !== undefined && info.menuItemId === INKLING_MENU_SAVE_VIDEO) {
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
