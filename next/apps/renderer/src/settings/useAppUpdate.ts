import { useSyncExternalStore } from "react";
import { desktop } from "../desktop.ts";
import { createUpdateStore, type UpdateAction, updateNavRow, updateView } from "./updateModel.ts";

const updates = createUpdateStore(desktop?.updates);

/**
 * Update state and actions, shared by Settings and the sidebar. `navRow` is the
 * sidebar's offer of a new version (null when there is none); `runNavRow` runs
 * what that row offers. With `start: false` it only follows state Settings loaded.
 */
export function useAppUpdate({ start = true } = {}) {
  const view = updateView(
    useSyncExternalStore(start ? updates.subscribe : updates.observe, updates.get),
  );
  const navRow = updateNavRow(view);
  const run = (action: Exclude<UpdateAction, "channel">) =>
    action === "check"
      ? updates.check()
      : action === "install"
        ? updates.install()
        : updates.download();
  return {
    ...view,
    navRow,
    runNavRow: () => (navRow ? run(navRow.action) : Promise.resolve()),
    check: updates.check,
    setChannel: updates.setChannel,
    download: updates.download,
    install: updates.install,
    cancel: updates.cancel,
  };
}

export type AppUpdate = ReturnType<typeof useAppUpdate>;
