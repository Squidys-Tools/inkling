import { Dialog } from "@base-ui/react/dialog";
import { HugeiconsIcon } from "@hugeicons/react";
import * as stylex from "@stylexjs/stylex";
import { color, font, motion, radius, space, text } from "@inkling/ui/tokens.stylex";
import { useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { desktop } from "../desktop.ts";
import { setSettingsSheetOpen, useViewState } from "../libraryView/viewState.ts";
import { ExtensionPanel } from "./ExtensionPanel.tsx";
import { GeneralPanel } from "./GeneralPanel.tsx";
import { LibraryPanel } from "./LibraryPanel.tsx";
import { LicensesPanel } from "./LicensesPanel.tsx";
import { railSections, type SettingsSection } from "./sections.ts";
import { UpdatesPanel } from "./UpdatesPanel.tsx";

function useAppVersion(open: boolean) {
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => {
    if (!open || version !== null) return;
    let current = true;
    desktop?.appVersion().then(
      (value) => current && setVersion(value),
      () => undefined,
    );
    return () => {
      current = false;
    };
  }, [open, version]);
  return version;
}

/**
 * Settings as a sheet over the library. It owns focus, Escape and the scrim
 * until it closes, and every open lands on General.
 */
export function SettingsSheet() {
  const open = useViewState((state) => state.settingsSheetOpen);
  const version = useAppVersion(open);
  const router = useRouter();
  const [section, setSection] = useState<SettingsSection>("general");
  // Panels' × reaches the store directly, so reset here as well as onOpenChange.
  const close = () => {
    setSettingsSheetOpen(false);
    setSection("general");
  };
  const selected = section === "licenses" ? "general" : section;

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        setSettingsSheetOpen(next);
        if (!next) setSection("general");
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop {...stylex.props(styles.backdrop)} />
        <Dialog.Popup
          id="settings-sheet"
          aria-labelledby="settings-sheet-title"
          {...stylex.props(styles.sheet)}
        >
          <aside aria-label="Settings sections" {...stylex.props(styles.rail)}>
            <h1 id="settings-sheet-title" {...stylex.props(styles.heading)}>
              Settings
            </h1>
            <nav>
              <ul {...stylex.props(styles.tabs)}>
                {railSections.map(({ id, label, icon }) => (
                  <li key={id}>
                    <button
                      type="button"
                      aria-current={id === selected ? "page" : undefined}
                      onClick={() => setSection(id)}
                      {...stylex.props(styles.tab, id === selected && styles.tabSelected)}
                    >
                      <span
                        {...stylex.props(styles.tabIcon, id === selected && styles.tabIconSelected)}
                      >
                        <HugeiconsIcon icon={icon} size={15} />
                      </span>
                      {label}
                    </button>
                  </li>
                ))}
              </ul>
            </nav>
            {version && <p {...stylex.props(styles.version)}>inkling {version}</p>}
          </aside>
          {section === "general" && (
            <GeneralPanel
              onShowLicenses={() => setSection("licenses")}
              onShowWelcome={() => {
                close();
                void router.navigate({ to: "/welcome" });
              }}
              onClose={close}
            />
          )}
          {section === "licenses" && (
            <LicensesPanel onBack={() => setSection("general")} onClose={close} />
          )}
          {section === "library" && <LibraryPanel onClose={close} />}
          {section === "extension" && <ExtensionPanel onClose={close} />}
          {section === "updates" && <UpdatesPanel onClose={close} />}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

const narrow = "@media (max-width: 700px)";

const styles = stylex.create({
  backdrop: {
    position: "fixed",
    inset: 0,
    zIndex: 70,
    backgroundColor: color.modalScrim,
    opacity: { default: 1, "[data-starting-style]": 0, "[data-ending-style]": 0 },
    transitionProperty: "opacity",
    transitionDuration: motion.micro,
    transitionTimingFunction: motion.enter,
  },
  sheet: {
    position: "fixed",
    inset: 0,
    margin: "auto",
    zIndex: 71,
    boxSizing: "border-box",
    display: "flex",
    flexDirection: { default: "row", [narrow]: "column" },
    width: {
      default: "min(1080px, calc(100vw - clamp(32px, 6vw, 96px)))",
      [narrow]: "calc(100vw - 24px)",
    },
    height: {
      default: "min(640px, calc(100vh - clamp(32px, 8vh, 80px)))",
      [narrow]: "min(720px, calc(100vh - 24px))",
    },
    overflow: "hidden",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: color.border,
    borderRadius: { default: radius.overlay, [narrow]: "18px" },
    backgroundColor: color.app,
    color: color.ink,
    boxShadow: `0 30px 80px ${color.shadow}`,
    outline: "none",
    opacity: { default: 1, "[data-starting-style]": 0, "[data-ending-style]": 0 },
    transform: {
      default: "translateY(0) scale(1)",
      "[data-starting-style]": "translateY(10px) scale(0.98)",
      "[data-ending-style]": "translateY(8px) scale(0.98)",
    },
    transitionProperty: "opacity, transform",
    transitionDuration: motion.layout,
    transitionTimingFunction: motion.enter,
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
    width: "100%",
    height: "32px",
    paddingInline: "10px",
    borderWidth: 0,
    borderRadius: radius.control,
    backgroundColor: "transparent",
    fontFamily: font.body,
    fontSize: "14px",
    lineHeight: "18px",
    textAlign: "left",
    color: { default: color.inkSoft, ":hover": color.ink },
    cursor: "pointer",
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
