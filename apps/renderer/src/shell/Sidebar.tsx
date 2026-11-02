import {
  Archive01Icon,
  Loading01Icon,
  RotateCwIcon,
  Settings01Icon,
  SidebarLeftIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useLayoutEffect, useRef } from "react";
import * as stylex from "@stylexjs/stylex";
import { cardColor, color, font, motion, radius } from "@inkling/ui/tokens.stylex";
import { useCaptureState } from "../capture/capture.ts";
import { chrome } from "../desktop.ts";
import { shownScope, useActiveTotal } from "../library/cards.ts";
import { search, useSearch } from "../library/search.ts";
import { useStore } from "../library/store.ts";
import { setSidebarOpen } from "../libraryView/viewState.ts";
import { Mascot } from "../mascot/Mascot.tsx";
import { useMascotMood } from "../mascot/useMascotMood.ts";
import { useAppearance } from "../settings/appearance.ts";
import { useAppUpdate } from "../settings/useAppUpdate.ts";
import { AddMenu } from "./AddMenu.tsx";
import { NavButton, NavLink } from "./NavRow.tsx";
import { sidebarCompact, sidebarExpanded } from "./sidebarGeometry.ts";
import { SpacesSection } from "./SpacesSection.tsx";

// Keep the shipped nine-dot Everything glyph unchanged.
function DotGrid() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
      {[5, 12, 19].flatMap((cy) =>
        [5, 12, 19].map((cx) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="2.2" fill="currentColor" />
        )),
      )}
    </svg>
  );
}

function SidebarMascot() {
  const query = useSearch((state) => state.query);
  const captureFailed = useCaptureState((state) => state.error !== null);
  // Codex keeps the mascot as the compact rail's way back, even during search.
  const mood = useMascotMood({ searchFocused: false, query, captureFailed });
  return <Mascot mood={mood} size={44} visible />;
}

function UpdateRow({ compact }: { compact: boolean }) {
  const { navRow, runNavRow } = useAppUpdate({ start: false });
  if (!navRow) return null;
  return (
    <NavButton
      compact={compact}
      tone="update"
      icon={<HugeiconsIcon icon={navRow.busy ? Loading01Icon : RotateCwIcon} size={15} />}
      label={navRow.label}
      description={navRow.description}
      disabled={navRow.busy}
      onClick={() => void runNavRow()}
    />
  );
}

/** Codex is the only sidebar: full navigation or a persistent, usable compact rail. */
export function Sidebar({
  open,
  visualOpen = open,
  narrow,
}: {
  open: boolean;
  visualOpen?: boolean;
  narrow: boolean;
}) {
  const total = useActiveTotal();
  const shown = useStore(shownScope, (scope) => scope._tag);
  const appearance = useAppearance();
  const compact = !visualOpen;
  const edge = appearance.sidebarToggle === "edge";
  const width = visualOpen ? sidebarExpanded : sidebarCompact;
  const reopenButton = useRef<HTMLButtonElement>(null);
  const returnToggleFocus = useRef(false);
  const toggle = () => {
    returnToggleFocus.current = true;
    setSidebarOpen(!open);
  };
  useLayoutEffect(() => {
    if (!returnToggleFocus.current || visualOpen !== open) return;
    returnToggleFocus.current = false;
    if (reopenButton.current?.getAttribute("aria-expanded") === String(open))
      reopenButton.current.focus({ preventScroll: true });
  }, [open, visualOpen]);
  return (
    <>
      {narrow && open && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setSidebarOpen(false)}
          {...stylex.props(styles.scrim)}
        />
      )}
      <aside
        id="library-navigation"
        aria-label="Library"
        data-collapsed={compact}
        {...stylex.props(
          styles.sidebar,
          styles.width(width),
          narrow && styles.narrow,
          chrome.controls === "custom-right" && styles.unifiedHeader,
          chrome.controls === "native-left" && styles.belowLights,
        )}
      >
        <div {...stylex.props(styles.brand)}>
          {compact ? (
            <button
              type="button"
              ref={edge ? undefined : reopenButton}
              aria-label="Open sidebar"
              title="Open sidebar"
              data-bench={edge ? undefined : "sidebar-toggle"}
              aria-expanded={false}
              aria-controls="library-navigation"
              onClick={toggle}
              {...stylex.props(styles.mascotButton)}
            >
              <SidebarMascot />
            </button>
          ) : (
            <span {...stylex.props(styles.mascotButton)}>
              <SidebarMascot />
            </span>
          )}
          {!compact && (
            <>
              <span data-sidebar-label {...stylex.props(styles.wordmark)}>
                inkling
              </span>
              {!edge && (
                <button
                  type="button"
                  ref={reopenButton}
                  aria-label="Close sidebar"
                  title="Close sidebar"
                  data-bench="sidebar-toggle"
                  aria-expanded={open}
                  aria-controls="library-navigation"
                  onClick={toggle}
                  {...stylex.props(styles.close)}
                >
                  <HugeiconsIcon icon={SidebarLeftIcon} size={16} />
                </button>
              )}
            </>
          )}
        </div>
        <nav aria-label="Main navigation" {...stylex.props(styles.rows)}>
          <NavLink
            to="/"
            compact={compact}
            active={shown === "Active"}
            icon={<DotGrid />}
            label="Everything"
            count={total}
            onClick={() => search.clear()}
          />
        </nav>
        <SpacesSection compact={compact} onExpand={() => setSidebarOpen(true)} />
        <div {...stylex.props(styles.footer)}>
          <AddMenu compact={compact} />
          <UpdateRow compact={compact} />
          <NavLink
            to="/archive"
            tone="footer"
            compact={compact}
            active={shown === "Archived"}
            icon={<HugeiconsIcon icon={Archive01Icon} size={15} />}
            label="Archive"
            onClick={() => search.clear()}
          />
          <NavLink
            to="/settings/$section"
            params={{ section: "general" }}
            tone="footer"
            compact={compact}
            icon={<HugeiconsIcon icon={Settings01Icon} size={15} />}
            label="Settings"
          />
        </div>
      </aside>
      {edge && (
        <button
          type="button"
          ref={reopenButton}
          aria-label={open ? "Close sidebar" : "Open sidebar"}
          title={open ? "Close sidebar" : "Open sidebar"}
          aria-expanded={open}
          aria-controls="library-navigation"
          data-bench="sidebar-toggle"
          onClick={toggle}
          {...stylex.props(
            styles.grip,
            styles.gripInset((open ? sidebarExpanded : sidebarCompact) - 6),
          )}
        >
          <span {...stylex.props(styles.gripLine)} aria-hidden="true" />
        </button>
      )}
    </>
  );
}

const styles = stylex.create({
  sidebar: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    zIndex: 0,
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    gap: "14px",
    minHeight: 0,
    paddingTop: "32px",
    backgroundColor: color.surface,
    paddingInline: "8px",
    paddingBottom: "10px",
    borderTopRightRadius: radius.panel,
    borderBottomRightRadius: radius.panel,
    overflow: "hidden",
    // Fade labels before the moving frame can crop them, and reveal them only as it clears.
    transitionProperty: "opacity",
    transitionDuration: `calc(${motion.micro} / 2)`,
    transitionTimingFunction: motion.enter,
    // The main frame reveals this panel; never animate sidebar layout width.
  },
  // Only the right edge floats; leave the same 8px gap in expanded and compact modes.
  width: (width: number) => ({ width: width - 8 }),
  unifiedHeader: { paddingTop: "8px" },
  belowLights: { top: "32px", paddingTop: "8px" },
  narrow: { position: "fixed", zIndex: 30, backgroundColor: color.window },
  scrim: {
    position: "fixed",
    inset: 0,
    zIndex: 25,
    width: "100%",
    height: "100%",
    padding: 0,
    borderWidth: 0,
    backgroundColor: cardColor.sidebarScrim,
    cursor: "pointer",
  },
  brand: {
    display: "flex",
    alignItems: "center",
    flexShrink: 0,
    height: "44px",
    paddingInline: "4px",
    marginBottom: "-8px",
    WebkitAppRegion: "drag",
  },
  mascotButton: {
    WebkitAppRegion: "no-drag",
    display: "block",
    width: "44px",
    height: "44px",
    flexShrink: 0,
    padding: 0,
    borderWidth: 0,
    borderRadius: radius.control,
    backgroundColor: "transparent",
    cursor: "pointer",
    outline: { default: "none", ":focus-visible": `2px solid ${color.accent}` },
    outlineOffset: "-2px",
  },
  wordmark: {
    marginLeft: "-4px",
    fontFamily: font.quote,
    fontSize: "20px",
    lineHeight: 1,
    letterSpacing: "-0.04em",
    whiteSpace: "nowrap",
    color: color.ink,
    userSelect: "none",
  },
  close: {
    WebkitAppRegion: "no-drag",
    display: "grid",
    placeItems: "center",
    width: "30px",
    height: "30px",
    marginLeft: "auto",
    flexShrink: 0,
    padding: 0,
    borderWidth: 0,
    borderRadius: radius.control,
    backgroundColor: { default: "transparent", ":hover": color.surface },
    color: { default: color.muted, ":hover": color.ink },
    cursor: "pointer",
    outline: { default: "none", ":focus-visible": `2px solid ${color.accent}` },
  },
  rows: { display: "grid", gap: "2px" },
  footer: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr)",
    gap: "2px",
    marginTop: "auto",
    flexShrink: 0,
  },
  grip: {
    position: "absolute",
    top: "80px",
    bottom: "24px",
    zIndex: 31,
    width: "12px",
    padding: 0,
    display: "grid",
    placeItems: "center",
    borderWidth: 0,
    backgroundColor: "transparent",
    cursor: "pointer",
    outline: { default: "none", ":focus-visible": `2px solid ${color.accent}` },
    left: 0,
    transitionProperty: "transform",
    transitionDuration: motion.layout,
    transitionTimingFunction: motion.enter,
  },
  gripInset: (left: number) => ({ transform: `translateX(${left}px)` }),
  gripLine: {
    display: "block",
    width: "3px",
    height: "36px",
    borderRadius: radius.round,
    backgroundColor: color.borderStrong,
  },
});
