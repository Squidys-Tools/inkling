import { LibraryRpcs } from "@inkling/contracts";
import { libraryPortMessage } from "@inkling/contracts/desktop";
import { layerPlatform } from "@inkling/rpc-electron/client-renderer";
import { connect, type PromiseClient } from "@inkling/rpc-electron/promise-client";
import type { RpcGroup } from "effect/rpc";
import { desktop } from "../desktop.ts";
import { createReconnectingClient } from "./reconnecting.ts";

type Rpcs = RpcGroup.Rpcs<typeof LibraryRpcs>;
export type LibraryClient = PromiseClient<Rpcs>;

type Listener = (client: LibraryClient) => void;

// Main sends a new port whenever the library process restarts.
const library = desktop
  ? createReconnectingClient<LibraryClient, MessagePort>({
      open: (port) => connect(LibraryRpcs, layerPlatform(port)),
      requestPort: () => desktop?.connectLibrary(),
    })
  : undefined;

if (library)
  window.addEventListener("message", (event) => {
    if (event.source !== window || event.data !== libraryPortMessage) return;
    const [port] = event.ports;
    if (port) void library.receivePort(port);
  });

let preview: Promise<LibraryClient> | undefined;

/** The client for the library process, or for the in-memory demo library in the web preview. */
export function libraryClient(): Promise<LibraryClient> {
  if (library) return library.client();
  // The web preview serves the demo seed from memory, only in development and in
  // `build:web`'s preview mode, so the desktop bundle never carries the seed's images.
  if (!import.meta.env.DEV && import.meta.env.MODE !== "preview")
    return Promise.reject(new Error("The library is only available in the desktop app."));
  preview ??= import("./preview/client.ts").then(({ createPreviewClient }) =>
    createPreviewClient(),
  );
  return preview;
}

/** Runs after a library restart, once `libraryClient()` already answers the new client. */
export function onReconnect(listener: Listener) {
  return library ? library.onReconnect(listener) : () => {};
}
