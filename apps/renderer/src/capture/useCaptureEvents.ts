import { useEffect, useState } from "react";
import { desktop } from "../desktop.ts";
import { captureFiles, captureText, reportCaptureError } from "./capture.ts";
import { watchDrops } from "./drops.ts";

const isEditable = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || target.matches("input, textarea, select, [role='textbox']"));

/**
 * Paste and drag and drop save straight into the library while it is showing,
 * and never open a page. Returns whether something is being dragged over the
 * window, for the drop hint.
 */
export function useCaptureEvents(libraryShown: boolean) {
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (!libraryShown || isEditable(event.target)) return;
      const files = [...(event.clipboardData?.files ?? [])];
      if (files.length > 0) {
        event.preventDefault();
        captureFiles(files);
        return;
      }
      const text = event.clipboardData?.getData("text/plain").trim();
      if (text) {
        event.preventDefault();
        void captureText(text, "clipboard");
      }
    };

    const stopDrops = watchDrops(window, libraryShown, setDragging, {
      files: captureFiles,
      text: (text) => void captureText(text, "drag and drop"),
    });
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("paste", onPaste);
      stopDrops();
    };
  }, [libraryShown]);

  // Main saves inkling:// and extension captures itself; failures come back here.
  useEffect(
    () =>
      desktop?.onCaptures((failures) => {
        const [first] = failures;
        if (first) reportCaptureError(`${first.message} (${first.url})`);
      }),
    [],
  );

  return dragging;
}
