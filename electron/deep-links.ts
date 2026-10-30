import { ipcMain, type WebContents } from "electron";
import { type DeepLinkCapture, parseDeepLinkCaptureCore } from "../src/lib/deepLinkCore.mjs";

// Links that arrive before the renderer subscribes wait here until it does.
const subscribers = new Set<WebContents>();
const pending: DeepLinkCapture[] = [];

function sendDeepLinks(contents: WebContents, links: DeepLinkCapture[]) {
  if (!contents.isDestroyed() && links.length > 0) {
    contents.send("inkling:deep-link", links);
  }
}

export function enqueueDeepLink(value: string) {
  const capture = parseDeepLinkCaptureCore(value);
  if (!capture) return;

  const live = [...subscribers].filter((contents) => !contents.isDestroyed());
  if (live.length === 0) {
    pending.push(capture);
    return;
  }
  for (const contents of live) sendDeepLinks(contents, [capture]);
}

export function handleDeepLinkArguments(argumentsList: string[]) {
  for (const argument of argumentsList) {
    if (argument.startsWith("inkling:")) enqueueDeepLink(argument);
  }
}

export const takePendingDeepLinks = () => pending.splice(0);

export function registerDeepLinkSubscriptions() {
  ipcMain.handle("inkling:deep-link:subscribe", (event) => {
    subscribers.add(event.sender);
    event.sender.once("destroyed", () => subscribers.delete(event.sender));
    sendDeepLinks(event.sender, takePendingDeepLinks());
  });
  ipcMain.handle("inkling:deep-link:unsubscribe", (event) => {
    subscribers.delete(event.sender);
  });
}
