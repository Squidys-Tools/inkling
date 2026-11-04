import * as stylex from "@stylexjs/stylex";
import { useCallback, useEffect, useRef, useState } from "react";
import { loadingColor, motion, radius } from "@inkling/ui/tokens.stylex";
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
  revealRingGrow,
  revealSeconds,
  ringGrowAt,
  sampleCells,
  stringSeed,
} from "./cardFx.ts";
import { loadingPhase, startsReveal } from "./cardLoading.ts";
import { ProcessingBadge } from "./Processing.tsx";

/** A thin light travelling the card's edge while it waits for its thumbnail. */
function Beam({ label, onPaper }: { label: string; onPaper: boolean }) {
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
      {...stylex.props(styles.layer, styles.beam, onPaper && styles.dark)}
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

/**
 * The cover over a card: a dark base with a ring of blobs while jobs run, which then
 * resolves into the thumbnail's own colours as round blobs that grow and shrink away.
 */
function Cover({
  url,
  seed,
  revealing,
  label,
  onRevealed,
}: {
  url: string;
  seed: number;
  revealing: boolean;
  label: string;
  onRevealed: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cells = useRef<Mosaic["cells"]>(null);
  useEffect(() => {
    let current = true;
    cells.current = null;
    void sampleCells(url).then((sampled) => {
      if (current) cells.current = sampled;
    });
    return () => {
      current = false;
    };
  }, [url]);
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const size = canvasSize(canvas.clientWidth, canvas.clientHeight, revealing);
    canvas.width = size.width;
    canvas.height = size.height;
    const mosaic: Mosaic = {
      width: canvas.width,
      height: canvas.height,
      cells: null,
      phases: mosaicPhases(seed),
      image: context.createImageData(canvas.width, canvas.height),
    };
    const start = performance.now() / 1000;
    const run = animate((now) => {
      mosaic.cells = cells.current;
      if (!revealing)
        return void drawCover(context, mosaic, now + seed, 0, ringGrowAt(now - start));
      const progress = Math.min(1, (now - start) / revealSeconds);
      drawCover(context, mosaic, now + seed, progress, revealRingGrow(progress));
      if (progress < 1) return false;
      onRevealed();
      return true;
    });
    if (!run.animated) {
      if (revealing) onRevealed();
      else drawCover(context, mosaic, seed, 0, 1);
    }
    return run.stop;
  }, [seed, revealing, onRevealed]);
  return (
    <span role="status" aria-label={label} {...stylex.props(styles.layer)}>
      <canvas ref={canvasRef} aria-hidden="true" {...stylex.props(styles.cover)} />
      <span aria-hidden="true" {...stylex.props(styles.layer, styles.rim)} />
    </span>
  );
}

/** A failed card: what was read, drained of colour and dimmed, and still. */
function Failed() {
  return (
    <>
      <span aria-hidden="true" {...stylex.props(styles.layer, styles.drain)} />
      <span aria-hidden="true" {...stylex.props(styles.layer, styles.veil)} />
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
  if (previous !== phase) {
    setPrevious(phase);
    if (startsReveal(previous, phase, view.image)) setRevealing(true);
    else if (phase !== null) setRevealing(false);
  }
  const revealed = useCallback(() => setRevealing(false), []);
  const label = processing?.message ?? "Processing";
  const seed = stringSeed(view.id) % 20;
  const onPaper = view.kind === "Article" || view.media === "x-post" || view.media === "post";
  if (revealing && view.image)
    return <Cover url={view.image} seed={seed} revealing label={label} onRevealed={revealed} />;
  const badge = processing && <ProcessingBadge processing={processing} onRetry={onRetry} />;
  switch (phase) {
    case "captured":
      return <Beam label={label} onPaper={onPaper} />;
    case "processing":
      return (
        view.image && (
          <Cover
            url={view.image}
            seed={seed}
            revealing={false}
            label={label}
            onRevealed={revealed}
          />
        )
      );
    case "failed":
      return (
        <>
          <Failed />
          {badge}
        </>
      );
    case null:
      return badge;
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
  drain: { backgroundColor: loadingColor.failedGrey, mixBlendMode: "saturation" },
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
  // The beam is light, so it is flipped to dark on the cards that are drawn on pale paper.
  dark: { filter: "invert(1)" },
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
