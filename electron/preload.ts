import { commandChannel, commandNames } from "@inkling/contracts/commands";
import { contextBridge, type IpcRendererEvent, ipcRenderer } from "electron";
import { nativeWindowCaptions } from "./window-chrome.ts";

// Never expose a generic IPC or command passthrough: the renderer is untrusted and must not get raw filesystem or shell access.
const commands = Object.freeze(
  Object.fromEntries(
    commandNames.map((command) => [
      command,
      (args?: unknown) => ipcRenderer.invoke(commandChannel(command), args),
    ]),
  ),
);

contextBridge.exposeInMainWorld(
  "inkling",
  Object.freeze({
    commands,
    onDeepLink: async (listener: (captures: unknown) => void) => {
      const handler = (_event: IpcRendererEvent, captures: unknown) => listener(captures);
      ipcRenderer.on("inkling:deep-link", handler);
      try {
        await ipcRenderer.invoke("inkling:deep-link:subscribe");
      } catch (error) {
        ipcRenderer.removeListener("inkling:deep-link", handler);
        throw error;
      }
      return () => {
        ipcRenderer.removeListener("inkling:deep-link", handler);
        void ipcRenderer.invoke("inkling:deep-link:unsubscribe");
      };
    },
    onJobUpdated: (listener: (payload: unknown) => void) => {
      const handler = (_event: IpcRendererEvent, payload: unknown) => listener(payload);
      ipcRenderer.on("inkling:job-updated", handler);
      return () => ipcRenderer.removeListener("inkling:job-updated", handler);
    },
    windowControls: Object.freeze({
      nativeCaptions: nativeWindowCaptions,
      minimize: () => ipcRenderer.invoke("inkling:window:minimize"),
      toggleMaximize: () => ipcRenderer.invoke("inkling:window:toggle-maximize"),
      close: () => ipcRenderer.invoke("inkling:window:close"),
      ready: () => ipcRenderer.invoke("inkling:window:ready"),
    }),
  }),
);
