// X's frame reports over postMessage with the methods its widgets.js listens for.
export function frameMessage(data: unknown) {
  if (!data || typeof data !== "object" || !("twttr.embed" in data)) return null;
  const message = data["twttr.embed"];
  if (!message || typeof message !== "object" || !("method" in message)) return null;
  if (message.method === "twttr.private.rendered") return { outcome: "ready" as const };
  if (message.method === "twttr.private.no_results") return { outcome: "failed" as const };
  if (message.method !== "twttr.private.resize" || !("params" in message)) return null;
  const size: unknown = Array.isArray(message.params) ? message.params[0] : null;
  const height = size && typeof size === "object" && "height" in size ? size.height : null;
  return typeof height === "number" && height > 0 ? { height } : null;
}
