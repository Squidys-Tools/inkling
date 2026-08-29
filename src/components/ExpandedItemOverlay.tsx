import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { gsap } from "gsap";
import { AlertCircle, BookOpen, Check, Copy, ExternalLink, FileText, LoaderCircle, RotateCw, Sparkles, X } from "lucide-react";
import type { LibraryItem } from "../App";
import { isTauriRuntime } from "../lib/libraryApi";
import type { ReaderOrigin } from "../ReaderView";
import { KindIcon, PostArtwork, XPostEmbed, DetailVideoMedia } from "./ItemMedia";
import {
  OVERLAY_EASE,
  OVERLAY_FLIGHT_MS,
  computeOverlayDestination,
  overlayMediaHeight,
  prefersReducedMotion,
  queryCardRects,
  rectFrom,
  refitDestination,
  relativeBox,
  type FlightRect,
  type OverlayDestination,
  type SourceRects,
} from "./overlayMotion";

export type ExpandedOverlayActions = {
  onClose: () => void;
  onOpenPdf: (item: LibraryItem) => void;
  onOpenReader: (item: LibraryItem, origin: ReaderOrigin) => void;
  onFindSimilar: (item: LibraryItem) => void;
  onRetryJob: (jobId: string) => void | Promise<void>;
  isFindingSimilar: boolean;
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
  | { kind: "open"; id: number; originRects: SourceRects; destination: OverlayDestination }
  | {
      kind: "switch";
      id: number;
      fromItem: LibraryItem;
      fromRects: SourceRects;
      toRects: SourceRects;
      destination: OverlayDestination;
      headerHeight: number;
    }
  | { kind: "close"; id: number; fromCard: FlightRect; fromMediaHeight: number; toRects: SourceRects };

const CARD_RADIUS = 14;
const OVERLAY_RADIUS = 18;
const CARD_SHADOW = "0 11px 27px rgba(0,0,0,.45)";
const OVERLAY_SHADOW = "0 30px 80px rgba(0,0,0,.55)";

function clickOrigin(event: React.MouseEvent<HTMLElement>): ReaderOrigin {
  const rect = event.currentTarget.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

// The overlay keeps two triage actions in view: a primary (read / play / open)
// and secondary (open original / find similar). Everything after the first
// entry renders in the secondary slot.
function triageActions(item: LibraryItem, actions: ExpandedOverlayActions): OverlayAction[] {
  const list: OverlayAction[] = [];
  const openOriginal: OverlayAction = {
    key: "open-original",
    label: "Open original",
    icon: <ExternalLink size={15} />,
    onClick: () => item.sourceUrl && window.open(item.sourceUrl, "_blank", "noopener,noreferrer"),
    disabled: !item.sourceUrl,
  };

  if (item.kind === "PDF" && item.fileUrl) {
    list.push({ key: "open-pdf", label: "Open PDF", icon: <FileText size={15} />, onClick: () => actions.onOpenPdf(item) });
  }
  if (item.kind === "Article" && item.articleHtml) {
    list.push({
      key: "read",
      label: "Read",
      icon: <BookOpen size={15} />,
      onClick: (event) => actions.onOpenReader(item, clickOrigin(event)),
    });
  }
  if (list.length === 0 || item.sourceUrl) list.push(openOriginal);
  if (item.kind === "Image" && isTauriRuntime()) {
    list.push({
      key: "find-similar",
      label: actions.isFindingSimilar ? "Finding similar…" : "Find similar",
      icon: <Sparkles size={15} />,
      onClick: () => actions.onFindSimilar(item),
      disabled: actions.isFindingSimilar,
    });
  }
  if (item.kind === "Article" && !item.articleHtml && item.sourceUrl) {
    list.push({
      key: "read-unavailable",
      label: "Read",
      icon: <BookOpen size={15} />,
      onClick: () => {},
      disabled: true,
      title: "No saved article text",
    });
  }
  return list;
}

function OverlayMedia({ item }: { item: LibraryItem }) {
  if (item.social?.provider === "x") {
    return (
      <div className="expanded-overlay-media detail-x-post">
        <XPostEmbed
          social={item.social}
          fallback={item.post ? <PostArtwork post={item.post} /> : <div className="detail-art ink">Post preview unavailable.</div>}
        />
      </div>
    );
  }

  if (item.kind === "Video") {
    return (
      <div className="expanded-overlay-media">
        <DetailVideoMedia item={item} />
      </div>
    );
  }

  if (item.image) {
    return (
      <div className="expanded-overlay-media">
        <img src={item.image} alt={item.imageAlt ?? item.title} className="detail-image" />
      </div>
    );
  }

  if (item.kind === "Quote") {
    return (
      <div className="expanded-overlay-media">
        <div className="detail-art detail-quote-art paper-yellow">
          <span className="detail-quote-mark">“</span>
          <span>{item.kind}</span>
        </div>
      </div>
    );
  }

  if (item.kind === "Post" && item.post) {
    return (
      <div className="expanded-overlay-media">
        <PostArtwork post={item.post} />
      </div>
    );
  }

  return (
    <div className="expanded-overlay-media">
      <div className={`detail-art ${item.accent ?? "ink"}`}>
        <KindIcon kind={item.kind} />
        <span>{item.kind}</span>
      </div>
    </div>
  );
}

// Non-interactive media representation for flight frames. Third-party embeds
// are replaced with their static fallback so no live iframe is ever
// duplicated or transform-scaled during a transition.
function FlightMedia({ item }: { item: LibraryItem }) {
  if (item.image) {
    return <img src={item.image} alt={item.imageAlt ?? item.title} className="overlay-flight-img" />;
  }
  if (item.social?.provider === "x" && item.post) {
    return (
      <div className="overlay-flight-art">
        <PostArtwork post={item.post} />
      </div>
    );
  }
  if (item.kind === "Quote") {
    return (
      <div className="overlay-flight-art detail-quote-art paper-yellow">
        <span className="detail-quote-mark">“</span>
        <span>{item.kind}</span>
      </div>
    );
  }
  return (
    <div className={`overlay-flight-art ${item.accent ?? "ink"}`}>
      <KindIcon kind={item.kind} />
      <span>{item.kind}</span>
    </div>
  );
}

type ExpandedItemOverlayProps = {
  item: LibraryItem;
  actions: ExpandedOverlayActions;
  originRectsRef: RefObject<SourceRects | null>;
  contentAreaRef: RefObject<HTMLElement | null>;
};

export function ExpandedItemOverlay({ item, actions, originRectsRef, contentAreaRef }: ExpandedItemOverlayProps) {
  const layerRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const mediaRef = useRef<HTMLDivElement>(null);
  const outgoingFrameRef = useRef<HTMLDivElement>(null);
  const outgoingMediaRef = useRef<HTMLDivElement>(null);
  const incomingFrameRef = useRef<HTMLDivElement>(null);
  const incomingMediaRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const itemIdRef = useRef(item.id);
  const itemRef = useRef(item);
  const previousItemRef = useRef(item);
  const copyTimerRef = useRef<number | null>(null);
  const flightIdRef = useRef(0);
  const flightRef = useRef<Flight | null>(null);
  const destinationRef = useRef<OverlayDestination | null>(null);
  const originRatioRef = useRef(1.45);
  const hasSettledOnceRef = useRef(false);
  const [destination, setDestination] = useState<OverlayDestination | null>(null);
  const [flight, setFlight] = useState<Flight | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  itemRef.current = item;
  flightRef.current = flight;

  const contentAreaRect = (): FlightRect => {
    const rect = contentAreaRef.current?.getBoundingClientRect();
    if (rect) return rectFrom(rect);
    return { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
  };

  const measureHeaderHeight = (): number => headerRef.current?.offsetHeight ?? 52;

  // Picks the overlay's final rectangle before the opening animation starts.
  useLayoutEffect(() => {
    const originRects = originRectsRef.current;
    const content = contentAreaRect();
    const ratio = originRects ? originRects.card.width / Math.max(originRects.card.height, 1) : 1.45;
    originRatioRef.current = ratio;
    const sourceForPlacement: SourceRects =
      originRects ?? {
        card: { left: content.left + content.width / 2 - 100, top: content.top + content.height / 2 - 69, width: 200, height: 138 },
        media: { left: content.left + content.width / 2 - 100, top: content.top + content.height / 2 - 69, width: 200, height: 138 },
      };
    const next = computeOverlayDestination(sourceForPlacement, content, item, window.innerHeight);
    destinationRef.current = next;
    setDestination(next);
    if (!originRects || prefersReducedMotion()) {
      gsap.fromTo(layerRef.current, { opacity: 0 }, { opacity: 1, duration: 0.18, ease: "power1.out" });
      return;
    }
    flightIdRef.current += 1;
    setFlight({ kind: "open", id: flightIdRef.current, originRects, destination: next });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Runs every flight. GSAP owns the overlay's rectangle geometry. The
  // dialog's real content stays mounted and laid out at the destination
  // width during the whole flight — the frame is all that moves — so text
  // never re-wraps mid-flight and nothing unmounts or flashes.
  useLayoutEffect(() => {
    if (!flight) return;
    const media = mediaRef.current;

    if (flight.kind === "open") {
      if (!dialogRef.current || !media) return;
      const { originRects, destination: dest } = flight;
      const duration = OVERLAY_FLIGHT_MS / 1000;
      const hasEmbed = itemRef.current.social?.provider === "x" || (itemRef.current.kind === "Video" && !!itemRef.current.video);
      const timeline = gsap.timeline({
        onComplete: () => {
          setFlight(null);
          closeButtonRef.current?.focus({ preventScroll: true });
        },
      });
      timeline
        .fromTo(
          dialogRef.current,
          {
            left: originRects.card.left,
            top: originRects.card.top,
            width: originRects.card.width,
            height: originRects.card.height,
            borderRadius: CARD_RADIUS,
          },
          {
            left: dest.frame.left,
            top: dest.frame.top,
            width: dest.frame.width,
            height: dest.frame.height,
            borderRadius: OVERLAY_RADIUS,
            duration,
            ease: OVERLAY_EASE,
            autoRound: false,
          },
          0,
        )
        .fromTo(dialogRef.current, { opacity: 0 }, { opacity: 1, duration: 0.12, ease: "power1.out" }, 0);
      if (hasEmbed) {
        // Third-party embeds keep a stable frame for the whole flight.
        gsap.set(media, { height: dest.mediaHeight });
      } else {
        timeline.fromTo(
          media,
          { height: originRects.media.height },
          { height: dest.mediaHeight, duration, ease: OVERLAY_EASE, autoRound: false },
          0,
        );
      }
      return () => {
        timeline.kill();
      };
    }

    if (flight.kind === "close") {
      if (!dialogRef.current || !media) {
        actions.onClose();
        return;
      }
      const duration = OVERLAY_FLIGHT_MS / 1000;
      const hasEmbed = itemRef.current.social?.provider === "x" || (itemRef.current.kind === "Video" && !!itemRef.current.video);
      const timeline = gsap.timeline({ onComplete: actions.onClose });
      timeline
        .fromTo(
          dialogRef.current,
          { left: flight.fromCard.left, top: flight.fromCard.top, width: flight.fromCard.width, height: flight.fromCard.height },
          {
            left: flight.toRects.card.left,
            top: flight.toRects.card.top,
            width: flight.toRects.card.width,
            height: flight.toRects.card.height,
            borderRadius: CARD_RADIUS,
            duration,
            ease: OVERLAY_EASE,
            autoRound: false,
          },
          0,
        )
        .to(dialogRef.current, { opacity: 0, duration: 0.18, ease: "power1.in" }, duration - 0.18);
      if (hasEmbed) {
        gsap.set(media, { height: flight.fromMediaHeight });
      } else {
        timeline.fromTo(
          media,
          { height: flight.fromMediaHeight },
          { height: flight.toRects.media.height, duration, ease: OVERLAY_EASE, autoRound: false },
          0,
        );
      }
      return () => {
        timeline.kill();
      };
    }

    // Switch flight: two temporary representations. The outgoing one returns
    // to its source card while the incoming one grows into the same overlay
    // destination; the live dialog stays settled on top of nothing and the
    // ghosts cover it only where they overlap.
    const outgoingFrame = outgoingFrameRef.current;
    const outgoingMedia = outgoingMediaRef.current;
    const incomingFrame = incomingFrameRef.current;
    const incomingMedia = incomingMediaRef.current;
    if (!outgoingFrame || !outgoingMedia || !incomingFrame || !incomingMedia) return;
    const dest = flight.destination;
    const fromMediaHeight = overlayMediaHeight(flight.fromItem, dest.frame.width, window.innerHeight);
    const toMediaHeight = overlayMediaHeight(itemRef.current, dest.frame.width, window.innerHeight);
    const duration = OVERLAY_FLIGHT_MS / 1000;
    const outgoingFromMedia = { left: 0, top: flight.headerHeight, width: dest.frame.width, height: fromMediaHeight };
    const outgoingToMedia = relativeBox(flight.fromRects.media, flight.fromRects.card);
    const incomingFromMedia = relativeBox(flight.toRects.media, flight.toRects.card);
    const incomingToMedia = { left: 0, top: flight.headerHeight, width: dest.frame.width, height: toMediaHeight };
    const timeline = gsap.timeline({ onComplete: () => setFlight(null) });
    timeline
      .fromTo(
        outgoingFrame,
        { left: dest.frame.left, top: dest.frame.top, width: dest.frame.width, height: dest.frame.height, borderRadius: OVERLAY_RADIUS, boxShadow: OVERLAY_SHADOW },
        {
          left: flight.fromRects.card.left,
          top: flight.fromRects.card.top,
          width: flight.fromRects.card.width,
          height: flight.fromRects.card.height,
          borderRadius: CARD_RADIUS,
          boxShadow: CARD_SHADOW,
          duration,
          ease: OVERLAY_EASE,
          autoRound: false,
        },
        0,
      )
      .fromTo(
        outgoingMedia,
        { left: outgoingFromMedia.left, top: outgoingFromMedia.top, width: outgoingFromMedia.width, height: outgoingFromMedia.height },
        { left: outgoingToMedia.left, top: outgoingToMedia.top, width: outgoingToMedia.width, height: outgoingToMedia.height, duration, ease: OVERLAY_EASE, autoRound: false },
        0,
      )
      .fromTo(
        incomingFrame,
        { left: flight.toRects.card.left, top: flight.toRects.card.top, width: flight.toRects.card.width, height: flight.toRects.card.height, borderRadius: CARD_RADIUS, boxShadow: CARD_SHADOW },
        {
          left: dest.frame.left,
          top: dest.frame.top,
          width: dest.frame.width,
          height: dest.frame.height,
          borderRadius: OVERLAY_RADIUS,
          boxShadow: OVERLAY_SHADOW,
          duration,
          ease: OVERLAY_EASE,
          autoRound: false,
        },
        0,
      )
      .fromTo(
        incomingMedia,
        { left: incomingFromMedia.left, top: incomingFromMedia.top, width: incomingFromMedia.width, height: incomingFromMedia.height },
        { left: incomingToMedia.left, top: incomingToMedia.top, width: incomingToMedia.width, height: incomingToMedia.height, duration, ease: OVERLAY_EASE, autoRound: false },
        0,
      );
    return () => {
      timeline.kill();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flight]);

  // Re-clamps the settled geometry when the window is resized. The placement
  // decision itself stays as chosen at open time.
  useEffect(() => {
    const onResize = () => {
      const current = destinationRef.current;
      if (!current) return;
      const next = refitDestination(current, originRatioRef.current, contentAreaRect(), itemRef.current, window.innerHeight);
      destinationRef.current = next;
      setDestination(next);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    itemIdRef.current = item.id;
  }, [item.id]);

  // Switching items while the overlay is open. Both source cards keep their
  // live grid positions; the ghosts do all flying and the dialog content
  // swaps underneath. Interruptions cancel the active timeline and start
  // from the current visual state.
  useLayoutEffect(() => {
    const previous = previousItemRef.current;
    if (previous.id === item.id) return;
    previousItemRef.current = item;
    const activeFlight = flightRef.current;
    if (activeFlight && (activeFlight.kind === "open" || activeFlight.kind === "close")) {
      if (mediaRef.current) gsap.set(mediaRef.current, { clearProps: "height" });
      if (dialogRef.current) gsap.set(dialogRef.current, { clearProps: "opacity" });
    }
    setFlight(null);
    if (prefersReducedMotion()) return;
    const fromRects = queryCardRects(previous.id);
    const toRects = queryCardRects(item.id);
    const dest = destinationRef.current;
    if (!fromRects || !toRects || !dest) {
      if (bodyRef.current) gsap.fromTo(bodyRef.current, { opacity: 0.35 }, { opacity: 1, duration: 0.15 });
      return;
    }
    flightIdRef.current += 1;
    setFlight({ kind: "switch", id: flightIdRef.current, fromItem: previous, fromRects, toRects, destination: dest, headerHeight: measureHeaderHeight() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  // On close, hand focus back to the source card while it is still mounted.
  // Skipping the restore when focus already moved elsewhere (nav, search)
  // avoids yanking it back out of whatever the user clicked.
  useEffect(() => () => {
    const focusOwner = document.activeElement;
    const overlayHasFocus = focusOwner instanceof HTMLElement && (dialogRef.current?.contains(focusOwner) ?? false);
    if (!overlayHasFocus && focusOwner !== document.body) return;
    const card = document.querySelector<HTMLElement>(
      `.library-card[data-library-item-id="${CSS.escape(String(itemIdRef.current))}"]`,
    );
    card?.focus({ preventScroll: true });
  }, []);

  // Move focus to the close control when the overlay finishes opening.
  useLayoutEffect(() => {
    if (flight || !destination || hasSettledOnceRef.current) return;
    hasSettledOnceRef.current = true;
    closeButtonRef.current?.focus({ preventScroll: true });
  }, [flight, destination]);

  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  // All close paths funnel through here so the closing flight can run before
  // the overlay unmounts. Cards that are no longer mounted fall back to a
  // short opacity fade.
  const requestClose = () => {
    if (flightRef.current?.kind === "close") return;
    const rects = queryCardRects(itemIdRef.current);
    const dialog = dialogRef.current;
    const media = mediaRef.current;
    let fromCard: FlightRect | null = null;
    let fromMediaHeight: number | null = null;
    if (dialog) {
      fromCard = rectFrom(dialog.getBoundingClientRect());
      fromMediaHeight = media ? media.getBoundingClientRect().height : null;
    }
    if (prefersReducedMotion() || !rects || !fromCard || !fromMediaHeight) {
      if (flightRef.current) setFlight(null);
      gsap.to(layerRef.current, { opacity: 0, duration: 0.15, onComplete: actionsRef.current.onClose });
      return;
    }
    flightIdRef.current += 1;
    setFlight({ kind: "close", id: flightIdRef.current, fromCard, fromMediaHeight, toRects: rects });
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      requestClose();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Modeless close: clicks on empty library space dismiss the overlay, while
  // clicks on cards fall through to the card's own handler, which switches
  // the overlay to that item.
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (dialogRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest(".library-card")) return;
      requestClose();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => {
    if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
  }, []);

  const triage = triageActions(item, actions);
  const dialogFlying = flight?.kind === "open" || flight?.kind === "close";
  const placedStyle: CSSProperties | undefined = destination
    ? { left: destination.frame.left, top: destination.frame.top, width: destination.frame.width, height: destination.frame.height }
    : undefined;

  function copySourceLink() {
    if (!item.sourceUrl) return;
    void navigator.clipboard.writeText(item.sourceUrl).then(() => {
      setLinkCopied(true);
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = window.setTimeout(() => setLinkCopied(false), 2000);
    });
  }

  return (
    <div className="expanded-overlay-layer" ref={layerRef}>
      <section
        ref={dialogRef}
        className={`expanded-overlay ${destination ? "is-placed" : ""} ${dialogFlying ? "is-flying" : ""}`}
        role="dialog"
        aria-modal={false}
        aria-label={item.title}
        style={dialogFlying ? undefined : placedStyle}
      >
        <header className="expanded-overlay-header" ref={headerRef}>
          <span className="expanded-overlay-kicker"><KindIcon kind={item.kind} />{item.kind}</span>
          <button
            type="button"
            ref={closeButtonRef}
            className="expanded-overlay-close"
            onClick={requestClose}
            aria-label="Close details"
          >
            <X size={16} />
          </button>
        </header>

        <div
          className="expanded-overlay-media"
          ref={mediaRef}
          style={dialogFlying ? undefined : ({ height: destination ? overlayMediaHeight(item, destination.frame.width, window.innerHeight) : undefined } as CSSProperties)}
        >
          <OverlayMedia item={item} />
        </div>

        <div
          className="expanded-overlay-body"
          ref={bodyRef}
          style={dialogFlying && destination ? { width: destination.frame.width } : undefined}
        >
          <div className="card-kicker"><span><KindIcon kind={item.kind} />{item.kind}</span><span>{item.date}</span></div>
          {item.kind === "Quote" ? (
            <>
              <blockquote className="detail-quote">“{item.title}”</blockquote>
              {item.description && <p className="detail-attribution">— {item.description.replace(/^—\s*/u, "")}</p>}
            </>
          ) : (
            <>
              <h2 className="expanded-overlay-title">{item.title}</h2>
              {item.description && <p className="expanded-overlay-description">{item.description}</p>}
            </>
          )}
          {item.processing?.active && (
            <div className="detail-processing" role="status">
              <LoaderCircle size={14} />
              <span>{item.processing.message ?? "Processing"}</span>
              {item.processing.progressTotal != null && <span>{item.processing.progressCurrent}/{item.processing.progressTotal}</span>}
            </div>
          )}
          {item.processing?.failedJob && (
            <div className="detail-processing failed" role="alert">
              <AlertCircle size={14} />
              <span>{item.processing.failedJob.errorMessage ?? "Processing failed"}</span>
              <button type="button" className="retry-button" onClick={() => void actions.onRetryJob(item.processing?.failedJob?.id ?? "")}>
                <RotateCw size={12} /> Try again
              </button>
            </div>
          )}
          <div className="detail-source"><span>Source</span><strong>{item.source}</strong></div>
          <div className="tag-row">{item.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div>

          <div className="expanded-overlay-actions">
            {triage.map((action, index) => (
              <button
                type="button"
                key={action.key}
                className={index === 0 ? "overlay-action-primary" : "overlay-action-secondary"}
                onClick={action.onClick}
                disabled={action.disabled}
                title={action.title}
              >
                {action.icon} {action.label}
              </button>
            ))}
          </div>

          {item.sourceUrl && (
            <div className="expanded-overlay-utility">
              <button type="button" className="expanded-overlay-utility-action" onClick={copySourceLink} aria-label="Copy link to original">
                {linkCopied ? <Check size={13} /> : <Copy size={13} />} {linkCopied ? "Copied" : "Copy link"}
              </button>
            </div>
          )}

          {/* Insertion point for related items (overlay PR 3); renders nothing until then. */}
          <div className="expanded-overlay-related" hidden />
        </div>
      </section>

      {flight?.kind === "switch" && (
        <>
          <div
            className="overlay-flight-frame"
            ref={outgoingFrameRef}
            style={{ left: flight.destination.frame.left, top: flight.destination.frame.top, width: flight.destination.frame.width, height: flight.destination.frame.height }}
          >
            <div
              className="overlay-flight-media"
              ref={outgoingMediaRef}
              style={{ left: 0, top: flight.headerHeight, width: flight.destination.frame.width, height: overlayMediaHeight(flight.fromItem, flight.destination.frame.width, window.innerHeight) }}
            >
              <FlightMedia item={flight.fromItem} />
            </div>
          </div>
          <div
            className="overlay-flight-frame"
            ref={incomingFrameRef}
            style={{ left: flight.toRects.card.left, top: flight.toRects.card.top, width: flight.toRects.card.width, height: flight.toRects.card.height }}
          >
            <div
              className="overlay-flight-media"
              ref={incomingMediaRef}
              style={{ left: relativeBox(flight.toRects.media, flight.toRects.card).left, top: relativeBox(flight.toRects.media, flight.toRects.card).top, width: relativeBox(flight.toRects.media, flight.toRects.card).width, height: relativeBox(flight.toRects.media, flight.toRects.card).height }}
            >
              <FlightMedia item={item} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
