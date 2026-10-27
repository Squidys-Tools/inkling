import { Tabs } from "@base-ui/react/tabs";
import { gsap } from "gsap";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import { isElectronRuntime } from "../../lib/libraryApi";
import type { LibraryItem } from "../../lib/types";
import type { ReaderOrigin } from "../../ReaderView";
import { cx } from "../../ui/cx";
import { InfoPanel, NOTE_BOX } from "./InfoPanel";
import { ItemActionBar } from "./ItemActionBar";
import { ItemStageMedia } from "./ItemStageMedia";
import { itemViewTitle } from "./ItemTitle";
import {
  OVERLAY_EASE,
  OVERLAY_FLIGHT_MS,
  prefersReducedMotion,
  queryCardRects,
  rectFrom,
  type FlightRect,
  type SourceRects,
} from "./overlayMotion";
import { SimilarPanel } from "./SimilarPanel";

const RichNoteEditor = lazy(() =>
  import("./RichNoteEditor").then((module) => ({ default: module.RichNoteEditor })),
);

export type ItemViewActions = {
  onClose: () => void;
  onOpenPdf: (item: LibraryItem) => void;
  onOpenReader: (item: LibraryItem, origin: ReaderOrigin) => void;
  onForget: (item: LibraryItem) => void | Promise<void>;
  onRetryJob: (jobId: string) => void | Promise<void>;
  onAddTag?: (item: LibraryItem, tag: string) => void | Promise<void>;
  onUpdateNote: (item: LibraryItem, body: string) => void | Promise<void>;
  onToggleSpace?: (item: LibraryItem, spaceId: string) => void | Promise<void>;
  /** Items similar to this one, for the Similar tab. */
  onLoadSimilar: (item: LibraryItem) => Promise<LibraryItem[]>;
  /** Opens another item from the Similar tab as a new history step. */
  onOpenItem: (item: LibraryItem) => void;
  /** Hidden when absent. */
  onShowInFolder?: (item: LibraryItem) => void;
  /** Permanent delete. Only offered for archived items. Hidden when absent. */
  onDelete?: (item: LibraryItem) => void;
};

/** A Regular Space in the Space menu: filing an item in and taking it back out
 *  happen in the same place, so one toggle carries both directions. */
export type ItemViewSpace = {
  id: string;
  name: string;
  color: string;
  member: boolean;
};

type Flight =
  | { kind: "open"; id: number; from: FlightRect; to: FlightRect }
  | {
      kind: "close";
      id: number;
      fromItem: LibraryItem;
      from: FlightRect;
      to: FlightRect | null;
      thenOpen: boolean;
      /** Archiving: shrink and fade where it is, then archive the item. */
      archive?: boolean;
    };

// The settled view's corners match the library frame it covers.
const FRAME_RADIUS = "16px 0px 0px 16px";

const INSPECTOR_BODY =
  "flex min-h-0 flex-auto flex-col gap-5 overflow-y-auto pt-5 [scrollbar-width:none]";
const INSPECTOR_TAB =
  "cursor-pointer border-0 bg-transparent p-0 font-body text-[14px]/[18px] text-muted hover:not-data-active:text-ink-soft data-active:font-semibold data-active:text-ink";

type InspectorTab = "info" | "similar";

type ItemViewProps = {
  item: LibraryItem;
  actions: ItemViewActions;
  /** Regular Spaces available to file this item in. Empty hides the Space control. */
  spaces?: ItemViewSpace[];
  originRectsRef: RefObject<SourceRects | null>;
  /** The library frame the item view covers once it settles. */
  frameRef: RefObject<HTMLElement | null>;
  historyCloseRequest: number;
};

export function ItemView({
  item,
  actions,
  spaces,
  originRectsRef,
  frameRef,
  historyCloseRequest,
}: ItemViewProps) {
  const layerRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const itemIdRef = useRef(item.id);
  const itemRef = useRef(item);
  const previousItemRef = useRef(item);
  const flightIdRef = useRef(0);
  const flightRef = useRef<Flight | null>(null);
  const cancelPendingOpenRef = useRef(false);
  const previousHistoryCloseRequestRef = useRef(historyCloseRequest);
  const hasSettledOnceRef = useRef(false);
  const actionsRef = useRef(actions);
  const [destination, setDestination] = useState<FlightRect | null>(null);
  const [flight, setFlight] = useState<Flight | null>(null);
  const [pendingOpen, setPendingOpen] = useState(false);
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("info");
  // The similar items for one item. Tied to its id so a stale list never shows for another item.
  const [similar, setSimilar] = useState<{ itemId: string; items: LibraryItem[] } | null>(null);
  const isEditingNoteRef = useRef(false);
  const isFocusModeRef = useRef(false);

  // Mirror props into refs inside an effect, never during render, so a
  // concurrent render cannot publish a half-updated set. This runs before
  // the flight effects below, which read these refs.
  useLayoutEffect(() => {
    itemIdRef.current = item.id;
    itemRef.current = item;
    flightRef.current = flight;
  }, [item, flight]);

  useLayoutEffect(() => {
    isEditingNoteRef.current = isEditingNote;
    isFocusModeRef.current = isFocusMode;
  }, [isEditingNote, isFocusMode]);

  // The draft lives only in the editor, so while a note is being written a
  // press outside the item view (a Space, Settings, a card) is absorbed rather
  // than navigating away and dropping it. Save, Close and Escape are the ways
  // out. Press, release and click are separate events a control can answer.
  useEffect(() => {
    if (!isEditingNote) return;
    const absorb = (event: Event) => {
      if (!(event.target instanceof Node) || dialogRef.current?.contains(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
    };
    const events = ["pointerdown", "mousedown", "pointerup", "mouseup", "click"];
    for (const type of events) document.addEventListener(type, absorb, true);
    return () => {
      for (const type of events) document.removeEventListener(type, absorb, true);
    };
  }, [isEditingNote]);

  // The item whose content the view shows. During a closing flight that was
  // triggered by switching items, the view flies back displaying the item it
  // was showing, while React's item prop already points at the next one.
  const shownItem = flight?.kind === "close" ? flight.fromItem : item;

  // The view replaces the library: it takes the whole frame inside its border,
  // and the inspector keeps clear of the window controls itself.
  const frameRect = useCallback((): FlightRect => {
    const frame = frameRef.current;
    if (!frame) return { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
    const rect = frame.getBoundingClientRect();
    return {
      left: rect.left + frame.clientLeft,
      top: rect.top + frame.clientTop,
      width: frame.clientWidth,
      height: frame.clientHeight,
    };
  }, [frameRef]);

  // Grows the view from a card-sized rectangle into the library frame.
  const beginOpenFlight = useCallback(
    (from: FlightRect) => {
      const to = frameRect();
      setDestination(to);
      flightIdRef.current += 1;
      setFlight({ kind: "open", id: flightIdRef.current, from, to });
    },
    [frameRect],
  );

  const beginCloseFlight = useCallback(
    (closingItem: LibraryItem, to: FlightRect | null, thenOpen: boolean) => {
      const dialog = dialogRef.current;
      if (!dialog) {
        actionsRef.current.onClose();
        return;
      }
      flightIdRef.current += 1;
      setFlight({
        kind: "close",
        id: flightIdRef.current,
        fromItem: closingItem,
        from: rectFrom(dialog.getBoundingClientRect()),
        to,
        thenOpen,
      });
    },
    [],
  );

  const requestClose = useCallback(() => {
    const activeFlight = flightRef.current;
    if (activeFlight?.kind === "close") {
      if (activeFlight.thenOpen) cancelPendingOpenRef.current = true;
      return;
    }
    const rects = queryCardRects(itemIdRef.current);
    if (prefersReducedMotion() || !rects || !dialogRef.current) {
      if (flightRef.current) setFlight(null);
      gsap.to(layerRef.current, {
        opacity: 0,
        duration: 0.15,
        onComplete: actionsRef.current.onClose,
      });
      return;
    }
    cancelPendingOpenRef.current = false;
    beginCloseFlight(itemRef.current, rects.card, false);
  }, [beginCloseFlight]);

  // Archiving leaves like a close, but the view has no card to return to: it
  // shrinks a little where it is and fades out, and only then is the item
  // archived, so the grid does not flash back underneath a live view.
  const archiveFromView = useCallback(() => {
    const dialog = dialogRef.current;
    const closingItem = itemRef.current;
    if (!dialog || flightRef.current || prefersReducedMotion()) {
      void actionsRef.current.onForget(closingItem);
      return;
    }
    const from = rectFrom(dialog.getBoundingClientRect());
    const scale = 0.9;
    flightIdRef.current += 1;
    setFlight({
      kind: "close",
      id: flightIdRef.current,
      fromItem: closingItem,
      from,
      to: {
        left: from.left + (from.width * (1 - scale)) / 2,
        top: from.top + (from.height * (1 - scale)) / 2,
        width: from.width * scale,
        height: from.height * scale,
      },
      thenOpen: false,
      archive: true,
    });
  }, []);

  useEffect(() => {
    if (previousHistoryCloseRequestRef.current === historyCloseRequest) return;
    previousHistoryCloseRequestRef.current = historyCloseRequest;
    requestClose();
  }, [historyCloseRequest, requestClose]);

  // The origin rectangle is a one-time snapshot supplied through a mutable ref.
  // Reading it again after opening would retarget the flight to a stale card.
  useLayoutEffect(() => {
    const originRects = originRectsRef.current;
    if (!originRects || prefersReducedMotion()) {
      setDestination(frameRect());
      gsap.fromTo(
        layerRef.current,
        { opacity: 0 },
        { opacity: 1, duration: 0.18, ease: "power1.out" },
      );
      return;
    }
    beginOpenFlight(originRects.card);
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- This effect consumes the source-rectangle snapshot once on mount.
  }, [beginOpenFlight]);

  // Runs every flight. GSAP owns only the view's outer rectangle. While it
  // flies, the stage fills the whole rectangle and the inspector is hidden, so
  // the card reads as its own image growing into the frame; the inspector and
  // the stage's margins ease in by CSS once it lands.
  useLayoutEffect(() => {
    if (!flight) return;
    const dialog = dialogRef.current;
    if (!dialog) {
      if (flight.kind === "close") actionsRef.current.onClose();
      return;
    }
    const cardRadius = `${getComputedStyle(dialog).getPropertyValue("--radius-sidebar").trim() || "14px"}`;
    const cardCorners = `${cardRadius} ${cardRadius} ${cardRadius} ${cardRadius}`;
    const duration = OVERLAY_FLIGHT_MS / 1000;

    if (flight.kind === "open") {
      const timeline = gsap.timeline({
        onComplete: () => {
          setFlight(null);
          closeButtonRef.current?.focus({ preventScroll: true });
        },
      });
      timeline
        .fromTo(
          dialog,
          { ...flight.from, borderRadius: cardCorners },
          {
            ...flight.to,
            borderRadius: FRAME_RADIUS,
            duration,
            ease: OVERLAY_EASE,
            autoRound: false,
          },
          0,
        )
        .fromTo(dialog, { opacity: 0 }, { opacity: 1, duration: 0.12, ease: "power1.out" }, 0);
      return () => {
        timeline.kill();
      };
    }

    if (flight.archive && flight.to) {
      const timeline = gsap.timeline({
        onComplete: () => {
          void Promise.resolve(actionsRef.current.onForget(flight.fromItem)).then(() => {
            // Still mounted means archiving failed: bring the view back.
            const current = dialogRef.current;
            if (!current) return;
            gsap.set(current, { ...flight.from, opacity: 1, borderRadius: FRAME_RADIUS });
            setFlight(null);
          });
        },
      });
      timeline
        .fromTo(
          dialog,
          { ...flight.from },
          {
            ...flight.to,
            borderRadius: cardCorners,
            duration,
            ease: OVERLAY_EASE,
            autoRound: false,
          },
          0,
        )
        .to(dialog, { opacity: 0, duration: duration * 0.7, ease: "power1.in" }, duration * 0.3);
      return () => {
        timeline.kill();
      };
    }

    // Closing: the view returns to its source card and dissolves into it, or —
    // when the source card is no longer mounted — fades out in place.
    const timeline = gsap.timeline({
      onComplete: () => {
        if (flight.thenOpen && !cancelPendingOpenRef.current) {
          setFlight(null);
          setPendingOpen(true);
        } else {
          actionsRef.current.onClose();
        }
      },
    });
    if (flight.to) {
      timeline
        .fromTo(
          dialog,
          { ...flight.from },
          {
            ...flight.to,
            borderRadius: cardCorners,
            duration,
            ease: OVERLAY_EASE,
            autoRound: false,
          },
          0,
        )
        .to(dialog, { opacity: 0, duration: 0.18, ease: "power1.in" }, duration - 0.18);
    } else {
      timeline.to(dialog, { opacity: 0, duration: 0.25, ease: "power1.in" });
    }
    return () => {
      timeline.kill();
    };
  }, [flight]);

  // Follows the frame when the window resizes or the sidebar opens or closes.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const observer = new ResizeObserver(() => {
      if (flightRef.current) return;
      setDestination(frameRect());
    });
    observer.observe(frame);
    return () => observer.disconnect();
  }, [frameRef, frameRect]);

  // Switching items runs sequentially: the view flies back into its card, then the
  // new item opens from its own. Rapid selections during the close collapse into
  // opening the most recent one.
  useLayoutEffect(() => {
    const previous = previousItemRef.current;
    if (previous.id === item.id) return;
    previousItemRef.current = item;
    if (isEditingNoteRef.current) {
      // Leave the editor rather than carry the draft onto another item.
      setIsEditingNote(false);
      setIsFocusMode(false);
    }

    const activeFlight = flightRef.current;
    if (activeFlight?.kind === "close") return;
    if (activeFlight?.kind === "open") {
      // Retarget the in-progress open from its current visual state.
      const dialog = dialogRef.current;
      if (!dialog) return;
      cancelPendingOpenRef.current = false;
      beginOpenFlight(rectFrom(dialog.getBoundingClientRect()));
      return;
    }

    // Settled: close into the old card, then open the new selection.
    cancelPendingOpenRef.current = false;
    beginCloseFlight(previous, queryCardRects(previous.id)?.card ?? null, /* thenOpen */ true);
  }, [item, beginOpenFlight, beginCloseFlight]);

  // When a sequential switch's closing leg lands, open the newly selected
  // item from its own card.
  useLayoutEffect(() => {
    if (!pendingOpen || flight) return;
    setPendingOpen(false);
    if (cancelPendingOpenRef.current) {
      cancelPendingOpenRef.current = false;
      actionsRef.current.onClose();
      return;
    }
    const rects = queryCardRects(itemRef.current.id);
    // No card to fly from (the item is filtered out of the grid): fade it in place.
    if (!rects) {
      beginOpenFlight(frameRect());
      return;
    }
    beginOpenFlight(rects.card);
  }, [pendingOpen, flight, beginOpenFlight, frameRect]);

  // On close, hand focus back to the source card while it is still mounted.
  // Skipping the restore when focus already moved elsewhere (nav, search)
  // avoids yanking it back out of whatever the user clicked.
  useEffect(
    () => () => {
      const focusOwner = document.activeElement;
      const overlayHasFocus =
        focusOwner instanceof HTMLElement && (dialogRef.current?.contains(focusOwner) ?? false);
      if (!overlayHasFocus && focusOwner !== document.body) return;
      const card = document.querySelector<HTMLElement>(
        `.library-card[data-library-item-id="${CSS.escape(String(itemIdRef.current))}"]`,
      );
      card?.focus({ preventScroll: true });
    },
    [],
  );

  // Move focus to the close control when the view finishes opening.
  useLayoutEffect(() => {
    if (flight || !destination || hasSettledOnceRef.current) return;
    hasSettledOnceRef.current = true;
    closeButtonRef.current?.focus({ preventScroll: true });
  }, [flight, destination]);

  actionsRef.current = actions;

  const handleOverlayClose = () => {
    if (isFocusModeRef.current) {
      setIsFocusMode(false);
      return;
    }
    if (isEditingNoteRef.current) {
      setIsEditingNote(false);
      return;
    }
    requestClose();
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // A field or menu inside the view owns its own Escape: the new-tag input,
      // the editor's link URL field and the Space menu each cancel just
      // themselves. This listener runs in the capture phase, before they can.
      if (event.target instanceof HTMLInputElement) return;
      if (event.target instanceof Element && event.target.closest("[role=menu]")) return;
      event.stopPropagation();
      if (isFocusModeRef.current) {
        setIsFocusMode(false);
        return;
      }
      if (isEditingNoteRef.current) {
        setIsEditingNote(false);
        return;
      }
      requestClose();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [requestClose]);

  // Selection changes reset the tab even though the selected ID is only a
  // trigger. The tag draft and Space menu reset by their own keys.
  useEffect(() => {
    setInspectorTab("info");
  }, [shownItem.id]);

  // Looks up similar items when the Similar tab is open. Reloads only when the
  // shown item changes, not on every edit to its record.
  useEffect(() => {
    if (inspectorTab !== "similar") return;
    const itemId = String(shownItem.id);
    let cancelled = false;
    actionsRef.current.onLoadSimilar(shownItem).then(
      (items) => {
        if (!cancelled)
          setSimilar({
            itemId,
            items: items.filter((candidate) => String(candidate.id) !== itemId),
          });
      },
      () => {
        if (!cancelled) setSimilar({ itemId, items: [] });
      },
    );
    return () => {
      cancelled = true;
    };
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- Keyed on the item ID; the lookup reads the item it was started for.
  }, [inspectorTab, shownItem.id]);

  const isFlying = flight !== null;
  const placedStyle: CSSProperties | undefined =
    destination && !isFlying
      ? {
          left: destination.left,
          top: destination.top,
          width: destination.width,
          height: destination.height,
        }
      : undefined;

  const isEditingNoteView = isEditingNote && shownItem.kind === "Note";
  const isFocusModeView = isFocusMode && isEditingNoteView;
  const similarItems = similar?.itemId === String(shownItem.id) ? similar.items : null;
  const memberSpaces = spaces?.filter((space) => space.member) ?? [];

  // Classes that override each other are picked here rather than stacked as
  // variants, because media-query variants sort after the state ones.
  return (
    <div
      className={cx(
        "fixed inset-0 in-[.settings-open]:z-130",
        isFocusModeView
          ? "pointer-events-auto z-70 grid place-items-center bg-[#100f0e] before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(ellipse_at_50%_42%,rgba(176,113,79,0.09),transparent_58%)] before:content-['']"
          : "pointer-events-none z-6",
      )}
      ref={layerRef}
    >
      <section
        ref={dialogRef}
        className={cx(
          "expanded-overlay group/item pointer-events-auto overflow-hidden [--item-inset:8px] [--item-inspector-top:calc(3px_+_var(--spacing-titlebar))]",
          isFocusModeView
            ? "relative z-1 h-full w-[min(100%,1060px)] rounded-none bg-transparent"
            : "absolute top-0 left-0 size-0 rounded-l-[calc(var(--radius-frame)_-_1px)] bg-frame",
          isFlying && "will-change-[left,top,width,height,opacity]",
        )}
        data-flying={isFlying || undefined}
        role="dialog"
        aria-modal={false}
        aria-label={itemViewTitle(shownItem)}
        style={isFocusModeView ? undefined : placedStyle}
      >
        <div
          className={cx(
            "absolute overflow-hidden border [--item-stage-surface:radial-gradient(circle,#2a2623_1px,transparent_1.2px)_0_0/18px_18px_#121110] [background:var(--item-stage-surface)]",
            isEditingNoteView ? "hidden" : "grid place-items-center",
            isFlying
              ? "inset-0 rounded-[inherit] border-transparent p-0"
              : "inset-[var(--item-inset)_320px_var(--item-inset)_var(--item-inset)] rounded-[calc(var(--radius-frame)_-_1px_-_var(--item-inset)_+_4px)] border-border px-10 py-[60px] max-[780px]:inset-[var(--item-inspector-top)_var(--item-inset)_50%_var(--item-inset)] max-[780px]:p-4",
            // The view mounts in its resting layout for a moment before the open
            // flight starts, so the stage must not ease from there into the card.
            flight?.kind !== "open" &&
              "[transition:inset_0.32s_cubic-bezier(0.2,0.8,0.2,1),padding_0.32s_cubic-bezier(0.2,0.8,0.2,1),border-radius_0.32s_cubic-bezier(0.2,0.8,0.2,1)]",
          )}
        >
          <ItemStageMedia item={shownItem} />
        </div>

        <Tabs.Root
          value={inspectorTab}
          onValueChange={(value) => setInspectorTab(value === "similar" ? "similar" : "info")}
          render={<aside />}
          className={cx(
            "absolute top-(--item-inspector-top) right-0 bottom-(--item-inset) flex flex-col font-body",
            isEditingNoteView
              ? "left-(--item-inset) w-auto px-0 pt-1.5"
              : "w-80 pt-1.5 pr-4 pl-[18px] max-[780px]:top-1/2 max-[780px]:left-0 max-[780px]:w-auto",
            isFlying
              ? "pointer-events-none translate-x-6 opacity-0"
              : "[transition:opacity_0.25s_ease_0.08s,translate_0.32s_cubic-bezier(0.2,0.8,0.2,1)]",
          )}
        >
          <header
            className={cx(
              "flex h-10 flex-none items-center justify-between",
              isEditingNoteView && "px-4",
            )}
          >
            {/* The tabs step aside while the note editor owns the inspector. */}
            {!isEditingNoteView && (
              <Tabs.List activateOnFocus className="flex items-center gap-[18px]">
                <Tabs.Tab value="info" className={INSPECTOR_TAB}>
                  Info
                </Tabs.Tab>
                <Tabs.Tab value="similar" className={INSPECTOR_TAB}>
                  Similar
                </Tabs.Tab>
              </Tabs.List>
            )}
            <button
              type="button"
              ref={closeButtonRef}
              className={cx(
                "ml-auto inline-flex cursor-pointer items-center gap-1.5 border-0",
                isFocusModeView
                  ? cx(
                      "fixed right-7 min-w-[92px] rounded-full bg-surface-raised px-3 font-body text-[11px] leading-[normal] text-[#c8c0b5] hover:bg-[#25211e] max-[680px]:right-3.5",
                      // In the desktop app, Exit focus must clear the window controls' band.
                      isElectronRuntime()
                        ? "top-[calc(4px_+_var(--spacing-titlebar))]"
                        : "top-[22px] max-[680px]:top-3.5",
                    )
                  : "bg-transparent p-0 font-sans text-[12px]/4 text-muted hover:text-ink",
              )}
              onClick={handleOverlayClose}
              aria-label={
                isFocusModeView
                  ? "Exit focus mode"
                  : isEditingNoteView
                    ? "Close editor"
                    : "Close details"
              }
            >
              {isFocusModeView ? "Exit focus" : "Close"}
              <kbd className="rounded-[4px] border border-border px-[5px] py-px font-mono text-[10px]/3 text-muted">
                esc
              </kbd>
            </button>
          </header>

          {isEditingNoteView ? (
            <div className="flex min-h-0 flex-auto flex-col overflow-hidden">
              <Suspense
                fallback={
                  <p className={NOTE_BOX} role="status">
                    Loading editor…
                  </p>
                }
              >
                <RichNoteEditor
                  key={`edit-${shownItem.id}`}
                  embedded
                  body={shownItem.noteBody}
                  title={shownItem.title}
                  onSave={(body) => actions.onUpdateNote(shownItem, body)}
                  onEditingChange={(editing) => {
                    setIsEditingNote(editing);
                    if (!editing) setIsFocusMode(false);
                  }}
                  focusMode={isFocusModeView}
                  onFocusModeChange={setIsFocusMode}
                />
              </Suspense>
            </div>
          ) : (
            <>
              <Tabs.Panel value="info" tabIndex={-1} className={INSPECTOR_BODY}>
                <InfoPanel
                  item={shownItem}
                  actions={actions}
                  memberSpaces={memberSpaces}
                  onEditNote={() => {
                    setIsFocusMode(false);
                    setIsEditingNote(true);
                  }}
                />
              </Tabs.Panel>
              <Tabs.Panel value="similar" tabIndex={-1} className={INSPECTOR_BODY}>
                <SimilarPanel item={shownItem} similar={similarItems} onOpen={actions.onOpenItem} />
              </Tabs.Panel>
            </>
          )}

          {!isEditingNoteView && (
            <ItemActionBar
              item={shownItem}
              actions={actions}
              spaces={spaces}
              onArchive={archiveFromView}
            />
          )}
        </Tabs.Root>
      </section>
    </div>
  );
}
