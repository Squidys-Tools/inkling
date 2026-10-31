import { LibraryRpcs } from "@inkling/contracts";
import { layerPlatform } from "@inkling/rpc-electron/client-main";
import { connect } from "@inkling/rpc-electron/promise-client";
import type { MessagePortMain } from "electron";

const open = (port: MessagePortMain) => connect(LibraryRpcs, layerPlatform(port));
export type LibraryClient = Awaited<ReturnType<typeof open>>["client"];

/**
 * Main's own client to the library process, so captures from outside the app
 * save with no window open. Each restart of the process brings a new port;
 * calls made before the first one wait for it.
 */
export function mainLibraryClient() {
  const firstPort = Promise.withResolvers<void>();
  let connection: ReturnType<typeof open> | undefined;
  return {
    onPort(port: MessagePortMain) {
      const previous = connection;
      connection = open(port);
      firstPort.resolve();
      void previous?.then(({ close }) => close()).catch(() => {});
    },
    async client() {
      await firstPort.promise;
      return (await connection!).client;
    },
  };
}
