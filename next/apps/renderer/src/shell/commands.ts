import type { Command } from "@inkling/contracts/shortcuts";

const handlers = new Map<Command, () => void>();

/**
 * Commands a mounted component answers itself (focus search, open the file
 * picker, slide the sidebar). The last component to register a command owns it.
 */
export function handleCommand(command: Command, handler: () => void) {
  handlers.set(command, handler);
  return () => {
    if (handlers.get(command) === handler) handlers.delete(command);
  };
}

export const runHandledCommand = (command: Command) => handlers.get(command)?.();
