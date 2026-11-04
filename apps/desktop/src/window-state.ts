import { channels } from "./channels.ts";

type StateWindow = {
  isDestroyed: () => boolean;
  isMaximized: () => boolean;
  on: {
    (event: "maximize", listener: () => void): unknown;
    (event: "unmaximize", listener: () => void): unknown;
  };
  webContents: { send: (channel: string, maximized: boolean) => void };
};

/** Send only this window's state; renderer reloads query it again through the named IPC. */
export function bindMaximizedState(window: StateWindow) {
  const changed = () => {
    if (!window.isDestroyed())
      window.webContents.send(channels.windowMaximized, window.isMaximized());
  };
  window.on("maximize", changed);
  window.on("unmaximize", changed);
}
