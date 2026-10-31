import * as stylex from "@stylexjs/stylex";
import { color, font, radius, space, text } from "@inkling/ui/tokens.stylex";
import { Link } from "@tanstack/react-router";

const links = [
  { to: "/", label: "Library" },
  { to: "/add/note", label: "New note" },
  { to: "/add/quote", label: "New quote" },
  { to: "/add/link", label: "Save a link" },
  { to: "/archive", label: "Archive" },
  { to: "/settings/$section", params: { section: "general" }, label: "Settings" },
] as const;

export function Sidebar() {
  return (
    <nav aria-label="Library" {...stylex.props(styles.sidebar)}>
      <div {...stylex.props(styles.wordmark)}>inkling</div>
      {links.map((link) => (
        <Link
          key={link.label}
          to={link.to}
          params={"params" in link ? link.params : undefined}
          activeOptions={{ exact: true }}
          {...stylex.props(styles.row)}
          activeProps={stylex.props(styles.row, styles.active)}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}

const styles = stylex.create({
  sidebar: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    paddingInline: space.s2,
    paddingBottom: space.s4,
    position: "relative",
    zIndex: 1,
  },
  wordmark: {
    fontFamily: font.display,
    fontSize: text.xl,
    fontWeight: 600,
    color: color.inkStrong,
    paddingInline: space.s3,
    paddingBlock: space.s3,
    letterSpacing: "-0.01em",
  },
  row: {
    display: "flex",
    alignItems: "center",
    height: "32px",
    paddingInline: space.s3,
    borderRadius: radius.control,
    color: { default: color.inkSoft, ":hover": color.inkStrong },
    backgroundColor: { default: "transparent", ":hover": color.overlayHover },
    fontSize: text.md,
    textDecoration: "none",
    outline: { default: "none", ":focus-visible": `2px solid ${color.accent}` },
  },
  active: {
    backgroundColor: color.overlayActive,
    color: color.inkStrong,
  },
});
