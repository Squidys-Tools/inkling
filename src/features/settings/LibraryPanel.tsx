import {
  Download04Icon,
  Folder01Icon,
  Loading01Icon,
  Upload04Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { LastExport, LibraryExportReport, LibraryImportReport } from "../../lib/libraryApi";
import type { ItemKind } from "../../lib/types";
import { cx } from "../../ui/cx";
import { formatByteSize, formatExportSummary, formatImportSummary, formatLastCopy } from "./format";
import {
  pillButton,
  SETTINGS_SCROLL,
  SettingsHeader,
  SettingsPanel,
  SettingsRow,
  SMALL_PILL,
} from "./SettingsPanel";

const MAKEUP_GROUPS: Array<{ label: string; kinds: ItemKind[]; color: string }> = [
  { label: "Images", kinds: ["Image"], color: "#B0714F" },
  { label: "Articles", kinds: ["Article"], color: "#C9A57A" },
  { label: "PDFs", kinds: ["PDF"], color: "#7E9A86" },
  { label: "Notes & quotes", kinds: ["Note", "Quote"], color: "#8B93B5" },
  { label: "Videos & posts", kinds: ["Video", "Post"], color: "#A88AAE" },
  { label: "Files", kinds: ["File"], color: "#4A443E" },
];

function LibraryMakeup({
  kinds,
  sizeBytes,
  onShowFolder,
}: {
  kinds: ItemKind[];
  sizeBytes: number | null;
  onShowFolder?: () => void;
}) {
  const groups = MAKEUP_GROUPS.map((group) => ({
    ...group,
    count: kinds.filter((kind) => group.kinds.includes(kind)).length,
  })).filter((group) => group.count > 0);
  return (
    <div className="mb-7 flex flex-col gap-3.5 rounded-frame border border-[#221f1c] bg-[#171513] px-[22px] py-5">
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-baseline gap-2.5">
          <p className="m-0 font-sans text-[22px]/7 font-semibold tracking-[-0.01em] text-ink">
            {kinds.length.toLocaleString()} {kinds.length === 1 ? "thing" : "things"}
          </p>
          {sizeBytes !== null && (
            <span className="font-mono text-[12px]/4 font-normal text-muted">
              {formatByteSize(sizeBytes)} on disk
            </span>
          )}
        </div>
        {onShowFolder && (
          <button type="button" className={SMALL_PILL} onClick={onShowFolder}>
            <HugeiconsIcon icon={Folder01Icon} size={13} />
            Show folder
          </button>
        )}
      </div>
      {groups.length > 0 && (
        <>
          <div className="flex h-2 gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
            {groups.map((group) => (
              <span
                key={group.label}
                className="basis-0"
                style={{ flexGrow: group.count, background: group.color }}
              />
            ))}
          </div>
          <ul className="m-0 flex list-none flex-wrap gap-x-[18px] gap-y-1.5 p-0 font-body text-[12px]/4 font-normal text-[#a8a096]">
            {groups.map((group) => (
              <li key={group.label} className="inline-flex items-center gap-1.5">
                <span
                  className="size-[7px] shrink-0 rounded-full"
                  style={{ background: group.color }}
                  aria-hidden="true"
                />
                {group.label} {group.count.toLocaleString()}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

const HINT = "m-0 font-body text-[12px]/4 font-normal text-muted";
const RESULT = "flex flex-col gap-1.5 rounded-[10px] border border-[#221f1c] px-3.5 py-3";
const SUMMARY = "font-body text-[12px]/4 font-medium text-ink-soft";

export function LibraryPanel({
  kinds,
  sizeBytes,
  canUseFolderPicker,
  onShowFolder,
  lastCopy,
  lastExport,
  lastImport,
  isExporting,
  isImporting,
  onExport,
  onImport,
  onClose,
}: {
  kinds: ItemKind[];
  sizeBytes: number | null;
  canUseFolderPicker: boolean;
  onShowFolder: () => void;
  lastCopy: LastExport | null;
  lastExport: LibraryExportReport | null;
  lastImport: LibraryImportReport | null;
  isExporting: boolean;
  isImporting: boolean;
  onExport: () => void;
  onImport: () => void;
  onClose: () => void;
}) {
  const isBusy = !canUseFolderPicker || isExporting || isImporting;
  return (
    <SettingsPanel tab="data" titleId="data-panel-title">
      <SettingsHeader
        titleId="data-panel-title"
        title="Your library"
        note="It lives in one folder on this computer. Back it up by exporting a copy, or bring an old copy back in."
        onClose={onClose}
      />
      <div className={SETTINGS_SCROLL}>
        <LibraryMakeup
          kinds={kinds}
          sizeBytes={sizeBytes}
          onShowFolder={canUseFolderPicker ? onShowFolder : undefined}
        />
        <SettingsRow
          icon={isExporting ? Loading01Icon : Download04Icon}
          title="Export a copy"
          description="A dated folder with the database, every file, and a manifest. Keep it on another drive."
          action={
            <button
              type="button"
              className={cx(pillButton("solid"), "font-semibold")}
              disabled={isBusy}
              onClick={onExport}
            >
              {isExporting ? "Exporting…" : "Export…"}
            </button>
          }
        >
          {lastCopy ? (
            <p className="m-0 font-mono text-[11px]/[14px] font-normal text-[#6f685f]">
              {formatLastCopy(lastCopy)}
            </p>
          ) : null}
          {!canUseFolderPicker ? <p className={HINT}>Export runs in the desktop app.</p> : null}
          {lastExport ? (
            <div className={RESULT} role="status" aria-live="polite">
              <span className={SUMMARY}>{formatExportSummary(lastExport)}</span>
              <span className="font-mono text-[11px]/[14px] font-normal wrap-anywhere text-muted">
                {lastExport.directory}
              </span>
            </div>
          ) : null}
        </SettingsRow>
        <SettingsRow
          icon={isImporting ? Loading01Icon : Upload04Icon}
          title="Restore from an export"
          description="Adds its items, files and Spaces here. Nothing already in your library gets replaced."
          action={
            <button type="button" className={pillButton()} disabled={isBusy} onClick={onImport}>
              {isImporting ? "Restoring…" : "Restore…"}
            </button>
          }
        >
          {!canUseFolderPicker ? <p className={HINT}>Restore runs in the desktop app.</p> : null}
          {lastImport ? (
            <div className={RESULT} role="status" aria-live="polite">
              <span className={SUMMARY}>{formatImportSummary(lastImport)}</span>
            </div>
          ) : null}
        </SettingsRow>
      </div>
    </SettingsPanel>
  );
}
