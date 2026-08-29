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
  overlayMediaHeight,
  overlayPosition,
  overlayWidth,
  prefersReducedMotion,
  queryCardRects,
  rectFrom,
  type FlightRect,
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

type OverlayDestination = { frame: FlightRect; mediaHeight: number };

type Flight =
  | { kind: "open"; id: number; originCard: FlightRect; originMediaHeight: number; destination: OverlayDestination }
  | {
      kind: "close";
      id: number;
      fromItem: LibraryItem;
      fromCard: FlightRect;
      fromMediaHeight: number;
      toRects: SourceRects | null;
      thenOpen: boolean;
    };

const CARD_RADIUS = 14;
const OVERLAY_RADIUS = 18;

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

type ExpandedItemOverlayProps = {
  item: LibraryItem;
  actions: ExpandedOverlayActions;
  originRectsRef: RefObject<SourceRects | null>;
  contentAreaRef: RefObject<HTMLElement | null>;
};

export function ExpandedItemOverlay({ item, actions, originRectsRef, contentAreaRef }: ExpandedItemOverlayProps) {
  const layerRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const mediaRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const itemIdRef = useRef(item.id);
  const itemRef = useRef(item);
  const previousItemRef = useRef(item);
  const copyTimerRef = useRef<number | null>(null);
  const flightIdRef = useRef(0);
  const flightRef = useRef<Flight | null>(null);
  const destinationRef = useRef<OverlayDestination | null>(null);
  const cancelPendingOpenRef = useRef(false);
  const hasSettledOnceRef = useRef(false);
  const [destination, setDestination] = useState<OverlayDestination | null>(null);
  const [flight, setFlight] = useState<Flight | null>(null);
  const [pendingOpen, setPendingOpen] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  itemRef.current = item;
  flightRef.current = flight;

  // The item whose content the dialog shows. During a closing flight that was
  // triggered by switching items, the dialog flies back displaying the item it
  // was showing, while React's item prop already points at the next one.
  const shownItem = flight?.kind === "close" ? flight.fromItem : item;

  const contentAreaRect = (): FlightRect => {
    const rect = contentAreaRef.current?.getBoundingClientRect();
    if (rect) return rectFrom(rect);
    return { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
  };

  // Lays the dialog out at the destination width, measures its natural
  // content height, and picks a frame centered on the parent card.
  const beginOpenFlight = (origin: SourceRects) => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const content = contentAreaRect();
    const width = overlayWidth(content);
    const mediaHeight = overlayMediaHeight(itemRef.current, width, window.innerHeight);

    dialog.style.width = `${width}px`;
    dialog.style.height = "auto";
    if (mediaRef.current) mediaRef.current.style.height = `${mediaHeight}px`;
    const contentHeight = dialog.offsetHeight;
    const availHeight = Math.max(content.height - 24 * 2, 240);
    const height = Math.min(Math.max(contentHeight, 320), availHeight);
    const position = overlayPosition(origin.card, content, width, height);

    const destination: OverlayDestination = {
      frame: { left: position.left, top: position.top, width, height },
      mediaHeight,
    };
    destinationRef.current = destination;
    setDestination(destination);
    flightIdRef.current += 1;
    setFlight({
      kind: "open",
      id: flightIdRef.current,
      originCard: origin.card,
      originMediaHeight: origin.media.height,
      destination,
    });
  };

  // Picks the overlay's frame before the opening animation starts. Openings
  // always run over the general area of the item's parent card.
  useLayoutEffect(() => {
    const originRects = originRectsRef.current;
    if (!originRects || prefersReducedMotion()) {
      gsap.fromTo(layerRef.current, { opacity: 0 }, { opacity: 1, duration: 0.18, ease: "power1.out" });
      return;
    }
    beginOpenFlight(originRects);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Runs every flight. GSAP owns the overlay's rectangle geometry. The real
  // content stays mounted and laid out at the destination width for the whole
  // flight — the frame is all that moves — so text never re-wraps and
  // nothing unmounts or flashes mid-animation.
  useLayoutEffect(() => {
    if (!flight) return;
    const media = mediaRef.current;
    const dialog = dialogRef.current;

    if (flight.kind === "open") {
      if (!dialog || !media) return;
      const duration = OVERLAY_FLIGHT_MS / 1000;
      const hasEmbed =
        itemRef.current.social?.provider === "x" || (itemRef.current.kind === "Video" && !!itemRef.current.video);
      const timeline = gsap.timeline({
        onComplete: () => {
          setFlight(null);
          closeButtonRef.current?.focus({ preventScroll: true });
        },
      });
      timeline
        .fromTo(
          dialog,
          {
            left: flight.originCard.left,
            top: flight.originCard.top,
            width: flight.originCard.width,
            height: flight.originCard.height,
            borderRadius: CARD_RADIUS,
          },
          {
            left: flight.destination.frame.left,
            top: flight.destination.frame.top,
            width: flight.destination.frame.width,
            height: flight.destination.frame.height,
            borderRadius: OVERLAY_RADIUS,
            duration,
            ease: OVERLAY_EASE,
            autoRound: false,
          },
          0,
        )
        .fromTo(dialog, { opacity: 0 }, { opacity: 1, duration: 0.12, ease: "power1.out" }, 0);
      if (hasEmbed) {
        // Third-party embeds keep a stable frame for the whole flight.
        gsap.set(media, { height: flight.destination.mediaHeight });
      } else {
        timeline.fromTo(
          media,
          { height: flight.originMediaHeight },
          { height: flight.destination.mediaHeight, duration, ease: OVERLAY_EASE, autoRound: false },
          0,
        );
      }
      return () => {
        timeline.kill();
      };
    }

    // Closing: the dialog returns to its source card and dissolves into it,
    // or — when the source card is no longer mounted — fades out in place.
    if (!dialog || !media) {
      actions.onClose();
      return;
    }
    const duration = OVERLAY_FLIGHT_MS / 1000;
    const hasEmbed =
      flight.fromItem.social?.provider === "x" || (flight.fromItem.kind === "Video" && !!flight.fromItem.video);
    const timeline = gsap.timeline({
      onComplete: () => {
        if (flight.thenOpen && !cancelPendingOpenRef.current) {
          setFlight(null);
          setPendingOpen(true);
        } else {
          actions.onClose();
        }
      },
    });
    if (flight.toRects) {
      timeline
        .fromTo(
          dialog,
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
        .to(dialog, { opacity: 0, duration: 0.18, ease: "power1.in" }, duration - 0.18);
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
    } else {
      timeline.to(dialog, { opacity: 0, duration: 0.25, ease: "power1.in" });
    }
    return () => {
      timeline.kill();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flight]);

  // Re-clamps and re-measures the settled overlay when the window resizes.
  useEffect(() => {
    const onResize = () => {
      const dialog = dialogRef.current;
      if (!dialog || !destinationRef.current) return;
      const content = contentAreaRect();
      const width = overlayWidth(content);
      const mediaHeight = overlayMediaHeight(itemRef.current, width, window.innerHeight);
      dialog.style.width = `${width}px`;
      if (mediaRef.current) mediaRef.current.style.height = `${mediaHeight}px`;
      const contentHeight = dialog.offsetHeight;
      const availHeight = Math.max(content.height - 24 * 2, 240);
      const height = Math.min(Math.max(contentHeight, 320), availHeight);
      const cardCenterX = destinationRef.current.frame.left + destinationRef.current.frame.width / 2;
      const cardCenterY = destinationRef.current.frame.top + destinationRef.current.frame.height / 2;
      const position = overlayPosition(
        { left: cardCenterX - width / 2, top: cardCenterY - height / 2, width, height },
        content,
        width,
        height,
      );
      const next: OverlayDestination = { frame: { left: position.left, top: position.top, width, height }, mediaHeight };
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

  // Switching items while the overlay is open runs sequentially: the open
  // overlay first animates closed into the card it was showing, and only
  // after it lands does the newly selected item animate open from its own
  // card. Rapid clicks during the closing leg are absorbed — the flight
  // completes once and then opens the most recently selected item.
  useLayoutEffect(() => {
    const previous = previousItemRef.current;
    if (previous.id === item.id) return;
    previousItemRef.current = item;

    const activeFlight = flightRef.current;
    if (activeFlight?.kind === "close") return;
    if (activeFlight?.kind === "open") {
      // Retarget the in-progress open from its current visual state.
      const dialog = dialogRef.current;
      const media = mediaRef.current;
      const rects = queryCardRects(item.id);
      if (!dialog || !media || !rects) return;
      const fromMediaHeight = media.getBoundingClientRect().height;
      cancelPendingOpenRef.current = false;
      beginOpenFlightFrom(fromMediaHeight, rects);
      return;
    }

    // Settled: close into the old card, then open the new selection.
    cancelPendingOpenRef.current = false;
    const previousRects = queryCardRects(previous.id);
    beginCloseFlight(previous, previousRects, /* thenOpen */ true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  // When a sequential switch's closing leg lands, open the newly selected
  // item from its own card. The dialog is measured at the destination width
  // so the frame height fits its content with no leftover whitespace.
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
    beginOpenFlight(rects);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingOpen, flight]);

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

  const beginCloseFlight = (closingItem: LibraryItem, toRects: SourceRects | null, thenOpen: boolean) => {
    const dialog = dialogRef.current;
    const media = mediaRef.current;
    if (!dialog) {
      actionsRef.current.onClose();
      return;
    }
    const fromCard = rectFrom(dialog.getBoundingClientRect());
    const fromMediaHeight = media ? media.getBoundingClientRect().height : 0;
    flightIdRef.current += 1;
    setFlight({
      kind: "close",
      id: flightIdRef.current,
      fromItem: closingItem,
      fromCard,
      fromMediaHeight,
      toRects,
      thenOpen,
    });
  };

  const beginOpenFlightFrom = (fromMediaHeight: number, origin: SourceRects) => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const content = contentAreaRect();
    const width = overlayWidth(content);
    const mediaHeight = overlayMediaHeight(itemRef.current, width, window.innerHeight);

    const measuredBefore = dialog.getBoundingClientRect();
    dialog.style.width = `${width}px`;
    dialog.style.height = "auto";
    if (mediaRef.current) mediaRef.current.style.height = `${mediaHeight}px`;
    const contentHeight = dialog.offsetHeight;
    const availHeight = Math.max(content.height - 24 * 2, 240);
    const height = Math.min(Math.max(contentHeight, 320), availHeight);
    const position = overlayPosition(origin.card, content, width, height);

    const destination: OverlayDestination = {
      frame: { left: position.left, top: position.top, width, height },
      mediaHeight,
    };
    destinationRef.current = destination;
    setDestination(destination);
    flightIdRef.current += 1;
    setFlight({
      kind: "open",
      id: flightIdRef.current,
      originCard: measuredBefore,
      originMediaHeight: fromMediaHeight,
      destination,
    });
  };

  // All close paths funnel through here so the closing flight can run before
  // the overlay unmounts. Cards that are no longer mounted fall back to a
  // short opacity fade.
  const requestClose = () => {
    const activeFlight = flightRef.current;
    if (activeFlight?.kind === "close") {
      if (activeFlight.thenOpen) cancelPendingOpenRef.current = true;
      return;
    }
    const rects = queryCardRects(itemIdRef.current);
    if (prefersReducedMotion() || !rects || !dialogRef.current) {
      if (flightRef.current) setFlight(null);
      gsap.to(layerRef.current, { opacity: 0, duration: 0.15, onComplete: actionsRef.current.onClose });
      return;
    }
    cancelPendingOpenRef.current = false;
    beginCloseFlight(itemRef.current, rects, false);
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

  const dialogFlying = flight?.kind === "open" || flight?.kind === "close";
  const placedStyle: CSSProperties | undefined = destination
    ? { left: destination.frame.left, top: destination.frame.top, width: destination.frame.width, height: destination.frame.height }
    : undefined;

  function copySourceLink() {
    if (!shownItem.sourceUrl) return;
    void navigator.clipboard.writeText(shownItem.sourceUrl).then(() => {
      setLinkCopied(true);
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = window.setTimeout(() => setLinkCopied(false), 2000);
    });
  }

  const triage = triageActions(shownItem, actions);

  return (
    <div className="expanded-overlay-layer" ref={layerRef}>
      <section
        ref={dialogRef}
        className={`expanded-overlay ${destination ? "is-placed" : ""} ${dialogFlying ? "is-flying" : ""}`}
        role="dialog"
        aria-modal={false}
        aria-label={shownItem.title}
        style={dialogFlying ? undefined : placedStyle}
      >
        <header className="expanded-overlay-header">
          <span className="expanded-overlay-kicker"><KindIcon kind={shownItem.kind} />{shownItem.kind}</span>
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
          style={dialogFlying ? undefined : ({ height: destination ? overlayMediaHeight(shownItem, destination.frame.width, window.innerHeight) : undefined } as CSSProperties)}
        >
          <OverlayMedia item={shownItem} />
        </div>

        <div
          className="expanded-overlay-body"
          ref={bodyRef}
          style={dialogFlying && destination ? { width: destination.frame.width } : undefined}
        >
          <div className="card-kicker"><span><KindIcon kind={shownItem.kind} />{shownItem.kind}</span><span>{shownItem.date}</span></div>
          {shownItem.kind === "Quote" ? (
            <>
              <blockquote className="detail-quote">“{shownItem.title}”</blockquote>
              {shownItem.description && <p className="detail-attribution">— {shownItem.description.replace(/^—\s*/u, "")}</p>}
            </>
          ) : (
            <>
              <h2 className="expanded-overlay-title">{shownItem.title}</h2>
              {shownItem.description && <p className="expanded-overlay-description">{shownItem.description}</p>}
            </>
          )}
          {shownItem.processing?.active && (
            <div className="detail-processing" role="status">
              <LoaderCircle size={14} />
              <span>{shownItem.processing.message ?? "Processing"}</span>
              {shownItem.processing.progressTotal != null && <span>{shownItem.processing.progressCurrent}/{shownItem.processing.progressTotal}</span>}
            </div>
          )}
          {shownItem.processing?.failedJob && (
            <div className="detail-processing failed" role="alert">
              <AlertCircle size={14} />
              <span>{shownItem.processing.failedJob.errorMessage ?? "Processing failed"}</span>
              <button type="button" className="retry-button" onClick={() => void actions.onRetryJob(shownItem.processing?.failedJob?.id ?? "")}>
                <RotateCw size={12} /> Try again
              </button>
            </div>
          )}
          <div className="detail-source"><span>Source</span><strong>{shownItem.source}</strong></div>
          <div className="tag-row">{shownItem.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div>

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

          {shownItem.sourceUrl && (
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
    </div>
  );
}
