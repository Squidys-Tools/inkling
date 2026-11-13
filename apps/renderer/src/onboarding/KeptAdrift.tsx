import * as stylex from "@stylexjs/stylex";
import PlayIcon from "@hugeicons/core-free-icons/PlayIcon";
import { HugeiconsIcon } from "@hugeicons/react";
import { color, font, onboardingColor } from "@inkling/ui/tokens.stylex";
import { type ReactNode, useEffect, useLayoutEffect, useRef } from "react";
import { playInkWisps } from "./inkWisps.ts";
import { onboardingPhotos } from "./media.ts";
import { QuoteArtwork, TypedArtwork } from "./MiniArtwork.tsx";

/** Mini versions of inkling's own card kinds, so the backdrop reads as a library. */
type Content =
  | { kind: "photo"; src: string }
  | { kind: "video"; src: string; duration: string }
  | { kind: "article"; src: string; title: string; domain: string }
  | { kind: "note"; title: string; words: string }
  | { kind: "pdf"; title: string; pages: string }
  | { kind: "quote"; text: string; by: string };
type AdriftCard = {
  content: Content;
  /** 1 is the focal plane; below is nearer and soft, above is further, soft and fogged. */
  depth: number;
  x: number;
  y: number;
  w: number;
  h: number;
};

const p = onboardingPhotos;
const photo = (src: string): Content => ({ kind: "photo", src });

// Far to near, so nearer cards paint on top. Each box grown by its full drift
// (depth-scaled bob + current + parallax, plus 2deg of tilt) stays clear of the
// copy and buttons (x 170..790, y 125..415), and focal boxes clear each other.
const CARDS: AdriftCard[] = [
  { content: photo(p.sprig), depth: 1.8, x: 330, y: 8, w: 64, h: 92 },
  { content: photo(p.deskPlant), depth: 1.7, x: 600, y: 446, w: 76, h: 76 },
  { content: photo(p.delphinium), depth: 1.9, x: 40, y: 452, w: 64, h: 108 },
  {
    content: {
      kind: "article",
      src: p.book,
      title: "The slow return of paper",
      domain: "paperjournal.co",
    },
    depth: 1,
    x: -4,
    y: 214,
    w: 140,
    h: 200,
  },
  {
    content: {
      kind: "quote",
      text: "How we spend our days is how we spend our lives.",
      by: "Annie Dillard",
    },
    depth: 1,
    x: 824,
    y: 178,
    w: 150,
    h: 196,
  },
  { content: photo(p.vases), depth: 1, x: 548, y: -56, w: 128, h: 150 },
  {
    content: { kind: "video", src: p.sea, duration: "12:04" },
    depth: 1,
    x: 290,
    y: 446,
    w: 156,
    h: 104,
  },
  {
    content: { kind: "pdf", title: "Studio lease", pages: "8 PAGES" },
    depth: 0.72,
    x: -56,
    y: -64,
    w: 172,
    h: 214,
  },
  { content: photo(p.monstera), depth: 0.75, x: 846, y: -100, w: 160, h: 220 },
  {
    content: { kind: "note", title: "Call the framer", words: "9 WORDS" },
    depth: 0.68,
    x: 836,
    y: 412,
    w: 180,
    h: 212,
  },
];

// Every offset below is divided by depth, so nearer cards move further.
const BOB_PX = 5;
const CURRENT_PX = 6;
const PARALLAX_PX = 11;
const TILT_DEG = 2;
/** One slow swell of the shared current, in seconds. */
const CURRENT_SECONDS = 90;
const MAX_BLUR_PX = 3;
const BLUR_PER_DEFOCUS = 5.5;

const blurFor = (depth: number) =>
  Math.min(MAX_BLUR_PX, BLUR_PER_DEFOCUS * Math.abs(1 - 1 / depth));
const opacityFor = (depth: number) => (depth > 1 ? 1 - 0.45 * (depth - 1) : 1);

/** The card's transform `seconds` into the drift, with the eased pointer in -1..1. */
function transformAt(card: AdriftCard, index: number, seconds: number, px: number, py: number) {
  const reach = 1 / card.depth;
  const current = (seconds / CURRENT_SECONDS) * Math.PI * 2;
  const bobX = BOB_PX * Math.sin(seconds * (0.19 + (index % 3) * 0.04) + index * 2.1);
  const bobY = BOB_PX * Math.cos(seconds * (0.23 + (index % 4) * 0.03) + index * 1.3);
  const x = card.x + reach * (bobX + CURRENT_PX * Math.sin(current) - px * PARALLAX_PX);
  const y = card.y + reach * (bobY + CURRENT_PX * 0.5 * Math.cos(current * 0.8) - py * PARALLAX_PX);
  const tilt = TILT_DEG * Math.sin(seconds * (0.11 + (index % 5) * 0.02) + index * 0.9);
  return `translate3d(${x}px, ${y}px, 0) rotate(${tilt}deg)`;
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
 * Screen two's backdrop: the library as still water, each card held at its own
 * depth. One frame loop writes transforms straight to the cards, so React
 * renders this once; it lives only while the screen is shown.
 */
export function KeptAdrift({ reducedMotion }: { reducedMotion: boolean }) {
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const inkRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = inkRef.current;
    if (!canvas) return;
    return playInkWisps(canvas, { still: reducedMotion });
  }, [reducedMotion]);

  useLayoutEffect(() => {
    if (reducedMotion) return;
    const pointer = { x: 0, y: 0 };
    const eased = { x: 0, y: 0 };
    const onPointerMove = (event: PointerEvent) => {
      pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
      pointer.y = (event.clientY / window.innerHeight) * 2 - 1;
    };

    const loop = { frame: 0, last: 0, seconds: 0 };
    const tick = (ms: number) => {
      loop.frame = requestAnimationFrame(tick);
      // Clamped so a long pause resumes where it stopped instead of jumping.
      if (loop.last) loop.seconds += Math.min(ms - loop.last, 100) / 1000;
      loop.last = ms;
      eased.x += (pointer.x - eased.x) * 0.05;
      eased.y += (pointer.y - eased.y) * 0.05;
      for (let index = 0; index < CARDS.length; index++) {
        const el = cardRefs.current[index];
        const card = CARDS[index];
        if (el && card)
          el.style.transform = transformAt(card, index, loop.seconds, eased.x, eased.y);
      }
    };
    const start = () => {
      loop.last = 0;
      loop.frame = requestAnimationFrame(tick);
    };
    const onVisibility = () => {
      cancelAnimationFrame(loop.frame);
      if (!document.hidden) start();
    };

    window.addEventListener("pointermove", onPointerMove);
    document.addEventListener("visibilitychange", onVisibility);
    if (!document.hidden) start();
    return () => {
      cancelAnimationFrame(loop.frame);
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [reducedMotion]);

  return (
    <div {...stylex.props(styles.adrift)} aria-hidden="true">
      <canvas ref={inkRef} aria-hidden="true" {...stylex.props(styles.ink)} />
      {CARDS.map((card, index) => {
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
              card.depth === 1 && styles.focal,
              bare && styles.bare,
              styles.placed(card.w, card.h, transformAt(card, index, 0, 0, 0), 120 + index * 60),
              styles.depth(card.depth > 1 ? 9 : 12, blurFor(card.depth), opacityFor(card.depth)),
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
  adrift: { position: "absolute", zIndex: 0, inset: 0 },
  ink: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    color: color.ink,
    pointerEvents: "none",
  },
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
  focal: { boxShadow: `0 14px 32px ${color.shadow}` },
  bare: { borderWidth: 0 },
  placed: (w: number, h: number, transform: string, delay: number) => ({
    width: w,
    height: h,
    transform,
    animationDelay: `${delay}ms`,
  }),
  // Blur is fixed per card and never animated: a moving filter repaints every frame.
  depth: (radius: number, blur: number, opacity: number) => ({
    borderRadius: radius,
    filter: blur > 0.2 ? `blur(${blur.toFixed(2)}px)` : "none",
    opacity,
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
