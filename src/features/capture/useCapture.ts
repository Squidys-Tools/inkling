import {
  type Dispatch,
  type SetStateAction,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import type { AddMode } from "./AddMenu/AddMenu";
import { createFileImportQueue, type FileImportProgress } from "./fileImport";
import { parseDeepLinkCapture, validateDeepLinkCapture } from "../../lib/deepLink";
import { currentDeepLinks, listenForDeepLinks } from "../../lib/libraryApi";
import { shouldUseSeedLibrary } from "../../lib/previewMode";
import type { LibraryItem } from "../../lib/types";
import { errorMessage } from "../errorMessage";
import { capturePersistence, looksLikeUrl } from "./persistCapture";
import { grabScreenshot } from "./screenshot";

type CaptureOptions = {
  canUseDesktopBackend: boolean;
  setItems: Dispatch<SetStateAction<LibraryItem[]>>;
  setSelectedItem: Dispatch<SetStateAction<LibraryItem | null>>;
  setCaptureError: Dispatch<SetStateAction<string | null>>;
};

export function useCapture({
  canUseDesktopBackend,
  setItems,
  setSelectedItem,
  setCaptureError,
}: CaptureOptions) {
  const [isAdding, setIsAdding] = useState(false);
  const [captureMode, setCaptureMode] = useState<AddMode | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const { persistFile, persistArticle, persistText, persistQuote } = capturePersistence({
    canUseDesktopBackend,
    setItems,
    setSelectedItem,
  });

  async function runCapture(capture: () => Promise<unknown>, closeMenu: boolean) {
    setCaptureError(null);
    setIsCapturing(true);
    try {
      await capture();
      if (closeMenu) {
        setIsAdding(false);
        setCaptureMode(null);
      }
      return true;
    } catch (error) {
      setCaptureError(errorMessage(error));
      return false;
    } finally {
      setIsCapturing(false);
    }
  }

  const [fileImport, setFileImport] = useState<FileImportProgress | null>(null);
  const [fileQueue] = useState(() =>
    createFileImportQueue<File>(setFileImport, (file, error) => {
      setCaptureError(
        `Couldn’t import ${file.name}: ${errorMessage(error)}. Other files will continue.`,
      );
    }),
  );
  function captureFiles(files: readonly File[], captureSource: string) {
    if (!files.length) return;
    setCaptureError(null);
    setIsAdding(false);
    setCaptureMode(null);
    // Keep the persistence closure from this selection, including its destination.
    fileQueue.enqueue(files, (file) => persistFile(file, captureSource));
  }

  function captureText(text: string, captureSource: string) {
    return runCapture(() => persistText(text, captureSource), false);
  }

  async function captureScreenshot() {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setCaptureError(
        "Screen capture is unavailable. Take a screenshot with your system tool, then paste it here or add it with File.",
      );
      return;
    }

    setCaptureError(null);
    setIsCapturing(true);
    try {
      const file = await grabScreenshot();
      await persistFile(file, "screenshot");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setCaptureError(
        error instanceof DOMException
          ? "Screen capture was canceled or unavailable. You can paste a screenshot from your system tool, or add it with File."
          : errorMessage(error),
      );
    } finally {
      setIsCapturing(false);
    }
  }

  async function captureImageUrl(pageUrl: string, imageUrl: string, captureSource: string) {
    setCaptureError(null);
    setIsCapturing(true);
    try {
      const response = await fetch(imageUrl);
      if (!response.ok) throw new Error(`The image returned HTTP ${response.status}.`);
      const blob = await response.blob();
      const segment =
        imageUrl.split("?")[0].split("#")[0].split("/").filter(Boolean).pop() || "image";
      const file = new File([blob], segment.slice(0, 80), { type: blob.type || "image/png" });
      await persistFile(file, captureSource);
    } catch {
      // A direct download can fail on hotlink protection or CORS; the page
      // itself is still worth keeping.
      await persistArticle(pageUrl, captureSource);
    } finally {
      setIsCapturing(false);
    }
  }

  async function handleDeepLinkPayload(payload: unknown) {
    const values = Array.isArray(payload) ? payload : [payload];
    for (const value of values) {
      const capture =
        typeof value === "string" ? parseDeepLinkCapture(value) : validateDeepLinkCapture(value);
      if (!capture) continue;
      // Every path creates the provisional card immediately; extraction,
      // embeddings, and indexing run as background jobs from there.
      if (capture.kind === "quote") {
        await persistQuote(
          capture.selection,
          capture.attribution,
          capture.url,
          "browser extension",
        );
      } else if (capture.kind === "image") {
        await captureImageUrl(capture.pageUrl, capture.imageUrl, "browser extension");
      } else {
        await runCapture(
          () => persistArticle(capture.url, "browser extension", capture.title),
          false,
        );
      }
    }
  }

  const onPaste = useEffectEvent((event: ClipboardEvent) => {
    const target = event.target;
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      (target instanceof HTMLElement && target.isContentEditable)
    ) {
      return;
    }

    const files = Array.from(event.clipboardData?.files ?? []);
    if (files.length) {
      event.preventDefault();
      captureFiles(files, "clipboard");
      return;
    }

    const text = event.clipboardData?.getData("text/plain").trim();
    if (text) {
      event.preventDefault();
      void captureText(text, "clipboard");
    }
  });
  useEffect(() => {
    const listener = (event: ClipboardEvent) => onPaste(event);
    window.addEventListener("paste", listener);
    return () => window.removeEventListener("paste", listener);
  }, []);

  const onDeepLink = useEffectEvent(handleDeepLinkPayload);
  useEffect(() => {
    if (shouldUseSeedLibrary()) return;
    let cancelled = false;
    let removeListener: (() => void) | undefined;

    async function connectCaptureEvents() {
      const remove = await listenForDeepLinks((payload) => void onDeepLink(payload));
      if (cancelled) remove();
      else removeListener = remove;

      const links = await currentDeepLinks();
      if (!cancelled) {
        for (const link of links) await onDeepLink(link);
      }
    }

    void connectCaptureEvents().catch((error: unknown) => {
      if (!cancelled) setCaptureError(errorMessage(error));
    });
    return () => {
      cancelled = true;
      removeListener?.();
    };
  }, [setCaptureError]);

  // A second Enter can land before the saving state re-renders, so a ref
  // keeps one save at a time.
  const addMenuSavingRef = useRef(false);
  async function saveFromAddMenu(save: () => Promise<unknown>) {
    if (addMenuSavingRef.current) return false;
    addMenuSavingRef.current = true;
    try {
      return await runCapture(save, true);
    } finally {
      addMenuSavingRef.current = false;
    }
  }

  const saveNote = (text: string) => saveFromAddMenu(() => persistText(text, "quick note"));
  const saveLink = (url: string) => saveFromAddMenu(() => persistArticle(url, "quick link"));
  const saveQuote = (text: string, attribution: string, sourceUrl: string) =>
    saveFromAddMenu(() => persistQuote(text, attribution, sourceUrl, "quick quote"));

  function changeCaptureMode(mode: AddMode | null) {
    setCaptureMode(mode);
    setCaptureError(null);
  }

  function openCapture(mode: AddMode | null = null) {
    setCaptureError(null);
    setCaptureMode(mode);
    setIsAdding(true);
  }

  function closeCaptureModal() {
    if (isCapturing) return;
    setIsAdding(false);
    setCaptureMode(null);
  }

  function startScreenshotCapture() {
    setIsAdding(false);
    setCaptureMode(null);
    void captureScreenshot();
  }

  function handleDragOver(event: React.DragEvent<HTMLElement>) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setIsDragActive(true);
  }

  function handleDragLeave(event: React.DragEvent<HTMLElement>) {
    if (event.currentTarget === event.target) setIsDragActive(false);
  }

  function handleDrop(event: React.DragEvent<HTMLElement>) {
    event.preventDefault();
    setIsDragActive(false);
    const files = Array.from(event.dataTransfer.files);
    if (files.length) {
      captureFiles(files, "drag and drop");
      return;
    }

    const droppedText = (
      event.dataTransfer.getData("text/uri-list") || event.dataTransfer.getData("text/plain")
    )
      .split(/\r?\n/u)
      .map((value) => value.trim())
      .find(Boolean);
    if (!droppedText) return;
    if (looksLikeUrl(droppedText)) {
      void runCapture(() => persistArticle(droppedText, "drag and drop"), true);
    } else {
      void captureText(droppedText, "drag and drop");
    }
  }

  return {
    isAdding,
    captureMode,
    setCaptureMode,
    isCapturing: isCapturing || Boolean(fileImport?.active),
    fileImport,
    clearFileImport: () => setFileImport(null),
    isDragActive,
    openCapture,
    closeCaptureModal,
    changeCaptureMode,
    saveNote,
    saveLink,
    saveQuote,
    captureFiles,
    startScreenshotCapture,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  };
}
