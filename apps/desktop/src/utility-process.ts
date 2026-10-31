import { type UtilityProcess, utilityProcess } from "electron";

const restartWindowMillis = 60_000;
const maxRestartsPerWindow = 3;
const shutdownTimeoutMillis = 10_000;

/**
 * Runs a utility process and starts it again when it crashes, until it crashes
 * more than three times in a minute. A restarted process has none of the old
 * one's ports, so `onRestart` is where callers hand it new ones.
 */
export function superviseUtilityProcess({
  entry,
  args,
  serviceName,
  onRestart,
  onGiveUp,
}: {
  entry: string;
  args: string[];
  serviceName: string;
  onRestart: () => void;
  onGiveUp: (code: number) => void;
}) {
  const restarts: number[] = [];
  let child: UtilityProcess;
  let running = false;
  let stopping: Promise<void> | undefined;
  type Listener = (message: unknown, reply: (answer: unknown) => void) => void;
  const listeners: Listener[] = [];
  // A reply reaches only the process that asked: once it exits, a restarted one
  // must not receive an answer to a request it never made.
  const listen = (sender: UtilityProcess, listener: Listener) =>
    sender.on("message", (message) =>
      listener(message, (answer) => {
        if (running && child === sender) sender.postMessage(answer);
      }),
    );

  const spawn = () => {
    child = utilityProcess.fork(entry, args, { serviceName, stdio: "inherit" });
    for (const listener of listeners) listen(child, listener);
    running = true;
    child.once("exit", (code) => {
      running = false;
      if (stopping) return;
      const now = Date.now();
      restarts.push(now);
      while (restarts[0] < now - restartWindowMillis) restarts.shift();
      if (restarts.length > maxRestartsPerWindow) return onGiveUp(code);
      spawn();
      onRestart();
    });
  };
  spawn();

  return {
    /** Runs `listener` for each message from the current process and every later one. */
    onMessage(listener: Listener) {
      listeners.push(listener);
      listen(child, listener);
    },
    postMessage(message: unknown, ports?: Electron.MessagePortMain[]) {
      if (running) child.postMessage(message, ports);
    },
    /** Asks the process to finish cleanly, then waits for it, killing it after ten seconds. */
    stop() {
      stopping ??= running
        ? new Promise<void>((resolve) => {
            const timer = setTimeout(() => child.kill(), shutdownTimeoutMillis);
            child.once("exit", () => {
              clearTimeout(timer);
              resolve();
            });
            child.postMessage({ type: "shutdown" });
          })
        : Promise.resolve();
      return stopping;
    },
  };
}
