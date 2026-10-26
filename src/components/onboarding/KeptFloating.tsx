import { useLayoutEffect, useRef, type ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { PlayIcon } from "@hugeicons/core-free-icons";
import { DocumentArtwork, QuoteArtwork } from "../ItemMedia";
import { prefersReducedMotion } from "../mascot/mascotStore";
import { onboardingPhotos } from "./onboardingMedia";

type Layer = "far" | "mid" | "near";
/** Mini versions of inkling's own card types, so the backdrop reads as a library. */
type Content =
  | { kind: "photo"; src: string }
  | { kind: "video"; src: string; duration: string }
  | { kind: "article"; src: string; title: string; domain: string }
  | { kind: "note"; title: string; words: string }
  | { kind: "pdf"; title: string; pages: string }
  | { kind: "quote"; text: string; by: string };
type FloatCard = {
  content: Content;
  layer: Layer;
  /** Where on the lap the card starts, in degrees clockwise from the right (y points down). */
  angle: number;
  /** How far out it rides: 1 is the stage-sized lap, larger is further out. */
  ring: number;
  w: number;
  h: number;
};

const p = onboardingPhotos;
const photo = (src: string): Content => ({ kind: "photo", src });

// One of each kind around the copy. Angles, rings and sizes were searched so
// that, all moving together, no card crosses the copy or a card at its own
// depth anywhere on the lap at 16:9; far cards may tuck under nearer ones.
const CARDS: FloatCard[] = [
  { content: photo(p.sprig), layer: "far", angle: 36, ring: 1.08, w: 100, h: 150 },
  { content: photo(p.deskPlant), layer: "far", angle: 218, ring: 1.1, w: 122, h: 122 },
  {
    content: {
      kind: "quote",
      text: "How we spend our days is how we spend our lives.",
      by: "Annie Dillard",
    },
    layer: "mid",
    angle: 3,
    ring: 1.02,
    w: 168,
    h: 200,
  },
  {
    content: { kind: "note", title: "Call the framer", words: "9 WORDS" },
    layer: "mid",
    angle: 106,
    ring: 1.06,
    w: 172,
    h: 166,
  },
  { content: photo(p.delphinium), layer: "mid", angle: 290, ring: 1.02, w: 112, h: 196 },
  {
    content: { kind: "video", src: p.sea, duration: "12:04" },
    layer: "near",
    angle: 326,
    ring: 1.07,
    w: 231,
    h: 154,
  },
  { content: photo(p.vases), layer: "near", angle: 69, ring: 1.01, w: 156, h: 204 },
  {
    content: {
      kind: "article",
      src: p.book,
      title: "The slow return of paper",
      domain: "paperjournal.co",
    },
    layer: "near",
    angle: 249,
    ring: 1.01,
    w: 172,
    h: 204,
  },
  {
    content: { kind: "pdf", title: "Studio lease", pages: "8 PAGES" },
    layer: "near",
    angle: 189,
    ring: 1.02,
    w: 155,
    h: 200,
  },
  { content: photo(p.monstera), layer: "near", angle: 145, ring: 1, w: 146, h: 212 },
];

/** How strongly each layer follows the pointer and drifts; near moves most. */
const DEPTH: Record<Layer, number> = { far: 0.3, mid: 0.6, near: 1 };
const PARALLAX_PX = 40;
const DRIFT_PX = 4;
/** Every card makes one calm lap around the copy in this long, all together. */
const LAP_SECONDS = 150;
const CENTER = { x: 480, y: 270 };
/**
 * The lap is a superellipse the stage's shape, not a circle, so cards ride
 * out into the corners instead of cutting across the copy on the diagonals.
 */
const HALF_W = 480;
const HALF_H = 270;
const SQUARENESS = 4;

/** Where a card sits after `turn` radians of lap, in stage pixels (top-left). */
function orbitPosition(card: FloatCard, turn: number) {
  const angle = (card.angle * Math.PI) / 180 + turn;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const radius =
    card.ring / (Math.abs(cos) ** SQUARENESS + Math.abs(sin) ** SQUARENESS) ** (1 / SQUARENESS);
  return {
    x: CENTER.x + HALF_W * radius * cos - card.w / 2,
    y: CENTER.y + HALF_H * radius * sin - card.h / 2,
  };
}

function CardBody({ content }: { content: Content }): ReactNode {
  switch (content.kind) {
    case "photo":
      return <img className="kept-fill" src={content.src} alt="" draggable={false} />;
    case "video":
      return (
        <>
          <img className="kept-fill" src={content.src} alt="" draggable={false} />
          <span className="kept-scrim" />
          <span className="kept-play">
            <HugeiconsIcon icon={PlayIcon} size={14} />
          </span>
          <span className="kept-badge">{content.duration}</span>
        </>
      );
    case "article":
      return (
        <>
          <img className="kept-article-image" src={content.src} alt="" draggable={false} />
          <div className="kept-article-text">
            <span className="kept-kicker">Article</span>
            <strong>{content.title}</strong>
            <span className="kept-domain">{content.domain}</span>
          </div>
        </>
      );
    // The library's own note, PDF and quote artwork, so these read as real cards.
    case "note":
      return <DocumentArtwork label="NOTE" title={content.title} count={content.words} />;
    case "pdf":
      return <DocumentArtwork label="PDF" title={content.title} count={content.pages} />;
    case "quote":
      return (
        <QuoteArtwork
          text={content.text}
          attribution={`— ${content.by}`}
          className="absolute inset-0"
        />
      );
  }
}

/**
 * Screen two's backdrop: mini cards of every kind floating at three depths
 * around the copy, slowly circling it counter-clockwise together. Fancy
 * Components' Parallax Floating drives it: the pointer pulls near cards
 * further than far ones, and each card drifts a little on its own slow path,
 * Drift Wall style.
 *
 * One rAF loop writes transforms straight to the photos, so React renders this
 * once. The loop only lives while the screen is mounted; reduced motion gets
 * the lap's starting layout.
 */
export function KeptFloating() {
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

  useLayoutEffect(() => {
    if (prefersReducedMotion()) return;

    const pointer = { x: 0, y: 0 };
    const eased = { x: 0, y: 0 };
    const onPointerMove = (event: PointerEvent) => {
      pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
      pointer.y = (event.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", onPointerMove);

    let raf = 0;
    let start = 0;
    const tick = (ms: number) => {
      raf = requestAnimationFrame(tick);
      if (!start) start = ms;
      const seconds = (ms - start) / 1000;
      eased.x += (pointer.x - eased.x) * 0.06;
      eased.y += (pointer.y - eased.y) * 0.06;
      CARDS.forEach((card, index) => {
        const el = cardRefs.current[index];
        if (!el) return;
        const depth = DEPTH[card.layer];
        const driftX = Math.sin(seconds * 0.23 + index * 2.1) * DRIFT_PX * depth;
        const driftY = Math.cos(seconds * 0.31 + index * 1.3) * DRIFT_PX * depth;
        // Negative turns run counter-clockwise on screen (y points down).
        const lap = orbitPosition(card, (-seconds / LAP_SECONDS) * Math.PI * 2);
        const x = lap.x + driftX - eased.x * PARALLAX_PX * depth;
        const y = lap.y + driftY - eased.y * PARALLAX_PX * depth;
        el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      });
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onPointerMove);
    };
  }, []);

  return (
    <div className="kept-floating" aria-hidden="true">
      {CARDS.map((card, index) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: static list
          key={index}
          ref={(el) => {
            cardRefs.current[index] = el;
          }}
          className={`kept-card is-${card.layer} is-${card.content.kind}`}
          style={orbitStyle(card, index)}
        >
          <CardBody content={card.content} />
        </div>
      ))}
    </div>
  );
}

/** The still layout: lap zero, also what reduced motion keeps. */
function orbitStyle(card: FloatCard, index: number) {
  const { x, y } = orbitPosition(card, 0);
  return {
    left: 0,
    top: 0,
    width: card.w,
    height: card.h,
    transform: `translate3d(${x}px, ${y}px, 0)`,
    // They grow in one after another around the lap.
    animationDelay: `${120 + index * 60}ms`,
  };
}
