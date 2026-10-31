import type { ExportReport, ImportReport, LastExport } from "@inkling/contracts";
import { useEffect, useState } from "react";
import { desktop } from "../desktop.ts";
import { libraryClient } from "../library/connection.ts";
import { errorMessage } from "../library/errors.ts";
import { createStore, useStore } from "../library/store.ts";

type Outcome =
  | { action: "export"; report: ExportReport }
  | { action: "import"; report: ImportReport }
  | { action: "export" | "import" | "folder"; error: string };

// Outside the panel, so an export or restore keeps its lock and its result
// while the user looks at another section.
const transfers = createStore<{ busy: "export" | "import" | null; outcome: Outcome | null }>({
  busy: null,
  outcome: null,
});

async function transfer(action: "export" | "import") {
  if (!desktop || transfers.get().busy) return;
  let folder: string | null;
  try {
    folder = await desktop.chooseDirectory(
      action === "export"
        ? "Choose where to save the export"
        : "Choose an inkling export to restore",
    );
  } catch (error) {
    const message = `Could not open the folder picker. ${errorMessage(error)}`;
    transfers.set((state) => ({ ...state, outcome: { action, error: message } }));
    return;
  }
  if (!folder || transfers.get().busy) return;
  transfers.set((state) => ({ ...state, busy: action }));
  let outcome: Outcome;
  try {
    const client = await libraryClient();
    if (action === "export") {
      const report = await client.exportLibrary({
        destination: folder,
        timezoneOffsetMinutes: new Date().getTimezoneOffset(),
      });
      outcome = { action, report };
    } else {
      const report = await client.importLibrary({ exportDirectory: folder });
      outcome = { action, report };
    }
  } catch (error) {
    outcome = { action, error: errorMessage(error) };
  }
  transfers.set({ busy: null, outcome });
}

function showFolder() {
  desktop?.showLibraryFolder().catch((error: unknown) => {
    const message = `Could not open the library folder. ${errorMessage(error)}`;
    transfers.set((state) => ({ ...state, outcome: { action: "folder", error: message } }));
  });
}

/** Export a copy of the library, or restore one, through a folder the user picks. Desktop app only. */
export function useLibraryTransfer() {
  return {
    busy: useStore(transfers, (state) => state.busy),
    outcome: useStore(transfers, (state) => state.outcome),
    exportCopy: () => void transfer("export"),
    restoreCopy: () => void transfer("import"),
    showFolder,
  };
}

/**
 * The library's item count, size on disk and last export, read again after
 * each export or restore. Each stays null when it cannot be read.
 */
export function useLibraryOverview() {
  const [count, setCount] = useState<number | null>(null);
  const [sizeBytes, setSizeBytes] = useState<number | null>(null);
  const [lastCopy, setLastCopy] = useState<LastExport | null>(null);
  const outcome = useStore(transfers, (state) => state.outcome);

  useEffect(() => {
    let current = true;
    void libraryClient().then(
      (client) => {
        client.status({}).then(
          (status) => current && setCount(status.itemCount),
          () => undefined,
        );
        client.lastExport({}).then(
          (copy) => current && setLastCopy(copy),
          () => undefined,
        );
        if (!desktop) return;
        // The size walks every asset file. The cached figure shows at once and a
        // fresh walk replaces it; fired together, a first visit shares one walk.
        // After an export or restore the cached figure is stale, so only the walk runs.
        const showSize = (bytes: number) => current && setSizeBytes(bytes);
        if (!outcome) client.librarySize({ refresh: false }).then(showSize, () => undefined);
        client.librarySize({ refresh: true }).then(showSize, () => undefined);
      },
      () => undefined,
    );
    return () => {
      current = false;
    };
  }, [outcome]);

  return { count, sizeBytes, lastCopy };
}
