import * as stylex from "@stylexjs/stylex";
import { inkClose } from "@inkling/ui/tokens.stylex";
import { type PointerEvent, useCallback, useEffect, useRef, useState } from "react";
import { DownloadButton } from "../../landing/DownloadButton.tsx";
import { useCalm, useHydrated } from "../../landing/environment.ts";
import { ExternalArrow } from "../../landing/ExternalArrow.tsx";
import { landing, media } from "../../landing/landing.stylex.ts";
import { repository } from "../../layout/links.ts";
import { createWater, type Layout, type Water } from "./water.ts";

const faces = [
  ["/media/red-hat-400.ttf", "400"],
  ["/media/red-hat-500.ttf", "500"],
  ["/media/red-hat-700.ttf", "700"],
] as const;

function registerRedHat() {
  for (const [url, weight] of faces) {
    const face = new FontFace("Red Hat", `url(${url}) format("truetype")`, {
      weight,
      display: "swap",
    });
    document.fonts.add(face);
    void face.load().catch(() => {});
  }
}

const portrait = (canvas: HTMLCanvasElement) => canvas.clientHeight > canvas.clientWidth;

const layoutFor = (canvas: HTMLCanvasElement): Layout =>
  portrait(canvas) ? { surface: 0.42, band: 0.08 } : { surface: 0.42, band: 0.12 };

const dropX = (canvas: HTMLCanvasElement) => (portrait(canvas) ? 0.5 : 0.64);

// Renders only while on screen, and lets the first drop fall once the section is well in view.
function watch(canvas: HTMLCanvasElement, sim: Water) {
  let dropped = false;
  const visible = new IntersectionObserver(
    ([entry]) => {
      if (!entry?.isIntersecting) {
        sim.stop();
        return;
      }
      sim.start();
      if (!dropped && entry.intersectionRatio >= 0.35) {
        dropped = true;
        sim.drop(dropX(canvas));
      }
    },
    { threshold: [0, 0.35] },
  );
  visible.observe(canvas);
  return () => visible.disconnect();
}

export function CloseSection() {
  const calm = useCalm();
  const hydrated = useHydrated();
  const water = useRef<Water | null>(null);
  const [live, setLive] = useState(false);

  useEffect(registerRedHat, []);

  const mount = useCallback(
    (canvas: HTMLCanvasElement | null) => {
      if (!canvas) return;
      const sim = createWater(canvas, () => layoutFor(canvas));
      if (!sim) return;
      water.current = sim;
      if (calm) sim.settle(dropX(canvas), 7);
      setLive(true);
      const unwatch = calm ? () => {} : watch(canvas, sim);
      const resize = new ResizeObserver(() => sim.resize());
      resize.observe(canvas);
      return () => {
        unwatch();
        resize.disconnect();
        sim.dispose();
        water.current = null;
      };
    },
    [calm],
  );

  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (calm || !event.isPrimary) return;
    const box = event.currentTarget.getBoundingClientRect();
    water.current?.drop((event.clientX - box.left) / box.width);
  };

  return (
    <section aria-labelledby="ink-close-title" {...stylex.props(styles.section)}>
      <img src="/media/ink/close/still.webp" alt="" {...stylex.props(styles.fill, styles.still)} />
      {hydrated && (
        <canvas
          key={calm ? "still" : "moving"}
          ref={mount}
          aria-hidden="true"
          onPointerDown={onPointerDown}
          {...stylex.props(styles.fill, styles.canvas, live && styles.live, calm && styles.calm)}
        />
      )}
      <div {...stylex.props(styles.content)}>
        <h2 id="ink-close-title" {...stylex.props(styles.title)}>
          Keep what matters.
        </h2>
        <div {...stylex.props(styles.actions)}>
          <DownloadButton />
          <a href={repository} {...stylex.props(stylex.defaultMarker(), styles.github)}>
            GitHub
            <ExternalArrow />
          </a>
        </div>
      </div>
      <p {...stylex.props(styles.footnote)}>MIT licensed · no account · no tracking</p>
    </section>
  );
}

const styles = stylex.create({
  section: {
    position: "relative",
    isolation: "isolate",
    overflow: "hidden",
    minHeight: { default: "100svh", [media.phone]: "640px" },
    backgroundColor: inkClose.water,
    color: inkClose.ink,
    fontFamily: landing.font,
  },
  fill: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
  },
  still: { objectFit: "cover", objectPosition: "64% 50%", pointerEvents: "none" },
  canvas: {
    display: "block",
    opacity: 0,
    cursor: "crosshair",
    touchAction: "manipulation",
    transitionProperty: "opacity",
    transitionDuration: { default: "0.8s", [media.reduced]: "0s" },
  },
  live: { opacity: 1 },
  calm: { cursor: "default" },
  content: {
    position: "relative",
    zIndex: 1,
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    justifyContent: { default: "center", [media.tablet]: "flex-start" },
    gap: { default: "48px", [media.phone]: "32px" },
    minHeight: { default: "100svh", [media.phone]: "640px" },
    width: { default: "38%", [media.tablet]: "100%" },
    paddingInline: landing.gutter,
    paddingTop: { default: "0", [media.tablet]: "14svh" },
    paddingBottom: { default: "8svh", [media.tablet]: "0" },
    pointerEvents: "none",
  },
  title: {
    margin: 0,
    maxWidth: "6.5ch",
    fontSize: {
      default: "clamp(3.5rem, 8.4vw, 9.5rem)",
      [media.phone]: "clamp(3rem, 15vw, 4.75rem)",
    },
    fontWeight: 500,
    lineHeight: 0.9,
    letterSpacing: "-0.055em",
    textWrap: "balance",
  },
  actions: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: "12px",
    pointerEvents: "auto",
  },
  github: {
    boxSizing: "border-box",
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    height: { default: "60px", [media.phone]: "58px" },
    paddingInline: "24px",
    borderRadius: "22px",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: { default: inkClose.line, ":hover": inkClose.lineStrong },
    color: inkClose.ink,
    fontSize: { default: "16px", [media.phone]: "15px" },
    fontWeight: 500,
    letterSpacing: "-0.015em",
    textDecoration: "none",
    transitionProperty: "border-color",
    transitionDuration: "0.2s",
    outline: { default: null, ":focus-visible": `3px solid ${inkClose.ink}` },
    outlineOffset: { default: null, ":focus-visible": "5px" },
  },
  footnote: {
    position: "absolute",
    zIndex: 1,
    left: landing.gutter,
    bottom: { default: "28px", [media.phone]: "20px" },
    margin: 0,
    color: inkClose.muted,
    fontSize: "12px",
    letterSpacing: "0.02em",
    pointerEvents: "none",
  },
});
