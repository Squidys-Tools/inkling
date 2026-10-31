import { BrowserWorker } from "@effect/platform-browser";

/** The client half for the renderer, whose port is a DOM MessagePort. */
export const layerPlatform = (port: MessagePort) => BrowserWorker.layer(() => port);
