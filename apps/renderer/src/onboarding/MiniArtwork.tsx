import * as stylex from "@stylexjs/stylex";
import { cardColor, color, font } from "@inkling/ui/tokens.stylex";
import texture from "./photos/typed-texture.png";

/** A small copy of the library's note and PDF card face, for the welcome backdrop. */
export function TypedArtwork({
  label,
  title,
  footnote,
}: {
  label: string;
  title: string;
  footnote: string;
}) {
  return (
    <div {...stylex.props(styles.typed)}>
      <img src={texture} alt="" {...stylex.props(styles.texture)} />
      <div {...stylex.props(styles.labelRow)}>
        <span {...stylex.props(styles.label)}>{label}</span>
        <span {...stylex.props(styles.ring)} />
      </div>
      <span {...stylex.props(styles.title)}>{title}</span>
      <div {...stylex.props(styles.swatches)}>
        <span {...stylex.props(styles.swatch, styles.accent)} />
        <span {...stylex.props(styles.swatch, styles.yellow)} />
        <span {...stylex.props(styles.swatch, styles.green)} />
      </div>
      <span {...stylex.props(styles.footnote)}>{footnote}</span>
    </div>
  );
}

/** A small copy of the library's quote card face. */
export function QuoteArtwork({ text, attribution }: { text: string; attribution: string }) {
  return (
    <div {...stylex.props(styles.quote)}>
      <span {...stylex.props(styles.mark)}>“</span>
      <p {...stylex.props(styles.quoteText)}>{text}</p>
      <span {...stylex.props(styles.quoteRule)} />
      <span {...stylex.props(styles.attribution)}>{attribution}</span>
    </div>
  );
}

const styles = stylex.create({
  typed: {
    position: "absolute",
    inset: 0,
    isolation: "isolate",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    backgroundColor: color.window,
    paddingInline: 28,
    paddingTop: 42,
    paddingBottom: 30,
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
    paddingRight: 4,
  },
  label: {
    fontFamily: font.mono,
    fontSize: 10,
    lineHeight: "12px",
    letterSpacing: "0.15em",
    color: color.muted,
  },
  ring: {
    width: 22,
    height: 22,
    flexShrink: 0,
    borderRadius: "50%",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: color.muted,
    opacity: 0.85,
  },
  title: {
    position: "relative",
    zIndex: 2,
    display: "-webkit-box",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 2,
    overflow: "hidden",
    marginTop: 36,
    paddingRight: 12,
    fontFamily: font.display,
    fontSize: 21,
    lineHeight: "116%",
    fontWeight: 600,
    letterSpacing: "-0.025em",
    textTransform: "uppercase",
    color: color.ink,
  },
  swatches: {
    position: "relative",
    zIndex: 2,
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginTop: 14,
  },
  swatch: { width: 10, height: 10, flexShrink: 0, borderRadius: "50%" },
  accent: { backgroundColor: color.accent },
  yellow: { backgroundColor: color.paperYellow },
  green: { backgroundColor: color.success },
  footnote: {
    position: "relative",
    zIndex: 2,
    marginTop: "auto",
    alignSelf: "flex-end",
    fontFamily: font.mono,
    fontSize: 10,
    lineHeight: "12px",
    letterSpacing: "0.08em",
    color: color.muted,
  },
  quote: {
    position: "absolute",
    inset: 0,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    padding: 16,
    backgroundColor: color.surface,
  },
  mark: {
    flexShrink: 0,
    height: 58,
    fontFamily: "Georgia, serif",
    fontSize: 110,
    lineHeight: "100px",
    color: cardColor.quoteMark,
  },
  quoteText: {
    margin: 0,
    display: "-webkit-box",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 10,
    overflow: "hidden",
    overflowWrap: "break-word",
    fontFamily: font.display,
    fontSize: 18,
    lineHeight: "128%",
    letterSpacing: "-0.02em",
    color: cardColor.quoteText,
  },
  quoteRule: {
    flexShrink: 0,
    alignSelf: "flex-end",
    width: 120,
    height: 1,
    marginTop: "auto",
    backgroundColor: cardColor.quoteRule,
  },
  attribution: {
    flexShrink: 0,
    alignSelf: "flex-end",
    maxWidth: "100%",
    marginTop: 10,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontFamily: font.mono,
    fontSize: 10,
    lineHeight: "12px",
    color: cardColor.quoteKicker,
    opacity: 0.85,
  },
});
