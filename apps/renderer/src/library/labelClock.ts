import { createStore, useStore } from "./store.ts";

// Card date labels ("Just now", "Today") read the time when they are drawn.
// This store changes only at the moment the earliest drawn label expires, so
// cards redraw then and never on a repeating timer.
export const labelClock = createStore(0);

let wakeAt = Number.POSITIVE_INFINITY;
let timer: ReturnType<typeof setTimeout> | undefined;
// setTimeout fires at once for delays past 2^31 - 1 ms.
const longestDelay = 2 ** 31 - 1;

export function expireLabelAt(at: number) {
  if (!Number.isFinite(at) || at >= wakeAt) return;
  wakeAt = at;
  clearTimeout(timer);
  timer = setTimeout(
    () => {
      wakeAt = Number.POSITIVE_INFINITY;
      timer = undefined;
      labelClock.set((tick) => tick + 1);
    },
    Math.min(Math.max(0, at - Date.now()), longestDelay),
  );
}

export const useLabelClock = () => useStore(labelClock, (tick) => tick);
