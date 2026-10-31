import type { Platform } from "@inkling/contracts/desktop";
import { useSyncExternalStore } from "react";

// Phones and tablets run none of the builds; iOS also says "Mac OS X" and Android "Linux".
const detect = (): Platform | null => {
  const agent = navigator.userAgent;
  if (/iPhone|iPad|Android/u.test(agent)) return null;
  return /Mac/u.test(agent) ? "darwin" : /Windows/u.test(agent) ? "win32" : "linux";
};

const never = () => () => {};

/** The visitor's desktop system: null on a phone, and while prerendering, so the HTML never guesses one. */
export const usePlatform = () => useSyncExternalStore(never, detect, () => null);
