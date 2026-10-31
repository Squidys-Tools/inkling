import {
  Download04Icon,
  Folder01Icon,
  Loading01Icon,
  Upload04Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@inkling/ui";
import * as stylex from "@stylexjs/stylex";
import { color, font, radius, space, text } from "@inkling/ui/tokens.stylex";
import type { ReactNode } from "react";
import { desktop } from "../desktop.ts";
import {
  formatByteSize,
  formatExportSummary,
  formatImportSummary,
  formatLastCopy,
} from "./format.ts";
import { Panel, PanelBody, Pill, Row, settingsText } from "./parts.tsx";
import { useLibraryOverview, useLibraryTransfer } from "./useLibraryTransfer.ts";

export function LibraryPanel({ onClose }: { onClose: () => void }) {
  const { count, sizeBytes, lastCopy } = useLibraryOverview();
  const { busy, outcome, exportCopy, restoreCopy, showFolder } = useLibraryTransfer();
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
          <div {...stylex.props(styles.figures)}>
            <p {...stylex.props(styles.count)}>
              {count === null
                ? "Your library"
                : `${count.toLocaleString()} ${count === 1 ? "thing" : "things"}`}
            </p>
            {sizeBytes !== null && (
              <span {...stylex.props(settingsText.mono)}>{formatByteSize(sizeBytes)} on disk</span>
            )}
          </div>
          {desktop && (
            <Button
              onClick={showFolder}
              icon={<HugeiconsIcon icon={Folder01Icon} size={13} />}
              style={styles.smallPill}
            >
              Show folder
            </Button>
          )}
        </div>
        {failure("folder")}
        <Row
          icon={busy === "export" ? Loading01Icon : Download04Icon}
          title="Export a copy"
          description="A dated folder with the database, every file, and a manifest. Keep it on another drive."
          action={
            <Pill look="solid" disabled={!desktop || busy !== null} onClick={exportCopy}>
              {busy === "export" ? "Exporting…" : "Export…"}
            </Pill>
          }
        >
          {lastCopy && <p {...stylex.props(styles.lastCopy)}>{formatLastCopy(lastCopy)}</p>}
          {!desktop && <p {...stylex.props(settingsText.hint)}>Export runs in the desktop app.</p>}
          {outcome?.action === "export" && "report" in outcome && (
            <Result>
              <span {...stylex.props(styles.summary)}>{formatExportSummary(outcome.report)}</span>
              <span {...stylex.props(styles.path)}>{outcome.report.directory}</span>
            </Result>
          )}
          {failure("export")}
        </Row>
        <Row
          icon={busy === "import" ? Loading01Icon : Upload04Icon}
          title="Restore from an export"
          description="Adds its items, files and Spaces here. Nothing already in your library gets replaced."
          action={
            <Pill disabled={!desktop || busy !== null} onClick={restoreCopy}>
              {busy === "import" ? "Restoring…" : "Restore…"}
            </Pill>
          }
        >
          {!desktop && <p {...stylex.props(settingsText.hint)}>Restore runs in the desktop app.</p>}
          {outcome?.action === "import" && "report" in outcome && (
            <Result>
              <span {...stylex.props(styles.summary)}>
                {formatImportSummary(outcome.report)}. Search indexing continues in the background.
              </span>
            </Result>
          )}
          {failure("import")}
        </Row>
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
    flexShrink: 0,
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: space.s3,
    marginBottom: "28px",
    paddingInline: "22px",
    paddingBlock: space.s5,
    borderRadius: radius.frame,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: color.border,
    backgroundColor: color.surface,
  },
  figures: { display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "10px", minWidth: 0 },
  count: {
    margin: 0,
    fontFamily: font.display,
    fontSize: "22px",
    lineHeight: "28px",
    fontWeight: 600,
    letterSpacing: "-0.01em",
    color: color.ink,
  },
  smallPill: {
    height: "28px",
    flexShrink: 0,
    gap: "6px",
    paddingInline: space.s3,
    borderRadius: radius.round,
    borderColor: color.border,
    fontSize: text.sm,
    fontWeight: 400,
  },
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
