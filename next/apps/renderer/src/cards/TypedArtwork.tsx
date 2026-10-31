import * as stylex from "@stylexjs/stylex";
import { color, font, radius } from "@inkling/ui/tokens.stylex";
import {
  type CardView,
  fileExtensionLabel,
  formatFileSize,
  pdfPreviewTitle,
} from "../library/cardModel.ts";
import texture from "./assets/typed-texture.png";

// PDFs, notes and files share one layout: a mono label and ring, the title in
// DM Sans caps, three dots and a mono footnote over the same dotted texture.
// `compact` is the list row.
function TypedArtwork({
  label,
  title,
  footnote,
  compact = false,
}: {
  label: string;
  title: string;
  footnote?: string;
  compact?: boolean;
}) {
  return (
    <div {...stylex.props(styles.art, compact && styles.compactArt)} aria-hidden="true">
      <img src={texture} alt="" decoding="async" {...stylex.props(styles.texture)} />
      <div {...stylex.props(styles.labelRow)}>
        <span {...stylex.props(styles.label)}>{label}</span>
        <span {...stylex.props(styles.ring)} />
      </div>
      <span {...stylex.props(styles.title, compact && styles.compactTitle)}>{title}</span>
      <div {...stylex.props(styles.dots, compact && styles.compactDots)}>
        <span {...stylex.props(styles.dot, styles.dotAccent)} />
        <span {...stylex.props(styles.dot, styles.dotYellow)} />
        <span {...stylex.props(styles.dot, styles.dotGreen)} />
      </div>
      {footnote && <span {...stylex.props(styles.footnote)}>{footnote}</span>}
    </div>
  );
}

const wordCount = (value: string) => {
  const words = value.replace(/\s+/gu, " ").trim();
  return words ? words.split(" ").length : 0;
};

/** The art a card draws when it has no image: by kind, for PDFs, notes, files and the rest. */
export function TypedArtworkFor({ view, compact }: { view: CardView; compact?: boolean }) {
  if (view.kind === "PDF")
    return (
      <TypedArtwork
        label="PDF"
        title={pdfPreviewTitle(view.title) || "Document"}
        footnote={view.pdfPageCount ? `${view.pdfPageCount} PAGES` : undefined}
        compact={compact}
      />
    );
  if (view.kind === "Note") {
    const words = wordCount(view.description);
    return (
      <TypedArtwork
        label="NOTE"
        title={view.title}
        footnote={words > 0 ? `${words} WORDS` : undefined}
        compact={compact}
      />
    );
  }
  // A file shows its extension; a post, image or video with no artwork shows its kind.
  const extension = view.kind === "File" ? fileExtensionLabel(view.title) : "";
  return (
    <TypedArtwork
      label={extension || view.kind.toUpperCase()}
      title={pdfPreviewTitle(view.title) || view.kind}
      footnote={view.fileSizeBytes ? formatFileSize(view.fileSizeBytes) : undefined}
      compact={compact}
    />
  );
}

const styles = stylex.create({
  art: {
    position: "absolute",
    inset: 0,
    isolation: "isolate",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    backgroundColor: color.window,
    paddingTop: "42px",
    paddingInline: "28px",
    paddingBottom: "30px",
  },
  compactArt: {
    paddingTop: "14px",
    paddingRight: "16px",
    paddingBottom: "14px",
    paddingLeft: "18px",
  },
  texture: {
    position: "absolute",
    inset: 0,
    zIndex: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover",
    pointerEvents: "none",
  },
  labelRow: {
    position: "relative",
    zIndex: 2,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    paddingRight: "4px",
  },
  label: {
    fontFamily: font.mono,
    fontSize: "10px",
    lineHeight: "12px",
    letterSpacing: "0.15em",
    color: color.muted,
  },
  ring: {
    width: "22px",
    height: "22px",
    flexShrink: 0,
    borderRadius: radius.round,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: color.muted,
    opacity: 0.85,
  },
  title: {
    position: "relative",
    zIndex: 2,
    marginTop: "36px",
    paddingRight: "12px",
    fontFamily: font.display,
    fontSize: "21px",
    lineHeight: "116%",
    fontWeight: 600,
    letterSpacing: "-0.025em",
    textTransform: "uppercase",
    color: color.ink,
    display: "-webkit-box",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 2,
    overflow: "hidden",
  },
  compactTitle: {
    marginTop: "14px",
    fontSize: "15px",
  },
  dots: {
    position: "relative",
    zIndex: 2,
    display: "flex",
    alignItems: "center",
    gap: "8px",
    marginTop: "14px",
  },
  compactDots: {
    marginTop: "10px",
  },
  dot: {
    width: "10px",
    height: "10px",
    flexShrink: 0,
    borderRadius: radius.round,
  },
  dotAccent: { backgroundColor: color.accent },
  dotYellow: { backgroundColor: color.paperYellow },
  dotGreen: { backgroundColor: color.success },
  footnote: {
    position: "relative",
    zIndex: 2,
    marginTop: "auto",
    alignSelf: "flex-end",
    fontFamily: font.mono,
    fontSize: "10px",
    lineHeight: "12px",
    letterSpacing: "0.08em",
    color: color.muted,
  },
});
