import { Cancel01Icon, ViewSidebarLeftIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import * as stylex from "@stylexjs/stylex";
import { useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { cardColor, color, font, motion, radius } from "@inkling/ui/tokens.stylex";
import { dismissCaptureError, useCaptureState } from "../capture/capture.ts";
import { ensureScope, loadScope, shownScope, useScope } from "../library/cards.ts";
import { scopeFromPath, scopeKey } from "../library/scope.ts";
import { search, useSearch } from "../library/search.ts";
import { useSpace } from "../library/spaces.ts";
import { useStore } from "../library/store.ts";
import { EmptyState } from "./EmptyState.tsx";
import { FilterRow } from "./FilterRow.tsx";
import { Grid } from "./Grid.tsx";
import { SearchBar } from "./SearchBar.tsx";
import { ViewDock } from "./ViewDock.tsx";
import { setSidebarOpen, useViewState } from "./viewState.ts";

/**
 * The library frame's content. It stays mounted under every page, so closing
 * an item comes back to the same scroll position; a page that covers it makes
 * it inert and stops it painting. It shows the scope of the last library route.
 */
export function LibraryHost({
  covered,
  sidebarCollapsed,
}: {
  covered: boolean;
  sidebarCollapsed: boolean;
}) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const routeScope = scopeFromPath(pathname);

  useEffect(() => {
    const next = scopeFromPath(pathname);
    if (!next) return;
    shownScope.set(next);
    ensureScope(next);
  }, [pathname]);

  const scope = useStore(shownScope, (shown) => shown);
  const state = useScope(scope);
  const space = useSpace(scope._tag === "Space" ? scope.spaceId : null);
  const query = useSearch((search) => search.query.trim());
  const results = useSearch((search) => search.results);
  const searchError = useSearch((search) => search.error);
  const ran = useSearch((search) => search.ran);
  const focused = useViewState((view) => view.searchFocused);
  const list = useViewState((view) => view.list);
  const captureError = useCaptureState((capture) => capture.error);

  const archive = scope._tag === "Archived";
  const searching = query !== "" && !archive;
  const ids = searching && results ? results : (state?.ids ?? []);
  const count = searching && results ? results.length : (state?.total ?? 0);
  const ready = searching
    ? results !== null || state?.status === "ready"
    : state?.status === "ready";
  const pinned = searching && !focused;
  const viewName = archive ? "Archive" : (space?.name ?? "Everything");
  const layout = archive ? "archive" : list ? "list" : "grid";
  // A new scope, search or layout starts a new grid at the top; anything else keeps the scroll.
  const gridKey = `${layout}|${searching ? `search:${results === null ? "" : ran}` : scopeKey(scope)}`;

  let empty: { title: string; detail: string; action?: { label: string; run: () => void } } | null =
    null;
  if (ready && ids.length === 0) {
    if (searching)
      empty = {
        title: "Nothing surfaced yet.",
        detail: "Try another word, or save something new to your mind.",
        action: { label: "Clear search", run: () => search.clear() },
      };
    else if (archive)
      empty = {
        title: "Nothing archived.",
        detail: "Archived items wait here until you restore them or delete them for good.",
      };
    else if (space?.kind === "regular")
      empty = {
        title: `${space.name} is empty.`,
        detail: `Right-click anything in your library and choose Add to ${space.name} to file it here.`,
      };
    else if (space)
      empty = {
        title: "Nothing matches yet.",
        detail: `Items that match ${space.name} appear here as you save them.`,
      };
    else
      empty = {
        title: "Nothing surfaced yet.",
        detail: "Paste a link, drop a file, or press Add to save something to your mind.",
      };
  }

  return (
    <section
      aria-label={viewName}
      inert={covered}
      {...stylex.props(styles.host, covered && styles.covered)}
    >
      {state?.status === "error" && !searching ? (
        <EmptyState
          title="The library didn’t open."
          detail={state.error ?? "Something went wrong."}
          action={{ label: "Try again", run: () => void loadScope(scope) }}
        />
      ) : empty ? (
        <EmptyState {...empty} />
      ) : (
        <Grid
          key={gridKey}
          ids={ids}
          layout={layout}
          pinnedOffset={pinned}
          onNearEnd={() => {
            if (!searching) void loadScope(scope, "more");
          }}
        />
      )}

      <div {...stylex.props(styles.bar)}>
        {sidebarCollapsed && (
          <button
            type="button"
            data-bench="sidebar-toggle"
            aria-label="Open sidebar"
            title="Open sidebar"
            aria-expanded={false}
            aria-controls="library-navigation"
            onClick={() => setSidebarOpen(true)}
            {...stylex.props(styles.openSidebar)}
          >
            <HugeiconsIcon icon={ViewSidebarLeftIcon} size={17} />
          </button>
        )}
        <SearchBar viewName={viewName} inLibrary={routeScope?._tag === "Active"} />
      </div>

      {pinned && <FilterRow query={query} count={results?.length ?? null} />}

      {(captureError || (searching && searchError)) && (
        <p role="alert" {...stylex.props(styles.error, pinned && styles.errorBelowFilter)}>
          <span>
            Couldn’t {captureError ? "save this yet" : "search"}: {captureError ?? searchError}
          </span>
          {captureError && (
            <button
              type="button"
              aria-label="Dismiss"
              onClick={dismissCaptureError}
              {...stylex.props(styles.dismiss)}
            >
              <HugeiconsIcon icon={Cancel01Icon} size={12} />
            </button>
          )}
        </p>
      )}

      {!archive && ids.length > 0 && <ViewDock />}

      {/* Screen readers hear the count of what the grid shows. */}
      <p role="status" {...stylex.props(styles.srOnly)}>
        {ready ? `${count.toLocaleString()} ${count === 1 ? "item" : "items"}` : ""}
      </p>
    </section>
  );
}

const styles = stylex.create({
  host: {
    position: "absolute",
    inset: 0,
    overflow: "hidden",
  },
  // Covered by a page: kept in memory with its scroll, skipped by paint.
  covered: { contentVisibility: "hidden" },
  bar: {
    position: "absolute",
    top: "36px",
    left: "14px",
    right: "14px",
    height: "52px",
    zIndex: 3,
    pointerEvents: "none",
  },
  openSidebar: {
    position: "absolute",
    top: "9px",
    left: 0,
    display: "grid",
    placeItems: "center",
    width: "34px",
    height: "34px",
    padding: 0,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: color.glassEdge,
    borderRadius: "17px",
    backgroundColor: color.raised,
    boxShadow: `0 8px 24px ${color.shadow}`,
    color: { default: color.inkSoft, ":hover": color.ink },
    cursor: "pointer",
    pointerEvents: "auto",
    transform: { default: "none", ":active": "scale(0.96)" },
    transitionProperty: "color, transform",
    transitionDuration: motion.micro,
    outline: { default: "none", ":focus-visible": `2px solid ${color.accent}` },
    outlineOffset: "2px",
  },
  error: {
    position: "absolute",
    top: "92px",
    left: "14px",
    zIndex: 3,
    display: "flex",
    alignItems: "center",
    gap: "8px",
    margin: 0,
    maxWidth: "calc(100% - 28px)",
    paddingBlock: "6px",
    paddingLeft: "12px",
    paddingRight: "8px",
    borderRadius: radius.round,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: cardColor.dangerEdge,
    backgroundColor: color.raised,
    fontFamily: font.body,
    fontSize: "12px",
    color: color.danger,
  },
  errorBelowFilter: { top: "136px" },
  dismiss: {
    display: "grid",
    placeItems: "center",
    width: "20px",
    height: "20px",
    padding: 0,
    borderWidth: 0,
    borderRadius: radius.round,
    backgroundColor: { default: "transparent", ":hover": color.dangerSoft },
    color: { default: color.danger, ":hover": color.ink },
    cursor: "pointer",
    outline: { default: "none", ":focus-visible": `2px solid ${color.accent}` },
  },
  srOnly: {
    position: "absolute",
    width: "1px",
    height: "1px",
    margin: "-1px",
    padding: 0,
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    whiteSpace: "nowrap",
    borderWidth: 0,
  },
});
