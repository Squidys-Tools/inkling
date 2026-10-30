import { AnimatePresence, motion } from "motion/react";
import { type ComponentProps, lazy, Suspense } from "react";
import type { ItemView as ItemViewComponent } from "../item-view/ItemView";
import type { ReadingItem } from "../item-view/useItemDetails";
import type { LibraryItem } from "../../lib/types";

// These load on first open, off the boot bundle. The chunks come from local
// disk, so a null fallback shows nothing and shifts nothing.
const ItemView = lazy(() =>
  import("../item-view/ItemView").then((module) => ({ default: module.ItemView })),
);
const PdfViewer = lazy(() => import("../item-view/PdfViewer"));
const ReaderView = lazy(() =>
  import("../../ReaderView").then((module) => ({ default: module.ReaderView })),
);

export function ItemLayers({
  item,
  itemView,
  pdfViewerItem,
  onClosePdf,
  readingItem,
  onCloseReader,
}: {
  item: LibraryItem | null;
  itemView: Omit<ComponentProps<typeof ItemViewComponent>, "item">;
  pdfViewerItem: LibraryItem | null;
  onClosePdf: () => void;
  readingItem: ReadingItem | null;
  onCloseReader: () => void;
}) {
  return (
    <>
      {item && (
        <Suspense fallback={null}>
          <ItemView item={item} {...itemView} />
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
                onClose={onClosePdf}
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
              onRequestClose={onCloseReader}
            />
          </Suspense>
        )}
      </AnimatePresence>
    </>
  );
}
