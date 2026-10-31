import {
  MessageChannelMain,
  type UtilityProcess,
  utilityProcess,
  type WebContents,
} from "electron";

const restartWindowMillis = 60_000;
const maxRestartsPerWindow = 3;
const shutdownTimeoutMillis = 10_000;

/**
 * Runs the library process (SQLite, search, the job queue) and hands each window
 * its own port to it. A crash restarts the process and reconnects every window;
 * the job queue's leases bring interrupted jobs back on their own.
 */
export function startLibraryProcess({
  entry,
  args,
  onGiveUp,
}: {
  entry: string;
  args: string[];
  onGiveUp: (code: number) => void;
}) {
  const clients = new Set<WebContents>();
  const restarts: number[] = [];
  let child: UtilityProcess;
  let stopping: Promise<void> | undefined;

  const connect = (contents: WebContents) => {
    const { port1, port2 } = new MessageChannelMain();
    child.postMessage({ type: "connect" }, [port1]);
    contents.postMessage("inkling:library-port", null, [port2]);
  };

  const spawn = () => {
    child = utilityProcess.fork(entry, args, {
      serviceName: "inkling library",
      stdio: "inherit",
    });
    child.once("exit", (code) => {
      if (stopping) return;
      const now = Date.now();
      restarts.push(now);
      while (restarts[0] < now - restartWindowMillis) restarts.shift();
      if (restarts.length > maxRestartsPerWindow) return onGiveUp(code);
      spawn();
      for (const contents of clients) if (!contents.isDestroyed()) connect(contents);
    });
  };
  spawn();

  return {
    /** Sends `contents` a port now (a reloaded page asks again), and a new one after every restart. */
    attach(contents: WebContents) {
      if (!clients.has(contents)) {
        clients.add(contents);
        contents.once("destroyed", () => clients.delete(contents));
      }
      connect(contents);
    },
    /** Asks the process to hand running jobs back and close the database, then waits for it. */
    stop() {
      stopping ??= new Promise<void>((resolve) => {
        const timer = setTimeout(() => child.kill(), shutdownTimeoutMillis);
        child.once("exit", () => {
          clearTimeout(timer);
          resolve();
        });
        child.postMessage({ type: "shutdown" });
      });
      return stopping;
    },
  };
}
