import type { CommandArgs, CommandName, CommandResults } from "@inkling/contracts";
import type { DeepLinkCapture } from "./lib/deepLink";

type ElectronBridge = {
  commands: { [C in CommandName]: (args?: CommandArgs<C>) => Promise<CommandResults[C]> };
  onDeepLink: (listener: (captures: DeepLinkCapture[]) => void) => Promise<() => void>;
  onJobUpdated: (listener: (payload: { itemId: string }) => void) => () => void;
  windowControls: {
    minimize: () => Promise<void>;
    toggleMaximize: () => Promise<void>;
    close: () => Promise<void>;
    /** Shows the window, once the first frame worth showing has painted. */
    ready: () => Promise<void>;
  };
};

declare global {
  interface Window {
    inkling?: ElectronBridge;
  }
}

export {};
