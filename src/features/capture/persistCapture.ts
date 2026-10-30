import type { Dispatch, SetStateAction } from "react";
import { classifyFile } from "../../lib/ingestion/file-classification";
import { parseHttpUrl } from "../../lib/ingestion/url";
import { captureUrlItem, createNote, createQuote, saveFile } from "../../lib/libraryApi";
import type { LibraryItem } from "../../lib/types";
import { storedItemToLibraryItem } from "../library/libraryItem";
import {
  previewArticleEnrichment,
  previewArticleItem,
  previewFileItem,
  previewNoteItem,
  previewQuoteItem,
} from "./previewItems";

const BARE_DOMAIN =
  /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}(?::\d+)?(?:\/[^\s]*)?$/u;

export function looksLikeUrl(value: string) {
  return /^https?:\/\//iu.test(value) || BARE_DOMAIN.test(value);
}

export function capturePersistence({
  canUseDesktopBackend,
  setItems,
  setSelectedItem,
}: {
  canUseDesktopBackend: boolean;
  setItems: Dispatch<SetStateAction<LibraryItem[]>>;
  setSelectedItem: Dispatch<SetStateAction<LibraryItem | null>>;
}) {
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

  return { persistFile, persistArticle, persistText, persistQuote };
}
