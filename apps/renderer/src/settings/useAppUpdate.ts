import { useSyncExternalStore } from "react";
import { desktop, platform } from "../desktop.ts";
import { confirm } from "../shell/confirm.ts";
import { createUpdateStore, type UpdateAction, updateNavRow, updateView } from "./updateModel.ts";

const updates = createUpdateStore(desktop?.updates);

/** Asks first, then installs the version the user was shown. */
async function install() {
  const version = updates.get().state?.downloadedVersion;
  if (!version) return;
  const restart = "inkling restarts to finish. Your library stays on this computer.";
  const confirmed = await confirm({
    message: `Install inkling ${version}?`,
    detail: platform === "linux" ? `${restart} Your system may ask for your password.` : restart,
    confirmLabel: "Install and restart",
  });
  if (confirmed) await updates.install(version);
}

/**
 * Update state and actions, shared by Settings and the sidebar. `navRow` is the
 * sidebar's offer of a new version (null when there is none); `runNavRow` runs
 * what that row offers.
 */
export function useAppUpdate() {
  const view = updateView(useSyncExternalStore(updates.subscribe, updates.get));
  const navRow = updateNavRow(view);
  const run = (action: Exclude<UpdateAction, "channel">) =>
    action === "check" ? updates.check() : action === "install" ? install() : updates.download();
  return {
    ...view,
    navRow,
    runNavRow: () => (navRow ? run(navRow.action) : Promise.resolve()),
    check: updates.check,
    setChannel: updates.setChannel,
    download: updates.download,
    install,
    cancel: updates.cancel,
  };
}

export type AppUpdate = ReturnType<typeof useAppUpdate>;
