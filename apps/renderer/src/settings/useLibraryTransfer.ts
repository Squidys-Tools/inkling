import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { desktop } from "../desktop.ts";
import { libraryClient } from "../library/connection.ts";
import { errorMessage } from "../library/errors.ts";
import { notify, notifyError } from "../notifications/toasts.ts";
import { libraryQuery } from "../queryClient.ts";
import { formatExportSummary, formatImportSummary } from "./format.ts";

type Transfer = { action: "export" | "import"; folder: string };

async function run({ action, folder }: Transfer) {
  const client = await libraryClient();
  if (action === "import")
    return { action, report: await client.importLibrary({ exportDirectory: folder }) };
  const report = await client.exportLibrary({
    destination: folder,
    timezoneOffsetMinutes: new Date().getTimezoneOffset(),
  });
  return { action, report };
}

/**
 * Export a copy of the library, or restore one, through a folder the user picks.
 * Desktop app only. The settings sheet holds it, so a transfer keeps its lock
 * and its result while the user looks at another section.
 */
export function useLibraryTransfer() {
  const queryClient = useQueryClient();
  // The folder picker and Show folder fail outside the transfer, into the same slot.
  const [failure, setFailure] = useState<{
    action: "export" | "import" | "folder";
    error: string;
  } | null>(null);
  const transfer = useMutation({
    mutationFn: run,
    onSuccess: (outcome) =>
      notify(outcome.action === "export" ? "Library exported" : "Library restored", {
        id: "library-transfer",
        description:
          outcome.action === "export"
            ? formatExportSummary(outcome.report)
            : formatImportSummary(outcome.report),
      }),
    onError: (error, { action }) =>
      notifyError(
        action === "export" ? "Export failed" : "Restore failed",
        errorMessage(error),
        "library-transfer",
      ),
    onSettled: () => {
      setFailure(null);
      return queryClient.invalidateQueries({ queryKey: ["library", "overview"] });
    },
  });

  const fail = (action: "export" | "import" | "folder", title: string, error: string) => {
    setFailure({ action, error });
    notifyError(title, error, "library-transfer");
  };

  const start = async (action: Transfer["action"]) => {
    if (!desktop) return;
    try {
      const folder = await desktop.chooseDirectory(
        action === "export"
          ? "Choose where to save the export"
          : "Choose an inkling export to restore",
      );
      if (folder) transfer.mutate({ action, folder });
    } catch (error) {
      fail(
        action,
        "Couldn’t choose a folder",
        `Could not open the folder picker. ${errorMessage(error)}`,
      );
    }
  };

  return {
    busy: transfer.isPending ? transfer.variables.action : null,
    outcome:
      failure ??
      (transfer.isError
        ? { action: transfer.variables.action, error: errorMessage(transfer.error) }
        : transfer.data),
    exportCopy: () => void start("export"),
    restoreCopy: () => void start("import"),
    showFolder: () =>
      void desktop
        ?.showLibraryFolder()
        .catch((error: unknown) =>
          fail(
            "folder",
            "Couldn’t open the library folder",
            `Could not open the library folder. ${errorMessage(error)}`,
          ),
        ),
  };
}

/**
 * The library's item count, per-kind counts, size on disk and last export, read
 * again after each export or restore. Each stays undefined when it cannot be read.
 */
export function useLibraryOverview() {
  const count = useQuery(
    libraryQuery(["overview", "count"], async (client) => (await client.status({})).itemCount),
  );
  const kinds = useQuery(libraryQuery(["overview", "kinds"], (client) => client.kindCounts({})));
  const lastCopy = useQuery(
    libraryQuery(["overview", "lastExport"], (client) => client.lastExport({})),
  );
  // The size walks every asset file. The cached figure shows at once and a fresh
  // walk replaces it; fired together, a first visit shares one walk. After an
  // export or restore only the walk runs again, since the cached figure is stale.
  const size = useQuery({
    ...libraryQuery(["overview", "size"], (client) => client.librarySize({ refresh: true })),
    enabled: desktop !== undefined,
  });
  const cachedSize = useQuery({
    ...libraryQuery(["cachedSize"], (client) => client.librarySize({ refresh: false })),
    enabled: desktop !== undefined,
  });
  return {
    count: count.data,
    kinds: kinds.data ?? [],
    sizeBytes: size.data ?? cachedSize.data,
    lastCopy: lastCopy.data,
  };
}
