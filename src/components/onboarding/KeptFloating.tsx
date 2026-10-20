import { useLayoutEffect, useRef, type ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { PlayIcon } from "@hugeicons/core-free-icons";
import { DocumentArtwork } from "../ItemMedia";
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
type FloatCard = { content: Content; layer: Layer; x: number; y: number; w: number; h: number };

const p = onboardingPhotos;

// Positions and sizes come straight from the "Onboarding 2 · Every kind of
// thing" board in Paper, in the 960x540 stage's own pixels.
const photo = (src: string): Content => ({ kind: "photo", src });

const CARDS: FloatCard[] = [
  { content: photo(p.deskPlant), layer: "far", x: 10, y: 80, w: 71, h: 71 },
  { content: photo(p.record), layer: "far", x: 870, y: 74, w: 71, h: 71 },
  { content: photo(p.sprig), layer: "far", x: 411, y: 12, w: 58, h: 87 },
  {
    content: {
      kind: "quote",
      text: "How we spend our days is how we spend our lives.",
      by: "Annie Dillard",
    },
    layer: "mid",
    x: 150,
    y: 380,
    w: 100,
    h: 124,
  },
  {
    content: {
      kind: "note",
      title: "Call the framer",
      words: "9 WORDS",
    },
    layer: "mid",
    x: 110,
    y: 96,
    w: 100,
    h: 96,
  },
  { content: photo(p.daisy), layer: "mid", x: 668, y: 52, w: 94, h: 85 },
  { content: photo(p.delphinium), layer: "mid", x: 702, y: 395, w: 67, h: 120 },
  {
    content: { kind: "video", src: p.sea, duration: "12:04" },
    layer: "near",
    x: 753,
    y: 170,
    w: 134,
    h: 89,
  },
  { content: photo(p.vases), layer: "near", x: 797, y: 302, w: 95, h: 126 },
  {
    content: {
      kind: "article",
      src: p.book,
      title: "The slow return of paper",
      domain: "paperjournal.co",
    },
    layer: "near",
    x: 523,
    y: 410,
    w: 104,
    h: 124,
  },
  {
    content: { kind: "pdf", title: "Studio lease", pages: "8 PAGES" },
    layer: "near",
    x: 300,
    y: 401,
    w: 90,
    h: 116,
  },
  { content: photo(p.monstera), layer: "near", x: 67, y: 232, w: 89, h: 134 },
  { content: photo(p.sketching), layer: "near", x: 245, y: 20, w: 110, h: 110 },
  {
    content: { kind: "video", src: p.car, duration: "3:41" },
    layer: "near",
    x: 513,
    y: 28,
    w: 134,
    h: 89,
  },
];

/** How strongly each layer follows the pointer and drifts; near moves most. */
const DEPTH: Record<Layer, number> = { far: 0.3, mid: 0.6, near: 1 };
const PARALLAX_PX = 40;
const DRIFT_PX = 6;
/** The board's photos drawn this much larger, and pushed this much further out. */
const SIZE_SCALE = 1.725;
const SPREAD = 1.18;
/** One lap around the copy for the near layer; deeper layers lag behind. */
const LAP_SECONDS = 120;
const LAP_SPEED: Record<Layer, number> = { far: 0.6, mid: 0.8, near: 1 };
/** Each card also runs a little faster or slower than its layer, up to 12%, for a touch more depth. */
const cardSpeed = (index: number, layer: Layer) =>
  LAP_SPEED[layer] * (1 + 0.12 * Math.sin(index * 2.4));
const CENTER = { x: 480, y: 270 };
/** The stage is wider than tall, so laps follow its 16:9 ellipse. */
const ASPECT = 960 / 540;

/** Each card's centre relative to the stage centre, with x squashed to a circle. */
const ORBITS = CARDS.map((card) => {
  const u = ((card.x + card.w / 2 - CENTER.x) * SPREAD) / ASPECT;
  const v = (card.y + card.h / 2 - CENTER.y) * SPREAD;
  return { u, v, w: card.w * SIZE_SCALE, h: card.h * SIZE_SCALE };
});

/** Where a card sits after `angle` radians of lap, in stage pixels (top-left). */
function orbitPosition(index: number, angle: number) {
  const { u, v, w, h } = ORBITS[index];
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: CENTER.x + (u * cos - v * sin) * ASPECT - w / 2,
    y: CENTER.y + (u * sin + v * cos) - h / 2,
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
        <div className="card-paper-art quote-art kept-quote">
          <span className="quote-mark">“</span>
          <span className="quote-preview">{content.text}</span>
          <span className="quote-line" />
          <span className="quote-attribution-preview">— {content.by}</span>
        </div>
      );
  }
}

/**
 * Screen two's backdrop: mini cards of every kind floating at three depths around the copy, as
 * on the Paper board, slowly circling it counter-clockwise. Fancy Components' Parallax Floating drives it: the
 * pointer pulls near photos further than far ones, and each photo drifts on
 * its own slow path, Drift Wall style.
 *
 * One rAF loop writes transforms straight to the photos, so React renders this
 * once. The loop only lives while the screen is mounted; reduced motion gets
 * the board's still layout.
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
        // Negative angles run counter-clockwise on screen (y points down).
        const lap = orbitPosition(
          index,
          (-seconds / LAP_SECONDS) * Math.PI * 2 * cardSpeed(index, card.layer),
        );
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
          style={orbitStyle(index)}
        >
          <CardBody content={card.content} />
        </div>
      ))}
    </div>
  );
}

/** The still layout: lap zero, also what reduced motion keeps. */
function orbitStyle(index: number) {
  const { x, y } = orbitPosition(index, 0);
  return {
    left: 0,
    top: 0,
    width: ORBITS[index].w,
    height: ORBITS[index].h,
    transform: `translate3d(${x}px, ${y}px, 0)`,
  };
}
