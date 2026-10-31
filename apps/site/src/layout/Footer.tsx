import * as stylex from "@stylexjs/stylex";
import { color, font } from "@inkling/ui/tokens.stylex";
import { Link } from "@tanstack/react-router";
import { extensionGuide, latestRelease, repository } from "./links.ts";
import { page } from "./page.ts";

export function Footer() {
  return (
    <footer {...stylex.props(styles.footer)}>
      <div {...stylex.props(page.column, styles.inner)}>
        <div {...stylex.props(styles.about)}>
          <span {...stylex.props(styles.wordmark)}>inkling</span>
          <p {...stylex.props(styles.note)}>
            Free and open source under the MIT license. No account, no tracking on this site or in
            the app.
          </p>
        </div>
        <nav aria-label="Footer" {...stylex.props(styles.columns)}>
          <ul {...stylex.props(styles.list)}>
            <li>
              <Link to="/features" {...stylex.props(styles.link)}>
                Features
              </Link>
            </li>
            <li>
              <Link to="/privacy" {...stylex.props(styles.link)}>
                Privacy
              </Link>
            </li>
            <li>
              <Link to="/download" {...stylex.props(styles.link)}>
                Download
              </Link>
            </li>
          </ul>
          <ul {...stylex.props(styles.list)}>
            <li>
              <a href={repository} {...stylex.props(styles.link)}>
                Source code
              </a>
            </li>
            <li>
              <a href={latestRelease} {...stylex.props(styles.link)}>
                Releases
              </a>
            </li>
            <li>
              <a href={extensionGuide} {...stylex.props(styles.link)}>
                Chrome extension
              </a>
            </li>
          </ul>
        </nav>
      </div>
    </footer>
  );
}

const styles = stylex.create({
  footer: {
    marginTop: "120px",
    paddingBlock: "48px",
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: color.border,
  },
  inner: {
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: "40px",
  },
  about: { maxWidth: "34ch" },
  wordmark: {
    color: color.inkStrong,
    fontFamily: font.display,
    fontSize: "19px",
    fontWeight: 600,
    letterSpacing: "-0.02em",
  },
  note: {
    marginTop: "10px",
    marginBottom: 0,
    color: color.muted,
    fontSize: "14px",
    lineHeight: 1.6,
  },
  columns: { display: "flex", gap: "64px" },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    margin: 0,
    padding: 0,
    listStyle: "none",
  },
  link: {
    color: { default: color.inkSoft, ":hover": color.inkStrong },
    fontSize: "15px",
    textDecoration: "none",
    outline: { default: "none", ":focus-visible": `2px solid ${color.accent}` },
    outlineOffset: "3px",
  },
});
