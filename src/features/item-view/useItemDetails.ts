import {
  type Dispatch,
  type RefObject,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import {
  enqueueOcrJob,
  getItem,
  getItemContent,
  getProcessingSummaries,
  searchSimilarItems,
  showItemInFolder,
  type StoredLibraryItemDetail,
  updateItem,
} from "../../lib/libraryApi";
import { markdownToPlainText, NOTE_BODY_FORMAT, normalizeNoteBody } from "../../lib/notes";
import type { LibraryItem } from "../../lib/types";
import type { ReaderOrigin } from "../../ReaderView";
import {
  rememberNoteBody,
  storedItemToLibraryItem,
  withArticleContent,
} from "../library/libraryItem";
import { errorMessage } from "../errorMessage";

// The backend resolves false when the item has nothing on disk to point at.
export function showItemInFolderFromOverlay(item: LibraryItem) {
  void showItemInFolder(String(item.id))
    .then((shown) => {
      if (!shown) toast("Nothing is stored on disk for this item", { closeButton: true });
    })
    .catch((error: unknown) => {
      toast.error("Could not show the item in its folder", {
        description: errorMessage(error),
        closeButton: true,
      });
    });
}

export type ReadingItem = { item: LibraryItem; origin: ReaderOrigin };

type ItemDetailsOptions = {
  canUseDesktopBackend: boolean;
  selectedItem: LibraryItem | null;
  setSelectedItem: Dispatch<SetStateAction<LibraryItem | null>>;
  setItems: Dispatch<SetStateAction<LibraryItem[]>>;
  setArchivedItems: Dispatch<SetStateAction<LibraryItem[]>>;
  noteBodyCacheRef: RefObject<Map<string, string>>;
  setCaptureError: Dispatch<SetStateAction<string | null>>;
};

export function useItemDetails({
  canUseDesktopBackend,
  selectedItem,
  setSelectedItem,
  setItems,
  setArchivedItems,
  noteBodyCacheRef,
  setCaptureError,
}: ItemDetailsOptions) {
  const [pdfViewerItem, setPdfViewerItem] = useState<LibraryItem | null>(null);
  const [readingItem, setReadingItem] = useState<ReadingItem | null>(null);
  // Warm the PDF viewer chunk while a PDF's overlay is open, so the first
  // open fades together with the backdrop instead of popping in after it.
  // Same chunk the lazy viewer resolves; this only moves the fetch earlier.
  useEffect(() => {
    if (selectedItem?.kind === "PDF" && selectedItem.fileUrl) {
      void import("./PdfViewer");
    }
  }, [selectedItem]);
  const noteContentRequestsRef = useRef(new Set<string>());
  const processingSummaryRequestsRef = useRef(new Set<string>());
  const pendingOcrRequestsRef = useRef(new Set<string>());
  const itemDetailsRequestsRef = useRef(new Map<string, Promise<StoredLibraryItemDetail | null>>());
  const loadStoredItem = useCallback((id: string) => {
    const existing = itemDetailsRequestsRef.current.get(id);
    if (existing) return existing;
    const request = getItem(id).finally(() => itemDetailsRequestsRef.current.delete(id));
    itemDetailsRequestsRef.current.set(id, request);
    return request;
  }, []);
  const selectedItemId = selectedItem ? String(selectedItem.id) : null;
  const selectedItemKind = selectedItem?.kind;
  const selectedItemOcrText = selectedItem?.ocrText;
  const selectedItemProcessing = selectedItem?.processing;
  const readerRequestIdRef = useRef(0);
  const selectedItemIdRef = useRef(selectedItemId);
  useEffect(() => {
    if (selectedItemIdRef.current === selectedItemId) return;
    readerRequestIdRef.current += 1;
    selectedItemIdRef.current = selectedItemId;
  }, [selectedItemId]);
  useEffect(() => {
    if (!canUseDesktopBackend || !selectedItemId) return;
    const itemId = selectedItemId;
    if (!selectedItemProcessing) {
      if (processingSummaryRequestsRef.current.has(itemId)) return;
      processingSummaryRequestsRef.current.add(itemId);
      void getProcessingSummaries([itemId])
        .then((summaries) => {
          const processing = summaries.get(itemId);
          if (!processing) return;
          setSelectedItem((current) =>
            current && String(current.id) === itemId ? { ...current, processing } : current,
          );
        })
        .catch(() => {})
        .finally(() => processingSummaryRequestsRef.current.delete(itemId));
      return;
    }
    if (selectedItemProcessing.hasOcrJob) {
      pendingOcrRequestsRef.current.delete(itemId);
      return;
    }
    if (
      (selectedItemKind !== "Image" && selectedItemKind !== "PDF") ||
      selectedItemOcrText?.trim() ||
      pendingOcrRequestsRef.current.has(itemId)
    )
      return;
    pendingOcrRequestsRef.current.add(itemId);
    void enqueueOcrJob(itemId).catch(() => {
      pendingOcrRequestsRef.current.delete(itemId);
    });
  }, [
    canUseDesktopBackend,
    selectedItemId,
    selectedItemKind,
    selectedItemOcrText,
    selectedItemProcessing,
    setSelectedItem,
  ]);
  useEffect(() => {
    if (
      !canUseDesktopBackend ||
      selectedItem?.kind !== "Note" ||
      selectedItem.noteBody !== undefined
    )
      return;
    const id = String(selectedItem.id);
    if (noteContentRequestsRef.current.has(id)) return;
    noteContentRequestsRef.current.add(id);
    let cancelled = false;
    void getItemContent(id)
      .then((content) => {
        if (cancelled) return;
        const noteBody = normalizeNoteBody(content.body);
        rememberNoteBody(noteBodyCacheRef.current, id, noteBody);
        // The body is the only thing still missing here. Its description came
        // back already projected, so the fetched content only fills the gap.
        const apply = (item: LibraryItem) =>
          String(item.id) === id ? { ...item, noteBody } : item;
        setItems((current) => current.map(apply));
        setArchivedItems((current) => current.map(apply));
        setSelectedItem((current) => (current ? apply(current) : current));
      })
      .catch((error: unknown) => {
        if (!cancelled) setCaptureError(errorMessage(error));
      })
      .finally(() => {
        noteContentRequestsRef.current.delete(id);
      });
    return () => {
      cancelled = true;
    };
  }, [
    canUseDesktopBackend,
    selectedItem?.id,
    selectedItem?.kind,
    selectedItem?.noteBody,
    setSelectedItem,
    noteBodyCacheRef,
    setItems,
    setArchivedItems,
    setCaptureError,
  ]);
  const similarItemCacheRef = useRef(new Map<string, LibraryItem>());

  const addTagToItem = useCallback(
    async (item: LibraryItem, tag: string) => {
      const clean = tag.trim().replace(/^#+/u, "").trim().toLowerCase();
      if (!clean) return;
      try {
        let tags = canUseDesktopBackend ? [] : [...item.tags, clean];
        if (canUseDesktopBackend) {
          const storedItem = await updateItem({ id: String(item.id), addTag: clean });
          tags = Array.isArray(storedItem.metadata.tags)
            ? storedItem.metadata.tags.filter((value): value is string => typeof value === "string")
            : [];
        }
        const apply = (current: LibraryItem) => ({
          ...current,
          tags,
        });
        setItems((current) =>
          current.map((currentItem) =>
            String(currentItem.id) === String(item.id) ? apply(currentItem) : currentItem,
          ),
        );
        setSelectedItem((current) =>
          current && String(current.id) === String(item.id) ? apply(current) : current,
        );
      } catch {
        toast.error("Unable to save this tag", { duration: 5000 });
      }
    },
    [canUseDesktopBackend, setSelectedItem, setItems],
  );

  const updateNote = useCallback(
    async (item: LibraryItem, body: string) => {
      const nextBody = normalizeNoteBody(body);
      if (!nextBody) throw new Error("A note needs some text before it can be saved.");

      let nextItem: LibraryItem;
      if (canUseDesktopBackend) {
        const storedItem = await updateItem({
          id: String(item.id),
          body: nextBody,
          bodyFormat: NOTE_BODY_FORMAT,
        });
        const summary = (await getProcessingSummaries([storedItem.id])).get(storedItem.id);
        nextItem = {
          ...(await storedItemToLibraryItem(storedItem, summary)),
          noteBody: nextBody,
        };
      } else {
        nextItem = {
          ...item,
          description: markdownToPlainText(nextBody),
          noteBody: nextBody,
        };
      }

      const apply = (current: LibraryItem) =>
        String(current.id) === String(item.id)
          ? { ...current, ...nextItem, id: current.id }
          : current;
      setItems((current) => current.map(apply));
      setArchivedItems((current) => current.map(apply));
      setSelectedItem((current) => (current ? apply(current) : current));
      rememberNoteBody(noteBodyCacheRef.current, String(item.id), nextBody);
    },
    [canUseDesktopBackend, setArchivedItems, setSelectedItem, setItems, noteBodyCacheRef],
  );

  const openReader = useCallback(
    async (
      item: LibraryItem,
      origin: ReaderOrigin = { x: window.innerWidth / 2, y: window.innerHeight / 2 },
    ) => {
      const requestId = ++readerRequestIdRef.current;
      try {
        let readerItem = item;
        if (canUseDesktopBackend) {
          if (!readerItem.articleHtml && !readerItem.hasArticleContent) return;
          const storedItem = await loadStoredItem(String(item.id));
          if (requestId !== readerRequestIdRef.current || !storedItem) return;
          readerItem = withArticleContent(item, storedItem);
        } else if (!readerItem.articleHtml) {
          return;
        }
        if (requestId !== readerRequestIdRef.current || !readerItem.articleHtml) return;
        setReadingItem({ item: readerItem, origin });
      } catch (error) {
        if (requestId === readerRequestIdRef.current) {
          toast.error("Unable to open reader", {
            description: errorMessage(error),
          });
        }
      }
    },
    [canUseDesktopBackend, loadStoredItem],
  );
  const closeReader = useCallback(() => {
    readerRequestIdRef.current += 1;
    setReadingItem(null);
  }, []);

  const loadSimilarLibraryItems = useCallback(
    async (item: LibraryItem): Promise<LibraryItem[]> => {
      if (!canUseDesktopBackend) return [];
      const storedItems = await searchSimilarItems(
        String(item.id),
        item.kind === "Image" ? "image" : "text",
      );
      const summaries = await getProcessingSummaries(
        storedItems.map((storedItem) => storedItem.id),
      );
      const libraryItems = await Promise.all(
        storedItems.map((storedItem) =>
          storedItemToLibraryItem(storedItem, summaries.get(storedItem.id)),
        ),
      );
      for (const libraryItem of libraryItems) {
        similarItemCacheRef.current.set(String(libraryItem.id), libraryItem);
      }
      return libraryItems;
    },
    [canUseDesktopBackend],
  );

  return {
    pdfViewerItem,
    setPdfViewerItem,
    readingItem,
    openReader,
    closeReader,
    addTagToItem,
    updateNote,
    loadSimilarLibraryItems,
    similarItemCacheRef,
  };
}
