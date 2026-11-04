import { RotateCwIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import * as stylex from "@stylexjs/stylex";
import { useCallback, useEffect, useRef, useState } from "react";
import { cardColor, color, font, loadingColor, motion, radius } from "@inkling/ui/tokens.stylex";
import type { CardView } from "../library/cardModel.ts";
import type { Processing } from "../library/jobs.ts";
import { beam } from "./beam.stylex.ts";
import { beamBloom, beamEdges, beamGlow, beamStroke, beamWindow, solid } from "./beamGradients.ts";
import {
  animate,
  beamSlot,
  drawCover,
  type Mosaic,
  mosaicPhases,
  revealSeconds,
  ringGrowAt,
  sampleCells,
  stringSeed,
} from "./cardFx.ts";
import { loadingPhase, startsReveal } from "./cardLoading.ts";
import { ProcessingBadge } from "./Processing.tsx";

/** A thin light travelling the card's edge while it waits for its thumbnail. */
function Beam({ label }: { label: string }) {
  const element = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const release = beamSlot();
    // Past the cap only the turn stops; the fade-in still runs, so the beam shows as a still frame.
    if (!release && element.current) element.current.style.animationPlayState = "paused, running";
    return release ?? undefined;
  }, []);
  return (
    <span
      ref={element}
      role="status"
      aria-label={label}
      {...stylex.props(styles.layer, styles.beam)}
    >
      <span
        {...stylex.props(
          styles.stroke,
          styles.paint(beamStroke, `${beamWindow}, ${solid}, ${solid}`),
        )}
      />
      <span {...stylex.props(styles.glow, styles.paint(beamGlow, `${beamWindow}, ${beamEdges}`))} />
      <span {...stylex.props(styles.bloom, styles.paint(beamBloom, `${solid}, ${solid}`))} />
    </span>
  );
}

// The ring is cheap and shows its edges, so it draws sharper than the mosaic reveal.
// Both sides share one scale, or the picture would stretch differently on every card shape.
const canvasSize = (width: number, height: number, revealing: boolean) => {
  const longest = Math.max(1, width, height);
  const shortest = Math.max(1, Math.min(width, height));
  const scale = Math.max(
    24 / shortest,
    Math.min(revealing ? 1 / 3 : 1 / 2, (revealing ? 120 : 200) / longest),
  );
  // A card measured before layout reads 0 wide, and createImageData throws on a 0 side.
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
};

const newMosaic = (
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
  seed: number,
  base: boolean,
): Mosaic => ({
  width: canvas.width,
  height: canvas.height,
  cells: null,
  phases: mosaicPhases(seed),
  image: context.createImageData(canvas.width, canvas.height),
  base,
});

/** A dark cover with a breathing ring of blobs, drawn while a card's jobs run. */
function Ring({ seed, label, leaving }: { seed: number; label: string; leaving: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const size = canvasSize(canvas.clientWidth, canvas.clientHeight, false);
    canvas.width = size.width;
    canvas.height = size.height;
    const mosaic = newMosaic(canvas, context, seed, true);
    const start = performance.now() / 1000;
    const run = animate(
      (now) => void drawCover(context, mosaic, now + seed, 0, ringGrowAt(now - start)),
    );
    if (!run.animated) drawCover(context, mosaic, seed, 0, 1);
    return run.stop;
  }, [seed]);
  return (
    <span
      role="status"
      aria-label={label}
      {...stylex.props(styles.layer, leaving && styles.leaving)}
    >
      <canvas ref={canvasRef} aria-hidden="true" {...stylex.props(styles.cover)} />
    </span>
  );
}

// The ring is fully covered by then, so it can stop drawing and unmount.
const coveredAt = 0.5;

/**
 * The finished state: the thumbnail's own colours as round blobs that grow over the
 * card, then shrink away to show it. It draws over the ring, which it lets go once covered.
 */
function Reveal({
  url,
  seed,
  label,
  overRing,
  onCovered,
  onRevealed,
}: {
  url: string;
  seed: number;
  label: string | null;
  overRing: boolean;
  onCovered: () => void;
  onRevealed: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cells = useRef<Mosaic["cells"]>(null);
  // Whether the ring is beneath is decided once: it unmounts mid-reveal, which must not restart it.
  const [withRing] = useState(overRing);
  useEffect(() => {
    const sampling = { cancelled: false };
    void sampleCells(url).then((sampled) => {
      if (!sampling.cancelled) cells.current = sampled;
    });
    return () => {
      sampling.cancelled = true;
    };
  }, [url]);
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const size = canvasSize(canvas.clientWidth, canvas.clientHeight, true);
    canvas.width = size.width;
    canvas.height = size.height;
    const mosaic = newMosaic(canvas, context, seed, !withRing);
    const start = performance.now() / 1000;
    const reveal = { covered: false };
    const run = animate((now) => {
      mosaic.cells = cells.current;
      const progress = Math.min(1, (now - start) / revealSeconds);
      drawCover(context, mosaic, now + seed, progress, 0);
      if (!reveal.covered && progress >= coveredAt) {
        reveal.covered = true;
        onCovered();
      }
      if (progress < 1) return false;
      onRevealed();
      return true;
    });
    if (!run.animated) onRevealed();
    return run.stop;
  }, [seed, withRing, onCovered, onRevealed]);
  return (
    <span
      role={label ? "status" : undefined}
      aria-label={label ?? undefined}
      aria-hidden={label ? undefined : true}
      {...stylex.props(styles.layer)}
    >
      <canvas ref={canvasRef} aria-hidden="true" {...stylex.props(styles.cover)} />
    </span>
  );
}

/** A thin edge on the cover so a dark card still reads against the dark grid. */
function Rim() {
  return <span aria-hidden="true" {...stylex.props(styles.layer, styles.rim)} />;
}

/** A card still waiting for its thumbnail: dimmed and greyed, but still readable. */
function Dim() {
  return (
    <>
      <span aria-hidden="true" {...stylex.props(styles.layer, styles.drain, styles.half)} />
      <span aria-hidden="true" {...stylex.props(styles.layer, styles.dimVeil)} />
    </>
  );
}

/** A failed card: what was read, drained of colour and dimmed, and still. */
function Failed({
  failed,
  onRetry,
}: {
  failed: NonNullable<Processing["failedJob"]>;
  onRetry: (jobId: string) => void;
}) {
  return (
    <>
      <span aria-hidden="true" {...stylex.props(styles.layer, styles.drain)} />
      <span aria-hidden="true" {...stylex.props(styles.layer, styles.veil)} />
      <span {...stylex.props(styles.layer, styles.center)}>
        <button
          type="button"
          aria-label={`${failed.message} Try again`}
          title={failed.message}
          onClick={(event) => {
            event.stopPropagation();
            onRetry(failed.id);
          }}
          onKeyDown={(event) => event.stopPropagation()}
          {...stylex.props(styles.retry)}
        >
          <HugeiconsIcon icon={RotateCwIcon} size={14} /> Try again
        </button>
      </span>
    </>
  );
}

/**
 * A grid card's loading state, drawn over the whole card: a beam while it waits for its
 * thumbnail, a ring of blobs while it is indexed, a mosaic reveal when that finishes,
 * and a muted still card with a retry button when a job failed.
 */
export function CardState({
  view,
  processing,
  onRetry,
}: {
  view: CardView;
  processing: Processing | undefined;
  onRetry: (jobId: string) => void;
}) {
  const phase = loadingPhase(view, processing);
  const [previous, setPrevious] = useState(phase);
  const [revealing, setRevealing] = useState(false);
  const [ringUnder, setRingUnder] = useState(false);
  if (previous !== phase) {
    setPrevious(phase);
    if (startsReveal(previous, phase, view.image)) {
      setRevealing(true);
      setRingUnder(previous === "processing");
    } else if (phase !== null) {
      setRevealing(false);
      setRingUnder(false);
    }
  }
  const covered = useCallback(() => setRingUnder(false), []);
  const revealed = useCallback(() => {
    setRevealing(false);
    setRingUnder(false);
  }, []);
  const label = processing?.message ?? "Processing";
  const seed = stringSeed(view.id) % 20;
  const ring = view.image !== undefined && (phase === "processing" || ringUnder);
  const reveal = view.image !== undefined && revealing;
  if (view.image && (ring || reveal))
    return (
      <>
        {ring && <Ring seed={seed} label={label} leaving={revealing} />}
        {reveal && (
          <Reveal
            url={view.image}
            seed={seed}
            label={ring ? null : label}
            overRing={ring}
            onCovered={covered}
            onRevealed={revealed}
          />
        )}
        <Rim />
      </>
    );
  switch (phase) {
    case "captured":
      return (
        <>
          <Dim />
          <Beam label={label} />
        </>
      );
    case "failed":
      return processing?.failedJob && <Failed failed={processing.failedJob} onRetry={onRetry} />;
    default:
      return processing && <ProcessingBadge processing={processing} onRetry={onRetry} />;
  }
}

const turn = stylex.keyframes({
  from: { [beam.angle]: "0deg" },
  to: { [beam.angle]: "360deg" },
});
const fadeIn = stylex.keyframes({ from: { opacity: 0 }, to: { opacity: 1 } });

const styles = stylex.create({
  // The gradients are built in code from the colour tokens, so they arrive as values.
  paint: (backgroundImage: string, maskImage: string) => ({ backgroundImage, maskImage }),
  layer: {
    position: "absolute",
    inset: 0,
    zIndex: 2,
    borderRadius: radius.card,
    pointerEvents: "none",
  },
  cover: {
    display: "block",
    width: "100%",
    height: "100%",
    animationName: { default: fadeIn, "@media (prefers-reduced-motion: reduce)": "none" },
    animationDuration: motion.layout,
    animationTimingFunction: "ease",
  },
  rim: {
    boxShadow: `inset 0 0 0 1px ${loadingColor.ringEdge}, inset 0 0 14px 1px ${loadingColor.ringGlow}`,
  },
  leaving: {
    opacity: 0,
    transitionProperty: "opacity",
    transitionDuration: "0.7s",
    transitionDelay: "1.3s",
    transitionTimingFunction: "linear",
  },
  drain: { backgroundColor: loadingColor.failedGrey, mixBlendMode: "saturation" },
  half: { opacity: 0.55 },
  dimVeil: { backgroundColor: loadingColor.waitingVeil },
  center: { display: "grid", placeItems: "center" },
  retry: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    paddingBlock: 8,
    paddingInline: 14,
    borderRadius: radius.round,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: color.border,
    backgroundColor: { default: cardColor.tileButton, ":hover": color.surface },
    color: color.ink,
    fontFamily: font.body,
    fontSize: 12,
    cursor: "pointer",
    pointerEvents: "auto",
    outline: { default: "none", ":focus-visible": `2px solid ${color.accent}` },
    outlineOffset: 2,
  },
  veil: {
    backgroundColor: loadingColor.failedVeil,
    boxShadow: `inset 0 0 0 1px ${loadingColor.failedEdge}`,
  },
  beam: {
    overflow: "hidden",
    animationName: {
      default: `${turn}, ${fadeIn}`,
      "@media (prefers-reduced-motion: reduce)": "none",
    },
    animationDuration: "4.2s, 0.6s",
    animationTimingFunction: "linear, ease",
    animationIterationCount: "infinite, 1",
    animationFillMode: "none, both",
  },
  stroke: {
    position: "absolute",
    inset: 0,
    zIndex: 2,
    boxSizing: "border-box",
    padding: 1,
    borderRadius: radius.card,
    clipPath: `inset(0 round ${radius.card})`,
    maskOrigin: "border-box, content-box, border-box",
    maskClip: "border-box, content-box, border-box",
    maskComposite: "intersect, exclude",
    opacity: 0.34,
  },
  glow: {
    position: "absolute",
    inset: 0,
    zIndex: 1,
    borderRadius: radius.card,
    clipPath: `inset(0 round ${radius.card})`,
    boxShadow: `inset 0 0 9px 1px ${loadingColor.beamLightSoft}`,
    maskComposite: "intersect, add",
    opacity: 0.55,
  },
  bloom: {
    position: "absolute",
    inset: 0,
    zIndex: 3,
    boxSizing: "border-box",
    padding: 1,
    borderRadius: radius.card,
    clipPath: `inset(0 round ${radius.card})`,
    maskOrigin: "content-box, border-box",
    maskClip: "content-box, border-box",
    maskComposite: "exclude",
    filter: "blur(8px) brightness(1.3) saturate(1.2)",
    opacity: 0.31,
  },
});
