import { registerFonts } from "@inkling/ui";
import { color, font } from "@inkling/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import browser from "webextension-polyfill";
import { readLoopbackConfig } from "../deliver";
import { pageChoices, readPage } from "../page";
import { loopbackHealth } from "../transport";
import { Popup } from "./Popup";

async function openTab() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab) return null;
  let facts = null;
  // Opening the popup grants activeTab; pages Chrome protects still refuse the script.
  if (tab.id !== undefined) {
    try {
      // A tab still loading, or one holding an alert open, would never answer.
      const [injection] = await Promise.race([
        browser.scripting.executeScript({
          target: { tabId: tab.id },
          func: readPage,
          injectImmediately: true,
        }),
        new Promise<never>((_, reject) => setTimeout(reject, 800)),
      ]);
      facts = (injection?.result as ReturnType<typeof readPage> | undefined) ?? null;
    } catch {
      facts = null;
    }
  }
  return pageChoices(tab, facts);
}

async function link() {
  const config = await readLoopbackConfig().catch(() => null);
  if (!config) return "unpaired" as const;
  return loopbackHealth(config.baseUrl, config.token);
}

// Chrome sizes a popup to its content, so the page sets its width and never its height.
const styles = stylex.create({
  html: {
    colorScheme: "dark",
    backgroundColor: color.window,
    color: color.ink,
    fontFamily: font.body,
    fontSynthesis: "none",
    WebkitFontSmoothing: "antialiased",
  },
  body: { width: "344px", margin: 0 },
});

const root = document.getElementById("root");
if (!root) throw new Error("popup.html has no #root");
document.documentElement.className = stylex.props(styles.html).className ?? "";
document.body.className = stylex.props(styles.body).className ?? "";
registerFonts();

// The card is measured on its first render, so its fonts must be in by then.
const [choices, connection] = await Promise.all([
  openTab().catch(() => null),
  link(),
  document.fonts.ready,
]);
createRoot(root).render(
  <StrictMode>
    <Popup choices={choices} connection={connection} />
  </StrictMode>,
);
