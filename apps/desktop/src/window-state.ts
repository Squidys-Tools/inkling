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
export function bindMaximizedState(window: StateWindow, channel: string) {
  const changed = () => {
    if (!window.isDestroyed()) window.webContents.send(channel, window.isMaximized());
  };
  window.on("maximize", changed);
  window.on("unmaximize", changed);
}
