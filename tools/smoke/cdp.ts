// A minimal Chrome DevTools Protocol client for the smoke test and the benchmark.

type Target = { type: string; url: string; webSocketDebuggerUrl: string };

export async function pageTarget(port: number, timeoutMillis = 30_000) {
  const deadline = Date.now() + timeoutMillis;
  while (Date.now() < deadline) {
    const targets = await fetch(`http://127.0.0.1:${port}/json/list`)
      .then((response) => response.json() as Promise<Target[]>)
      .catch(() => []);
    const page = targets.find(
      (target) => target.type === "page" && target.url.startsWith("app://"),
    );
    if (page) return page;
    await Bun.sleep(100);
  }
  throw new Error(`no app:// page on the debugging port ${port}`);
}

export async function connect(target: Target) {
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let nextId = 0;
  const pending = new Map<number, (message: { result?: unknown; error?: unknown }) => void>();
  const listeners = new Set<(method: string, params: unknown) => void>();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (message.id !== undefined) pending.get(message.id)?.(message);
    else for (const listener of listeners) listener(message.method, message.params);
  });
  const send = <T>(method: string, params: object = {}) =>
    new Promise<T>((resolve, reject) => {
      const id = nextId++;
      pending.set(id, (message) => {
        pending.delete(id);
        if (message.error) reject(new Error(JSON.stringify(message.error)));
        else resolve(message.result as T);
      });
      socket.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async <T>(expression: string) => {
    const result = await send<{ result: { value: T }; exceptionDetails?: unknown }>(
      "Runtime.evaluate",
      { expression, awaitPromise: true, returnByValue: true },
    );
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  return {
    send,
    evaluate,
    on: (listener: (method: string, params: unknown) => void) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    close: () => socket.close(),
  };
}
