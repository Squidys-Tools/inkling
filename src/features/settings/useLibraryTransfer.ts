import { type Dispatch, type SetStateAction, useCallback, useState } from "react";
import { toast } from "sonner";
import {
  exportLibrary,
  getLastExport,
  importLibrary,
  type LastExport,
  type LibraryExportReport,
  type LibraryImportReport,
  listArchivedItems,
  listSpaces,
  selectLibraryDirectory,
  showLibraryFolder,
  type StoredSpace,
} from "../../lib/libraryApi";
import type { LibraryItem } from "../../lib/types";
import { storedItemToLibraryItem } from "../library/libraryItem";
import { formatExportSummary, formatImportSummary } from "./format";
import { errorMessage } from "../errorMessage";

export function showLibraryFolderFromSettings() {
  void showLibraryFolder().catch((error: unknown) => {
    toast.error("Could not open the library folder", {
      description: errorMessage(error),
      closeButton: true,
    });
  });
}

type LibraryTransferOptions = {
  canUseDesktopBackend: boolean;
  setLastCopy: Dispatch<SetStateAction<LastExport | null>>;
  setSpaces: Dispatch<SetStateAction<StoredSpace[]>>;
  setArchivedItems: Dispatch<SetStateAction<LibraryItem[]>>;
  setIsArchiveLoaded: Dispatch<SetStateAction<boolean>>;
  reload: () => void;
  setCaptureError: Dispatch<SetStateAction<string | null>>;
};

export function useLibraryTransfer({
  canUseDesktopBackend,
  setLastCopy,
  setSpaces,
  setArchivedItems,
  setIsArchiveLoaded,
  reload,
  setCaptureError,
}: LibraryTransferOptions) {
  const [isExportingLibrary, setIsExportingLibrary] = useState(false);
  const [lastExport, setLastExport] = useState<LibraryExportReport | null>(null);
  const [isImportingLibrary, setIsImportingLibrary] = useState(false);
  const [lastImport, setLastImport] = useState<LibraryImportReport | null>(null);

  const exportLibraryToFolder = useCallback(async () => {
    if (!canUseDesktopBackend || isExportingLibrary || isImportingLibrary) return;
    let destination: string | null = null;
    try {
      destination = await selectLibraryDirectory("Choose where to save the export");
    } catch (error) {
      toast.error("Could not open the folder picker", {
        description: errorMessage(error),
        closeButton: true,
      });
      return;
    }
    if (!destination) return;

    setIsExportingLibrary(true);
    const toastId = toast.loading("Exporting library…", {
      description: "Copying the database and its files",
    });
    try {
      const report = await exportLibrary(destination);
      setLastExport(report);
      // The backend stamps the copy; read it back rather than guessing the time here.
      void getLastExport()
        .then((copy) => setLastCopy(copy ?? null))
        .catch(() => undefined);
      toast.success(
        report.skippedAssets > 0 ? "Library exported with skipped assets" : "Library exported",
        {
          id: toastId,
          description: formatExportSummary(report),
          duration: 4000,
          closeButton: true,
        },
      );
    } catch (error) {
      toast.error("Export failed", {
        id: toastId,
        description: errorMessage(error),
        duration: Infinity,
        closeButton: true,
      });
    } finally {
      setIsExportingLibrary(false);
    }
  }, [canUseDesktopBackend, isExportingLibrary, isImportingLibrary, setLastCopy]);

  const importLibraryFromFolder = useCallback(async () => {
    if (!canUseDesktopBackend || isExportingLibrary || isImportingLibrary) return;
    let exportDirectory: string | null = null;
    try {
      exportDirectory = await selectLibraryDirectory("Choose an Inkling export to restore");
    } catch (error) {
      toast.error("Could not open the export picker", {
        description: errorMessage(error),
        closeButton: true,
      });
      return;
    }
    if (!exportDirectory) return;

    setIsImportingLibrary(true);
    const toastId = toast.loading("Restoring library…", {
      description: "Checking the export and copying its files",
    });
    try {
      const report = await importLibrary(exportDirectory);
      setLastImport(report);
      toast.success("Library restored", {
        id: toastId,
        description: `${formatImportSummary(report)}. Search indexing will continue in the background.`,
        duration: 5000,
        closeButton: true,
      });
      try {
        setSpaces(await listSpaces());
        const storedItems = await listArchivedItems();
        setArchivedItems(
          await Promise.all(storedItems.map((item) => storedItemToLibraryItem(item))),
        );
        setIsArchiveLoaded(true);
        reload();
      } catch (error) {
        setCaptureError(errorMessage(error));
      }
    } catch (error) {
      toast.error("Import failed", {
        id: toastId,
        description: errorMessage(error),
        duration: Infinity,
        closeButton: true,
      });
    } finally {
      setIsImportingLibrary(false);
    }
  }, [
    canUseDesktopBackend,
    isExportingLibrary,
    isImportingLibrary,
    setSpaces,
    setIsArchiveLoaded,
    setCaptureError,
    setArchivedItems,
    reload,
  ]);

  return {
    isExportingLibrary,
    lastExport,
    isImportingLibrary,
    lastImport,
    exportLibraryToFolder,
    importLibraryFromFolder,
  };
}
