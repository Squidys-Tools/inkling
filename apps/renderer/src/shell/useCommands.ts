import { type Command, commandForKey } from "@inkling/contracts/shortcuts";
import { useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { desktop, platform } from "../desktop.ts";
import { runHandledCommand } from "./commands.ts";

const modal = '[role="dialog"]:not([aria-modal="false"]), [role="alertdialog"]:not([aria-modal="false"])';

const isEditable = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || target.matches("input, textarea, select"));

/** Runs shortcut commands, whether they come from the keyboard, the macOS menu or a mouse button. */
export function useCommands() {
  const router = useRouter();

  useEffect(() => {
    const run = (command: Command) => {
      // An open dialog owns the keyboard: it keeps Escape and the shortcuts
      // until it closes. The settings sheet lives in the URL, so back and
      // forward from the mouse or the menu still close and reopen it (Base UI
      // keeps Alt+arrow keys inside the sheet).
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
          return router.navigate({
            to: ".",
            search: (prev) => ({ ...prev, settings: "general" }),
          });
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
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const command = commandForKey(event, platform, isEditable(event.target));
      if (!command) return;
      // On macOS the menu bar owns every Cmd shortcut and sends it through onCommand.
      if (desktop && platform === "darwin" && event.metaKey) return;
      event.preventDefault();
      void run(command);
    };
    // Chromium also steps history itself on an uncancelled side-button
    // mouseup, so without preventDefault one press moves two entries.
    const onMouseUp = (event: MouseEvent) => {
      if (event.button !== 3 && event.button !== 4) return;
      event.preventDefault();
      void run(event.button === 3 ? "back" : "forward");
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("mouseup", onMouseUp);
    const stopMenu = desktop?.onCommand((command) => void run(command));
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mouseup", onMouseUp);
      stopMenu?.();
    };
  }, [router]);
}
