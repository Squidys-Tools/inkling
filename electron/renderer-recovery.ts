// Bound automatic recovery: a repeated fault must leave a usable recovery
// screen, not an endless renderer reload/OOM loop.
export function createRendererRecovery(now: () => number = Date.now) {
  let attempts: number[] = [];
  return {
    admit() {
      const time = now();
      attempts = attempts.filter((at) => time - at < 60_000);
      if (attempts.length >= 2) return false;
      attempts.push(time);
      return true;
    },
  };
}
