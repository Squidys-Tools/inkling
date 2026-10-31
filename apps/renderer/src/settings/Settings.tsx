import { HugeiconsIcon } from "@hugeicons/react";
import * as stylex from "@stylexjs/stylex";
import { color, font, motion, radius, space, text } from "@inkling/ui/tokens.stylex";
import { Link, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { desktop } from "../desktop.ts";
import { useEscape } from "../item/useEscape.ts";
import { ExtensionPanel } from "./ExtensionPanel.tsx";
import { GeneralPanel } from "./GeneralPanel.tsx";
import { LibraryPanel } from "./LibraryPanel.tsx";
import { LicensesPanel } from "./LicensesPanel.tsx";
import { railSections, type SettingsSection } from "./sections.ts";
import { UpdatesPanel } from "./UpdatesPanel.tsx";

function useAppVersion() {
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => {
    let current = true;
    desktop?.appVersion().then(
      (value) => current && setVersion(value),
      () => undefined,
    );
    return () => {
      current = false;
    };
  }, []);
  return version;
}

/**
 * Settings as a page over the library. Moving between sections replaces the
 * history entry, so closing (or Back) returns to wherever Settings opened from.
 */
export function Settings({ section }: { section: SettingsSection }) {
  const router = useRouter();
  const version = useAppVersion();
  const page = useRef<HTMLDivElement>(null);
  // Focus moves into Settings, without a ring, and back to what had it on close.
  useEffect(() => {
    const previous = document.activeElement;
    page.current?.focus({ preventScroll: true });
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus({ preventScroll: true });
    };
  }, []);
  const close = () => {
    if (router.history.canGoBack()) router.history.back();
    else void router.navigate({ to: "/" });
  };
  const show = (next: SettingsSection) =>
    void router.navigate({ to: "/settings/$section", params: { section: next }, replace: true });
  useEscape(close);
  const selected = section === "licenses" ? "general" : section;

  return (
    <div ref={page} tabIndex={-1} {...stylex.props(styles.page)}>
      <aside aria-label="Settings sections" {...stylex.props(styles.rail)}>
        <h1 {...stylex.props(styles.heading)}>Settings</h1>
        <nav>
          <ul {...stylex.props(styles.tabs)}>
            {railSections.map(({ id, label, icon }) => (
              <li key={id}>
                <Link
                  to="/settings/$section"
                  params={{ section: id }}
                  replace
                  aria-current={id === selected ? "page" : undefined}
                  {...stylex.props(styles.tab, id === selected && styles.tabSelected)}
                >
                  <span
                    {...stylex.props(styles.tabIcon, id === selected && styles.tabIconSelected)}
                  >
                    <HugeiconsIcon icon={icon} size={15} />
                  </span>
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        {version && <p {...stylex.props(styles.version)}>inkling {version}</p>}
      </aside>
      {section === "general" && (
        <GeneralPanel
          onShowLicenses={() => show("licenses")}
          onShowWelcome={() => void router.navigate({ to: "/welcome" })}
          onClose={close}
        />
      )}
      {section === "licenses" && <LicensesPanel onBack={() => show("general")} onClose={close} />}
      {section === "library" && <LibraryPanel onClose={close} />}
      {section === "extension" && <ExtensionPanel onClose={close} />}
      {section === "updates" && <UpdatesPanel onClose={close} />}
    </div>
  );
}

const narrow = "@media (max-width: 700px)";

const styles = stylex.create({
  page: {
    outline: "none",
    position: "absolute",
    inset: 0,
    display: "flex",
    flexDirection: { default: "row", [narrow]: "column" },
    backgroundColor: color.app,
    color: color.ink,
  },
  rail: {
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
    width: { default: "232px", [narrow]: "auto" },
    minHeight: 0,
    paddingTop: { default: "22px", [narrow]: "14px" },
    paddingInline: { default: space.s3, [narrow]: "14px" },
    paddingBottom: { default: "18px", [narrow]: space.s3 },
  },
  heading: {
    margin: 0,
    paddingTop: space.s1,
    paddingInline: "10px",
    paddingBottom: { default: "18px", [narrow]: space.s3 },
    fontFamily: font.display,
    fontSize: text.lg,
    lineHeight: "20px",
    fontWeight: 600,
    color: color.ink,
  },
  tabs: {
    display: "flex",
    flexDirection: { default: "column", [narrow]: "row" },
    flexWrap: "wrap",
    gap: "2px",
    margin: 0,
    padding: 0,
    listStyle: "none",
  },
  tab: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    height: "32px",
    paddingInline: "10px",
    borderRadius: radius.control,
    fontFamily: font.body,
    fontSize: "14px",
    lineHeight: "18px",
    color: { default: color.inkSoft, ":hover": color.ink },
    textDecoration: "none",
    transitionProperty: "color",
    transitionDuration: motion.micro,
    outline: { default: "none", ":focus-visible": `2px solid ${color.accent}` },
  },
  tabSelected: { fontWeight: 500, color: color.ink },
  tabIcon: { display: "inline-flex", flexShrink: 0, color: color.muted },
  tabIconSelected: { color: color.ink },
  version: {
    marginTop: "auto",
    marginBottom: 0,
    paddingInline: "10px",
    fontFamily: font.mono,
    fontSize: text.xs,
    lineHeight: "14px",
    color: color.faint,
    display: { default: "block", [narrow]: "none" },
  },
});
