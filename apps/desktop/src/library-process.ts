import { MessageChannelMain, type MessagePortMain, type WebContents } from "electron";
import { superviseUtilityProcess } from "./utility-process.ts";

/**
 * Runs the library process (SQLite, search, the job queue) and hands each window
 * its own port to it. A crash restarts the process and reconnects every window;
 * the job queue's leases bring interrupted jobs back on their own.
 */
export function startLibraryProcess({
  entry,
  args,
  onRestart,
  onGiveUp,
}: {
  entry: string;
  args: string[];
  onRestart: () => void;
  onGiveUp: (code: number) => void;
}) {
  const clients = new Set<WebContents>();
  let mainClient: ((port: MessagePortMain) => void) | undefined;

  const connect = (contents: WebContents) => {
    const { port1, port2 } = new MessageChannelMain();
    child.postMessage({ type: "connect" }, [port1]);
    contents.postMessage("inkling:library-port", null, [port2]);
  };
  const connectMain = () => {
    if (!mainClient) return;
    const { port1, port2 } = new MessageChannelMain();
    child.postMessage({ type: "connect" }, [port1]);
    mainClient(port2);
  };

  const child = superviseUtilityProcess({
    entry,
    args,
    serviceName: "inkling library",
    onRestart: () => {
      for (const contents of clients) if (!contents.isDestroyed()) connect(contents);
      connectMain();
      onRestart();
    },
    onGiveUp,
  });

  return {
    /** Sends `contents` a port now (a reloaded page asks again), and a new one after every restart. */
    attach(contents: WebContents) {
      if (!clients.has(contents)) {
        clients.add(contents);
        contents.once("destroyed", () => clients.delete(contents));
      }
      connect(contents);
    },
    /** Gives main's own client a port now and a new one after every restart. */
    attachMain(onPort: (port: MessagePortMain) => void) {
      mainClient = onPort;
      connectMain();
    },
    /** Hands the library its port to the worker process. */
    connectWorker(port: MessagePortMain) {
      child.postMessage({ type: "worker" }, [port]);
    },
    /** Asks the process to hand running jobs back and close the database, then waits for it. */
    stop: () => child.stop(),
  };
}
