import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { gsap } from "gsap";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  AlertCircleIcon,
  Archive01Icon,
  ArrowUpRight01Icon,
  BookOpen01Icon,
  CheckmarkCircle01Icon,
  Copy01Icon,
  FileTextIcon,
  Globe02Icon,
  Loading01Icon,
  PinIcon,
  PlusSignIcon,
  RotateCwIcon,
  SparklesIcon,
  Cancel01Icon,
} from "@hugeicons/core-free-icons";
import type { LibraryItem } from "../App";
import { isTauriRuntime } from "../lib/libraryApi";
import type { ReaderOrigin } from "../ReaderView";
import { KindIcon, PdfArtwork, PostArtwork, XPostEmbed, DetailVideoMedia, pdfPreviewTitle } from "./ItemMedia";
import { useDialog } from "./dialog/useDialog";
import {
  OVERLAY_EASE,
  OVERLAY_FLIGHT_MS,
  isCardTooFarOffscreen,
  overlayMediaHeight,
  overlayPosition,
  overlayWidth,
  prefersReducedMotion,
  queryCardRects,
  rectFrom,
  scrollViewport,
  type FlightRect,
  type SourceRects,
} from "./overlayMotion";

export type ExpandedOverlayActions = {
  onClose: () => void;
  onOpenPdf: (item: LibraryItem) => void;
  onOpenReader: (item: LibraryItem, origin: ReaderOrigin) => void;
  onFindSimilar: (item: LibraryItem) => void;
  onForget: (item: LibraryItem) => void | Promise<void>;
  onTogglePin: (item: LibraryItem) => void | Promise<void>;
  onRetryJob: (jobId: string) => void | Promise<void>;
  onAddTag?: (item: LibraryItem, tag: string) => void | Promise<void>;
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

// Variant A (provenance row) derives its quiet metadata line from the item
// itself: the file/media type comes from the pipeline (image extension or
// kind), and the saved date is the item's own date. Tags render from the
// item's tag list with an inline + Add affordance.
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
      return "VIDEO";
    case "Article":
      return "LINK";
    case "Post":
      return "POST";
    case "Note":
      return "NOTE";
    case "Quote":
      return "QUOTE";
    default:
      return "FILE";
  }
}

function savedLabelFor(date: string): string {
  return `SAVED ${date.replace(/^saved\s+/iu, "").toUpperCase()}`;
}

// The overlay keeps two triage actions in view: a primary (read / play / open)
// and secondary (open original / find similar). Everything after the first
// entry renders in the secondary slot.
function triageActions(item: LibraryItem, actions: ExpandedOverlayActions): OverlayAction[] {
  const list: OverlayAction[] = [];
  const sourceHost = hostnameForUrl(item.sourceUrl);
  const openOriginal: OverlayAction = {
    key: "open-original",
    label: sourceHost ?? item.source ?? "Open original",
    icon: sourceHost
      ? <HugeiconsIcon icon={Globe02Icon} size={15} />
      : <HugeiconsIcon icon={ArrowUpRight01Icon} size={15} />,
    onClick: () => item.sourceUrl && window.open(item.sourceUrl, "_blank", "noopener,noreferrer"),
    disabled: !item.sourceUrl,
  };

  if (item.kind === "PDF" && item.fileUrl) {
    list.push({ key: "open-pdf", label: "Open PDF", icon: <HugeiconsIcon icon={FileTextIcon} size={15} />, onClick: () => actions.onOpenPdf(item) });
  }
  if (item.kind === "Article" && item.articleHtml) {
    list.push({
      key: "read",
      label: "Read",
      icon: <HugeiconsIcon icon={BookOpen01Icon} size={15} />,
      onClick: (event) => actions.onOpenReader(item, clickOrigin(event)),
    });
  }
  if (item.sourceUrl) list.push(openOriginal);
  if (isTauriRuntime() && ["Image", "Article", "Note", "Quote"].includes(item.kind)) {
    list.push({
      key: "find-similar",
      label: actions.isFindingSimilar ? "Finding similar…" : "Find similar",
      icon: <HugeiconsIcon icon={SparklesIcon} size={15} />,
      onClick: () => actions.onFindSimilar(item),
      disabled: actions.isFindingSimilar,
    });
  }
  if (item.kind === "Article" && !item.articleHtml && item.sourceUrl) {
    list.push({
      key: "read-unavailable",
      label: "Read",
      icon: <HugeiconsIcon icon={BookOpen01Icon} size={15} />,
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
      <div className="expanded-overlay-media detail-x-post relative h-full flex-none overflow-hidden bg-[#fff]">
        <XPostEmbed
          social={item.social}
          fallback={item.post ? <PostArtwork post={item.post} /> : <div className="detail-art ink">Post preview unavailable.</div>}
        />
      </div>
    );
  }

  if (item.kind === "Video") {
    return (
      <div className="expanded-overlay-media relative flex-none overflow-hidden bg-[#101010]">
        <DetailVideoMedia item={item} />
      </div>
    );
  }

  if (item.kind === "PDF") {
    return (
      <div className="expanded-overlay-media relative flex-none overflow-hidden bg-[#101010]">
        <PdfArtwork item={item} />
      </div>
    );
  }

  if (item.image) {
    return (
      <div className="expanded-overlay-media relative flex-none overflow-hidden bg-[#101010]">
        <img src={item.image} alt={item.imageAlt ?? item.title} className="detail-image block h-full w-full object-cover" />
      </div>
    );
  }

  if (item.kind === "Quote") {
    return (
      <div className="expanded-overlay-media relative flex-none overflow-hidden bg-[#101010]">
        <div className="detail-art detail-quote-art paper-yellow bg-yellow-soft text-[#b3ad8d]">
          <span className="detail-quote-mark block font-[Georgia,serif] text-[64px] leading-[.8] text-[#b3ad8d]">“</span>
          <span>{item.kind}</span>
        </div>
      </div>
    );
  }

  if (item.kind === "Post" && item.post) {
    return (
      <div className="expanded-overlay-media relative flex-none overflow-hidden bg-[#101010]">
        <PostArtwork post={item.post} />
      </div>
    );
  }

  return (
    <div className="expanded-overlay-media relative flex-none overflow-hidden bg-[#101010]">
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
  originRectsRef: RefObject<SourceRects | null>;
  contentAreaRef: RefObject<HTMLElement | null>;
  selectionScrollRef: RefObject<boolean>;
};

export function ExpandedItemOverlay({ item, actions, originRectsRef, contentAreaRef, selectionScrollRef }: ExpandedItemOverlayProps) {
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
  const [linkCopyFailed, setLinkCopyFailed] = useState(false);

  // Mirror props into refs inside an effect, never during render, so a
  // concurrent render cannot publish a half-updated set. This runs before
  // the flight effects below, which read these refs.
  useLayoutEffect(() => {
    itemIdRef.current = item.id;
    itemRef.current = item;
    flightRef.current = flight;
  }, [item, flight]);

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

  // Escape and the accessible name come from the shared primitive, which
  // arbitrates Escape so a reader opened from here closes before this does.
  // Everything else stays local: this overlay is modeless on purpose, so it
  // traps nothing, claims no modality, places its own focus once GSAP has
  // settled the panel, and looks its source card up on the way out.
  const { rootProps } = useDialog({
    open: true,
    onClose: requestClose,
    label: detailTitleFor(shownItem),
    trapFocus: false,
    restoreFocus: false,
    elementRef: dialogRef,
  });

  useEffect(() => {
    const checkSourceVisibility = () => {
      if (selectionScrollRef.current) return;
      const contentArea = contentAreaRef.current;
      const viewport = scrollViewport(contentArea);
      const rects = queryCardRects(itemIdRef.current);
      if (!viewport || !rects || isCardTooFarOffscreen(rects.card, rectFrom(viewport.getBoundingClientRect()))) {
        requestClose();
      }
    };

    document.addEventListener("scroll", checkSourceVisibility, true);
    window.addEventListener("resize", checkSourceVisibility);
    return () => {
      document.removeEventListener("scroll", checkSourceVisibility, true);
      window.removeEventListener("resize", checkSourceVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionScrollRef]);

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
    const resetCopyFeedback = () => {
      setLinkCopied(false);
      setLinkCopyFailed(false);
    };
    void navigator.clipboard.writeText(shownItem.sourceUrl).then(() => {
      setLinkCopied(true);
      setLinkCopyFailed(false);
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = window.setTimeout(resetCopyFeedback, 2000);
    }).catch(() => {
      setLinkCopied(false);
      setLinkCopyFailed(true);
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = window.setTimeout(resetCopyFeedback, 2000);
    });
  }

  const triage = triageActions(shownItem, actions);
  const sourceAction = triage.find((action) => action.key === "open-original");
  const otherActions = triage.filter((action) => action.key !== "open-original");
  // Layout G (Paper): any item with readable content merges into a single
  // row — Read/Open PDF + domain share the row, copy + forget are bare icons.
  // Readable = whatever currently renders a Read button in the overlay.
  const readAction = triage.find(
    (action) => action.key === "read" || action.key === "open-pdf" || action.key === "read-unavailable",
  );
  const isReadRow = Boolean(readAction);
  const isPinned = shownItem.favorite === true;

  // Copy, pin and forget sit at the end of both toolbar layouts, so they are
  // built once here rather than pasted into each row.
  const itemControls = (
    <>
      {shownItem.sourceUrl && (
        <button
          type="button"
          className="toolbar-icon flex w-[44px] flex-none cursor-pointer items-center justify-center rounded-[9px] bg-transparent border border-[#4a4842] text-ink hover:bg-surface-strong hover:border-[#5a5750] hover:text-ink"
          onClick={copySourceLink}
          aria-label="Copy link to original"
          title={linkCopied ? "Copied" : linkCopyFailed ? "Copy failed" : "Copy link"}
        >
          {linkCopied ? <HugeiconsIcon icon={CheckmarkCircle01Icon} size={14} /> : <HugeiconsIcon icon={Copy01Icon} size={14} />}
        </button>
      )}
      <button
        type="button"
        className="toolbar-icon flex w-[44px] flex-none cursor-pointer items-center justify-center rounded-[9px] bg-transparent border border-[#4a4842] text-ink hover:bg-surface-strong hover:border-[#5a5750] hover:text-ink"
        onClick={() => void actions.onTogglePin(shownItem)}
        aria-label={isPinned ? "Unpin from Top of mind" : "Pin to Top of mind"}
        aria-pressed={isPinned}
        title={isPinned ? "Unpin" : "Pin to Top of mind"}
      >
        <HugeiconsIcon icon={PinIcon} size={14} />
      </button>
      <button
        type="button"
        className="toolbar-icon toolbar-icon-muted flex w-[44px] flex-none cursor-pointer items-center justify-center rounded-[9px] bg-transparent border border-[#4a4842] text-muted hover:bg-surface-strong hover:border-[#5a5750] hover:text-ink"
        onClick={() => void actions.onForget(shownItem)}
        aria-label="Forget this item"
        title="Forget"
      >
        <HugeiconsIcon icon={Archive01Icon} size={14} />
      </button>
    </>
  );

  const [isAddingTag, setIsAddingTag] = useState(false);
  const [tagDraft, setTagDraft] = useState("");

  useEffect(() => {
    setIsAddingTag(false);
    setTagDraft("");
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

  return (
    <div className="expanded-overlay-layer fixed inset-0 z-[6] grid place-items-center p-[clamp(16px,4vh,40px)_clamp(16px,3vw,48px)] pointer-events-none" ref={layerRef}>
      <section
        ref={dialogRef}
        className={`expanded-overlay ${destination ? "is-placed" : ""} ${dialogFlying ? "is-flying" : ""} relative pointer-events-auto flex w-[min(680px,100%)] max-h-full flex-col overflow-hidden bg-surface border border-[#4a4842] rounded-[24px] shadow-[0_30px_80px_rgba(0,0,0,.55)]`}
        {...rootProps}
        style={dialogFlying ? undefined : placedStyle}
      >
        <button
          type="button"
          ref={closeButtonRef}
          className="expanded-overlay-close absolute top-[14px] right-[14px] z-[5] inline-grid size-[30px] flex-none place-items-center cursor-pointer bg-[rgba(59,58,53,.86)] border border-[#5a5750] rounded-[7px] text-ink shadow-[0_5px_16px_rgba(0,0,0,.3)] backdrop-blur-[8px] [transition:background_.18s_ease,color_.18s_ease,border-color_.18s_ease,transform_.18s_cubic-bezier(.23,1,.32,1)] hover:bg-[#4a4842] hover:border-[#716d64] active:scale-[.96]"
          onClick={requestClose}
          aria-label="Close details"
        >
          <HugeiconsIcon icon={Cancel01Icon} size={16} />
        </button>

        <div
          className="expanded-overlay-media relative flex-none overflow-hidden bg-[#101010]"
          ref={mediaRef}
          style={dialogFlying ? undefined : ({ height: destination ? overlayMediaHeight(shownItem, destination.frame.width, window.innerHeight) : undefined } as CSSProperties)}
        >
          <OverlayMedia item={shownItem} />
        </div>

        <div
          className="expanded-overlay-body min-h-0 overflow-x-hidden overflow-y-auto p-[18px_20px_24px] [scrollbar-width:none]"
          ref={bodyRef}
          style={dialogFlying && destination ? { width: destination.frame.width } : undefined}
        >
          {shownItem.kind === "Quote" ? (
            <>
              <blockquote className="detail-quote m-[16px_0_8px] font-[family-name:'Libre_Baskerville',Georgia,serif] text-[22px] leading-[1.35] font-normal italic text-ink">“{shownItem.title}”</blockquote>
              {shownItem.description && <p className="detail-attribution m-0 mb-[8px] font-mono text-[12px] leading-[1.5] text-muted">— {shownItem.description.replace(/^—\s*/u, "")}</p>}
            </>
          ) : (
            <>
              <h2 className="expanded-overlay-title m-0 mb-[9px] font-[family-name:Georgia,'Times_New_Roman',serif] text-[26px] leading-[1.18] font-normal tracking-[-.02em]">{detailTitleFor(shownItem)}</h2>
              {shownItem.description && <p className="expanded-overlay-description m-0 max-w-[60ch] text-[13px] leading-[1.55] text-muted">{shownItem.description}</p>}
            </>
          )}
          {shownItem.processing?.active && (
            <div className="detail-processing mt-[13px] flex items-center gap-[7px] font-mono text-[10px] leading-[1.35] text-green [&>svg]:animate-spin-slow" role="status">
              <HugeiconsIcon icon={Loading01Icon} size={14} />
              <span>{shownItem.processing.message ?? "Processing"}</span>
              {shownItem.processing.progressTotal != null && <span>{shownItem.processing.progressCurrent}/{shownItem.processing.progressTotal}</span>}
            </div>
          )}
          {shownItem.processing?.failedJob && (
            <div className="detail-processing failed mt-[13px] flex items-start gap-[7px] font-mono text-[10px] leading-[1.35] text-[#d07055] [&>svg]:animate-spin-slow" role="alert">
              <HugeiconsIcon icon={AlertCircleIcon} size={14} />
              <span>{shownItem.processing.failedJob.errorMessage ?? "Processing failed"}</span>
              <button type="button" className="retry-button" onClick={() => void actions.onRetryJob(shownItem.processing?.failedJob?.id ?? "")}>
                <HugeiconsIcon icon={RotateCwIcon} size={12} /> Try again
              </button>
            </div>
          )}
          <div className="detail-meta flex w-full flex-col gap-[8px] pt-[7px] pb-[6px]">
            <div className="detail-filemeta flex items-center gap-[8px]">
              <span className="filemeta-type font-mono text-[10px] tracking-[.08em] text-muted">{fileTypeFor(shownItem)}</span>
              <span className="filemeta-dot size-[2px] flex-none rounded-full bg-[#4a4842]" aria-hidden="true" />
              <span className="filemeta-saved font-mono text-[10px] tracking-[.08em] text-[#605d68]">{savedLabelFor(shownItem.date)}</span>
            </div>
            <div className="detail-tags flex flex-wrap items-center gap-x-[10px] gap-y-[4px] pt-[2px]">
              {allTags.map((tag) => <span key={tag} className="detail-tag p-[4px_0] font-mono text-[10px] text-orange">#{tag}</span>)}
              {isAddingTag ? (
                <input
                  className="detail-tag-input w-[110px] bg-paper p-[4px_8px] font-mono text-[10px] text-ink rounded-[6px] border border-rule outline-none focus:border-orange"
                  value={tagDraft}
                  autoFocus
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
                <button type="button" className="detail-tag-add inline-flex items-center gap-[3px] cursor-pointer border-0 bg-transparent p-[4px_0] font-mono text-[10px] text-[#605d68] hover:text-ink" onClick={() => setIsAddingTag(true)}>
                  <HugeiconsIcon icon={PlusSignIcon} size={11} /> Add
                </button>
              )}
            </div>
          </div>

          {isReadRow && otherActions.some((action) => action.key === "find-similar") && (
            <div className="expanded-overlay-actions mt-[25px] flex flex-wrap gap-[10px]">
              {otherActions.filter((action) => action.key === "find-similar").map((action) => (
                <button
                  type="button"
                  key={action.key}
                  className="overlay-action-secondary flex flex-[1_1_auto] items-center justify-center gap-[8px] cursor-pointer rounded-[8px] bg-transparent border border-rule p-[12px_16px] text-[12px] text-ink [transition:transform_.16s_cubic-bezier(.23,1,.32,1),background_.18s_ease,border-color_.18s_ease] enabled:hover:bg-surface-strong enabled:hover:border-[#4a4842] enabled:active:scale-[.96] disabled:cursor-default disabled:opacity-50"
                  onClick={action.onClick}
                  disabled={action.disabled}
                >
                  {action.icon} {action.label}
                </button>
              ))}
            </div>
          )}

          {isReadRow && readAction ? (
            <div className="expanded-overlay-toolbar is-read-row mt-[16px] flex w-full gap-[8px]">
              <button
                type="button"
                className="toolbar-primary toolbar-reading flex min-w-0 flex-[1_1_0%] cursor-pointer items-center justify-center gap-[8px] overflow-hidden whitespace-nowrap bg-[#222a26] border border-[#2e3a34] rounded-[9px] p-[13px_16px] text-[12px] font-medium text-[#8a978e] enabled:hover:bg-[#262e29] enabled:hover:border-[#3a4a40] enabled:hover:text-[#a8bfb0] enabled:active:scale-[.98] disabled:cursor-default disabled:opacity-50"
                onClick={readAction.onClick}
                disabled={readAction.disabled}
                title={readAction.title ?? (readAction.disabled ? "No saved content to read" : readAction.label)}
              >
                {readAction.icon} {readAction.label}
              </button>
              {sourceAction && (
                <button
                  type="button"
                  className="toolbar-primary flex min-w-0 flex-[1_1_0%] cursor-pointer items-center justify-center gap-[8px] overflow-hidden whitespace-nowrap bg-green-soft border border-[#35443c] rounded-[9px] p-[13px_16px] text-[12px] font-semibold text-[#9dbfa9] enabled:hover:bg-[#2b382f] enabled:hover:border-[#4a5c50] disabled:cursor-default disabled:opacity-50"
                  onClick={sourceAction.onClick}
                  disabled={sourceAction.disabled}
                  title={sourceAction.disabled ? "No source link saved" : `Open ${sourceAction.label}`}
                >
                  {sourceAction.icon} {sourceAction.label} <HugeiconsIcon icon={ArrowUpRight01Icon} size={13} />
                </button>
              )}
              {itemControls}
            </div>
          ) : (
            <>
              {otherActions.length > 0 && (
                <div className="expanded-overlay-actions mt-[25px] flex flex-wrap gap-[10px]">
                  {otherActions.map((action, index) => (
                    <button
                      type="button"
                      key={action.key}
                      className={index === 0 ? "overlay-action-primary flex flex-[1_1_auto] items-center justify-center gap-[8px] cursor-pointer rounded-[8px] bg-green-soft border border-[#35443c] p-[12px_16px] text-[12px] text-[#9dbfa9] [transition:transform_.16s_cubic-bezier(.23,1,.32,1),background_.18s_ease,border-color_.18s_ease] enabled:hover:bg-[#2b382f] enabled:hover:border-[#4a5c50] enabled:active:scale-[.96] disabled:cursor-default disabled:opacity-50" : "overlay-action-secondary flex flex-[1_1_auto] items-center justify-center gap-[8px] cursor-pointer rounded-[8px] bg-transparent border border-rule p-[12px_16px] text-[12px] text-ink [transition:transform_.16s_cubic-bezier(.23,1,.32,1),background_.18s_ease,border-color_.18s_ease] enabled:hover:bg-surface-strong enabled:hover:border-[#4a4842] enabled:active:scale-[.96] disabled:cursor-default disabled:opacity-50"}
                      onClick={action.onClick}
                      disabled={action.disabled}
                      title={action.title}
                    >
                      {action.icon} {action.label}
                    </button>
                  ))}
                </div>
              )}

              <div className="expanded-overlay-toolbar mt-[16px] flex w-full gap-[8px]">
                {sourceAction && (
                  <button
                    type="button"
                    className="toolbar-primary flex min-w-0 flex-[1_1_0%] cursor-pointer items-center justify-center gap-[8px] overflow-hidden whitespace-nowrap bg-green-soft border border-[#35443c] rounded-[9px] p-[13px_16px] text-[12px] font-semibold text-[#9dbfa9] enabled:hover:bg-[#2b382f] enabled:hover:border-[#4a5c50] disabled:cursor-default disabled:opacity-50"
                    onClick={sourceAction.onClick}
                    disabled={sourceAction.disabled}
                    title={sourceAction.disabled ? "No source link saved" : `Open ${sourceAction.label}`}
                  >
                    {sourceAction.icon} {sourceAction.label} <HugeiconsIcon icon={ArrowUpRight01Icon} size={13} />
                  </button>
                )}
                {itemControls}
              </div>
            </>
          )}

          {/* Insertion point for related items (overlay PR 3); renders nothing until then. */}
          <div className="expanded-overlay-related" hidden />
        </div>
      </section>
    </div>
  );
}
