import type { DesktopBridge, Platform } from "@inkling/contracts/desktop";
import { libraryPortMessage } from "@inkling/contracts/desktop";
import { contextBridge, type IpcRendererEvent, ipcRenderer } from "electron";
import { channels } from "./channels.ts";
import { windowChrome } from "./chrome.ts";

// The page is untrusted: expose named calls only, never a generic invoke or send.
const invoke = (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args);
const subscribe = <T>(channel: string, listener: (value: T) => void) => {
  const handler = (_event: IpcRendererEvent, value: T) => listener(value);
  ipcRenderer.on(channel, handler);
  return () => void ipcRenderer.removeListener(channel, handler);
};

// contextBridge cannot carry a MessagePort, so the port goes to the page as a
// window message, addressed to this page's own origin only.
ipcRenderer.on(channels.libraryPort, (event) => {
  window.postMessage(libraryPortMessage, window.location.origin, event.ports);
});

const platform = process.platform as Platform;

const bridge: DesktopBridge = {
  platform,
  chrome: windowChrome(platform).chrome,
  appVersion: () => invoke(channels.appVersion),
  connectLibrary: () => ipcRenderer.send(channels.libraryConnect),
  window: {
    minimize: () => invoke(channels.windowMinimize),
    toggleMaximize: () => invoke(channels.windowToggleMaximize),
    close: () => invoke(channels.windowClose),
    ready: () => invoke(channels.windowReady),
  },
  onCommand: (listener) => subscribe(channels.command, listener),
  onCaptures: (listener) => subscribe(channels.captures, listener),
  showContextMenu: (items) => invoke(channels.contextMenu, items),
  confirm: (options) => invoke(channels.confirm, options),
  chooseDirectory: (title) => invoke(channels.chooseDirectory, title),
  showItemInFolder: (itemId) => invoke(channels.showItemInFolder, itemId),
  showLibraryFolder: () => invoke(channels.showLibraryFolder),
  openExternal: (url) => invoke(channels.openExternal, url),
  updates: {
    state: () => invoke(channels.updateState),
    check: () => invoke(channels.updateCheck),
    download: () => invoke(channels.updateDownload),
    install: () => invoke(channels.updateInstall),
    cancel: () => invoke(channels.updateCancel),
    setChannel: (channel) => invoke(channels.updateSetChannel, channel),
    onState: (listener) => subscribe(channels.updateChanged, listener),
  },
  capture: {
    receiver: () => invoke(channels.captureReceiver),
    pairingToken: () => invoke(channels.capturePairingToken),
    regeneratePairingToken: () => invoke(channels.captureRegenerateToken),
    testReceiver: () => invoke(channels.captureTestReceiver),
  },
};

contextBridge.exposeInMainWorld("inkling", Object.freeze(bridge));
