import type { CapturePayloadV1 } from "@inkling/contracts/capture";
import browser, { type Menus, type Tabs } from "webextension-polyfill";
import {
  buildImageCapturePayload,
  buildQuoteCapturePayload,
  buildUrlCapturePayload,
} from "./capture";
import { deliver } from "./deliver";

const DEFAULT_TITLE = "Save to inkling";

let successResetTimer: ReturnType<typeof setTimeout> | undefined;

async function showSuccess(title: string) {
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

async function showFailure(message: string) {
  // A pending success timer must not clear the failure badge or title.
  clearTimeout(successResetTimer);
  await browser.action.setBadgeBackgroundColor({ color: "#a13b32" });
  await browser.action.setBadgeText({ text: "!" });
  await browser.action.setTitle({ title: `Couldn't save to inkling: ${message}` });
}

function menuCapture(info: Menus.OnClickData, tab: Tabs.Tab | undefined): CapturePayloadV1 {
  const pageUrl = info.pageUrl ?? tab?.url ?? "";
  const pageTitle = tab?.title ?? "";
  if (info.menuItemId === "inkling-save-image")
    return buildImageCapturePayload(pageUrl, info.srcUrl ?? "", pageTitle);
  if (info.menuItemId === "inkling-save-selection")
    return buildQuoteCapturePayload(pageUrl, info.selectionText ?? "", pageTitle);
  if (info.menuItemId === "inkling-save-link")
    return buildUrlCapturePayload(info.linkUrl ?? "", info.linkText ?? "");
  return buildUrlCapturePayload(pageUrl, pageTitle);
}

async function saveFromMenu(info: Menus.OnClickData, tab: Tabs.Tab | undefined) {
  let payload: CapturePayloadV1;
  try {
    payload = menuCapture(info, tab);
  } catch (error) {
    await showFailure(error instanceof Error ? error.message : "this can't be saved");
    return;
  }
  try {
    const delivery = await deliver(payload);
    await showSuccess(delivery === "saved" ? "Saved to inkling" : "Sent to inkling");
  } catch (error) {
    await showFailure(error instanceof Error ? error.message : "inkling did not answer");
  }
}

// Chrome offers "page" only when nothing more specific was right-clicked.
const menus: Menus.CreateCreatePropertiesType[] = [
  { id: "inkling-save-page", title: "Save page to inkling", contexts: ["page"] },
  { id: "inkling-save-link", title: "Save link to inkling", contexts: ["link"] },
  { id: "inkling-save-selection", title: "Save quote to inkling", contexts: ["selection"] },
  { id: "inkling-save-image", title: "Save image to inkling", contexts: ["image"] },
];

browser.runtime.onInstalled.addListener(() => {
  void browser.contextMenus.removeAll().then(() => {
    for (const menu of menus) browser.contextMenus.create(menu);
  });
});

browser.contextMenus.onClicked.addListener((info, tab) => {
  void saveFromMenu(info, tab);
});
