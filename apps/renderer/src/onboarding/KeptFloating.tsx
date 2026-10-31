import * as stylex from "@stylexjs/stylex";
import { PlayIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { color, font, onboardingColor } from "@inkling/ui/tokens.stylex";
import { type ReactNode, useLayoutEffect, useRef } from "react";
import { onboardingPhotos } from "./media.ts";
import { QuoteArtwork, TypedArtwork } from "./MiniArtwork.tsx";

type Layer = "far" | "mid" | "near";
/** Mini versions of inkling's own card kinds, so the backdrop reads as a library. */
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
// The lap is a superellipse the stage's shape, not a circle, so cards ride out
// into the corners instead of cutting across the copy on the diagonals.
const HALF_W = 480;
const HALF_H = 270;
const SQUARENESS = 4;

/** Where a card sits after `turn` radians of lap, in stage pixels (top left). */
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
      return <img {...stylex.props(styles.fill)} src={content.src} alt="" draggable={false} />;
    case "video":
      return (
        <>
          <img {...stylex.props(styles.fill)} src={content.src} alt="" draggable={false} />
          <span {...stylex.props(styles.scrim)} />
          <span {...stylex.props(styles.play)}>
            <HugeiconsIcon icon={PlayIcon} size={14} />
          </span>
          <span {...stylex.props(styles.badge)}>{content.duration}</span>
        </>
      );
    case "article":
      return (
        <>
          <img {...stylex.props(styles.articleImage)} src={content.src} alt="" draggable={false} />
          <div {...stylex.props(styles.articleText)}>
            <span {...stylex.props(styles.kicker)}>Article</span>
            <strong {...stylex.props(styles.articleTitle)}>{content.title}</strong>
            <span {...stylex.props(styles.domain)}>{content.domain}</span>
          </div>
        </>
      );
    case "note":
      return <TypedArtwork label="NOTE" title={content.title} footnote={content.words} />;
    case "pdf":
      return <TypedArtwork label="PDF" title={content.title} footnote={content.pages} />;
    case "quote":
      return <QuoteArtwork text={content.text} attribution={`— ${content.by}`} />;
  }
}

/**
 * Screen two's backdrop. One frame loop writes transforms straight to the
 * cards, so React renders this once; it lives only while the screen is shown.
 * Reduced motion keeps the starting layout.
 */
export function KeptFloating({ reducedMotion }: { reducedMotion: boolean }) {
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

  useLayoutEffect(() => {
    if (reducedMotion) return;
    const pointer = { x: 0, y: 0 };
    const eased = { x: 0, y: 0 };
    const onPointerMove = (event: PointerEvent) => {
      pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
      pointer.y = (event.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", onPointerMove);

    let frame = 0;
    let start = 0;
    const tick = (ms: number) => {
      frame = requestAnimationFrame(tick);
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
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onPointerMove);
    };
  }, [reducedMotion]);

  return (
    <div {...stylex.props(styles.floating)} aria-hidden="true">
      {CARDS.map((card, index) => {
        const start = orbitPosition(card, 0);
        const bare = card.content.kind === "photo" || card.content.kind === "video";
        return (
          <div
            // oxlint-disable-next-line react/no-array-index-key -- a fixed list, never reordered.
            key={index}
            ref={(el) => {
              cardRefs.current[index] = el;
            }}
            {...stylex.props(
              styles.card,
              styles[card.layer],
              bare && styles.bare,
              styles.placed(card.w, card.h, start.x, start.y, 120 + index * 60),
            )}
          >
            <CardBody content={card.content} />
          </div>
        );
      })}
    </div>
  );
}

// The frame loop owns transform, so the cards grow in with scale.
const cardIn = stylex.keyframes({ from: { opacity: 0, scale: "0.88" } });

const styles = stylex.create({
  floating: { position: "absolute", zIndex: 0, inset: 0 },
  card: {
    position: "absolute",
    left: 0,
    top: 0,
    overflow: "hidden",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: color.border,
    borderRadius: 12,
    backgroundColor: color.surface,
    color: color.ink,
    willChange: "transform",
    animationName: { default: cardIn, "@media (prefers-reduced-motion: reduce)": "none" },
    animationDuration: "900ms",
    animationTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
    animationFillMode: "both",
  },
  far: { borderRadius: 9, opacity: 0.6, filter: "blur(1.5px)" },
  mid: { borderRadius: 10, opacity: 0.85 },
  near: { boxShadow: `0 18px 40px ${color.shadow}` },
  bare: { borderWidth: 0 },
  placed: (w: number, h: number, x: number, y: number, delay: number) => ({
    width: w,
    height: h,
    transform: `translate3d(${x}px, ${y}px, 0)`,
    animationDelay: `${delay}ms`,
  }),
  fill: {
    position: "absolute",
    inset: 0,
    display: "block",
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  scrim: {
    position: "absolute",
    inset: 0,
    backgroundImage: `linear-gradient(180deg, ${onboardingColor.videoScrimTop} 40%, ${onboardingColor.videoScrimBottom})`,
  },
  play: {
    position: "absolute",
    inset: 0,
    margin: "auto",
    width: 38,
    height: 38,
    display: "grid",
    placeItems: "center",
    borderRadius: "50%",
    backgroundColor: onboardingColor.playButton,
    color: onboardingColor.playInk,
    boxShadow: `0 8px 24px ${onboardingColor.softShadow}, inset 0 0 0 1px ${onboardingColor.playEdge}`,
  },
  badge: {
    position: "absolute",
    left: 9,
    bottom: 9,
    paddingBlock: 3,
    paddingInline: 8,
    borderRadius: 999,
    backgroundColor: onboardingColor.badge,
    color: onboardingColor.badgeInk,
    fontFamily: font.body,
    fontSize: 10,
    fontWeight: 500,
    letterSpacing: "0.03em",
  },
  articleImage: { display: "block", width: "100%", height: "52%", objectFit: "cover" },
  articleText: {
    display: "flex",
    flexDirection: "column",
    gap: 5,
    paddingBlock: 10,
    paddingInline: 11,
  },
  kicker: {
    color: color.muted,
    fontFamily: font.body,
    fontSize: 9,
    textTransform: "uppercase",
    letterSpacing: "0.045em",
  },
  articleTitle: {
    display: "-webkit-box",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 3,
    overflow: "hidden",
    fontSize: 13,
    fontWeight: 500,
    lineHeight: 1.22,
    letterSpacing: "-0.02em",
  },
  domain: {
    overflow: "hidden",
    color: color.muted,
    fontFamily: font.body,
    fontSize: 9,
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
});
