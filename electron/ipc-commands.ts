import {
  type CommandArgs,
  type CommandName,
  type CommandResults,
  commandArgs,
} from "@inkling/contracts";
import { commandChannel, commandNames } from "@inkling/contracts/commands";
import { Schema } from "effect";
import { ipcMain } from "electron";

export type CommandHandlers = {
  [C in CommandName]: (args: CommandArgs<C>) => CommandResults[C] | Promise<CommandResults[C]>;
};

export function registerCommandHandlers(handlers: CommandHandlers) {
  for (const command of commandNames) {
    const decode = Schema.decodeUnknownSync(commandArgs[command]);
    const handler = handlers[command] as (args: unknown) => unknown;
    ipcMain.handle(commandChannel(command), (_event, args: unknown) => {
      // The renderer is untrusted, so a payload of the wrong shape never reaches a handler.
      let decoded: unknown;
      try {
        decoded = decode(args ?? {});
      } catch (error) {
        throw new Error(
          `invalid storage input: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        );
      }
      return handler(decoded);
    });
  }
}
