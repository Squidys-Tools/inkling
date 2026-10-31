import { accelerator, bindingsFor, type Command, shortcuts } from "@inkling/contracts/shortcuts";
import { app, Menu, type MenuItemConstructorOptions } from "electron";

/**
 * macOS routes Cmd+C, V, W, Q and every other key equivalent through the menu
 * bar, so the app needs a full one there. Windows and Linux have none: Chromium
 * handles editing keys itself and the renderer handles the rest.
 */
export function installMenu(send: (command: Command) => void) {
  if (process.platform !== "darwin") {
    Menu.setApplicationMenu(null);
    return;
  }
  const item = (command: Command): MenuItemConstructorOptions => {
    const binding = bindingsFor(command, "darwin").find((candidate) => candidate.mod);
    return {
      label: shortcuts[command].label,
      accelerator: binding && accelerator(binding),
      click: () => send(command),
    };
  };
  const development = !app.isPackaged;
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        role: "appMenu",
        submenu: [
          { role: "about" },
          { type: "separator" },
          { ...item("openSettings"), label: "Settings…" },
          { type: "separator" },
          { role: "services" },
          { type: "separator" },
          { role: "hide" },
          { role: "hideOthers" },
          { role: "unhide" },
          { type: "separator" },
          { role: "quit" },
        ],
      },
      {
        label: "File",
        submenu: [
          item("addNote"),
          item("addQuote"),
          item("addLink"),
          { ...item("addFile"), label: "Add Files…" },
          { type: "separator" },
          { role: "close" },
        ],
      },
      { role: "editMenu" },
      {
        label: "View",
        submenu: [
          item("search"),
          item("toggleSidebar"),
          { type: "separator" },
          { role: "resetZoom" },
          { role: "zoomIn" },
          { role: "zoomOut" },
          { type: "separator" },
          { role: "togglefullscreen" },
          ...(development
            ? ([{ type: "separator" }, { role: "reload" }, { role: "toggleDevTools" }] as const)
            : []),
        ],
      },
      { label: "Go", submenu: [item("back"), item("forward")] },
      { role: "windowMenu" },
      { role: "help", submenu: [item("showShortcuts")] },
    ]),
  );
}
