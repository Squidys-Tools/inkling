import Archive01Icon from "@hugeicons/core-free-icons/Archive01Icon";
import Settings01Icon from "@hugeicons/core-free-icons/Settings01Icon";
import SidebarLeftIcon from "@hugeicons/core-free-icons/SidebarLeftIcon";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useSearch as useRouteSearch } from "@tanstack/react-router";
import { type ReactNode, useLayoutEffect, useRef } from "react";
import * as stylex from "@stylexjs/stylex";
import { cardColor, color, font, motion, radius } from "@inkling/ui/tokens.stylex";
import { useCaptureState } from "../capture/capture.ts";
import { chrome } from "../desktop.ts";
import { assetUrl } from "../library/assets.ts";
import { shownScope, useActiveTotal, useScopeThumbs } from "../library/cards.ts";
import { activeScope } from "../library/scope.ts";
import { search, useSearch } from "../library/search.ts";
import { useSelector } from "@tanstack/react-store";
import { setSidebarOpen } from "../libraryView/viewState.ts";
import { Mascot } from "../mascot/Mascot.tsx";
import { useMascotMood } from "../mascot/useMascotMood.ts";
import { libraryQuery } from "../queryClient.ts";
import { useAppearance } from "../settings/appearance.ts";
import { AddMenu } from "./AddMenu.tsx";
import { IndexingRing } from "./IndexingRing.tsx";
import { NavButton, NavLink } from "./NavRow.tsx";
import { sidebarCompact, sidebarExpanded } from "./sidebarGeometry.ts";
import { SpacesSection } from "./SpacesSection.tsx";
import { UpdateRow } from "./UpdateRow.tsx";
import { useSelectionPill } from "./useSelectionPill.ts";

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

const useSearchIndexing = () =>
  useQuery(
    libraryQuery(
      ["searchIndexing"],
      async (client) => (await client.status({})).searchIndexing,
      (change) => change._tag === "SearchIndexReady",
    ),
  ).data === true;

function SidebarMascot() {
  const query = useSearch((state) => state.query);
  const captureFailed = useCaptureState((state) => state.error !== null);
  // The mascot stays as the compact rail's way back, even during search.
  const mood = useMascotMood({ searchFocused: false, query, captureFailed });
  return <Mascot mood={mood} size={44} visible />;
}

/** Strip's Everything: the library's newest pictures over its name and count. */
function StripEverything({ active, count }: { active: boolean; count: ReactNode }) {
  const thumbs = useScopeThumbs(activeScope, 4);
  const urls = thumbs ? thumbs.split("\n").flatMap((path) => assetUrl(path) ?? []) : [];
  return (
    <Link
      to="/"
      draggable={false}
      onClick={() => search.clear()}
      aria-current={active ? "page" : undefined}
      {...stylex.props(styles.hero, active && styles.heroActive)}
    >
      {urls.length > 0 && (
        <span aria-hidden="true" {...stylex.props(styles.strip)}>
          {urls.map((url) => (
            <img
              key={url}
              src={url}
              alt=""
              draggable={false}
              decoding="async"
              {...stylex.props(styles.stripImage)}
            />
          ))}
        </span>
      )}
      <span {...stylex.props(styles.heroText)}>
        <span data-sidebar-label>Everything</span>
        <span data-sidebar-label {...stylex.props(styles.heroCount)}>
          {typeof count === "number" ? count.toLocaleString() : count}
        </span>
      </span>
    </Link>
  );
}

export function Sidebar({
  open,
  visualOpen,
  narrow,
}: {
  open: boolean;
  visualOpen: boolean;
  narrow: boolean;
}) {
  const total = useActiveTotal();
  const shown = useSelector(shownScope, (scope) => scope._tag);
  const navigate = useNavigate();
  const settingsOpen = useRouteSearch({
    from: "__root__",
    select: (search) => search.settings !== undefined,
  });

  const compact = !visualOpen;
  // The compact rail is one design; Strip is a look of the expanded sidebar.
  const strip = useAppearance().sidebar === "strip" && !compact;
  const [track, pill] = useSelectionPill();
  const openSettings = () =>
    void navigate({ to: ".", search: (prev) => ({ ...prev, settings: "general" }) });
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
  const indexing = useSearchIndexing();
  const indexingRing = <IndexingRing label="Updating search for this version" />;
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
              ref={reopenButton}
              aria-label="Open sidebar"
              title="Open sidebar"
              data-bench="sidebar-toggle"
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
              <button
                type="button"
                ref={reopenButton}
                aria-label="Close sidebar"
                title="Close sidebar"
                data-sidebar-label
                data-bench="sidebar-toggle"
                aria-expanded={open}
                aria-controls="library-navigation"
                onClick={toggle}
                {...stylex.props(styles.close)}
              >
                <HugeiconsIcon icon={SidebarLeftIcon} size={16} />
              </button>
            </>
          )}
        </div>
        <div ref={track} {...stylex.props(styles.track, strip && styles.stripTrack)}>
          <span ref={pill} aria-hidden="true" {...stylex.props(styles.pill)} />
          <nav aria-label="Main navigation" {...stylex.props(styles.rows)}>
            {strip ? (
              <StripEverything
                active={shown === "Active"}
                count={indexing ? indexingRing : total}
              />
            ) : (
              <NavLink
                to="/"
                compact={compact}
                active={shown === "Active"}
                slides
                icon={compact && indexing ? indexingRing : <DotGrid />}
                label="Everything"
                count={indexing ? indexingRing : total}
                onClick={() => search.clear()}
              />
            )}
          </nav>
          <SpacesSection compact={compact} strip={strip} onExpand={() => setSidebarOpen(true)} />
        </div>
        {strip ? (
          <div {...stylex.props(styles.footer, styles.stripFooter)}>
            <UpdateRow compact={false} />
            <div {...stylex.props(styles.stripRow)}>
              <AddMenu compact={false} beside={92} />
              <Link
                to="/archive"
                draggable={false}
                data-sidebar-label
                aria-label="Archive"
                title="Archive"
                aria-current={shown === "Archived" ? "page" : undefined}
                onClick={() => search.clear()}
                {...stylex.props(styles.square, shown === "Archived" && styles.squareActive)}
              >
                <HugeiconsIcon icon={Archive01Icon} size={16} />
              </Link>
              <button
                type="button"
                data-sidebar-label
                aria-label="Settings"
                title="Settings"
                aria-expanded={settingsOpen}
                aria-controls="settings-sheet"
                onClick={openSettings}
                {...stylex.props(styles.square, settingsOpen && styles.squareActive)}
              >
                <HugeiconsIcon icon={Settings01Icon} size={16} />
              </button>
            </div>
          </div>
        ) : (
          <div {...stylex.props(styles.footer)}>
            <AddMenu compact={compact} />
            <UpdateRow compact={compact} />
            <div {...stylex.props(styles.lastRow, compact && styles.lastRowCompact)}>
              <NavLink
                to="/archive"
                tone="footer"
                compact={compact}
                active={shown === "Archived"}
                icon={<HugeiconsIcon icon={Archive01Icon} size={15} />}
                label="Archive"
                onClick={() => search.clear()}
              />
              {/* Expanded, Settings is the gear ending the Archive row, and fades with the labels. */}
              <div
                data-sidebar-label={compact ? undefined : ""}
                {...stylex.props(!compact && styles.gear)}
              >
                <NavButton
                  tone="footer"
                  active={settingsOpen}
                  expanded={settingsOpen}
                  controls="settings-sheet"
                  compact
                  icon={<HugeiconsIcon icon={Settings01Icon} size={15} />}
                  label="Settings"
                  onClick={openSettings}
                />
              </div>
            </div>
          </div>
        )}
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
    gap: "14px",
    minHeight: 0,
    paddingTop: "32px",
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
    backgroundColor: { default: "transparent", ":hover": color.overlayHover },
    color: { default: color.muted, ":hover": color.ink },
    cursor: "pointer",
    transform: { default: "none", ":active": "scale(0.94)" },
    transitionProperty: "color, background-color, transform",
    transitionDuration: motion.micro,
    transitionTimingFunction: motion.enter,
    outline: { default: "none", ":focus-visible": `2px solid ${color.accent}` },
  },
  // Everything and the Spaces share one selection, so they share the pill's positioning box.
  track: {
    position: "relative",
    zIndex: 0,
    display: "flex",
    flexDirection: "column",
    gap: "14px",
    minHeight: 0,
  },
  stripTrack: { gap: "10px" },
  // Under the rows: z-index -1 inside the track's own stacking context.
  pill: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: -1,
    height: "32px",
    borderRadius: radius.control,
    backgroundColor: color.overlayActive,
    opacity: 0,
    pointerEvents: "none",
    transitionProperty: "transform, opacity",
    transitionDuration: motion.reveal,
    transitionTimingFunction: motion.enter,
    "::before": {
      content: '""',
      position: "absolute",
      left: 0,
      top: "calc(50% - 7px)",
      width: "3px",
      height: "14px",
      borderRadius: radius.round,
      backgroundColor: color.accent,
    },
  },
  rows: { display: "grid", gap: "2px", flexShrink: 0 },
  hero: {
    display: "grid",
    gap: "8px",
    padding: "6px",
    paddingBottom: "8px",
    borderRadius: radius.panel,
    backgroundColor: { default: color.raised, ":hover": color.hover },
    color: color.inkSoft,
    fontSize: "14px",
    lineHeight: "18px",
    textDecoration: "none",
    cursor: "pointer",
    transform: { default: "none", ":active": "scale(0.985)" },
    transitionProperty: "background-color, transform",
    transitionDuration: motion.micro,
    transitionTimingFunction: motion.enter,
    outline: { default: "none", ":focus-visible": `2px solid ${color.accent}` },
  },
  heroActive: {
    fontWeight: 600,
    backgroundColor: { default: color.hover, ":hover": color.hover },
    boxShadow: `inset 0 0 0 1px ${color.borderStrong}`,
    color: color.inkStrong,
  },
  strip: {
    display: "grid",
    gridAutoFlow: "column",
    gridAutoColumns: "minmax(0, 1fr)",
    gap: "3px",
    height: "58px",
    borderRadius: "9px",
    overflow: "hidden",
  },
  stripImage: { display: "block", width: "100%", height: "58px", objectFit: "cover" },
  heroText: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "10px",
    minHeight: "18px",
    paddingInline: "6px",
    whiteSpace: "nowrap",
  },
  heroCount: {
    fontFamily: font.mono,
    fontSize: "12px",
    lineHeight: "16px",
    fontWeight: 400,
    color: color.muted,
  },
  footer: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr)",
    gap: "2px",
    marginTop: "auto",
    flexShrink: 0,
    paddingTop: "10px",
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: color.border,
  },
  stripFooter: { gap: "8px", paddingTop: "6px", borderTopWidth: 0 },
  stripRow: { display: "flex", alignItems: "center", gap: "6px", minWidth: 0 },
  square: {
    display: "grid",
    placeItems: "center",
    width: "40px",
    height: "40px",
    flexShrink: 0,
    padding: 0,
    borderWidth: 0,
    borderRadius: radius.tile,
    backgroundColor: { default: color.raised, ":hover": color.hover },
    color: { default: color.muted, ":hover": color.ink },
    cursor: "pointer",
    transform: { default: "none", ":active": "scale(0.94)" },
    transitionProperty: "color, background-color, transform",
    transitionDuration: motion.micro,
    transitionTimingFunction: motion.enter,
    outline: { default: "none", ":focus-visible": `2px solid ${color.accent}` },
  },
  squareActive: {
    backgroundColor: { default: color.hover, ":hover": color.hover },
    boxShadow: `inset 0 0 0 1px ${color.borderStrong}`,
    color: { default: color.accentStrong, ":hover": color.accentStrong },
  },
  lastRow: { display: "flex", alignItems: "center", gap: "2px", minWidth: 0 },
  lastRowCompact: { flexDirection: "column", alignItems: "stretch" },
  // 36px wide, so the gear centers under the Spaces header's plus and each row's menu button.
  gear: { width: "36px", flexShrink: 0 },
});
