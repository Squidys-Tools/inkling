import { type Dispatch, type SetStateAction, useCallback, useState } from "react";
import { toast } from "notch-toast";
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

export function showLibraryFolderFromSettings() {
  void showLibraryFolder().catch(() => {
    toast.error("Could not open the library folder", { duration: 5000 });
  });
}

type LibraryTransferOptions = {
  canUseLibraryFolderPicker: boolean;
  setLastCopy: Dispatch<SetStateAction<LastExport | null>>;
  setSpaces: Dispatch<SetStateAction<StoredSpace[]>>;
  setArchivedItems: Dispatch<SetStateAction<LibraryItem[]>>;
  setIsArchiveLoaded: Dispatch<SetStateAction<boolean>>;
  reload: () => void;
  setCaptureError: Dispatch<SetStateAction<string | null>>;
};

export function useLibraryTransfer({
  canUseLibraryFolderPicker,
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
    if (!canUseLibraryFolderPicker || isExportingLibrary || isImportingLibrary) return;
    let destination: string | null = null;
    try {
      destination = await selectLibraryDirectory("Choose where to save the export");
    } catch {
      toast.error("Could not open the folder picker", { duration: 5000 });
      return;
    }
    if (!destination) return;

    setIsExportingLibrary(true);
    toast.loading("Exporting library…");
    try {
      const report = await exportLibrary(destination);
      setLastExport(report);
      // The backend stamps the copy; read it back rather than guessing the time here.
      void getLastExport()
        .then((copy) => setLastCopy(copy ?? null))
        .catch(() => undefined);
      toast.success(
        report.skippedAssets > 0 ? "Library exported with skipped assets" : "Library exported",
        { duration: 4000, dismissible: true },
      );
    } catch {
      toast.error("Export failed");
    } finally {
      setIsExportingLibrary(false);
    }
  }, [canUseLibraryFolderPicker, isExportingLibrary, isImportingLibrary, setLastCopy]);

  const importLibraryFromFolder = useCallback(async () => {
    if (!canUseLibraryFolderPicker || isExportingLibrary || isImportingLibrary) return;
    let exportDirectory: string | null = null;
    try {
      exportDirectory = await selectLibraryDirectory("Choose an Inkling export to restore");
    } catch {
      toast.error("Could not open the export picker", { duration: 5000 });
      return;
    }
    if (!exportDirectory) return;

    setIsImportingLibrary(true);
    toast.loading("Restoring library…");
    try {
      const report = await importLibrary(exportDirectory);
      setLastImport(report);
      toast.success("Library restored", { duration: 5000, dismissible: true });
      try {
        setSpaces(await listSpaces());
        const storedItems = await listArchivedItems();
        setArchivedItems(
          await Promise.all(storedItems.map((item) => storedItemToLibraryItem(item))),
        );
        setIsArchiveLoaded(true);
        reload();
      } catch (error) {
        setCaptureError(error instanceof Error ? error.message : String(error));
      }
    } catch {
      toast.error("Import failed");
    } finally {
      setIsImportingLibrary(false);
    }
  }, [
    canUseLibraryFolderPicker,
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
