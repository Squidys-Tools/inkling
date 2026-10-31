import type { Command, Platform } from "./shortcuts.ts";

export type { Command, Platform } from "./shortcuts.ts";

/**
 * How the OS frames the window, decided by main per platform: traffic lights at
 * the top left (`native-left`), the Window Controls Overlay at the top right
 * (`overlay-right`), or the desktop's own titlebar (`system-frame`).
 */
export type WindowChrome = {
  controls: "native-left" | "overlay-right" | "system-frame";
  /** Height of the draggable band the renderer draws, in CSS pixels. */
  titlebarHeight: number;
  /** Width the renderer must leave free for OS controls on that side. */
  controlsInset: number;
};

export type ContextMenuItem =
  | { type: "item"; id: string; label: string; enabled?: boolean; destructive?: boolean }
  | { type: "separator" };

export type ConfirmOptions = {
  message: string;
  detail?: string;
  confirmLabel: string;
  destructive?: boolean;
};

export type UpdateChannel = "latest" | "nightly";
export type UpdateState = {
  channel: UpdateChannel;
  currentVersion: string;
  status:
    | "disabled"
    | "idle"
    | "checking"
    | "up-to-date"
    | "available"
    | "downloading"
    | "downloaded"
    | "installing"
    | "cancelled"
    | "error";
  availableVersion: string | null;
  progress: number | null;
  message: string | null;
};

export type CaptureReceiver = { running: boolean; port: number | null };

/** A capture the browser extension or an `inkling://` link asked for. */
export type DeepLinkCapture = { url: string; title?: string; source: "deep-link" | "extension" };

/** What the preload exposes as `window.inkling`. Nothing here reaches files or the shell directly. */
export type DesktopBridge = {
  platform: Platform;
  chrome: WindowChrome;
  appVersion: () => Promise<string>;
  /** Asks main for a fresh port to the library process; it arrives as a window message. */
  connectLibrary: () => void;
  window: {
    minimize: () => Promise<void>;
    toggleMaximize: () => Promise<void>;
    close: () => Promise<void>;
    /** Shows the window once the first frame worth showing has painted. */
    ready: () => Promise<void>;
  };
  onCommand: (listener: (command: Command) => void) => () => void;
  onCaptures: (listener: (captures: DeepLinkCapture[]) => void) => () => void;
  showContextMenu: (items: ContextMenuItem[]) => Promise<string | null>;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  chooseDirectory: (title: string) => Promise<string | null>;
  showItemInFolder: (itemId: string) => Promise<void>;
  showLibraryFolder: () => Promise<void>;
  openExternal: (url: string) => Promise<void>;
  updates: {
    state: () => Promise<UpdateState>;
    check: () => Promise<UpdateState>;
    download: () => Promise<UpdateState>;
    install: () => Promise<UpdateState>;
    setChannel: (channel: UpdateChannel) => Promise<UpdateState>;
    onState: (listener: (state: UpdateState) => void) => () => void;
  };
  capture: {
    receiver: () => Promise<CaptureReceiver>;
    pairingToken: () => Promise<string>;
    regeneratePairingToken: () => Promise<string>;
  };
};

/** The window message that carries the library port from the preload to the page. */
export const libraryPortMessage = "inkling:library-port";
