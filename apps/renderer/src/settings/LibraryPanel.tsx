import Download04Icon from "@hugeicons/core-free-icons/Download04Icon";
import Folder01Icon from "@hugeicons/core-free-icons/Folder01Icon";
import Upload04Icon from "@hugeicons/core-free-icons/Upload04Icon";
import * as stylex from "@stylexjs/stylex";
import { color, font, radius, space, text } from "@inkling/ui/tokens.stylex";
import type { ReactNode } from "react";
import { desktop } from "../desktop.ts";
import { formatByteSize } from "../format.ts";
import { formatExportSummary, formatImportSummary, formatLastCopy } from "./format.ts";
import { KindBreakdown } from "./KindBreakdown.tsx";
import { ActionButton, CardRow, Panel, PanelBody, Section, settingsText } from "./parts.tsx";
import { useLibraryOverview, type useLibraryTransfer } from "./useLibraryTransfer.ts";

export function LibraryPanel({
  transfer,
  onClose,
}: {
  transfer: ReturnType<typeof useLibraryTransfer>;
  onClose: () => void;
}) {
  const { count, kinds, sizeBytes, lastCopy } = useLibraryOverview();
  const { busy, outcome, exportCopy, restoreCopy, showFolder } = transfer;
  const failure = (action: "export" | "import" | "folder") =>
    outcome?.action === action && "error" in outcome ? (
      <p role="alert" {...stylex.props(styles.failed)}>
        {outcome.error}
      </p>
    ) : null;

  return (
    <Panel
      title="Your library"
      note="It lives in one folder on this computer. Back it up by exporting a copy, or bring an old copy back in."
      onClose={onClose}
    >
      <PanelBody>
        <div {...stylex.props(styles.overview)}>
          <div {...stylex.props(styles.headline)}>
            <div {...stylex.props(styles.figures)}>
              <p {...stylex.props(styles.count)}>
                {count === undefined
                  ? "Your library"
                  : `${count.toLocaleString()} ${count === 1 ? "thing" : "things"}`}
              </p>
              {sizeBytes !== undefined && (
                <span {...stylex.props(styles.size)}>
                  {formatByteSize(sizeBytes)} on this computer
                </span>
              )}
            </div>
            {desktop && (
              <ActionButton icon={Folder01Icon} onClick={showFolder}>
                Show folder
              </ActionButton>
            )}
          </div>
          <KindBreakdown kinds={kinds} />
        </div>
        {failure("folder")}
        <Section label="Backups">
          <CardRow
            title="Export a copy"
            description="A dated folder with the database, every file, and a manifest. Keep it on another drive."
            action={
              <ActionButton
                icon={Download04Icon}
                disabled={!desktop || busy !== null}
                onClick={exportCopy}
              >
                {busy === "export" ? "Exporting…" : "Export…"}
              </ActionButton>
            }
          >
            {lastCopy && <p {...stylex.props(styles.lastCopy)}>{formatLastCopy(lastCopy)}</p>}
            {!desktop && (
              <p {...stylex.props(settingsText.hint)}>Export runs in the desktop app.</p>
            )}
            {outcome?.action === "export" && "report" in outcome && (
              <Result>
                <span {...stylex.props(styles.summary)}>{formatExportSummary(outcome.report)}</span>
                <span {...stylex.props(styles.path)}>{outcome.report.directory}</span>
              </Result>
            )}
            {failure("export")}
          </CardRow>
          <CardRow
            title="Restore from an export"
            description="Adds its items, files and Spaces here. Nothing already in your library gets replaced."
            action={
              <ActionButton
                icon={Upload04Icon}
                disabled={!desktop || busy !== null}
                onClick={restoreCopy}
              >
                {busy === "import" ? "Restoring…" : "Restore…"}
              </ActionButton>
            }
          >
            {!desktop && (
              <p {...stylex.props(settingsText.hint)}>Restore runs in the desktop app.</p>
            )}
            {outcome?.action === "import" && "report" in outcome && (
              <Result>
                <span {...stylex.props(styles.summary)}>
                  {formatImportSummary(outcome.report)}. Search indexing continues in the
                  background.
                </span>
              </Result>
            )}
            {failure("import")}
          </CardRow>
        </Section>
      </PanelBody>
    </Panel>
  );
}

function Result({ children }: { children: ReactNode }) {
  return (
    <div role="status" aria-live="polite" {...stylex.props(styles.result)}>
      {children}
    </div>
  );
}

const styles = stylex.create({
  overview: {
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
    gap: space.s4,
    paddingInline: "18px",
    paddingTop: "18px",
    paddingBottom: space.s4,
    borderRadius: radius.tile,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: color.border,
    backgroundColor: color.surface,
  },
  headline: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: space.s3,
  },
  figures: { display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "10px", minWidth: 0 },
  count: {
    margin: 0,
    fontFamily: font.display,
    fontSize: "30px",
    lineHeight: "34px",
    fontWeight: 600,
    letterSpacing: "-0.02em",
    color: color.inkStrong,
  },
  size: { fontFamily: font.body, fontSize: "12.5px", color: color.muted },
  lastCopy: {
    margin: 0,
    fontFamily: font.mono,
    fontSize: text.xs,
    lineHeight: "14px",
    color: color.faint,
  },
  result: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    marginTop: space.s1,
    paddingInline: "14px",
    paddingBlock: space.s3,
    borderRadius: "10px",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: color.border,
  },
  summary: {
    fontFamily: font.body,
    fontSize: text.sm,
    lineHeight: "16px",
    fontWeight: 500,
    color: color.inkSoft,
  },
  path: {
    fontFamily: font.mono,
    fontSize: text.xs,
    lineHeight: "14px",
    overflowWrap: "anywhere",
    color: color.muted,
  },
  failed: {
    margin: 0,
    fontFamily: font.body,
    fontSize: text.sm,
    lineHeight: "18px",
    color: color.danger,
  },
});
