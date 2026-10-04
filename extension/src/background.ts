// Ephemeral dispatcher: nothing here survives between invocations (the service
// worker may be killed mid-save), so every save re-resolves the tab and
// injects what it needs on invoke under activeTab (the extractors for a page
// save, the collector for a context-menu selection/image/video). Nothing runs
// on pages the user never captures from. A capture is delivered over loopback
// first and queued only when that fails, so a worker killed in between loses it;
// persisting first instead would hand the same payload to the flush this very
// save starts, and duplicate the capture every time.
import browser from "webextension-polyfill";
import {
  isPageCapturePayload,
  type PageCapturePayloadV1,
} from "@inkling/ingestion-shared";
import { QUEUE_KEY, enqueue, readQueue, withQueueLock } from "./capture-queue-store";
import { removeSettledCaptureEntries } from "./capture-queue";
import { EXTRACTOR_FN_KEY } from "./extract-handoff";
import { isPermanentCaptureError, postPayloadToLoopback } from "./transport";
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

/**
 * A menu click or a keyboard shortcut has no caller waiting on the result, and
 * an unhandled rejection in a service worker is how a save vanishes with no
 * status and no queue entry. Every fire-and-forget path goes through here;
 * paths with a caller await it and report their own failures.
 *
 * `unknown` because contextMenus.create is typed as returning the raw menu id
 * while the polyfill hands back a promise: Promise.resolve passes a promise
 * through unchanged and neutralizes anything else.
 */
function fireAndForget(work: unknown): void {
  void Promise.resolve(work).catch(() => undefined);
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
  // The isolated world installs the extractor on its own globalThis, which the
  // page cannot reach. Invoking it here keeps each capture inside the save that
  // asked for it — parking the payload in a shared slot for a later injection to
  // read back let two saves on one tab overwrite each other.
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
      // The browser awaits what this returns, so the payload crosses as a
      // resolved value. The extractor's own name arrives as an argument: a func
      // is stringified into the page, so naming the global inline here would be a
      // second copy of extract-handoff.ts's constant that nothing keeps in sync.
      func: async (key: string) => {
        const extract = (globalThis as Record<string, unknown>)[key];
        if (typeof extract !== "function") return undefined;
        return (extract as () => Promise<unknown>)();
      },
      args: [EXTRACTOR_FN_KEY],
    });
    result = results[0]?.result;
  } catch (error) {
    // The injected func awaits the extraction, so a rejected extraction surfaces
    // here. Report the extractor's own reason rather than a generic failure, so
    // the popup says what actually went wrong.
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

/** Delivery outcome for one capture attempt. */
type DeliveryOutcome = { delivered: true } | { delivered: false; reason: string; permanent: boolean };

/**
 * POST a capture once and report whether the failure is worth retrying. Callers
 * must decide from `permanent` rather than re-POSTing to find out: a second
 * attempt cannot change the app's answer and only doubles the requests.
 */
async function attemptDelivery(payload: LoopbackCapturePayload): Promise<DeliveryOutcome> {
  const config = await readLoopbackConfig();
  if (!config) return { delivered: false, reason: "pairing is not configured", permanent: false };
  try {
    await postPayloadToLoopback(config.baseUrl, config.token, payload);
    return { delivered: true };
  } catch (error) {
    return {
      delivered: false,
      reason: error instanceof Error ? error.message : String(error),
      permanent: isPermanentCaptureError(error),
    };
  }
}

/** Retry queued payloads against the loopback server; keeps what still fails. */
async function flushQueuedCaptures(): Promise<{ delivered: number; pending: number; dropped: number }> {
  const config = await readLoopbackConfig();
  // Read under the lock, deliver outside it, settle under it again. Holding the
  // lock across the POSTs would block every capture enqueued while the app is
  // slow or hung — the exact case the queue exists for. Nothing is removed from
  // storage until it settles, so a worker killed mid-flush loses nothing and the
  // next flush re-reads the whole batch.
  const batch = await withQueueLock(readQueue);
  if (!config || batch.length === 0) return { delivered: 0, pending: batch.length, dropped: 0 };
  const settled: LoopbackCapturePayload[] = [];
  let delivered = 0;
  let dropped = 0;
  for (const payload of batch) {
    try {
      await postPayloadToLoopback(config.baseUrl, config.token, payload);
      delivered += 1;
    } catch (error) {
      // A capture the app refuses on its merits will be refused identically on
      // every retry. Keeping it would delay every later save behind it for no
      // possible gain.
      if (!isPermanentCaptureError(error)) continue;
      dropped += 1;
    }
    settled.push(payload);
  }
  const pending = await withQueueLock(async () => {
    const queue = await readQueue();
    // Nothing settled — the app is closed or refusing for now. Rewriting an
    // unchanged queue on every save would be storage churn for no reason.
    if (settled.length === 0) return queue.length;
    removeSettledCaptureEntries(queue, settled);
    await browser.storage.local.set({ [QUEUE_KEY]: queue });
    return queue.length;
  });
  return { delivered, pending, dropped };
}

// One flush at a time. Two concurrent flushes would deliver the same batch
// twice. Deliberately not persisted: if the worker dies mid-flush the next flush
// simply re-reads the whole queue.
let flushInFlight: Promise<{ delivered: number; pending: number; dropped: number }> | null = null;

export function flushQueue(): Promise<{ delivered: number; pending: number; dropped: number }> {
  flushInFlight ??= flushQueuedCaptures().finally(() => {
    flushInFlight = null;
  });
  return flushInFlight;
}

/**
 * A capture the app would not take right now: keep it for the next flush, or
 * report honestly when local storage has no room left to keep it in.
 */
async function keepQueued(
  payload: LoopbackCapturePayload,
  reason: string,
  title?: string,
): Promise<SaveStatus> {
  const at = new Date().toISOString();
  let pending: number;
  try {
    pending = await enqueue(payload);
  } catch (error) {
    // The queue could not be written for a reason dropping older captures would
    // not fix. Say so: "the queue is full" would be the wrong story, and it is
    // the user's only clue about a capture the backlog is now missing.
    return {
      state: "failed",
      title,
      detail: `${reason} — and the pending queue could not be written: ${
        error instanceof Error ? error.message : String(error)
      }`,
      at,
    };
  }
  return pending > 0
    ? { state: "queued", title, detail: `${pending} pending — ${reason}`, at }
    : {
        state: "failed",
        title,
        detail: `${reason} — the pending queue is full, so it was not kept`,
        at,
      };
}

export async function saveTab(tabId: number): Promise<SaveStatus> {
  fireAndForget(flushQueue());
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
  const outcome = await attemptDelivery(raw);
  if (outcome.delivered) {
    const status: SaveStatus = {
      state: "saved",
      title: raw.title,
      at: new Date().toISOString(),
    };
    await writeStatus(status);
    return status;
  }
  // Same rule as a media capture: a rejection the app will repeat is not worth
  // a queue slot on every future flush.
  const status: SaveStatus = outcome.permanent
    ? { state: "failed", title: raw.title, detail: outcome.reason, at: new Date().toISOString() }
    : await keepQueued(raw, outcome.reason, raw.title);
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
async function dispatchCapturePayload(payload: unknown): Promise<SaveStatus> {
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
  // The app downloads http(s) sources itself and honors `dataUrl` for the
  // blob:/canvas sources it cannot fetch, so both are acceptable. Anything else
  // — a chrome:// or file: URL the app has no way to read — is not, and would
  // come back as a 422 the user cannot act on.
  if (
    message.payload.kind === "image"
    && !/^https?:\/\//iu.test(message.payload.srcUrl)
    && !message.payload.dataUrl
  ) {
    const status: SaveStatus = {
      state: "failed",
      detail: "image captures require an http(s) image URL",
      at: new Date().toISOString(),
    };
    await writeStatus(status);
    return status;
  }
  const outcome = await attemptDelivery(message.payload);
  if (outcome.delivered) {
    const status: SaveStatus = { state: "saved", at: new Date().toISOString() };
    await writeStatus(status);
    return status;
  }
  // Queue like a page save. A media capture that arrives while the app is
  // closed is exactly the case a local library must not lose, and these
  // payloads are small (a URL, a quote, or an image URL) compared to a page.
  //
  // Only a *transient* failure is queued. A rejection the app will repeat — a
  // malformed payload, an image host answering with something that is not an
  // image — would occupy a queue slot on every future flush, delay later saves
  // behind it, and eventually push older captures out of the bounded queue for
  // no possible gain. Report it failed instead.
  const status: SaveStatus = outcome.permanent
    ? { state: "failed", detail: outcome.reason, at: new Date().toISOString() }
    : await keepQueued(message.payload, outcome.reason);
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
      await dispatchCapturePayload((response as { payload: unknown }).payload);
    } else if (response && typeof response === "object" && "reason" in response) {
      const status: SaveStatus = {
        state: "failed",
        detail: String((response as { reason: unknown }).reason),
        at: new Date().toISOString(),
      };
      await writeStatus(status);
    } else {
      // Neither a payload nor a reason: nothing was captured and nothing was
      // queued. Say so instead of leaving the popup showing an older save.
      const status: SaveStatus = {
        state: "failed",
        detail: "page collector returned no capture",
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

browser.runtime.onInstalled.addListener(({ reason }) => {
  // Menus survive an extension update and contextMenus.create rejects a
  // duplicate id, so only the first install creates them. Recreating on every
  // update was an unhandled rejection per menu and left the browser's
  // last-error report pointing at an extension doing nothing wrong.
  if (reason === "install") {
    fireAndForget(browser.contextMenus.create({
      id: "inkling-save-page",
      title: "Save page to inkling",
      contexts: ["page"],
    }));
    fireAndForget(browser.contextMenus.create({
      id: INKLING_MENU_SAVE_SELECTION,
      title: "Save selection as quote",
      contexts: ["selection"],
    }));
    fireAndForget(browser.contextMenus.create({
      id: INKLING_MENU_SAVE_IMAGE,
      title: "Save image to inkling",
      contexts: ["image"],
    }));
    fireAndForget(browser.contextMenus.create({
      id: INKLING_MENU_SAVE_VIDEO,
      title: "Save video to inkling",
      contexts: ["page", "video"],
    }));
  }
  // Opportunistic drain: a previously queued save may now be deliverable.
  fireAndForget(flushQueue());
});

browser.runtime.onStartup.addListener(() => {
  fireAndForget(flushQueue());
});

browser.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "inkling-save-page") {
    fireAndForget(saveActiveTab());
    return;
  }
  if (tab?.id === undefined) {
    // No tab, so no collector and nothing to read off the page. Only a
    // selection can still be saved from the event itself.
    if (info.menuItemId === INKLING_MENU_SAVE_SELECTION && typeof info.selectionText === "string") {
      fireAndForget(dispatchCapturePayload({
        kind: "selection",
        sourceUrl: info.pageUrl ?? "",
        selectedHtml: "",
        selectedText: info.selectionText,
      }));
    }
    return;
  }
  // Everything else goes through the collector: it reads the live page, so a
  // selection keeps its title, a blob:/canvas image gets the dataUrl fallback
  // the app cannot fetch for itself, and the payload carries the real frame URL
  // rather than whatever the tab reports.
  if (info.menuItemId === INKLING_MENU_SAVE_SELECTION) {
    fireAndForget(collectFromTab(tab.id, "selection"));
  } else if (info.menuItemId === INKLING_MENU_SAVE_IMAGE) {
    fireAndForget(collectFromTab(tab.id, "image", info.srcUrl));
  } else if (info.menuItemId === INKLING_MENU_SAVE_VIDEO) {
    fireAndForget(collectFromTab(tab.id, "video"));
  }
});

browser.commands.onCommand.addListener((command) => {
  if (command === "inkling-save-page") fireAndForget(saveActiveTab());
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
