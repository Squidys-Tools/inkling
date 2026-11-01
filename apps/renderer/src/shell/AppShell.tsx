import * as stylex from "@stylexjs/stylex";
import { Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useSyncExternalStore } from "react";
import { cardColor, color, font, motion, radius } from "@inkling/ui/tokens.stylex";
import { useCaptureEvents } from "../capture/useCaptureEvents.ts";
import { useFlightPainting } from "../item/itemFlight.ts";
import { scopeFromPath } from "../library/scope.ts";
import { startLibrarySync } from "../library/sync.ts";
import { LibraryHost } from "../libraryView/LibraryHost.tsx";
import { toggleSidebar, useViewState } from "../libraryView/viewState.ts";
import { ContextMenuLayer } from "../menu/contextMenu.tsx";
import { useFirstRun } from "../onboarding/useFirstRun.ts";
import { handleCommand } from "./commands.ts";
import { ShortcutsDialog } from "./ShortcutsDialog.tsx";
import { Sidebar } from "./Sidebar.tsx";
import { sidebarCompact, sidebarExpanded } from "./sidebarGeometry.ts";
import { TitleBar } from "./TitleBar.tsx";
import { useCommands } from "./useCommands.ts";
import { useSidebarMotion } from "./useSidebarMotion.ts";

function useMedia(query: string) {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
  );
}

export function AppShell() {
  useFirstRun();
  useCommands();
  useEffect(() => startLibrarySync(), []);
  useEffect(() => handleCommand("toggleSidebar", toggleSidebar), []);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const covered = scopeFromPath(pathname) === null;
  const painting = useFlightPainting();
  const welcome = pathname === "/welcome";
  const dragging = useCaptureEvents(!covered);
  const narrow = useMedia("(max-width: 780px)");
  const open = useViewState((state) => state.sidebarOpen);
  // Reflow once, then FLIP the frame instead of resizing the grid every frame.
  const inset = narrow && open ? 0 : open ? sidebarExpanded : sidebarCompact;
  const [stageRef, visualOpen] = useSidebarMotion(open, inset, narrow);

  return (
    <div {...stylex.props(styles.shell)}>
      <TitleBar />
      <div inert={welcome} {...stylex.props(styles.under)}>
        <Sidebar open={open} visualOpen={visualOpen} narrow={narrow} />
        <main
          ref={stageRef}
          {...stylex.props(
            styles.stage,
            styles.inset(inset),
            !covered && styles.library,
            narrow && styles.narrow,
          )}
        >
          <div {...stylex.props(styles.content)}>
            <LibraryHost covered={covered} painting={painting} sidebarCollapsed={false} />
            {welcome ? null : covered ? (
              <div {...stylex.props(styles.page, painting && styles.flightPage)}>
                <Outlet />
              </div>
            ) : (
              <Outlet />
            )}
            {dragging && (
              <div {...stylex.props(styles.drop)} aria-hidden="true">
                Drop to save
              </div>
            )}
          </div>
        </main>
      </div>
      {welcome && (
        <div {...stylex.props(styles.welcome)}>
          <Outlet />
        </div>
      )}
      <ShortcutsDialog />
      <ContextMenuLayer />
    </div>
  );
}

const styles = stylex.create({
  shell: {
    position: "relative",
    height: "100%",
    overflow: "hidden",
    backgroundColor: color.window,
    color: color.ink,
  },
  under: { display: "contents" },
  welcome: { position: "fixed", inset: 0, zIndex: 35, backgroundColor: color.window },
  stage: {
    position: "absolute",
    top: 0,
    bottom: 0,
    right: 0,
    zIndex: 1,
    boxSizing: "border-box",
    minWidth: 0,
    backgroundColor: color.frame,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: color.border,
    borderTopLeftRadius: radius.frame,
    borderBottomLeftRadius: radius.frame,
    overflow: "hidden",
    contain: "strict",
    // Keep the reviewed edge inside the clip and above covering pages.
    "::after": {
      content: "''",
      position: "absolute",
      inset: 0,
      border: "inherit",
      borderTopLeftRadius: `calc(${radius.frame} - 1px)`,
      borderBottomLeftRadius: `calc(${radius.frame} - 1px)`,
      pointerEvents: "none",
      zIndex: 10,
    },
    transformOrigin: "left top",
    willChange: "transform",
    transitionProperty: "none",
    transitionDuration: motion.layout,
  },
  inset: (left: number) => ({ left }),
  // The library already has its own gutters; a full-height rule here reads as a stray line.
  // Covered pages keep the reviewed frame edge. The inset pseudo-edge inherits this color.
  library: { borderLeftColor: "transparent" },
  narrow: { transitionDuration: "0s" },
  content: { position: "absolute", inset: 0 },
  page: {
    position: "absolute",
    inset: 0,
    zIndex: 4,
    overflow: "hidden",
    backgroundColor: color.frame,
  },
  flightPage: { backgroundColor: "transparent" },
  drop: {
    position: "absolute",
    inset: "8px",
    zIndex: 5,
    display: "grid",
    placeItems: "center",
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: color.accent,
    borderRadius: radius.panel,
    backgroundColor: cardColor.dropWash,
    fontFamily: font.body,
    fontSize: "14px",
    fontWeight: 600,
    color: color.accent,
    pointerEvents: "none",
  },
});
