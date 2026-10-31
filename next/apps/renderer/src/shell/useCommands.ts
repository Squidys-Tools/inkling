import { type Command, commandForKey } from "@inkling/contracts/shortcuts";
import { useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { desktop, platform } from "../desktop.ts";
import { runHandledCommand } from "./commands.ts";

const isEditable = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || target.matches("input, textarea, select"));

/** Runs shortcut commands, whether they come from the keyboard, the macOS menu or a mouse button. */
export function useCommands() {
  const router = useRouter();

  useEffect(() => {
    const run = (command: Command) => {
      switch (command) {
        case "addNote":
          return router.navigate({ to: "/add/note" });
        case "addQuote":
          return router.navigate({ to: "/add/quote" });
        case "addLink":
          return router.navigate({ to: "/add/link" });
        case "openSettings":
          return router.navigate({ to: "/settings/$section", params: { section: "general" } });
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
    // Mouse side buttons are back and forward on every system.
    const onMouseUp = (event: MouseEvent) => {
      if (event.button === 3) void run("back");
      if (event.button === 4) void run("forward");
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
