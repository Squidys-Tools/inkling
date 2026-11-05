import * as stylex from "@stylexjs/stylex";
import { font, inkDevelopColor } from "@inkling/ui/tokens.stylex";
import { useEffect, useRef } from "react";
import { useMediaQuery } from "../../landing/environment.ts";
import { createDevelopRenderer } from "./renderer.ts";
import { frameAt, frameRect, media, query } from "./timeline.ts";

const faces = [
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

const phoneWidth = 640;
const qualitySteps = [1, 0.82, 0.68, 0.55];
const slowFrameMs = 20;
const sampleFrames = 30;

export function Develop() {
  const section = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const still = useRef<HTMLImageElement>(null);
  const queryText = useRef<HTMLSpanElement>(null);
  const found = useRef<HTMLSpanElement>(null);
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");

  useEffect(registerRedHat, []);

  useEffect(() => {
    const root = section.current;
    const surface = canvas.current;
    const image = still.current;
    const queryEl = queryText.current;
    const foundEl = found.current;
    if (reduced || !root || !surface || !image || !queryEl || !foundEl) return;

    const gpu = { renderer: createDevelopRenderer(surface, media) };
    const loop = {
      handle: 0,
      visible: false,
      last: 0,
      time: 0,
      progress: -1,
      typed: -1,
      shown: false,
      quality: 0,
      frames: 0,
      spent: 0,
    };
    const box = { top: 0, travel: 1, width: 1, height: 1, phone: false, ratio: 1 };

    const measure = () => {
      const rect = root.getBoundingClientRect();
      box.top = rect.top + window.scrollY;
      box.travel = Math.max(1, rect.height - window.innerHeight);
      box.width = Math.max(1, surface.clientWidth);
      box.height = Math.max(1, surface.clientHeight);
      box.phone = window.innerWidth < phoneWidth;
      box.ratio = Math.min(window.devicePixelRatio || 1, box.phone ? 1 : 1.5);
    };
    measure();

    const show = (canvasOn: boolean) => {
      if (loop.shown === canvasOn) return;
      loop.shown = canvasOn;
      surface.style.opacity = canvasOn ? "1" : "0";
      image.style.opacity = canvasOn ? "0" : "";
    };

    const govern = (delta: number) => {
      loop.frames += 1;
      loop.spent += delta;
      if (loop.frames < sampleFrames) return;
      if ((loop.spent / loop.frames) * 1000 > slowFrameMs) {
        loop.quality = Math.min(qualitySteps.length - 1, loop.quality + 1);
      }
      loop.frames = 0;
      loop.spent = 0;
    };

    const tick = (now: number) => {
      loop.handle = 0;
      const delta = loop.last ? Math.min(0.1, (now - loop.last) / 1000) : 0;
      loop.last = now;
      loop.time += Math.min(delta, 0.05);
      if (delta > 0) govern(delta);

      const goal = Math.min(1, Math.max(0, (window.scrollY - box.top) / box.travel));
      loop.progress =
        loop.progress < 0
          ? goal
          : loop.progress + (goal - loop.progress) * (1 - Math.exp(-delta * 4.5));
      const moment = frameAt(loop.progress);
      if (moment.characters !== loop.typed) {
        loop.typed = moment.characters;
        queryEl.textContent = query.text.slice(0, moment.characters);
      }
      foundEl.style.opacity = moment.found ? "1" : "0";

      const renderer = gpu.renderer;
      if (renderer?.ready) {
        renderer.draw({
          time: loop.time,
          width: box.width,
          height: box.height,
          scale: box.ratio * qualitySteps[loop.quality],
          rect: frameRect(box.width, box.height, box.phone),
          ...moment,
        });
        show(true);
      }
      if (loop.visible && !document.hidden) loop.handle = requestAnimationFrame(tick);
    };

    const wake = () => {
      if (loop.handle || !loop.visible || document.hidden) return;
      loop.last = 0;
      loop.handle = requestAnimationFrame(tick);
    };

    const observer = new IntersectionObserver(([entry]) => {
      loop.visible = entry?.isIntersecting ?? false;
      wake();
    });
    observer.observe(root);
    const resize = new ResizeObserver(measure);
    resize.observe(root);
    resize.observe(surface);
    window.addEventListener("resize", measure);
    document.addEventListener("visibilitychange", wake);

    const lost = (event: Event) => {
      event.preventDefault();
      gpu.renderer = null;
      show(false);
    };
    const restored = () => {
      gpu.renderer = createDevelopRenderer(surface, media);
      wake();
    };
    surface.addEventListener("webglcontextlost", lost);
    surface.addEventListener("webglcontextrestored", restored);

    return () => {
      observer.disconnect();
      resize.disconnect();
      window.removeEventListener("resize", measure);
      document.removeEventListener("visibilitychange", wake);
      surface.removeEventListener("webglcontextlost", lost);
      surface.removeEventListener("webglcontextrestored", restored);
      cancelAnimationFrame(loop.handle);
      gpu.renderer?.dispose();
      queryEl.textContent = query.text;
      foundEl.style.opacity = "";
      surface.style.opacity = "";
      image.style.opacity = "";
    };
  }, [reduced]);

  return (
    <section
      ref={section}
      aria-label="Describe it. That's the search."
      {...stylex.props(styles.section, reduced && styles.sectionStill)}
    >
      <div {...stylex.props(styles.stage)}>
        <img
          ref={still}
          src={media.still}
          alt={query.alt}
          width={1376}
          height={768}
          {...stylex.props(styles.still)}
        />
        <canvas ref={canvas} aria-hidden {...stylex.props(styles.canvas)} />
        <h2 {...stylex.props(styles.headline)}>
          <span {...stylex.props(styles.line)}>Describe it.</span>
          <span {...stylex.props(styles.line)}>That&apos;s the search.</span>
        </h2>
        <div {...stylex.props(styles.pill)}>
          <span ref={found} {...stylex.props(styles.found, reduced && styles.shown)} />
          <span ref={queryText} {...stylex.props(styles.query)}>
            {query.text}
          </span>
          <span aria-hidden {...stylex.props(styles.caret)} />
        </div>
      </div>
    </section>
  );
}

const blink = stylex.keyframes({
  "0%, 49%": { opacity: 1 },
  "50%, 100%": { opacity: 0 },
});

const phone = "@media (max-width: 639px)";

// These mirror frameRect in timeline.ts: the 1376x768 frame fills the width on wide screens; on phones its
// photo blob (670 frame px wide, centered at x 925) spans 66% of the width, centered at 62%, a little higher.
const styles = stylex.create({
  section: {
    position: "relative",
    height: "320svh",
    backgroundColor: inkDevelopColor.water,
    color: inkDevelopColor.ink,
  },
  sectionStill: { height: "100svh" },
  stage: {
    position: "sticky",
    top: 0,
    height: "100svh",
    overflow: "hidden",
    containerType: "size",
  },
  canvas: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    display: "block",
    opacity: 0,
    transition: "opacity 600ms ease",
  },
  shown: { opacity: 1 },
  still: {
    position: "absolute",
    maxWidth: "none",
    height: "auto",
    width: { default: "100cqw", [phone]: "135.55cqw" },
    left: { default: 0, [phone]: "-29.12cqw" },
    top: { default: "calc(56cqh - 27.907cqw)", [phone]: "calc(52cqh - 37.827cqw)" },
    transition: "opacity 600ms ease",
  },
  headline: {
    position: "absolute",
    top: { default: "clamp(56px, 11svh, 128px)", [phone]: "56px" },
    left: "clamp(20px, 4vw, 64px)",
    margin: 0,
    fontFamily: '"Red Hat", sans-serif',
    fontWeight: 700,
    fontSize: {
      default: "clamp(2.5rem, 4.4vw, 5rem)",
      [phone]: "clamp(2.25rem, 10.5vw, 3rem)",
    },
    lineHeight: 0.94,
    letterSpacing: "-0.045em",
    pointerEvents: "none",
  },
  line: { display: "block" },
  pill: {
    position: "absolute",
    left: { default: "67.22cqw", [phone]: "50cqw" },
    top: { default: "calc(56cqh - 19.186cqw)", [phone]: "calc(52cqh - 26.006cqw)" },
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    maxWidth: "88vw",
    paddingBlock: "9px",
    paddingInline: "14px 12px",
    borderRadius: "999px",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: inkDevelopColor.pillEdge,
    backgroundColor: inkDevelopColor.pill,
    backdropFilter: "blur(10px)",
    fontFamily: font.mono,
    fontSize: { default: "13px", [phone]: "12px" },
    letterSpacing: "0.01em",
    whiteSpace: "nowrap",
    transform: "translate(-50%, -50%)",
  },
  found: {
    width: "6px",
    height: "6px",
    flexShrink: 0,
    borderRadius: "50%",
    backgroundColor: inkDevelopColor.found,
    opacity: 0,
    transition: "opacity 400ms ease",
  },
  query: { minHeight: "1em" },
  caret: {
    width: "1px",
    height: "1.1em",
    backgroundColor: inkDevelopColor.ink,
    animationName: { default: blink, "@media (prefers-reduced-motion: reduce)": "none" },
    animationDuration: "1s",
    animationIterationCount: "infinite",
  },
});
