import browser from "webextension-polyfill";
import { buildUrlCapturePayload } from "./capture";
import type { PageCapturePayloadV1 } from "@inkling/ingestion-shared";
import {
  BASE_URL_KEY,
  isPairingToken,
  normalizeCaptureServerAddress,
  TOKEN_KEY,
} from "./connection";
import { CaptureResponseError, buildCaptureDeepLink, postPayloadToLoopback } from "./transport";

const DEFAULT_TITLE = "Save to inkling";
const MENU_ID = "inkling-save-page";

type LoopbackConfig = { baseUrl: string; token: string };

async function readLoopbackConfig(): Promise<LoopbackConfig | null> {
  const stored = await browser.storage.local.get([BASE_URL_KEY, TOKEN_KEY]);
  const baseUrl = normalizeCaptureServerAddress(stored[BASE_URL_KEY]);
  const token = stored[TOKEN_KEY];
  if (!baseUrl || !isPairingToken(token)) return null;
  return { baseUrl, token };
}

let successResetTimer: ReturnType<typeof setTimeout> | undefined;

async function showSuccess(title: string): Promise<void> {
  // A second save inside the window must not be cleared by the first save's timer.
  clearTimeout(successResetTimer);
  successResetTimer = setTimeout(() => {
    void browser.action.setBadgeText({ text: "" });
    void browser.action.setTitle({ title: DEFAULT_TITLE });
  }, 1_400);
  await browser.action.setBadgeBackgroundColor({ color: "#347968" });
  await browser.action.setBadgeText({ text: "✓" });
  await browser.action.setTitle({ title });
}

async function showFailure(message: string): Promise<void> {
  // A pending success timer must not clear the failure badge or title.
  clearTimeout(successResetTimer);
  await browser.action.setBadgeBackgroundColor({ color: "#a13b32" });
  await browser.action.setBadgeText({ text: "!" });
  await browser.action.setTitle({ title: `Couldn't save to inkling: ${message}` });
}

function captureErrorMessage(error: unknown): string {
  if (error instanceof CaptureResponseError) {
    if (error.status === 401)
      return "check the extension pairing in inkling Settings → Browser extension";
    if (error.status === 429) return "too many saves; try again in a minute";
    return `inkling returned HTTP ${error.status}`;
  }
  return "open the extension options or check that inkling is installed";
}

async function saveUrl(rawUrl: string | undefined, title: string | undefined): Promise<void> {
  let payload: PageCapturePayloadV1;
  try {
    if (!rawUrl) throw new Error("no page URL");
    payload = buildUrlCapturePayload(rawUrl, title ?? "");
  } catch {
    await showFailure("only HTTP and HTTPS pages can be saved");
    return;
  }

  let config: LoopbackConfig | null = null;
  try {
    config = await readLoopbackConfig();
  } catch {}
  if (config) {
    try {
      await postPayloadToLoopback(config.baseUrl, config.token, payload);
      await showSuccess("Saved to inkling");
      return;
    } catch (error) {
      if (error instanceof CaptureResponseError) {
        await showFailure(captureErrorMessage(error));
        return;
      }
    }
  }

  try {
    await browser.tabs.create({ url: buildCaptureDeepLink(payload) });
    await showSuccess("Sent to inkling");
  } catch {
    await showFailure("open inkling once, then try again");
  }
}

browser.runtime.onInstalled.addListener(() => {
  void browser.contextMenus.removeAll().then(() =>
    browser.contextMenus.create({
      id: MENU_ID,
      title: "Save to inkling",
      contexts: ["page", "link"],
    }),
  );
});

browser.action.onClicked.addListener((tab) => {
  void saveUrl(tab.url, tab.title);
});

browser.contextMenus.onClicked.addListener((info, tab) => {
  const isLink = typeof info.linkUrl === "string";
  void saveUrl(info.linkUrl ?? info.pageUrl ?? tab?.url, isLink ? info.linkText : tab?.title);
});
