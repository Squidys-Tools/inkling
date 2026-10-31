import * as stylex from "@stylexjs/stylex";
import { color, font, radius } from "@inkling/ui/tokens.stylex";
import { createFileRoute } from "@tanstack/react-router";
import { page } from "../layout/page.ts";
import { type } from "../parts/type.ts";

export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [{ title: "Privacy · inkling" }] }),
  component: Privacy,
});

// Kept in step with product rule 3 in AGENTS.md: these are the only times the app uses the network.
const online = [
  {
    when: "You save a link",
    what: "inkling fetches that page, its images and any media it points to, to make the card and a readable copy.",
  },
  {
    when: "You play a video",
    what: "A YouTube or Vimeo card loads the player from that site once you press play.",
  },
  {
    when: "You check for updates",
    what: "inkling asks GitHub whether a newer version exists. The request carries the app's version and nothing from your library.",
  },
];

const folders = [
  { system: "Windows", path: "%APPDATA%\\com.inkling.library" },
  { system: "macOS", path: "~/Library/Application Support/com.inkling.library" },
  { system: "Linux", path: "~/.config/com.inkling.library" },
];

const local = [
  "Reading the words in images and scanned PDFs",
  "Pulling a clean copy out of an article",
  "Understanding what a picture or a note is about, for search",
  "Every search you run",
];

function Privacy() {
  return (
    <main {...stylex.props(page.column, styles.main)}>
      <h1 {...stylex.props(type.display, styles.title)}>Your library stays with you.</h1>
      <p {...stylex.props(type.lede)}>
        inkling has no account, no server of its own and no analytics. What you save lives in one
        folder on your computer, and everything inkling does with it happens there too.
      </p>

      <section {...stylex.props(styles.section)}>
        <h2 {...stylex.props(type.heading)}>Where it lives</h2>
        <p {...stylex.props(type.body)}>
          One SQLite database, <code {...stylex.props(styles.code)}>library.sqlite3</code>, and an{" "}
          <code {...stylex.props(styles.code)}>assets</code> folder with the files you saved. You
          can export a full copy from Settings whenever you like, and open it in any SQLite tool.
        </p>
        <dl {...stylex.props(styles.paths)}>
          {folders.map(({ system, path }) => (
            <div key={system} {...stylex.props(styles.pathRow)}>
              <dt {...stylex.props(styles.pathSystem)}>{system}</dt>
              <dd {...stylex.props(styles.path)}>{path}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section {...stylex.props(styles.section)}>
        <h2 {...stylex.props(type.heading)}>What runs on your computer</h2>
        <p {...stylex.props(type.body)}>
          The text and image models ship inside the app. Nothing you save is sent anywhere to be
          processed.
        </p>
        <ul {...stylex.props(styles.list)}>
          {local.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section {...stylex.props(styles.section)}>
        <h2 {...stylex.props(type.heading)}>Every time it goes online</h2>
        <p {...stylex.props(type.body)}>This is the whole list.</p>
        <dl {...stylex.props(styles.online)}>
          {online.map(({ when, what }) => (
            <div key={when} {...stylex.props(styles.onlineRow)}>
              <dt {...stylex.props(type.subheading)}>{when}</dt>
              <dd {...stylex.props(type.body, styles.flush)}>{what}</dd>
            </div>
          ))}
        </dl>
        <p {...stylex.props(type.body)}>
          The Chrome extension sends the page address to inkling on your own computer and nowhere
          else.
        </p>
      </section>

      <section {...stylex.props(styles.section)}>
        <h2 {...stylex.props(type.heading)}>This website</h2>
        <p {...stylex.props(type.body)}>
          This site sets no cookies and runs no analytics. Downloads come from GitHub.
        </p>
      </section>
    </main>
  );
}

const styles = stylex.create({
  main: { display: "flex", flexDirection: "column", gap: "32px", paddingTop: "72px" },
  title: { maxWidth: "13ch" },
  section: {
    display: "flex",
    flexDirection: "column",
    gap: "18px",
    marginTop: "56px",
    maxWidth: "760px",
  },
  code: {
    paddingInline: "6px",
    paddingBlock: "2px",
    borderRadius: radius.control,
    backgroundColor: color.raised,
    color: color.inkStrong,
    fontFamily: font.mono,
    fontSize: "0.88em",
  },
  paths: { display: "flex", flexDirection: "column", margin: 0 },
  pathRow: {
    display: "grid",
    gridTemplateColumns: { default: "120px 1fr", "@media (max-width: 560px)": "1fr" },
    gap: "4px 16px",
    paddingBlock: "14px",
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: color.border,
  },
  pathSystem: { color: color.muted, fontSize: "15px" },
  path: {
    margin: 0,
    color: color.ink,
    fontFamily: font.mono,
    fontSize: "14px",
    overflowWrap: "anywhere",
  },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    margin: 0,
    paddingLeft: "20px",
    color: color.inkSoft,
    fontSize: "17px",
    lineHeight: 1.5,
  },
  online: { display: "flex", flexDirection: "column", gap: "28px", margin: 0 },
  onlineRow: { display: "flex", flexDirection: "column", gap: "8px" },
  flush: { marginLeft: 0 },
});
