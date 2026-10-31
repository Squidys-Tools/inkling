import { Archive01Icon, Settings01Icon, SidebarLeftIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import * as stylex from "@stylexjs/stylex";
import { cardColor, color, font, layout, motion } from "@inkling/ui/tokens.stylex";
import { useCaptureState } from "../capture/capture.ts";
import { chrome } from "../desktop.ts";
import { shownScope, useActiveTotal } from "../library/cards.ts";
import { search, useSearch } from "../library/search.ts";
import { useStore } from "../library/store.ts";
import { setSidebarOpen, useViewState } from "../libraryView/viewState.ts";
import { sidebarMarker } from "../markers.stylex.ts";
import { Mascot } from "../mascot/Mascot.tsx";
import { useMascotMood } from "../mascot/useMascotMood.ts";
import { AddMenu } from "./AddMenu.tsx";
import { NavLink } from "./NavRow.tsx";
import { SpacesSection } from "./SpacesSection.tsx";

// The Everything glyph: a 3x3 dot grid, which the icon set does not have.
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

// While search has focus the mascot leaves the header; its eyes show in the field.
function SidebarMascot({ open }: { open: boolean }) {
  const searchFocused = useViewState((view) => view.searchFocused);
  const query = useSearch((search) => search.query);
  const captureFailed = useCaptureState((capture) => capture.error !== null);
  const mood = useMascotMood({ searchFocused, query, captureFailed });
  return (
    <span {...stylex.props(styles.mascotSlot, searchFocused && styles.mascotAway)}>
      <Mascot mood={mood} size={44} visible={open && !searchFocused} />
    </span>
  );
}

/**
 * Wide windows keep the sidebar still under the library frame, which slides
 * over it; narrow ones slide the sidebar in over a scrim. Either way only a
 * transform moves.
 */
export function Sidebar({ open, narrow }: { open: boolean; narrow: boolean }) {
  const total = useActiveTotal();
  const shown = useStore(shownScope, (scope) => scope._tag);

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
        inert={!open}
        {...stylex.props(
          styles.sidebar,
          narrow && styles.narrow,
          !open && (narrow ? styles.narrowClosed : styles.wideClosed),
          sidebarMarker,
        )}
      >
        <div
          {...stylex.props(styles.brand, chrome.controls === "native-left" && styles.belowLights)}
        >
          <SidebarMascot open={open} />
          <span {...stylex.props(styles.wordmark)}>inkling</span>
          <button
            type="button"
            data-bench={open ? "sidebar-toggle" : undefined}
            aria-label="Close sidebar"
            title="Close sidebar"
            aria-expanded={open}
            aria-controls="library-navigation"
            onClick={() => setSidebarOpen(false)}
            {...stylex.props(styles.close)}
          >
            <HugeiconsIcon icon={SidebarLeftIcon} size={16} />
          </button>
        </div>

        <nav aria-label="Main navigation" {...stylex.props(styles.nav)}>
          <NavLink
            to="/"
            active={shown === "Active"}
            icon={<DotGrid />}
            label="Everything"
            count={total}
            onClick={() => search.clear()}
          />
        </nav>

        <SpacesSection />

        <div {...stylex.props(styles.footer)}>
          <AddMenu />
          <NavLink
            to="/archive"
            tone="footer"
            active={shown === "Archived"}
            icon={<HugeiconsIcon icon={Archive01Icon} size={15} />}
            label="Archive"
            onClick={() => search.clear()}
          />
          <NavLink
            to="/settings/$section"
            params={{ section: "general" }}
            tone="footer"
            icon={<HugeiconsIcon icon={Settings01Icon} size={15} />}
            label="Settings"
          />
        </div>
      </aside>
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
    gap: "22px",
    width: layout.sidebar,
    minHeight: 0,
    paddingTop: "26px",
    paddingInline: "10px",
    paddingBottom: "6px",
    overflow: "hidden",
    visibility: "visible",
    // Hidden only once the frame has covered it, so its controls leave the tab order.
    transitionProperty: "visibility",
    transitionDuration: "0s",
    transitionDelay: "0s",
  },
  wideClosed: {
    visibility: "hidden",
    transitionDelay: motion.layout,
  },
  narrow: {
    position: "fixed",
    zIndex: 30,
    width: "min(248px, calc(100vw - 42px))",
    backgroundColor: color.window,
    borderRightWidth: 1,
    borderRightStyle: "solid",
    borderRightColor: color.border,
    boxShadow: `16px 0 40px ${cardColor.sidebarShadow}`,
    transform: "none",
    transitionProperty: "transform",
    transitionDuration: motion.layout,
    transitionTimingFunction: motion.standard,
  },
  narrowClosed: { transform: "translateX(-102%)", boxShadow: "none" },
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
    marginBottom: "-8px",
    paddingLeft: "6px",
    paddingRight: "4px",
    WebkitAppRegion: "no-drag",
  },
  // macOS draws its traffic lights at the top left, so the brand sits below them.
  belowLights: { marginTop: "14px" },
  mascotSlot: {
    display: "block",
    width: "44px",
    height: "44px",
    flexShrink: 0,
    opacity: 1,
    transitionProperty: "opacity",
    transitionDuration: motion.mascot,
  },
  mascotAway: { opacity: 0 },
  wordmark: {
    marginLeft: "6px",
    fontFamily: font.quote,
    fontSize: "20px",
    lineHeight: 1,
    letterSpacing: "-0.04em",
    whiteSpace: "nowrap",
    color: color.ink,
    userSelect: "none",
  },
  close: {
    display: "grid",
    placeItems: "center",
    width: "30px",
    height: "30px",
    marginLeft: "auto",
    padding: 0,
    borderWidth: 0,
    borderRadius: "7px",
    backgroundColor: { default: "transparent", ":hover": color.surface },
    color: { default: color.muted, ":hover": color.ink },
    cursor: "pointer",
    opacity: {
      default: 0,
      [stylex.when.ancestor(":hover", sidebarMarker)]: 1,
      [stylex.when.ancestor(":focus-within", sidebarMarker)]: 1,
      "@media (max-width: 780px)": 1,
    },
    transitionProperty: "opacity",
    transitionDuration: motion.layout,
    outline: { default: "none", ":focus-visible": `2px solid ${color.accent}` },
  },
  nav: { display: "grid", gap: "2px" },
  footer: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr)",
    gap: "2px",
    marginTop: "auto",
    flexShrink: 0,
  },
});
