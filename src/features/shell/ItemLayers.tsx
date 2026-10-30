import { AnimatePresence, motion } from "motion/react";
import { lazy, type RefObject, Suspense, useMemo } from "react";
import type { ItemViewActions } from "../item-view/ItemView";
import { revealItemInFolder, type useItemDetails } from "../item-view/useItemDetails";
import type { useItemSelection } from "../item-view/useItemSelection";
import type { useArchive } from "../settings/useArchive";
import type { useSpaces } from "../spaces/useSpaces";
import type { LibraryItem } from "../../lib/types";

// These load on first open, off the boot bundle. The chunks come from local
// disk, so a null fallback shows nothing and shifts nothing.
const ItemView = lazy(() =>
  import("../item-view/ItemView").then((module) => ({ default: module.ItemView })),
);
const PdfViewer = lazy(() => import("../item-view/PdfViewer"));
const ReaderView = lazy(() =>
  import("../reader/ReaderView").then((module) => ({ default: module.ReaderView })),
);

export function ItemLayers({
  item,
  details,
  archive,
  selection,
  spaces,
  canUseDesktopBackend,
  onClose,
  onRetryJob,
  frameRef,
  historyCloseRequest,
}: {
  item: LibraryItem | null;
  details: ReturnType<typeof useItemDetails>;
  archive: ReturnType<typeof useArchive>;
  selection: ReturnType<typeof useItemSelection>;
  spaces: ReturnType<typeof useSpaces>;
  canUseDesktopBackend: boolean;
  onClose: () => void;
  onRetryJob: (jobId: string) => void | Promise<void>;
  frameRef: RefObject<HTMLElement | null>;
  historyCloseRequest: number;
}) {
  const {
    pdfViewerItem,
    setPdfViewerItem,
    readingItem,
    closeReader,
    openReader,
    loadSimilarLibraryItems,
    addTagToItem,
    updateNote,
  } = details;
  const { deleteArchivedLibraryItem, forgetItem } = archive;
  const { openSimilarItem } = selection;
  const toggleItemInSpace = spaces.handleToggleItemInSpace;
  const actions = useMemo<ItemViewActions>(
    () => ({
      onClose,
      onOpenPdf: setPdfViewerItem,
      onOpenReader: openReader,
      onLoadSimilar: loadSimilarLibraryItems,
      onOpenItem: openSimilarItem,
      onShowInFolder: canUseDesktopBackend ? revealItemInFolder : undefined,
      onDelete: deleteArchivedLibraryItem,
      onForget: forgetItem,
      onRetryJob,
      onAddTag: addTagToItem,
      onUpdateNote: updateNote,
      onToggleSpace: toggleItemInSpace,
    }),
    [
      addTagToItem,
      canUseDesktopBackend,
      deleteArchivedLibraryItem,
      forgetItem,
      loadSimilarLibraryItems,
      onClose,
      onRetryJob,
      openReader,
      openSimilarItem,
      setPdfViewerItem,
      toggleItemInSpace,
      updateNote,
    ],
  );
  return (
    <>
      {item && (
        <Suspense fallback={null}>
          <ItemView
            item={item}
            actions={actions}
            spaces={spaces.selectedItemSpaces}
            originRectsRef={selection.selectionRectsRef}
            frameRef={frameRef}
            historyCloseRequest={historyCloseRequest}
          />
        </Suspense>
      )}
      <AnimatePresence>
        {pdfViewerItem?.fileUrl && (
          <motion.div
            key="pdf-viewer"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
          >
            <Suspense fallback={null}>
              <PdfViewer
                url={pdfViewerItem.fileUrl}
                title={pdfViewerItem.title}
                onClose={() => setPdfViewerItem(null)}
              />
            </Suspense>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {readingItem && (
          <Suspense key={readingItem.item.id} fallback={null}>
            <ReaderView
              item={readingItem.item}
              origin={readingItem.origin}
              onRequestClose={closeReader}
            />
          </Suspense>
        )}
      </AnimatePresence>
    </>
  );
}
