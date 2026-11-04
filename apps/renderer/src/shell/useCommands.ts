import { type Command, bindingsFor, shortcuts } from "@inkling/contracts/shortcuts";
import { useHotkeys } from "@tanstack/react-hotkeys";
import { useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { desktop, platform } from "../desktop.ts";
import { runHandledCommand } from "./commands.ts";

// Mod resolves from the same platform that picked the bindings, not from the user agent.
const hotkeyPlatform = { darwin: "mac", win32: "windows", linux: "linux" } as const;

const modal =
  '[role="dialog"]:not([aria-modal="false"]), [role="alertdialog"]:not([aria-modal="false"])';

function run(router: ReturnType<typeof useRouter>, command: Command) {
  // An open dialog owns the keyboard: it keeps Escape and the shortcuts
  // until it closes. The settings sheet lives in the URL, so back and
  // forward still close and reopen it.
  const navigation = command === "back" || command === "forward";
  const owners = [...document.querySelectorAll(modal)];
  if (owners.some((dialog) => !navigation || dialog.id !== "settings-sheet")) return;
  switch (command) {
    case "addNote":
      return router.navigate({ to: "/add/note" });
    case "addQuote":
      return router.navigate({ to: "/add/quote" });
    case "addLink":
      return router.navigate({ to: "/add/link" });
    case "openSettings":
      return router.navigate({ to: ".", search: (prev) => ({ ...prev, settings: "general" }) });
    case "back":
      return router.history.back();
    case "forward":
      return router.history.forward();
    case "search":
    case "addFile":
    case "toggleSidebar":
    case "showShortcuts":
      return runHandledCommand(command);
  }
}

/** Runs shortcut commands, whether they come from the keyboard, the macOS menu or a mouse button. */
export function useCommands() {
  const router = useRouter();

  useHotkeys(
    (Object.keys(shortcuts) as Command[]).flatMap((command) =>
      bindingsFor(command, platform)
        // On macOS the menu bar owns every Cmd shortcut and sends it through onCommand.
        .filter((binding) => !(desktop && platform === "darwin" && binding.mod))
        .map((binding) => ({
          hotkey: binding,
          callback: () => void run(router, command),
          // Alt+Left is Back even in a field; only bare keys leave a field alone.
          options: { ignoreInputs: !binding.mod && !binding.alt },
        })),
    ),
    { platform: hotkeyPlatform[platform] },
  );

  useEffect(() => {
    // Chromium also steps history itself on an uncancelled side-button
    // mouseup, so without preventDefault one press moves two entries.
    const onMouseUp = (event: MouseEvent) => {
      if (event.button !== 3 && event.button !== 4) return;
      event.preventDefault();
      void run(router, event.button === 3 ? "back" : "forward");
    };
    window.addEventListener("mouseup", onMouseUp);
    const stopMenu = desktop?.onCommand((command) => void run(router, command));
    return () => {
      window.removeEventListener("mouseup", onMouseUp);
      stopMenu?.();
    };
  }, [router]);
}
