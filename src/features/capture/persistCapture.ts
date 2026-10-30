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
  const prepend = (item: LibraryItem) => setItems((current) => [item, ...current]);

  async function persistFile(file: File, captureSource: string) {
    if (file.size > 50 * 1024 * 1024) throw new Error("File exceeds the 50 MB input limit");
    const kind = classifyFile(file);
    prepend(
      canUseDesktopBackend
        ? await storedItemToLibraryItem(
            await saveFile({
              fileName: file.name,
              mimeType: file.type,
              kind,
              bytes: new Uint8Array(await file.arrayBuffer()),
            }),
          )
        : await previewFileItem(file, kind, captureSource),
    );
  }

  async function persistArticle(sourceUrl: string, captureSource: string, extensionTitle?: string) {
    const parsedUrl = parseHttpUrl(sourceUrl);
    const normalizedUrl = parsedUrl.toString();
    const preservedTitle = extensionTitle?.trim();
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

    const fallbackItem = previewArticleItem(parsedUrl, preservedTitle || parsedUrl.hostname);
    prepend(fallbackItem);
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

    prepend(
      canUseDesktopBackend
        ? await storedItemToLibraryItem(
            await createNote({ body: value, metadata: { captureSource } }),
          )
        : previewNoteItem(value, captureSource),
    );
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

    prepend(
      canUseDesktopBackend
        ? await storedItemToLibraryItem(
            await createQuote({
              body,
              attribution: trimmedAttribution || undefined,
              sourceUrl: trimmedSource || undefined,
              metadata: { captureSource },
            }),
          )
        : previewQuoteItem(body, trimmedAttribution, trimmedSource),
    );
  }

  return { persistFile, persistArticle, persistText, persistQuote };
}
