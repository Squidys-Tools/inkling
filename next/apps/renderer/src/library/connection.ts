import { LibraryRpcs } from "@inkling/contracts";
import { libraryPortMessage } from "@inkling/contracts/desktop";
import { layerPlatform } from "@inkling/rpc-electron/client-renderer";
import { type Connection, connect, type PromiseClient } from "@inkling/rpc-electron/promise-client";
import type { RpcGroup } from "effect/rpc";
import { desktop } from "../desktop.ts";

type Rpcs = RpcGroup.Rpcs<typeof LibraryRpcs>;
export type LibraryClient = PromiseClient<Rpcs>;

type Listener = (client: LibraryClient) => void;

let current: Connection<Rpcs> | undefined;
let ready: Promise<LibraryClient> | undefined;
const listeners = new Set<Listener>();

/**
 * The client for the library process. Main sends a new port whenever the
 * library process restarts; each one replaces the client, and `onReconnect`
 * listeners refetch what they show.
 */
export function libraryClient(): Promise<LibraryClient> {
  if (ready) return ready;
  if (!desktop)
    return Promise.reject(new Error("The library is only available in the desktop app."));
  ready = new Promise((resolve) => {
    window.addEventListener("message", async (event) => {
      if (event.source !== window || event.data !== libraryPortMessage) return;
      const [port] = event.ports;
      if (!port) return;
      const previous = current;
      current = await connect(LibraryRpcs, layerPlatform(port));
      const client = current.client;
      void previous?.close();
      if (previous) for (const listener of listeners) listener(client);
      ready = Promise.resolve(client);
      resolve(client);
    });
  });
  desktop.connectLibrary();
  return ready;
}

export function onReconnect(listener: Listener) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
