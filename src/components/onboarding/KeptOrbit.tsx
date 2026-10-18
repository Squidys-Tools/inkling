import { useLayoutEffect, useRef } from "react";
import { prefersReducedMotion } from "../mascot/mascotStore";
import { onboardingPhotos } from "./onboardingMedia";

type OrbitCard =
  | { kind: "photo"; src: string; w: number; h: number }
  | { kind: "video"; src: string; w: number; h: number }
  | { kind: "article"; w: number; h: number }
  | { kind: "quote"; w: number; h: number }
  | { kind: "note"; w: number; h: number }
  | { kind: "pdf"; w: number; h: number }
  | { kind: "post"; w: number; h: number };

const p = onboardingPhotos;

// Interleaved so no two of a kind sit side by side on the ring.
const CARDS: OrbitCard[] = [
  { kind: "photo", src: p.alps, w: 92, h: 130 },
  { kind: "article", w: 128, h: 104 },
  { kind: "photo", src: p.blossom, w: 96, h: 128 },
  { kind: "quote", w: 120, h: 96 },
  { kind: "video", src: p.lanterns, w: 136, h: 90 },
  { kind: "photo", src: p.fuji, w: 92, h: 124 },
  { kind: "note", w: 108, h: 112 },
  { kind: "photo", src: p.tower, w: 96, h: 128 },
  { kind: "pdf", w: 96, h: 124 },
  { kind: "photo", src: p.coast, w: 90, h: 120 },
  { kind: "post", w: 124, h: 100 },
  { kind: "photo", src: p.shore, w: 104, h: 126 },
  { kind: "photo", src: p.valley, w: 86, h: 124 },
  { kind: "photo", src: p.corner, w: 92, h: 130 },
];

/** Stage geometry, in the 960x540 onboarding stage's own pixels. */
const CENTER_X = 480;
const CENTER_Y = 262;
const RADIUS_X = 410;
const RADIUS_Y = 206;
/** Seconds per lap. Slow enough to read as drift, not as a carousel spinning. */
const LAP_SECONDS = 70;
const PARALLAX_PX = 14;

function CardFace({ card }: { card: OrbitCard }) {
  switch (card.kind) {
    case "photo":
      return <img src={card.src} alt="" draggable={false} decoding="async" />;
    case "video":
      return (
        <>
          <img src={card.src} alt="" draggable={false} decoding="async" />
          <span className="kept-play" />
        </>
      );
    case "article":
      return (
        <>
          <span className="kept-kicker">aeon.co</span>
          <span className="kept-article-title">The quiet art of keeping things</span>
          <span className="kept-rule" />
        </>
      );
    case "quote":
      return (
        <>
          <span className="kept-quote-mark">&ldquo;</span>
          <span className="kept-quote-text">Make it simple, but significant.</span>
        </>
      );
    case "note":
      return (
        <>
          <span className="kept-kicker">note</span>
          <span className="kept-note-title">Paint the hallway ochre?</span>
          <span className="kept-note-line" />
          <span className="kept-note-line is-short" />
        </>
      );
    case "pdf":
      return (
        <>
          <span className="kept-pdf-label">PDF</span>
          <span className="kept-pdf-rule" />
          <span className="kept-pdf-pages">12 pages</span>
        </>
      );
    case "post":
      return (
        <>
          <span className="kept-post-head">
            <span className="kept-post-avatar" />
            <span className="kept-kicker">@field.notes</span>
          </span>
          <span className="kept-post-text">Fog rolled in at six and never left. Perfect.</span>
        </>
      );
  }
}

/**
 * Screen two's backdrop: every kind of card the library makes, riding a tilted
 * ring around the copy. A blend of React Bits' Circular Carousel (the ring),
 * Infinite Spiral (depth scaling toward the viewer), Drift Wall (each card's
 * own slow bob) and Fancy's Parallax Floating (the pointer nudges near cards
 * more than far ones).
 *
 * One rAF loop writes transforms straight to the cards, so React renders this
 * once. The loop only lives while the screen is mounted; reduced motion gets a
 * single still frame.
 */
export function KeptOrbit() {
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Layout effect, so the first painted frame already has every card on the ring.
  useLayoutEffect(() => {
    const pointer = { x: 0, y: 0 };
    const eased = { x: 0, y: 0 };

    const place = (seconds: number) => {
      const turn = (seconds / LAP_SECONDS) * Math.PI * 2;
      eased.x += (pointer.x - eased.x) * 0.05;
      eased.y += (pointer.y - eased.y) * 0.05;
      CARDS.forEach((card, index) => {
        const el = cardRefs.current[index];
        if (!el) return;
        const angle = (index / CARDS.length) * Math.PI * 2 + turn;
        // depth: 1 at the front of the ring (bottom), 0 at the back (top)
        const depth = (Math.cos(angle) + 1) / 2;
        const bob = Math.sin(seconds * 0.6 + index * 1.7) * 5;
        const x = CENTER_X + Math.sin(angle) * RADIUS_X + eased.x * PARALLAX_PX * (0.4 + depth);
        const y =
          CENTER_Y + Math.cos(angle) * RADIUS_Y + bob + eased.y * PARALLAX_PX * (0.4 + depth);
        const scale = 0.7 + depth * 0.38;
        const tilt = Math.sin(angle) * -6;
        el.style.transform = `translate3d(${x - card.w / 2}px, ${y - card.h / 2}px, 0) scale(${scale}) rotate(${tilt}deg)`;
        el.style.opacity = String(0.38 + depth * 0.62);
        el.style.zIndex = String(Math.round(depth * 100));
      });
    };

    if (prefersReducedMotion()) {
      place(0);
      return;
    }

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
      place((ms - start) / 1000);
    };
    place(0);
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onPointerMove);
    };
  }, []);

  return (
    <div className="kept-orbit" aria-hidden="true">
      {CARDS.map((card, index) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed list, never reorders.
          key={index}
          ref={(el) => {
            cardRefs.current[index] = el;
          }}
          className={`kept-card is-${card.kind}`}
          style={{ width: card.w, height: card.h }}
        >
          <CardFace card={card} />
        </div>
      ))}
    </div>
  );
}
