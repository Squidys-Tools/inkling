import type { Platform } from "@inkling/contracts/desktop";
import { useSyncExternalStore } from "react";

const detect = (): Platform =>
  /Mac/u.test(navigator.userAgent)
    ? "darwin"
    : /Windows/u.test(navigator.userAgent)
      ? "win32"
      : "linux";

const never = () => () => {};

/** The visitor's system, or null while prerendering, so the HTML never guesses one. */
export const usePlatform = () => useSyncExternalStore(never, detect, () => null);
