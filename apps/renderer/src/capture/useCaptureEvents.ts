import { useEffect, useState } from "react";
import { desktop } from "../desktop.ts";
import { captureFiles, captureText, reportCaptureError } from "./capture.ts";

const isEditable = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || target.matches("input, textarea, select, [role='textbox']"));

const carriesFiles = (event: DragEvent) => event.dataTransfer?.types.includes("Files") ?? false;

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

    // Dropping a file anywhere must never navigate the window to it, so every
    // drag is taken here, and only the library accepts what is dropped.
    let depth = 0;
    const onDragEnter = (event: DragEvent) => {
      event.preventDefault();
      depth += 1;
      if (
        libraryShown &&
        (carriesFiles(event) || event.dataTransfer?.types.includes("text/uri-list"))
      )
        setDragging(true);
    };
    const onDragOver = (event: DragEvent) => {
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = libraryShown ? "copy" : "none";
    };
    const onDragLeave = () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const onDrop = (event: DragEvent) => {
      event.preventDefault();
      depth = 0;
      setDragging(false);
      if (!libraryShown || !event.dataTransfer) return;
      const files = [...event.dataTransfer.files];
      if (files.length > 0) {
        captureFiles(files);
        return;
      }
      const dropped = (
        event.dataTransfer.getData("text/uri-list") || event.dataTransfer.getData("text/plain")
      )
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .find((line) => line && !line.startsWith("#"));
      if (dropped) void captureText(dropped, "drag and drop");
    };

    window.addEventListener("paste", onPaste);
    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("paste", onPaste);
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
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
