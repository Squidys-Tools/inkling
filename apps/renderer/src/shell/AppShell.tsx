import * as stylex from "@stylexjs/stylex";
import { Outlet, useRouterState } from "@tanstack/react-router";
import { AnimatePresence, MotionConfig, motion as m } from "motion/react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { cardColor, color, font, layout, motion, radius } from "@inkling/ui/tokens.stylex";
import { useCaptureEvents } from "../capture/useCaptureEvents.ts";
import {
  aimAtCard,
  FRAME_RADIUS,
  ITEM_FLIGHT_EASE,
  ITEM_FLIGHT_MS,
  ItemFlightBack,
} from "../item/itemFlight.ts";
import { scopeFromPath } from "../library/scope.ts";
import { startLibrarySync } from "../library/sync.ts";
import { LibraryHost } from "../libraryView/LibraryHost.tsx";
import { toggleSidebar, useViewState } from "../libraryView/viewState.ts";
import { ContextMenuLayer } from "../menu/contextMenu.tsx";
import { useFirstRun } from "../onboarding/useFirstRun.ts";
import { SettingsSheet } from "../settings/SettingsSheet.tsx";
import { handleCommand } from "./commands.ts";
import { ShortcutsDialog } from "./ShortcutsDialog.tsx";
import { Sidebar } from "./Sidebar.tsx";
import { TitleBar } from "./TitleBar.tsx";
import { useCommands } from "./useCommands.ts";

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
  // The welcome covers the whole window, sidebar included.
  const welcome = pathname === "/welcome";
  const dragging = useCaptureEvents(!covered);
  const narrow = useMedia("(max-width: 780px)");
  const instant = useMedia("(prefers-reduced-motion: reduce)");
  const open = useViewState((state) => state.sidebarOpen);

  // On wide windows the frame slides over the sidebar by transform, and the
  // grid inside lays out for its new width once, when the slide has ended.
  const shifted = !narrow && open;
  const [settled, setSettled] = useState(shifted);
  const narrowed = instant ? shifted : !narrow && settled;

  // An item opened from Similar replaces the open page in place, so the whole
  // /item/$id family shares a key; every other covering page is its own.
  const itemId = pathname.match(/^\/item\/([^/]+)$/)?.[1] ?? null;
  const pageKey = itemId ? "/item" : pathname;

  // The page ref must be a callback: aimAtCard snaps the element onto the card
  // before motion's layout effects read its start geometry.
  const pageRef = useRef<HTMLElement | null>(null);
  const armPage = useCallback(
    (el: HTMLElement | null) => {
      pageRef.current = el;
      if (el && itemId) aimAtCard(el);
    },
    [itemId],
  );

  return (
    <MotionConfig reducedMotion="user">
      <div {...stylex.props(styles.shell)}>
        <TitleBar />
        <div inert={welcome} {...stylex.props(styles.under)}>
          <Sidebar open={open} narrow={narrow} />
          <main
            {...stylex.props(
              styles.stage,
              shifted && styles.shifted,
              (shifted || narrowed) && styles.rounded,
            )}
            onTransitionEnd={(event) => {
              if (event.target === event.currentTarget && event.propertyName === "transform")
                setSettled(shifted);
            }}
          >
            <div {...stylex.props(styles.content, narrowed && styles.narrowed)}>
              <LibraryHost covered={covered} sidebarCollapsed={!open} />
              {!welcome && !covered && <Outlet />}
              {!welcome && (
                <AnimatePresence initial={false}>
                  {covered && (
                    <m.div
                      key={pageKey}
                      ref={armPage}
                      {...stylex.props(styles.page)}
                      initial={itemId ? { opacity: 0 } : { opacity: 0, scale: 0.94 }}
                      animate={
                        itemId
                          ? instant
                            ? { opacity: 1 }
                            : {
                                left: "0px",
                                top: "0px",
                                right: "0px",
                                bottom: "0px",
                                borderRadius: FRAME_RADIUS,
                                "--item-progress": 1,
                                opacity: 1,
                              }
                          : { opacity: 1, scale: 1 }
                      }
                      exit={itemId ? {} : { opacity: 0, scale: 0.94 }}
                      transition={
                        itemId
                          ? {
                              duration: ITEM_FLIGHT_MS / 1000,
                              ease: ITEM_FLIGHT_EASE,
                              opacity: { duration: 0.12, ease: "easeOut" },
                            }
                          : { duration: 0.22, ease: [0.2, 0, 0, 1] }
                      }
                    >
                      <Outlet />
                      {itemId && <ItemFlightBack id={itemId} pageRef={pageRef} />}
                    </m.div>
                  )}
                </AnimatePresence>
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
        <SettingsSheet />
        <ContextMenuLayer />
      </div>
    </MotionConfig>
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
  welcome: {
    position: "fixed",
    inset: 0,
    zIndex: 35,
    backgroundColor: color.window,
  },
  stage: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    zIndex: 1,
    boxSizing: "border-box",
    width: "100%",
    backgroundColor: color.frame,
    borderBlockWidth: 1,
    borderBlockStyle: "solid",
    borderBlockColor: color.border,
    borderLeftWidth: 0,
    borderLeftStyle: "solid",
    borderLeftColor: color.border,
    overflow: "hidden",
    // Its own layer: the slide moves pixels the compositor already has.
    contain: "strict",
    transform: "none",
    transitionProperty: "transform",
    transitionDuration: motion.layout,
    transitionTimingFunction: motion.standard,
  },
  shifted: { transform: `translateX(${layout.sidebar})` },
  rounded: {
    borderLeftWidth: 1,
    borderTopLeftRadius: radius.frame,
    borderBottomLeftRadius: radius.frame,
  },
  content: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: "100%",
  },
  narrowed: { width: `calc(100% - ${layout.sidebar})` },
  page: {
    position: "absolute",
    inset: 0,
    zIndex: 4,
    overflow: "hidden",
    backgroundColor: color.frame,
    // Item pages fly this from 0 to 1; other pages stay settled.
    "--item-progress": "1",
  },
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
