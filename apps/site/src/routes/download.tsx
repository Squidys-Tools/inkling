import * as stylex from "@stylexjs/stylex";
import { color, font, radius } from "@inkling/ui/tokens.stylex";
import { createFileRoute } from "@tanstack/react-router";
import release from "virtual:latest-release";
import { extensionGuide, latestRelease } from "../layout/links.ts";
import { page } from "../layout/page.ts";
import { usePlatform } from "../parts/platform.ts";
import { action, type } from "../parts/type.ts";

export const Route = createFileRoute("/download")({
  head: () => ({ meta: [{ title: "Download inkling" }] }),
  component: Download,
});

type System = {
  platform: "win32" | "darwin" | "linux";
  name: string;
  files: { label: string; href: string | null | undefined }[];
  notes: string[];
};

const systems: System[] = [
  {
    platform: "win32",
    name: "Windows",
    files: [{ label: "Installer (.exe)", href: release?.windows }],
    notes: [
      "The installer is not code-signed yet, so SmartScreen may warn you. Choose More info, then Run anyway.",
      "inkling checks for updates only when you ask it to, and installs them only when you say so.",
    ],
  },
  {
    platform: "darwin",
    name: "macOS",
    files: [{ label: "Apple silicon (.dmg)", href: release?.mac }],
    notes: [
      "Intel Macs are not supported: the search models have no Intel build.",
      "The app has no Apple developer signature yet. The first time you open it, macOS blocks it; go to System Settings, Privacy & Security, and choose Open Anyway.",
      "Updates on macOS are manual for now: download the new disk image.",
    ],
  },
  {
    platform: "linux",
    name: "Linux",
    files: [
      { label: "Debian and Ubuntu (.deb)", href: release?.deb },
      { label: "AppImage", href: release?.appImage },
    ],
    notes: [
      "Install the .deb with apt, so it brings along the ffmpeg and python3 it needs.",
      "Updates to the .deb ask for your password through PolicyKit before they install.",
    ],
  },
];

function Download() {
  const platform = usePlatform();
  const ordered = platform
    ? [...systems].sort((a, b) => Number(b.platform === platform) - Number(a.platform === platform))
    : systems;
  return (
    <main {...stylex.props(page.column, styles.main)}>
      <h1 {...stylex.props(type.display, styles.title)}>Download inkling</h1>
      <p {...stylex.props(type.lede)}>
        {release ? `Version ${release.version}. ` : ""}Free, with nothing to sign up for. The search
        models come inside the app, so it works offline from the first launch.
      </p>
      <div {...stylex.props(styles.systems)}>
        {ordered.map((system) => (
          <section
            key={system.platform}
            aria-labelledby={`system-${system.platform}`}
            {...stylex.props(styles.system, system.platform === platform && styles.yours)}
          >
            <h2 id={`system-${system.platform}`} {...stylex.props(type.subheading)}>
              {system.name}
              {system.platform === platform && (
                <span {...stylex.props(styles.yoursLabel)}>Your system</span>
              )}
            </h2>
            <div {...stylex.props(styles.files)}>
              {system.files.map((file, index) => (
                <a
                  key={file.label}
                  href={file.href ?? latestRelease}
                  {...stylex.props(index === 0 ? action.primary : action.secondary)}
                >
                  {file.label}
                </a>
              ))}
            </div>
            <ul {...stylex.props(styles.notes)}>
              {system.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <section {...stylex.props(styles.extension)}>
        <h2 {...stylex.props(type.subheading)}>Save from Chrome</h2>
        <p {...stylex.props(type.body)}>
          The companion extension saves the page you are on, or a link you right-click, straight
          into inkling. It is not in the Chrome Web Store yet;{" "}
          <a href={extensionGuide} {...stylex.props(action.inline)}>
            load it from the source
          </a>
          . It talks only to inkling on your own computer.
        </p>
      </section>
      <p {...stylex.props(type.small)}>
        Older versions and checksums are on{" "}
        <a href={latestRelease} {...stylex.props(action.inline)}>
          the release page
        </a>
        .
      </p>
    </main>
  );
}

const styles = stylex.create({
  main: { display: "flex", flexDirection: "column", gap: "32px", paddingTop: "72px" },
  title: { maxWidth: "14ch" },
  systems: {
    display: "grid",
    gridTemplateColumns: {
      default: "repeat(3, minmax(0, 1fr))",
      "@media (max-width: 900px)": "1fr",
    },
    gap: "16px",
    marginTop: "24px",
  },
  system: {
    display: "flex",
    flexDirection: "column",
    gap: "20px",
    padding: "28px",
    borderRadius: radius.card,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: color.border,
    backgroundColor: color.sunken,
  },
  yours: { borderColor: color.borderStrong, backgroundColor: color.surface },
  yoursLabel: {
    marginLeft: "10px",
    color: color.accentStrong,
    fontFamily: font.body,
    fontSize: "13px",
    fontWeight: 500,
    letterSpacing: 0,
  },
  files: { display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "10px" },
  notes: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    margin: 0,
    paddingLeft: "18px",
    color: color.muted,
    fontSize: "14px",
    lineHeight: 1.55,
  },
  extension: { display: "flex", flexDirection: "column", gap: "12px", marginTop: "24px" },
});
