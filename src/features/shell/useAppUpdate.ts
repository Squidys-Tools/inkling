import { useEffect, useState } from "react";
import { type AvailableUpdate, checkForUpdates, installUpdate } from "../../lib/libraryApi";

export function useAppUpdate(canUseDesktopBackend: boolean) {
  const [availableUpdate, setAvailableUpdate] = useState<AvailableUpdate | null>(null);
  const [isInstallingUpdate, setIsInstallingUpdate] = useState(false);
  const [updateInstallFailed, setUpdateInstallFailed] = useState(false);
  useEffect(() => {
    if (!canUseDesktopBackend) return;
    let cancelled = false;
    void checkForUpdates()
      .then((update) => {
        if (!cancelled) setAvailableUpdate(update);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [canUseDesktopBackend]);
  const handleInstallUpdate = async () => {
    if (!availableUpdate) return;
    setIsInstallingUpdate(true);
    setUpdateInstallFailed(false);
    try {
      const latestUpdate = await installUpdate(availableUpdate.version);
      setAvailableUpdate(latestUpdate);
      setIsInstallingUpdate(false);
    } catch {
      setIsInstallingUpdate(false);
      setUpdateInstallFailed(true);
    }
  };

  return { availableUpdate, isInstallingUpdate, updateInstallFailed, handleInstallUpdate };
}
