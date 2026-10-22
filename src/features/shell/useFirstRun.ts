import { useCallback, useEffect, useState } from "react";
import { completeOnboarding, getOnboardingState } from "../../lib/libraryApi";

export function useFirstRun(canUseDesktopBackend: boolean) {
  const [isFirstRunOpen, setIsFirstRunOpen] = useState(false);
  const finishFirstRun = useCallback(() => {
    setIsFirstRunOpen(false);
    void completeOnboarding().catch(() => null);
  }, []);
  // The desktop window stays hidden until this settles (inkling:window:ready),
  // so a first launch opens straight onto the welcome instead of flashing the
  // library. When the welcome runs, it reports ready once it has painted.
  useEffect(() => {
    const showWindow = () => void window.inkling?.windowControls.ready().catch(() => null);
    if (!canUseDesktopBackend) {
      showWindow();
      return;
    }
    let cancelled = false;
    void getOnboardingState()
      .then(({ shouldAutoShow }) => shouldAutoShow)
      .catch(() => false)
      .then((welcome) => {
        if (cancelled) return;
        if (welcome) setIsFirstRunOpen(true);
        else showWindow();
      });
    return () => {
      cancelled = true;
    };
  }, [canUseDesktopBackend]);

  return { isFirstRunOpen, setIsFirstRunOpen, finishFirstRun };
}
