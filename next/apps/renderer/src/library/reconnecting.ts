export const restartedMessage = "The library restarted. Try again.";

type Opened<Client> = { client: Client; close: () => Promise<void> };

/**
 * Wraps one connection's client. Once retired, a call already in flight
 * rejects with a plain message, since its process is gone, and a new call
 * waits for the next client. `changes` streams pass through: their listeners
 * follow the reconnect themselves.
 */
function guard<Client extends object>(client: Client, next: () => Promise<Client>) {
  let retired = false;
  let retire = () => {};
  const retirement = new Promise<never>((_, reject) => {
    retire = () => {
      retired = true;
      reject(new Error(restartedMessage));
    };
  });
  retirement.catch(() => {});
  const guarded = new Proxy(client, {
    get(target, key) {
      const method: unknown = Reflect.get(target, key);
      if (key === "changes" || typeof method !== "function") return method;
      return (payload: unknown): Promise<unknown> => {
        if (!retired) return Promise.race([method.call(target, payload), retirement]);
        return next().then((fresh) => {
          const forwarded: unknown = Reflect.get(fresh, key);
          return typeof forwarded === "function" ? forwarded.call(fresh, payload) : forwarded;
        });
      };
    },
  });
  return { client: guarded, retire: () => retire() };
}

/**
 * The client for a process that can restart and send a new port. Each port
 * replaces the client: calls made while it connects wait for it, and
 * `onReconnect` listeners run only once `client()` already answers the new one.
 */
export function createReconnectingClient<Client extends object, Port>({
  open,
  requestPort,
}: {
  open: (port: Port) => Promise<Opened<Client>>;
  requestPort: () => void;
}) {
  type Waiting = { resolve: (client: Client) => void; reject: (error: unknown) => void };
  let ready: Promise<Client> | undefined;
  let waiting: Waiting | undefined;
  let current: { close: () => Promise<void>; retire: () => void } | undefined;
  let ports = 0;
  const listeners = new Set<(client: Client) => void>();

  const wait = () => {
    if (waiting) return waiting;
    let deferred: Waiting | undefined;
    ready = new Promise<Client>((resolve, reject) => {
      deferred = { resolve, reject };
    });
    ready.catch(() => {});
    waiting = deferred;
    return deferred as Waiting;
  };

  function client(): Promise<Client> {
    if (ready) return ready;
    wait();
    requestPort();
    return ready ?? Promise.reject(new Error("The library did not start."));
  }

  async function receivePort(port: Port) {
    const mine = ++ports;
    const pending = wait();
    const previous = current;
    current = undefined;
    previous?.retire();
    let opened: Opened<Client>;
    try {
      opened = await open(port);
    } catch (error) {
      if (mine !== ports) return;
      // The first load shows the failure; the next call asks for a port again.
      waiting = undefined;
      ready = undefined;
      pending.reject(error);
      return;
    }
    if (mine !== ports) {
      void opened.close();
      return;
    }
    const { client: fresh, retire } = guard(opened.client, client);
    current = { close: opened.close, retire };
    waiting = undefined;
    ready = Promise.resolve(fresh);
    pending.resolve(fresh);
    void previous?.close().catch(() => {});
    if (mine > 1) for (const listener of listeners) listener(fresh);
  }

  return {
    client,
    receivePort,
    onReconnect(listener: (client: Client) => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}
