import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import { gsap } from "gsap";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  AlertCircleIcon,
  Archive01Icon,
  ArrowUpRight01Icon,
  BookOpen01Icon,
  FileTextIcon,
  FolderAddIcon,
  Loading01Icon,
  PlusSignIcon,
  RotateCwIcon,
  SparklesIcon,
  StarIcon,
} from "@hugeicons/core-free-icons";
import type { LibraryItem } from "../lib/types";
import { isElectronRuntime } from "../lib/libraryApi";
import type { ReaderOrigin } from "../ReaderView";
import {
  KindIcon,
  NoteArtwork,
  PdfArtwork,
  PostArtwork,
  XPostEmbed,
  DetailVideoMedia,
  pdfPreviewTitle,
} from "./ItemMedia";
import {
  OVERLAY_EASE,
  OVERLAY_FLIGHT_MS,
  prefersReducedMotion,
  queryCardRects,
  rectFrom,
  type FlightRect,
  type SourceRects,
} from "./overlayMotion";

const RichNoteEditor = lazy(() =>
  import("./RichNoteEditor").then((module) => ({ default: module.RichNoteEditor })),
);

export type ExpandedOverlayActions = {
  onClose: () => void;
  onOpenPdf: (item: LibraryItem) => void;
  onOpenReader: (item: LibraryItem, origin: ReaderOrigin) => void;
  onFindSimilar: (item: LibraryItem) => void;
  onForget: (item: LibraryItem) => void | Promise<void>;
  onTogglePin: (item: LibraryItem) => void | Promise<void>;
  onRetryJob: (jobId: string) => void | Promise<void>;
  onAddTag?: (item: LibraryItem, tag: string) => void | Promise<void>;
  onUpdateNote: (item: LibraryItem, body: string) => void | Promise<void>;
  onToggleSpace?: (item: LibraryItem, spaceId: string) => void | Promise<void>;
  isFindingSimilar: boolean;
};

/** A Regular Space chip: filing an item in and taking it back out happen in the
 *  same place, so one toggle carries both directions. */
export type OverlaySpaceChip = {
  id: string;
  name: string;
  color: string;
  member: boolean;
};

type OverlayAction = {
  key: string;
  label: string;
  icon: ReactNode;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  title?: string;
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
    };

// The settled view's corners match the library frame it covers.
const FRAME_RADIUS = "16px 0px 0px 16px";

function clickOrigin(event: React.MouseEvent<HTMLElement>): ReaderOrigin {
  const rect = event.currentTarget.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function hostnameForUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./u, "");
  } catch {
    return null;
  }
}

function fileTypeFor(item: LibraryItem): string {
  if (item.kind === "Image") {
    const match = item.image?.split("?")[0].match(/\.([a-z0-9]{2,5})$/iu);
    if (match) {
      const extension = match[1].toLowerCase();
      return extension === "jpeg" ? "JPG" : extension.toUpperCase();
    }
    return "JPG";
  }
  switch (item.kind) {
    case "PDF":
      return "PDF";
    case "Video":
      return "Video";
    case "Article":
      return "Link";
    case "Post":
      return "Post";
    case "Note":
      return "Note";
    case "Quote":
      return "Quote";
    default:
      return "File";
  }
}

// Content actions sit under the details: read, open the PDF, find similar.
// Item housekeeping (star, Spaces, open original, archive) lives in the
// action bar at the bottom of the inspector instead.
function contentActions(item: LibraryItem, actions: ExpandedOverlayActions): OverlayAction[] {
  const list: OverlayAction[] = [];
  const hasReaderContent = Boolean(item.articleHtml || item.hasArticleContent);
  if (item.kind === "PDF" && item.fileUrl) {
    list.push({
      key: "open-pdf",
      label: "Open PDF",
      icon: <HugeiconsIcon icon={FileTextIcon} size={14} />,
      onClick: () => actions.onOpenPdf(item),
    });
  }
  if (item.kind === "Article" && hasReaderContent) {
    list.push({
      key: "read",
      label: "Read",
      icon: <HugeiconsIcon icon={BookOpen01Icon} size={14} />,
      onClick: (event) => actions.onOpenReader(item, clickOrigin(event)),
    });
  }
  if (isElectronRuntime() && ["Image", "Article", "Note", "Quote"].includes(item.kind)) {
    list.push({
      key: "find-similar",
      label: actions.isFindingSimilar ? "Finding similar…" : "Find similar",
      icon: <HugeiconsIcon icon={SparklesIcon} size={14} />,
      onClick: () => actions.onFindSimilar(item),
      disabled: actions.isFindingSimilar,
    });
  }
  return list;
}

// Screen pixels per image pixel at each zoom step: 100% up to 3200%.
const ZOOM_STEPS = [1, 2, 4, 8, 16, 32];
// From this zoom on, an image pixel is large enough to read as a square, so the
// image renders pixelated and the grid appears. The Paper note leaves the exact
// threshold open; 800% is the pick.
const PIXEL_ZOOM = 8;

type Size = { width: number; height: number };
type Offset = { x: number; y: number };

// Pan moves the image only as far as it overhangs the frame, so the frame stays
// covered. An image smaller than the frame in one axis stays centred on it.
function clampPan(pan: Offset, shown: Size, frame: Size): Offset {
  const maxX = Math.max(0, (shown.width - frame.width) / 2);
  const maxY = Math.max(0, (shown.height - frame.height) / 2);
  return {
    x: Math.min(maxX, Math.max(-maxX, pan.x)),
    y: Math.min(maxY, Math.max(-maxY, pan.y)),
  };
}

// Zoom and pan live here, not in the overlay, so panning re-renders only this
// stage. The key on the caller resets zoom when the shown item changes.
function ZoomableImage({ src, alt }: { src: string; alt: string }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerX: number; pointerY: number; origin: Offset } | null>(null);
  const [frame, setFrame] = useState<Size | null>(null);
  const [natural, setNatural] = useState<Size | null>(null);
  // null means fit, which follows the frame as the window resizes.
  const [zoomLevel, setZoomLevel] = useState<number | null>(null);
  const [pan, setPan] = useState<Offset>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const element = frameRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      setFrame((previous) =>
        previous && previous.width === rect.width && previous.height === rect.height
          ? previous
          : { width: rect.width, height: rect.height },
      );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const ready = frame !== null && natural !== null;
  const fit =
    ready && frame.width > 0 && frame.height > 0
      ? Math.min(frame.width / natural.width, frame.height / natural.height)
      : 1;
  const zoom = Math.max(fit, zoomLevel ?? fit);
  const isZoomed = zoom > fit;
  const shown = natural ? { width: natural.width * zoom, height: natural.height * zoom } : null;
  const offset = ready && shown ? clampPan(pan, shown, frame) : { x: 0, y: 0 };
  const showPixels = ready && zoom >= PIXEL_ZOOM;

  const nextStep = ZOOM_STEPS.find((step) => step > zoom);
  const previousStep = [...ZOOM_STEPS].reverse().find((step) => step < zoom);
  const zoomOutLevel = previousStep !== undefined && previousStep > fit ? previousStep : null;

  function applyZoom(nextLevel: number | null) {
    if (ready) {
      const next = Math.max(fit, nextLevel ?? fit);
      // Keep the point at the centre of the frame in place as the scale changes.
      const scaled = { x: (offset.x * next) / zoom, y: (offset.y * next) / zoom };
      setPan(
        clampPan(scaled, { width: natural.width * next, height: natural.height * next }, frame),
      );
    }
    setZoomLevel(nextLevel);
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!isZoomed || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerX: event.clientX, pointerY: event.clientY, origin: offset };
    setIsDragging(true);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || !shown || !frame) return;
    setPan(
      clampPan(
        {
          x: drag.origin.x + event.clientX - drag.pointerX,
          y: drag.origin.y + event.clientY - drag.pointerY,
        },
        shown,
        frame,
      ),
    );
  }

  function endDrag() {
    dragRef.current = null;
    setIsDragging(false);
  }

  return (
    <>
      <div
        ref={frameRef}
        className={`item-stage-zoom ${isZoomed ? "is-zoomed" : ""} ${isDragging ? "is-dragging" : ""}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <img
          src={src}
          alt={alt}
          className="item-stage-image"
          draggable={!isZoomed}
          onLoad={(event) => {
            const { naturalWidth, naturalHeight } = event.currentTarget;
            if (naturalWidth > 0 && naturalHeight > 0) {
              setNatural({ width: naturalWidth, height: naturalHeight });
            }
          }}
          style={{
            transform: isZoomed
              ? `translate(${offset.x}px, ${offset.y}px) scale(${zoom / fit})`
              : undefined,
            imageRendering: showPixels ? "pixelated" : undefined,
          }}
        />
        {showPixels && shown && (
          <div
            className="item-stage-grid"
            style={{
              width: shown.width,
              height: shown.height,
              translate: `calc(-50% + ${offset.x}px) calc(-50% + ${offset.y}px)`,
              backgroundSize: `${zoom}px ${zoom}px`,
            }}
          />
        )}
      </div>
      {ready && (
        <div className="item-zoom-pill glass">
          <button
            type="button"
            className="item-zoom-button"
            aria-label="Zoom out"
            title="Zoom out"
            disabled={!isZoomed}
            onClick={() => applyZoom(zoomOutLevel)}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M5 12h14"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <span className="item-zoom-label">{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            className="item-zoom-button"
            aria-label="Zoom in"
            title="Zoom in"
            disabled={nextStep === undefined}
            onClick={() => {
              if (nextStep !== undefined) applyZoom(nextStep);
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M12 5v14M5 12h14"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      )}
    </>
  );
}

function OverlayMedia({ item }: { item: LibraryItem }) {
  if (item.kind === "Note" && !item.image) {
    return (
      <div className="item-stage-art note-detail-media">
        <NoteArtwork item={item} />
      </div>
    );
  }

  if (item.social?.provider === "x") {
    return (
      <div className="item-stage-art detail-x-post">
        <XPostEmbed
          key={item.social.postUrl}
          social={item.social}
          fallback={
            item.post ? (
              <PostArtwork post={item.post} />
            ) : (
              <div className="detail-art ink">Post preview unavailable.</div>
            )
          }
        />
      </div>
    );
  }

  if (item.kind === "Video") {
    return (
      <div className="item-stage-art">
        <DetailVideoMedia item={item} />
      </div>
    );
  }

  if (item.kind === "PDF") {
    return (
      <div className="item-stage-art">
        <PdfArtwork item={item} />
      </div>
    );
  }

  if (item.image) {
    return <ZoomableImage key={item.id} src={item.image} alt={item.imageAlt ?? item.title} />;
  }

  if (item.kind === "Quote") {
    return (
      <div className="item-stage-art">
        <div className="detail-art detail-quote-art paper-yellow">
          <span className="detail-quote-mark">“</span>
          <span>{item.kind}</span>
        </div>
      </div>
    );
  }

  if (item.kind === "Post" && item.post) {
    return (
      <div className="item-stage-art">
        <PostArtwork post={item.post} />
      </div>
    );
  }

  return (
    <div className="item-stage-art">
      <div className={`detail-art ${item.accent ?? "ink"}`}>
        <KindIcon kind={item.kind} />
        <span>{item.kind}</span>
      </div>
    </div>
  );
}

function detailTitleFor(item: LibraryItem): string {
  return item.kind === "PDF" ? pdfPreviewTitle(item.title) || item.title : item.title;
}

type ExpandedItemOverlayProps = {
  item: LibraryItem;
  actions: ExpandedOverlayActions;
  /** Regular Spaces available to file this item in. Empty hides the Space control. */
  spaces?: OverlaySpaceChip[];
  originRectsRef: RefObject<SourceRects | null>;
  /** The library frame the item view covers once it settles. */
  frameRef: RefObject<HTMLElement | null>;
  historyCloseRequest: number;
};

export function ExpandedItemOverlay({
  item,
  actions,
  spaces,
  originRectsRef,
  frameRef,
  historyCloseRequest,
}: ExpandedItemOverlayProps) {
  const layerRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const tagInputRef = useRef<HTMLInputElement>(null);
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
  const [isSpaceMenuOpen, setIsSpaceMenuOpen] = useState(false);
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

  // The item whose content the view shows. During a closing flight that was
  // triggered by switching items, the view flies back displaying the item it
  // was showing, while React's item prop already points at the next one.
  const shownItem = flight?.kind === "close" ? flight.fromItem : item;

  const frameRect = useCallback((): FlightRect => {
    const rect = frameRef.current?.getBoundingClientRect();
    if (rect) return rectFrom(rect);
    return { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
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

  useEffect(() => {
    if (previousHistoryCloseRequestRef.current === historyCloseRequest) return;
    previousHistoryCloseRequestRef.current = historyCloseRequest;
    requestClose();
  }, [historyCloseRequest, requestClose]);

  // The origin rectangle is a one-time snapshot supplied through a mutable ref.
  // Reading it again after opening would retarget the flight to a stale card.
  // biome-ignore lint/correctness/useExhaustiveDependencies: This effect consumes the source-rectangle snapshot once on mount.
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
    const cardRadius = `${getComputedStyle(dialog).getPropertyValue("--sidebar-radius").trim() || "14px"}`;
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

  // Switching items while the view is open runs sequentially: the open view
  // first flies back into the card it was showing, and only after it lands
  // does the newly selected item open from its own card. Rapid selections
  // during the closing leg are absorbed — the flight completes once and then
  // opens the most recently selected item.
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
    if (!rects) {
      actionsRef.current.onClose();
      return;
    }
    beginOpenFlight(rects.card);
  }, [pendingOpen, flight, beginOpenFlight]);

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
      // A field inside the view owns its own Escape: the new-tag input and
      // the editor's link URL field each cancel just themselves. This listener
      // runs in the capture phase, before their handlers get a chance to.
      if (event.target instanceof HTMLInputElement) return;
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

  const [isAddingTag, setIsAddingTag] = useState(false);
  const [tagDraft, setTagDraft] = useState("");
  useLayoutEffect(() => {
    if (isAddingTag) tagInputRef.current?.focus();
  }, [isAddingTag]);

  // Selection changes reset this local editor state even though the selected ID
  // is only a trigger and is not read by the reset itself.
  // biome-ignore lint/correctness/useExhaustiveDependencies: The shown item ID intentionally triggers a reset.
  useEffect(() => {
    setIsAddingTag(false);
    setTagDraft("");
    setIsSpaceMenuOpen(false);
  }, [shownItem.id]);

  const allTags = shownItem.tags;

  function submitTag() {
    const clean = tagDraft.trim().replace(/^#+/u, "").toLowerCase();
    if (clean && !allTags.some((tag) => tag.toLowerCase() === clean)) {
      void actions.onAddTag?.(shownItem, clean);
    }
    setTagDraft("");
    setIsAddingTag(false);
  }

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
  const isPinned = shownItem.favorite === true;
  const sourceHost = hostnameForUrl(shownItem.sourceUrl);
  const memberSpaces = spaces?.filter((space) => space.member) ?? [];
  const content = contentActions(shownItem, actions);
  const savedDate = shownItem.date.replace(/^saved\s+/iu, "");
  const size =
    shownItem.mediaWidth && shownItem.mediaHeight
      ? `${shownItem.mediaWidth} × ${shownItem.mediaHeight}`
      : null;

  return (
    <div
      className={`expanded-overlay-layer ${isFocusModeView ? "is-focus-mode" : ""}`}
      ref={layerRef}
    >
      <section
        ref={dialogRef}
        className={`expanded-overlay ${destination ? "is-placed" : ""} ${isFlying ? "is-flying" : ""} ${isEditingNoteView ? "is-editing-note" : ""} ${isFocusModeView ? "is-focus-mode" : ""}`}
        role="dialog"
        aria-modal={false}
        aria-label={detailTitleFor(shownItem)}
        style={isFocusModeView ? undefined : placedStyle}
      >
        <div className="item-stage">
          <OverlayMedia item={shownItem} />
        </div>

        <aside className="item-inspector">
          <header className="item-inspector-header">
            <button
              type="button"
              ref={closeButtonRef}
              className="item-close"
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
              <kbd>esc</kbd>
            </button>
          </header>

          <div className="item-inspector-body">
            {isEditingNoteView ? (
              <Suspense
                fallback={
                  <p className="item-note" role="status">
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
            ) : (
              <>
                {shownItem.kind === "Quote" ? (
                  <>
                    <blockquote className="detail-quote">“{shownItem.title}”</blockquote>
                    {shownItem.description && (
                      <p className="detail-attribution">
                        — {shownItem.description.replace(/^—\s*/u, "")}
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <h2 className="item-title">{detailTitleFor(shownItem)}</h2>
                    {shownItem.kind !== "Note" && shownItem.description && (
                      <p className="item-note">{shownItem.description}</p>
                    )}
                  </>
                )}

                {shownItem.processing?.active && (
                  <div className="detail-processing" role="status">
                    <HugeiconsIcon icon={Loading01Icon} size={14} />
                    <span>{shownItem.processing.message ?? "Processing"}</span>
                    {shownItem.processing.progressTotal != null && (
                      <span>
                        {shownItem.processing.progressCurrent}/{shownItem.processing.progressTotal}
                      </span>
                    )}
                  </div>
                )}
                {shownItem.processing?.failedJob && (
                  <div className="detail-processing failed" role="alert">
                    <HugeiconsIcon icon={AlertCircleIcon} size={14} />
                    <span>
                      {shownItem.processing.failedJob.errorMessage ?? "Processing failed"}
                    </span>
                    <button
                      type="button"
                      className="retry-button"
                      onClick={() =>
                        void actions.onRetryJob(shownItem.processing?.failedJob?.id ?? "")
                      }
                    >
                      <HugeiconsIcon icon={RotateCwIcon} size={12} /> Try again
                    </button>
                  </div>
                )}

                <div className="item-tags">
                  {memberSpaces.map((space) => (
                    <span key={space.id} className="item-space-chip">
                      <span className={`detail-space-dot ${space.color}`} aria-hidden="true" />
                      {space.name}
                    </span>
                  ))}
                  {allTags.map((tag) => (
                    <span key={tag} className="item-tag">
                      #{tag}
                    </span>
                  ))}
                  {isAddingTag ? (
                    <input
                      ref={tagInputRef}
                      className="detail-tag-input"
                      value={tagDraft}
                      placeholder="tag name"
                      aria-label="New tag name"
                      onChange={(event) => setTagDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          submitTag();
                        } else if (event.key === "Escape") {
                          setTagDraft("");
                          setIsAddingTag(false);
                        }
                      }}
                      onBlur={submitTag}
                    />
                  ) : (
                    <button
                      type="button"
                      className="item-tag-add"
                      onClick={() => setIsAddingTag(true)}
                      aria-label="Add a tag"
                    >
                      <HugeiconsIcon icon={PlusSignIcon} size={11} />
                    </button>
                  )}
                </div>

                <section className="item-details">
                  <h3>Details</h3>
                  <dl>
                    <div>
                      <dt>Saved</dt>
                      <dd>{savedDate}</dd>
                    </div>
                    {(sourceHost || shownItem.source) && (
                      <div>
                        <dt>From</dt>
                        <dd>{sourceHost ?? shownItem.source}</dd>
                      </div>
                    )}
                    <div>
                      <dt>Type</dt>
                      <dd>{fileTypeFor(shownItem)}</dd>
                    </div>
                    {size && (
                      <div>
                        <dt>Size</dt>
                        <dd className="is-mono">{size}</dd>
                      </div>
                    )}
                  </dl>
                </section>

                {(content.length > 0 || shownItem.kind === "Note") && (
                  <div className="item-actions">
                    {shownItem.kind === "Note" && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsFocusMode(false);
                          setIsEditingNote(true);
                        }}
                      >
                        Edit note
                      </button>
                    )}
                    {content.map((action) => (
                      <button
                        type="button"
                        key={action.key}
                        onClick={action.onClick}
                        disabled={action.disabled}
                        title={action.title}
                      >
                        {action.icon} {action.label}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {!isEditingNoteView && (
            <footer className="item-action-bar">
              {isSpaceMenuOpen && spaces && spaces.length > 0 && (
                <fieldset className="item-space-menu">
                  <legend className="visually-hidden">Regular Spaces</legend>
                  {spaces.map((space) => (
                    <button
                      key={space.id}
                      type="button"
                      className={`detail-space ${space.member ? "is-member" : ""}`}
                      aria-pressed={space.member}
                      title={space.member ? `Remove from ${space.name}` : `Add to ${space.name}`}
                      onClick={() => void actions.onToggleSpace?.(shownItem, space.id)}
                    >
                      <span className={`detail-space-dot ${space.color}`} aria-hidden="true" />
                      <span className="detail-space-name">{space.name}</span>
                    </button>
                  ))}
                </fieldset>
              )}
              <button
                type="button"
                className="item-bar-button"
                onClick={() => void actions.onTogglePin(shownItem)}
                aria-label={isPinned ? "Unstar" : "Star to Top of mind"}
                aria-pressed={isPinned}
                title={isPinned ? "Unstar" : "Star to Top of mind"}
              >
                <HugeiconsIcon icon={StarIcon} size={15} />
              </button>
              {spaces && spaces.length > 0 && (
                <button
                  type="button"
                  className="item-bar-button"
                  onClick={() => setIsSpaceMenuOpen((open) => !open)}
                  aria-label="Move to Space"
                  aria-expanded={isSpaceMenuOpen}
                  title="Move to Space"
                >
                  <HugeiconsIcon icon={FolderAddIcon} size={15} />
                </button>
              )}
              {shownItem.sourceUrl && (
                <button
                  type="button"
                  className="item-bar-button"
                  onClick={() => window.open(shownItem.sourceUrl, "_blank", "noopener,noreferrer")}
                  aria-label={`Open ${sourceHost ?? "original"}`}
                  title={`Open ${sourceHost ?? "original"}`}
                >
                  <HugeiconsIcon icon={ArrowUpRight01Icon} size={15} />
                </button>
              )}
              <button
                type="button"
                className="item-bar-button"
                onClick={() => void actions.onForget(shownItem)}
                aria-label="Archive"
                title="Archive"
              >
                <HugeiconsIcon icon={Archive01Icon} size={15} />
              </button>
            </footer>
          )}
        </aside>
      </section>
    </div>
  );
}
