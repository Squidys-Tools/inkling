import BookBookmarkIcon from "@inkling/ui/icons/BookBookmark";
import FileTextIcon from "@inkling/ui/icons/FileText";
import { Icon } from "@inkling/ui";
import type { Space } from "@inkling/contracts";
import * as stylex from "@stylexjs/stylex";
import { Button } from "@inkling/ui";
import { color, font, itemColor, space, text } from "@inkling/ui/tokens.stylex";
import { retryProcessing } from "../cards/cardActions.ts";
import { ProcessingRows } from "../cards/Processing.tsx";
import { quoteArtworkText } from "../cards/QuoteArtwork.tsx";
import { hostname } from "../library/assets.ts";
import { useProcessing } from "../library/jobs.ts";
import { dayMonthYear } from "../format.ts";
import type { DescribedItem } from "./model.ts";
import { TagList } from "./TagList.tsx";
import { TitleField } from "./TitleField.tsx";

// A file saved from disk carries its MIME type where a page carries its site.
const mimeType = /^([a-z]+)\/(?:x-)?([a-z0-9.+-]+)$/iu;
// Subtypes whose raw names read badly as a format label.
const formatNames: Record<string, string> = {
  quicktime: "MOV",
  matroska: "MKV",
  msvideo: "AVI",
  "svg+xml": "SVG",
  mpeg: "MPEG",
  plain: "Plain",
  "vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
};
const kindNames: Record<string, string> = { application: "file", text: "text", font: "font" };

function fileType(value: string) {
  const match = mimeType.exec(value);
  if (!match) return null;
  const kind = match[1].toLowerCase();
  const subtype = match[2].toLowerCase();
  const format =
    formatNames[subtype] ?? subtype.replace(/^x-/u, "").split(/[.+]/u)[0].toUpperCase();
  if (subtype === "pdf") return "PDF document";
  return `${format} ${kindNames[kind] ?? kind}`;
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div {...stylex.props(styles.detail)}>
      <dt {...stylex.props(styles.detailLabel)}>{label}</dt>
      <dd {...stylex.props(styles.detailValue, mono && styles.mono)}>{value}</dd>
    </div>
  );
}

/** The Info tab: what the item is, where it came from, and what to do with it. */
export function InfoPanel({
  item,
  filedIn,
  onRename,
  onAddTag,
  onEditNote,
  onOpenPdf,
  onRead,
}: {
  item: DescribedItem;
  filedIn: readonly Space[];
  onRename: (title: string) => void;
  onAddTag: (tag: string) => void;
  onEditNote: () => void;
  onOpenPdf: () => void;
  onRead: () => void;
}) {
  const processing = useProcessing(item.id);
  const site = hostname(item.webUrl);
  const type = site ? null : fileType(item.source);
  const from = site ?? (type ? null : item.source);
  const quote = item.kind === "Quote" ? quoteArtworkText(item) : null;
  const canRead = item.hasArticleContent;
  const canOpenPdf = item.kind === "PDF" && Boolean(item.file);

  return (
    <>
      {quote ? (
        <>
          <blockquote {...stylex.props(styles.quote)}>
            “{quote.text.replace(/^["“]|["”]$/gu, "")}”
          </blockquote>
          {quote.attribution && <p {...stylex.props(styles.attribution)}>{quote.attribution}</p>}
        </>
      ) : (
        <div {...stylex.props(styles.heading)}>
          <TitleField title={item.title} onRename={onRename} />
          {item.palette.length > 0 && (
            <div aria-hidden="true" {...stylex.props(styles.palette)}>
              {[...new Set(item.palette)].map((swatch) => (
                <span key={swatch} {...stylex.props(styles.swatch, styles.swatchColor(swatch))} />
              ))}
            </div>
          )}
        </div>
      )}
      {item.kind !== "Note" && !quote && item.description && (
        <p {...stylex.props(styles.box)}>{item.description}</p>
      )}
      {processing && (
        <ProcessingRows processing={processing} onPaper={false} onRetry={retryProcessing} />
      )}
      <TagList tags={item.tags} spaces={filedIn} onAddTag={onAddTag} />
      <section>
        <h3 {...stylex.props(styles.sectionTitle)}>Details</h3>
        <dl {...stylex.props(styles.details)}>
          <Detail label="Saved" value={dayMonthYear(item.createdAt)} />
          {from && <Detail label="From" value={from} />}
          {type && <Detail label="Type" value={type} />}
          {item.size && (
            <Detail label="Size" value={`${item.size.width} × ${item.size.height}`} mono />
          )}
          {item.pdfPageCount && <Detail label="Pages" value={String(item.pdfPageCount)} mono />}
        </dl>
      </section>
      {(item.kind === "Note" || canOpenPdf || canRead) && (
        <div {...stylex.props(styles.actions)}>
          {item.kind === "Note" && (
            <Button variant="outline" onClick={onEditNote}>
              Edit note
            </Button>
          )}
          {canOpenPdf && (
            <Button
              variant="outline"
              icon={<Icon icon={FileTextIcon} size={14} />}
              onClick={onOpenPdf}
            >
              Open PDF
            </Button>
          )}
          {canRead && (
            <Button
              variant="outline"
              icon={<Icon icon={BookBookmarkIcon} size={14} />}
              onClick={onRead}
            >
              Read
            </Button>
          )}
        </div>
      )}
    </>
  );
}

const styles = stylex.create({
  heading: { display: "flex", flexDirection: "column", gap: space.s3 },
  palette: { display: "flex", gap: "6px" },
  swatch: {
    flexShrink: 0,
    width: "22px",
    height: "22px",
    borderRadius: "6px",
    boxShadow: `inset 0 0 0 1px ${itemColor.swatchEdge}`,
  },
  // Palette entries are colors the library measured from the image.
  swatchColor: (value: string) => ({ backgroundColor: value }),
  quote: {
    marginTop: space.s4,
    marginBottom: space.s2,
    marginInline: 0,
    fontFamily: font.quote,
    fontSize: "22px",
    lineHeight: 1.35,
    fontStyle: "italic",
    color: color.ink,
    overflowWrap: "anywhere",
  },
  attribution: {
    margin: 0,
    fontFamily: font.body,
    fontSize: text.sm,
    lineHeight: 1.5,
    color: color.muted,
  },
  box: {
    margin: 0,
    minHeight: "72px",
    maxHeight: "240px",
    overflowY: "auto",
    whiteSpace: "pre-wrap",
    userSelect: "text",
    paddingBlock: "11px",
    paddingInline: space.s3,
    borderRadius: "10px",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: color.border,
    backgroundColor: color.surface,
    fontSize: text.md,
    lineHeight: "20px",
    color: color.inkSoft,
    overflowWrap: "anywhere",
  },
  sectionTitle: {
    marginTop: 0,
    marginBottom: "9px",
    marginInline: 0,
    fontSize: text.xs,
    lineHeight: "14px",
    fontWeight: 500,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: color.muted,
  },
  details: { margin: 0, display: "flex", flexDirection: "column", gap: "9px", lineHeight: "16px" },
  detail: { display: "flex", justifyContent: "space-between", gap: space.s3 },
  detailLabel: { fontSize: text.md, color: color.muted },
  detailValue: {
    margin: 0,
    fontSize: text.md,
    textAlign: "right",
    color: color.inkSoft,
    overflowWrap: "anywhere",
  },
  mono: { fontFamily: font.mono, fontSize: text.sm },
  actions: { display: "flex", flexWrap: "wrap", gap: space.s2 },
});
