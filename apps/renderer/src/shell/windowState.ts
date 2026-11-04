import type { DesktopBridge } from "@inkling/contracts/desktop";

type WindowState = Pick<DesktopBridge["window"], "isMaximized" | "onMaximized">;

/** Subscribe before querying; a late initial reply must never overwrite a newer WM event. */
export function observeMaximized(actions: WindowState, update: (maximized: boolean) => void) {
  let alive = true;
  let changed = false;
  const stop = actions.onMaximized((value) => {
    changed = true;
    if (alive) update(value);
  });
  void actions.isMaximized().then(
    (value) => {
      if (alive && !changed) update(value);
    },
    () => {},
  );
  return () => {
    alive = false;
    stop();
  };
}
