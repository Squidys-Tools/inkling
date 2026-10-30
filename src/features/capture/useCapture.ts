import { type Dispatch, type SetStateAction, useEffect, useRef, useState } from "react";
import type { AddMode } from "./AddMenu/AddMenu";
import { createFileImportQueue, type FileImportProgress } from "./fileImport";
import { parseDeepLinkCapture, validateDeepLinkCapture } from "../../lib/deepLink";
import { classifyFile } from "../../lib/ingestion/file-classification";
import { parseHttpUrl } from "../../lib/ingestion/url";
import { videoLinkFromSourceUrl } from "../../lib/ingestion/video-links";
import {
  captureUrlItem,
  createNote,
  createQuote,
  currentDeepLinks,
  listenForDeepLinks,
  saveFile,
} from "../../lib/libraryApi";
import { markdownToPlainText, normalizeNoteBody } from "../../lib/notes";
import { shouldUseSeedLibrary } from "../../lib/previewMode";
import type { LibraryItem } from "../../lib/types";
import {
  postFallbackFromMetadata,
  readImageDimensions,
  storedItemToLibraryItem,
} from "../library/libraryItem";
import { errorMessage } from "../errorMessage";

type CaptureOptions = {
  canUseDesktopBackend: boolean;
  setItems: Dispatch<SetStateAction<LibraryItem[]>>;
  setSelectedItem: Dispatch<SetStateAction<LibraryItem | null>>;
  setCaptureError: Dispatch<SetStateAction<string | null>>;
  setIsSidebarOpen: Dispatch<SetStateAction<boolean>>;
};

export function useCapture({
  canUseDesktopBackend,
  setItems,
  setSelectedItem,
  setCaptureError,
  setIsSidebarOpen,
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

    const image = kind === "image" ? URL.createObjectURL(file) : undefined;
    const mediaDimensions = image ? await readImageDimensions(image) : undefined;

    const item: LibraryItem = {
      id: crypto.randomUUID(),
      kind:
        kind === "image" ? "Image" : kind === "pdf" ? "PDF" : kind === "video" ? "Video" : "File",
      title: file.name,
      description: `Saved from ${captureSource}.`,
      source: captureSource,
      date: "Just now",
      tags: [],
      image,
      fileUrl: kind === "video" ? URL.createObjectURL(file) : undefined,
      mediaWidth: mediaDimensions?.width,
      mediaHeight: mediaDimensions?.height,
    };
    setItems((current) => [item, ...current]);
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

    const fallbackItem: LibraryItem = {
      id: Date.now(),
      kind: "Article",
      title: fallbackTitle,
      description: "",
      source: parsedUrl.hostname,
      sourceUrl: normalizedUrl,
      date: "Just now",
      tags: [],
    };
    setItems((current) => [fallbackItem, ...current]);
    void import("../../lib/ingestion")
      .then(({ ingestUrl }) => ingestUrl(normalizedUrl))
      .then((article) => {
        const social = article.social;
        const embeddedVideoLink = social ? null : videoLinkFromSourceUrl(article.canonicalUrl);
        const firstImageDimensions = article.imageDimensions.find(
          (value) => value.url === article.imageUrls[0],
        );
        const enrichedItem: LibraryItem = {
          ...fallbackItem,
          kind: social ? "Post" : embeddedVideoLink ? "Video" : "Article",
          title: article.title || fallbackTitle,
          description: article.description || article.text.slice(0, 180),
          source: social
            ? `X${social.authorHandle ? ` · @${social.authorHandle.replace(/^@/u, "")}` : ""}`
            : new URL(article.canonicalUrl).hostname,
          sourceUrl: article.canonicalUrl,
          author: article.author,
          image: article.imageUrls[0],
          mediaWidth: firstImageDimensions?.width,
          mediaHeight: firstImageDimensions?.height,
          mediaAspectRatio: firstImageDimensions
            ? firstImageDimensions.width / firstImageDimensions.height
            : undefined,
          articleAuthor: article.author || undefined,
          publishedDate: article.publishedDate ?? undefined,
          articleHtml: article.html || undefined,
          hasArticleContent: Boolean(article.html.trim()),
          social,
          post: social ? postFallbackFromMetadata(social) : undefined,
          video: embeddedVideoLink ?? undefined,
        };
        const applyEnrichment = (item: LibraryItem) =>
          String(item.id) === String(fallbackItem.id)
            ? {
                ...enrichedItem,
                title:
                  preservedTitle || item.title !== fallbackTitle
                    ? item.title
                    : article.title || item.title,
              }
            : item;
        setItems((current) => current.map(applyEnrichment));
        setSelectedItem((current) => (current ? applyEnrichment(current) : current));
      })
      .catch(() => {});
  }

  async function captureArticle(sourceUrl: string, captureSource: string, extensionTitle?: string) {
    setCaptureError(null);
    setIsCapturing(true);
    try {
      await persistArticle(sourceUrl, captureSource, extensionTitle);
      setIsAdding(false);
      setCaptureMode(null);
    } catch (error) {
      setCaptureError(errorMessage(error));
    } finally {
      setIsCapturing(false);
    }
  }

  async function captureDeepLinkUrl(sourceUrl: string, title: string | undefined) {
    setCaptureError(null);
    setIsCapturing(true);
    try {
      await persistArticle(sourceUrl, "browser extension", title);
    } catch (error) {
      setCaptureError(errorMessage(error));
    } finally {
      setIsCapturing(false);
    }
  }

  async function captureText(text: string, captureSource: string) {
    setCaptureError(null);
    setIsCapturing(true);
    try {
      await persistText(text, captureSource);
    } catch (error) {
      setCaptureError(errorMessage(error));
    } finally {
      setIsCapturing(false);
    }
  }

  async function persistText(text: string, captureSource: string) {
    const value = text.trim();
    if (!value) return;
    if (
      /^https?:\/\//iu.test(value) ||
      /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}(?::\d+)?(?:\/[^\s]*)?$/u.test(
        value,
      )
    ) {
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

    const item: LibraryItem = {
      id: Date.now(),
      kind: "Note",
      title: value,
      description: markdownToPlainText(value),
      noteBody: normalizeNoteBody(value),
      source: captureSource,
      date: "Just now",
      tags: [],
      accent: "bg-blue-soft",
    };
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

    let sourceLabel = "Quote";
    if (trimmedSource) {
      try {
        sourceLabel = new URL(trimmedSource).hostname.replace(/^www\./u, "");
      } catch {
        sourceLabel = trimmedSource;
      }
    } else if (trimmedAttribution) {
      sourceLabel = trimmedAttribution.split(",")[0]?.trim() || "Quote";
    }

    const item: LibraryItem = {
      id: Date.now(),
      kind: "Quote",
      title: body,
      description: trimmedAttribution,
      source: sourceLabel,
      date: "Just now",
      tags: [],
      accent: "bg-yellow-soft",
      sourceUrl: trimmedSource || undefined,
    };
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
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const video = document.createElement("video");
      video.srcObject = stream;
      await video.play();
      const width = video.videoWidth;
      const height = video.videoHeight;
      if (width === 0 || height === 0)
        throw new Error("The selected display has no capturable frame.");
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d")?.drawImage(video, 0, 0, width, height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("The screenshot could not be encoded.");
      const file = new File([blob], `screenshot-${Date.now()}.png`, { type: "image/png" });
      await persistFile(file, "screenshot");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setCaptureError(
        error instanceof DOMException
          ? "Screen capture was canceled or unavailable. You can paste a screenshot from your system tool, or add it with File."
          : errorMessage(error),
      );
    } finally {
      stream?.getTracks().forEach((track) => {
        track.stop();
      });
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
        await captureDeepLinkUrl(capture.url, capture.title);
      }
    }
  }

  const captureFilesRef = useRef(captureFiles);
  const captureTextRef = useRef(captureText);
  captureFilesRef.current = captureFiles;
  captureTextRef.current = captureText;

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
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
        captureFilesRef.current(files, "clipboard");
        return;
      }

      const text = event.clipboardData?.getData("text/plain").trim();
      if (text) {
        event.preventDefault();
        void captureTextRef.current(text, "clipboard");
      }
    };

    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  const handleDeepLinkPayloadRef = useRef(handleDeepLinkPayload);
  handleDeepLinkPayloadRef.current = handleDeepLinkPayload;
  useEffect(() => {
    if (shouldUseSeedLibrary()) return;
    let cancelled = false;
    const unlisten: Array<() => void> = [];

    async function connectCaptureEvents() {
      const removeListener = await listenForDeepLinks((payload) => {
        void handleDeepLinkPayloadRef.current(payload);
      });
      if (cancelled) {
        removeListener();
      } else {
        unlisten.push(removeListener);
      }

      const links = await currentDeepLinks();
      if (!cancelled) {
        for (const link of links ?? []) await handleDeepLinkPayloadRef.current(link);
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
    setCaptureError(null);
    setIsCapturing(true);
    try {
      await save();
      setIsAdding(false);
      setCaptureMode(null);
      return true;
    } catch (error) {
      setCaptureError(errorMessage(error));
      return false;
    } finally {
      addMenuSavingRef.current = false;
      setIsCapturing(false);
    }
  }

  // Shortcuts/Classic reveal the sidebar; the compact Codex trigger stays put.
  function openCapture(mode: AddMode | null = null, revealSidebar = true) {
    setCaptureError(null);
    setCaptureMode(mode);
    setIsAdding(true);
    if (revealSidebar) setIsSidebarOpen(true);
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
    if (
      /^https?:\/\//iu.test(droppedText) ||
      /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}(?::\d+)?(?:\/[^\s]*)?$/u.test(
        droppedText,
      )
    ) {
      void captureArticle(droppedText, "drag and drop");
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
    saveFromAddMenu,
    persistText,
    persistArticle,
    persistQuote,
    captureFiles,
    startScreenshotCapture,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  };
}
