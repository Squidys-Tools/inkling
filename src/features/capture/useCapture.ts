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
import { classifyFile } from "../../lib/ingestion/file-classification";
import { parseHttpUrl } from "../../lib/ingestion/url";
import {
  captureUrlItem,
  createNote,
  createQuote,
  currentDeepLinks,
  listenForDeepLinks,
  saveFile,
} from "../../lib/libraryApi";
import { shouldUseSeedLibrary } from "../../lib/previewMode";
import type { LibraryItem } from "../../lib/types";
import { storedItemToLibraryItem } from "../library/libraryItem";
import { errorMessage } from "../errorMessage";
import {
  previewArticleEnrichment,
  previewArticleItem,
  previewFileItem,
  previewNoteItem,
  previewQuoteItem,
} from "./previewItems";
import { grabScreenshot } from "./screenshot";

const BARE_DOMAIN =
  /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}(?::\d+)?(?:\/[^\s]*)?$/u;

function looksLikeUrl(value: string) {
  return /^https?:\/\//iu.test(value) || BARE_DOMAIN.test(value);
}

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

  async function persistFile(file: File, captureSource: string) {
    if (file.size > 50 * 1024 * 1024) throw new Error("File exceeds the 50 MB input limit");
    const kind = classifyFile(file);
    if (canUseDesktopBackend) {
      const storedItem = await saveFile({
        fileName: file.name,
        mimeType: file.type,
        kind,
        bytes: new Uint8Array(await file.arrayBuffer()),
      });
      const libraryItem = await storedItemToLibraryItem(storedItem);
      setItems((current) => [libraryItem, ...current]);
      return;
    }

    const item = await previewFileItem(file, kind, captureSource);
    setItems((current) => [item, ...current]);
  }

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

  async function persistArticle(sourceUrl: string, captureSource: string, extensionTitle?: string) {
    const parsedUrl = parseHttpUrl(sourceUrl);
    const normalizedUrl = parsedUrl.toString();
    const preservedTitle = extensionTitle?.trim();
    const fallbackTitle = preservedTitle || parsedUrl.hostname;
    if (canUseDesktopBackend) {
      const storedItem = await captureUrlItem({
        sourceUrl: normalizedUrl,
        captureSource,
        ...(preservedTitle ? { title: preservedTitle } : {}),
      });
      const libraryItem = await storedItemToLibraryItem(storedItem);
      setItems((current) =>
        current.some((item) => String(item.id) === String(libraryItem.id))
          ? current.map((item) => (String(item.id) === String(libraryItem.id) ? libraryItem : item))
          : [libraryItem, ...current],
      );
      return;
    }

    const fallbackItem = previewArticleItem(parsedUrl, fallbackTitle);
    setItems((current) => [fallbackItem, ...current]);
    void previewArticleEnrichment(normalizedUrl, fallbackItem, preservedTitle)
      .then((applyEnrichment) => {
        setItems((current) => current.map(applyEnrichment));
        setSelectedItem((current) => (current ? applyEnrichment(current) : current));
      })
      .catch(() => {});
  }

  function captureText(text: string, captureSource: string) {
    return runCapture(() => persistText(text, captureSource), false);
  }

  async function persistText(text: string, captureSource: string) {
    const value = text.trim();
    if (!value) return;
    if (looksLikeUrl(value)) {
      await persistArticle(value, captureSource);
      return;
    }

    if (canUseDesktopBackend) {
      const storedItem = await createNote({
        body: value,
        metadata: { captureSource },
      });
      const libraryItem = await storedItemToLibraryItem(storedItem);
      setItems((current) => [libraryItem, ...current]);
      return;
    }

    const item = previewNoteItem(value, captureSource);
    setItems((current) => [item, ...current]);
  }

  async function persistQuote(
    quoteText: string,
    attribution: string,
    sourceUrl: string,
    captureSource: string,
  ) {
    const body = quoteText.trim();
    if (!body) throw new Error("Quote text cannot be empty.");
    const trimmedAttribution = attribution.trim();
    const rawSource = sourceUrl.trim();
    const trimmedSource =
      rawSource &&
      !/^[a-zA-Z][a-zA-Z0-9+.-]*:/u.test(rawSource) &&
      rawSource.includes(".") &&
      !rawSource.includes(" ")
        ? `https://${rawSource}`
        : rawSource;

    if (canUseDesktopBackend) {
      const storedItem = await createQuote({
        body,
        attribution: trimmedAttribution || undefined,
        sourceUrl: trimmedSource || undefined,
        metadata: { captureSource },
      });
      const libraryItem = await storedItemToLibraryItem(storedItem);
      setItems((current) => [libraryItem, ...current]);
      return;
    }

    const item = previewQuoteItem(body, trimmedAttribution, trimmedSource);
    setItems((current) => [item, ...current]);
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
    const unlisten: Array<() => void> = [];

    async function connectCaptureEvents() {
      const removeListener = await listenForDeepLinks((payload) => {
        void onDeepLink(payload);
      });
      if (cancelled) {
        removeListener();
      } else {
        unlisten.push(removeListener);
      }

      const links = await currentDeepLinks();
      if (!cancelled) {
        for (const link of links ?? []) await onDeepLink(link);
      }
    }

    void connectCaptureEvents().catch((error: unknown) => {
      if (!cancelled) setCaptureError(errorMessage(error));
    });
    return () => {
      cancelled = true;
      unlisten.forEach((removeListener) => {
        removeListener();
      });
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
