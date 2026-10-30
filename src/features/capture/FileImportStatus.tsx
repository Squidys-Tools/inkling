import type { FileImportProgress } from "./fileImport";

export function FileImportStatus({
  progress,
  onDismiss,
}: {
  progress: FileImportProgress;
  onDismiss: () => void;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed right-5 bottom-5 z-50 flex items-center gap-3 rounded-xl border border-border bg-canvas px-4 py-2 text-xs shadow-sm"
    >
      <span>
        {progress.active
          ? `Importing ${progress.completed} of ${progress.total} files…`
          : `${progress.saved} files saved. Processing continues in the background.`}
        {progress.failed > 0 ? ` ${progress.failed} failed.` : ""}
      </span>
      {!progress.active && (
        <button type="button" aria-label="Dismiss import status" onClick={onDismiss}>
          ×
        </button>
      )}
    </div>
  );
}
