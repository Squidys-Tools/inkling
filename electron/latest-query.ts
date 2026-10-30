// Native inference cannot be interrupted safely mid-call. Keep at most one
// inference running and one newest query waiting; superseded callers receive
// their lexical-only fallback rather than filling a model queue while typing.
export function createLatestQuery<T>(infer: (text: string) => Promise<T>, fallback: () => T) {
  type Call = { text: string; resolve: (value: T) => void; reject: (error: unknown) => void };
  let active = false;
  let pending: Call | undefined;
  const drain = async (call: Call) => {
    active = true;
    try {
      call.resolve(await infer(call.text));
    } catch (error) {
      call.reject(error);
    } finally {
      active = false;
      const next = pending;
      pending = undefined;
      if (next) void drain(next);
    }
  };
  return (text: string) =>
    new Promise<T>((resolve, reject) => {
      const call = { text, resolve, reject };
      if (!active) void drain(call);
      else {
        pending?.resolve(fallback());
        pending = call;
      }
    });
}
