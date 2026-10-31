// One table drives the macOS menu, the renderer's key handler and every hint in
// the UI, so a binding changes in one place. Keep it free of runtime imports:
// the main process and the preload both load it.

export type Platform = "darwin" | "win32" | "linux";

export type Command =
  | "search"
  | "addNote"
  | "addQuote"
  | "addLink"
  | "addFile"
  | "toggleSidebar"
  | "showShortcuts"
  | "openSettings"
  | "back"
  | "forward";

/** `mod` is Cmd on macOS and Ctrl elsewhere. `key` is a KeyboardEvent.key value. */
export type Binding = { key: string; mod?: boolean; shift?: boolean; alt?: boolean };

type Shortcut = {
  label: string;
  /** The first binding is the one menus and hints show. */
  mac: readonly Binding[];
  other: readonly Binding[];
};

const same = (...bindings: Binding[]) => ({ mac: bindings, other: bindings });

export const shortcuts: Record<Command, Shortcut> = {
  search: { label: "Search", ...same({ key: "k", mod: true }, { key: "/" }) },
  addNote: { label: "New note", ...same({ key: "n", mod: true }, { key: "n" }) },
  addQuote: { label: "New quote", ...same({ key: "n", mod: true, shift: true }) },
  addLink: { label: "Save a link", ...same({ key: "l", mod: true, shift: true }) },
  addFile: { label: "Add files", ...same({ key: "o", mod: true }) },
  toggleSidebar: { label: "Show or hide the sidebar", ...same({ key: "\\", mod: true }) },
  showShortcuts: { label: "Keyboard shortcuts", ...same({ key: "/", mod: true }, { key: "?" }) },
  openSettings: { label: "Settings", ...same({ key: ",", mod: true }) },
  back: {
    label: "Back",
    mac: [{ key: "[", mod: true }],
    other: [{ key: "ArrowLeft", alt: true }],
  },
  forward: {
    label: "Forward",
    mac: [{ key: "]", mod: true }],
    other: [{ key: "ArrowRight", alt: true }],
  },
};

export const bindingsFor = (command: Command, platform: Platform) =>
  platform === "darwin" ? shortcuts[command].mac : shortcuts[command].other;

const acceleratorKeys: Record<string, string> = {
  ArrowLeft: "Left",
  ArrowRight: "Right",
  "\\": "Backslash",
  "/": "/",
};

/** Electron accelerator for a menu item, such as `CmdOrCtrl+Shift+N`. */
export function accelerator({ key, mod, shift, alt }: Binding) {
  const parts = [mod && "CmdOrCtrl", alt && "Alt", shift && "Shift"].filter(Boolean);
  return [...parts, acceleratorKeys[key] ?? key.toUpperCase()].join("+");
}

const macSymbols: Record<string, string> = { ArrowLeft: "←", ArrowRight: "→" };

/** How a binding reads in a hint: ⌘⇧N on macOS, Ctrl+Shift+N elsewhere. */
export function bindingLabel({ key, mod, shift, alt }: Binding, platform: Platform) {
  const name = key.length === 1 ? key.toUpperCase() : (macSymbols[key] ?? key);
  if (platform === "darwin") return `${alt ? "⌥" : ""}${shift ? "⇧" : ""}${mod ? "⌘" : ""}${name}`;
  const words = { ArrowLeft: "Left", ArrowRight: "Right" } as Record<string, string>;
  return [mod && "Ctrl", alt && "Alt", shift && "Shift", words[key] ?? name]
    .filter(Boolean)
    .join("+");
}

// The fields of a DOM KeyboardEvent this reads; main has no DOM types.
type KeyEvent = {
  key: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  isComposing: boolean;
};

/**
 * The command a key press runs. Bindings without a modifier never fire while
 * the user types in a field, and nothing fires during IME composition.
 */
export function commandForKey(event: KeyEvent, platform: Platform, inEditable: boolean) {
  if (event.isComposing) return null;
  const mod = platform === "darwin" ? event.metaKey : event.ctrlKey;
  // Ctrl on macOS and Meta elsewhere belong to the system.
  const foreign = platform === "darwin" ? event.ctrlKey : event.metaKey;
  if (foreign) return null;
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  for (const command of Object.keys(shortcuts) as Command[]) {
    for (const binding of bindingsFor(command, platform)) {
      const plain = !binding.mod && !binding.alt;
      if (plain && inEditable) continue;
      if (binding.key !== key || !!binding.mod !== mod || !!binding.alt !== event.altKey) continue;
      // "?" already implies Shift on most layouts, so a bare symbol binding ignores Shift.
      if (binding.shift !== undefined || binding.mod) {
        if (!!binding.shift !== event.shiftKey) continue;
      }
      return command;
    }
  }
  return null;
}
