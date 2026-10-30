import { gsap } from "gsap";
import { type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { LibraryItem } from "../../lib/types";
import type { ItemViewActions } from "./ItemView";
import {
  OVERLAY_EASE,
  OVERLAY_FLIGHT_MS,
  prefersReducedMotion,
  queryCardRects,
  rectFrom,
  type FlightRect,
  type SourceRects,
} from "./overlayMotion";

type Flight =
  | { kind: "open"; id: number; from: FlightRect; to: FlightRect; progress: number }
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

// Flies the item view between its card and the library frame: opening,
// closing, switching items and archiving.
export function useItemFlight({
  item,
  actions,
  originRectsRef,
  frameRef,
  historyCloseRequest,
  leaveEditor,
}: {
  item: LibraryItem;
  actions: ItemViewActions;
  originRectsRef: RefObject<SourceRects | null>;
  frameRef: RefObject<HTMLElement | null>;
  historyCloseRequest: number;
  /** Called when the item changes under an open view. */
  leaveEditor: () => void;
}) {
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

  // Mirror props into refs inside an effect, never during render, so a
  // concurrent render cannot publish a half-updated set. This runs before
  // the flight effects below, which read these refs.
  useLayoutEffect(() => {
    itemIdRef.current = item.id;
    itemRef.current = item;
    flightRef.current = flight;
  }, [item, flight]);

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
    (from: FlightRect, progress = 0) => {
      const to = frameRect();
      setDestination(to);
      flightIdRef.current += 1;
      setFlight({ kind: "open", id: flightIdRef.current, from, to, progress });
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

  // One timeline owns the frame, stage inset and inspector in both directions.
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
          { ...flight.from, borderRadius: cardCorners, "--item-progress": flight.progress },
          {
            ...flight.to,
            "--item-progress": 1,
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
            gsap.set(current, {
              ...flight.from,
              opacity: 1,
              borderRadius: FRAME_RADIUS,
              "--item-progress": 1,
            });
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
            "--item-progress": 0,
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
            "--item-progress": 0,
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
    leaveEditor();

    const activeFlight = flightRef.current;
    if (activeFlight?.kind === "close") return;
    if (activeFlight?.kind === "open") {
      // Retarget the in-progress open from its current visual state.
      const dialog = dialogRef.current;
      if (!dialog) return;
      cancelPendingOpenRef.current = false;
      beginOpenFlight(
        rectFrom(dialog.getBoundingClientRect()),
        Number(gsap.getProperty(dialog, "--item-progress")) || 0,
      );
      return;
    }

    // Settled: close into the old card, then open the new selection.
    cancelPendingOpenRef.current = false;
    beginCloseFlight(previous, queryCardRects(previous.id)?.card ?? null, /* thenOpen */ true);
  }, [item, beginOpenFlight, beginCloseFlight, leaveEditor]);

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

  return {
    layerRef,
    dialogRef,
    closeButtonRef,
    flight,
    destination,
    shownItem,
    requestClose,
    archiveFromView,
  };
}
