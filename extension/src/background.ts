// Ephemeral dispatcher: no module-level mutable state (the service worker may
// be killed between invocations). Every save re-resolves the tab, injects on
// invoke (activeTab only — no <all_urls>, no persistent content scripts), and
// persists before navigating: the full v1 payload goes to chrome.storage.local
// FIRST, then the deep link fires. If the app is closed the tab navigation
// fails but nothing is lost — the queue survives for the Phase 2 loopback
// flush (see transport.ts postPayloadToLoopback).
import browser from "webextension-polyfill";
import {
  isPageCapturePayload,
  type PageCapturePayloadV1,
} from "@inkling/ingestion-shared";
import { buildCaptureDeepLink } from "./transport";

// Emitted at dist/ root by vite.content-main/isolated.config.ts — keep in sync.
const CONTENT_MAIN_FILE = "content-main.js";
const CONTENT_ISOLATED_FILE = "content-isolated.js";

const QUEUE_KEY = "inkling:pending-captures-v1";
const MAX_QUEUED = 50;
const LAST_STATUS_KEY = "inkling:last-save-status";

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
  while (queue.length > MAX_QUEUED) queue.shift();
  await browser.storage.local.set({ [QUEUE_KEY]: queue });
  return queue.length;
}

async function writeStatus(status: SaveStatus): Promise<void> {
  await browser.storage.local.set({ [LAST_STATUS_KEY]: status });
}

async function injectExtractor(tabId: number): Promise<unknown> {
  await browser.scripting.executeScript({
    target: { tabId },
    files: [CONTENT_MAIN_FILE],
    world: "MAIN",
  });
  const results = await browser.scripting.executeScript({
    target: { tabId },
    files: [CONTENT_ISOLATED_FILE],
    world: "ISOLATED",
  });
  return results[0]?.result;
}

export async function saveTab(tabId: number): Promise<SaveStatus> {
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
      detail: "page extraction produced no usable content",
      at: new Date().toISOString(),
    };
    await writeStatus(status);
    return status;
  }
  const queued = await enqueue(raw);
  const deepLink = buildCaptureDeepLink(raw);
  try {
    await browser.tabs.create({ url: deepLink });
    const status: SaveStatus = {
      state: "saved",
      title: raw.title,
      at: new Date().toISOString(),
    };
    await writeStatus(status);
    return status;
  } catch (error) {
    // App closed or no protocol handler: payload stays queued for later flush.
    const status: SaveStatus = {
      state: "queued",
      title: raw.title,
      detail: `${queued} pending (${error instanceof Error ? error.message : "deep link refused"})`,
      at: new Date().toISOString(),
    };
    await writeStatus(status);
    return status;
  }
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

browser.runtime.onInstalled.addListener(() => {
  void browser.contextMenus.create({
    id: "inkling-save-page",
    title: "Save page to inkling",
    contexts: ["page"],
  });
});

browser.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === "inkling-save-page") void saveActiveTab();
});

browser.commands.onCommand.addListener((command) => {
  if (command === "inkling-save-page") void saveActiveTab();
});

browser.runtime.onMessage.addListener((message: unknown) => {
  if (typeof message === "object" && message !== null && "type" in message) {
    if ((message as { type: string }).type === "inkling:save-page") {
      return saveActiveTab();
    }
  }
  return undefined;
});
