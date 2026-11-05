import * as stylex from "@stylexjs/stylex";
import { font, inkDevelopColor } from "@inkling/ui/tokens.stylex";
import { useEffect, useRef } from "react";
import { useMediaQuery } from "../../landing/environment.ts";
import { createDevelopRenderer } from "./renderer.ts";
import { frameAt, imageRect, queries } from "./timeline.ts";

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

// The last query holds once it has bloomed instead of scrolling on into a dissolve.
const stops = queries.length - 0.2;
const maxScale = 1.5;
const maxPixels = 2_400_000;

export function Develop() {
  const section = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const still = useRef<HTMLImageElement>(null);
  const pill = useRef<HTMLDivElement>(null);
  const query = useRef<HTMLSpanElement>(null);
  const found = useRef<HTMLSpanElement>(null);
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");

  useEffect(registerRedHat, []);

  useEffect(() => {
    const root = section.current;
    const surface = canvas.current;
    const image = still.current;
    const pillEl = pill.current;
    const queryEl = query.current;
    const foundEl = found.current;
    if (reduced || !root || !surface || !image || !pillEl || !queryEl || !foundEl) return;

    const renderer = createDevelopRenderer(
      surface,
      queries.map((entry) => entry.src),
    );
    const loop = {
      handle: 0,
      visible: false,
      last: 0,
      time: 0,
      progress: -1,
      index: -1,
      typed: -1,
    };
    pillEl.style.top = "0";
    pillEl.style.left = "0";
    if (renderer) {
      surface.style.opacity = "1";
      image.style.visibility = "hidden";
    }

    const target = () => {
      const box = root.getBoundingClientRect();
      const travel = Math.max(1, box.height - window.innerHeight);
      return Math.min(1, Math.max(0, -box.top / travel)) * stops;
    };

    const tick = (now: number) => {
      const delta = loop.last ? Math.min(0.05, (now - loop.last) / 1000) : 0;
      loop.last = now;
      loop.time += delta;
      const goal = target();
      loop.progress =
        loop.progress < 0
          ? goal
          : loop.progress + (goal - loop.progress) * (1 - Math.exp(-delta * 4.5));
      const frame = frameAt(loop.progress);
      const width = surface.clientWidth;
      const height = surface.clientHeight;
      const entry = queries[frame.index];
      const rect = imageRect(width, height, entry.aspect);

      if (frame.index !== loop.index || frame.characters !== loop.typed) {
        if (!renderer && frame.index !== loop.index) {
          image.src = entry.src;
          image.alt = entry.alt;
          image.style.aspectRatio = String(entry.aspect);
        }
        loop.index = frame.index;
        loop.typed = frame.characters;
        queryEl.textContent = entry.text.slice(0, frame.characters);
      }
      pillEl.style.transform = `translate(${rect.x}px, ${rect.y - rect.halfHeight - 36}px) translate(-50%, -100%)`;
      foundEl.style.opacity = frame.found ? "1" : "0";

      if (renderer) {
        const scale = Math.min(
          window.devicePixelRatio || 1,
          maxScale,
          Math.sqrt(maxPixels / Math.max(1, width * height)),
        );
        renderer.draw({
          time: loop.time,
          width,
          height,
          scale,
          rect,
          image: frame.index,
          ...frame,
        });
      }
      loop.handle = loop.visible ? requestAnimationFrame(tick) : 0;
    };

    const observer = new IntersectionObserver(([entry]) => {
      loop.visible = entry?.isIntersecting ?? false;
      if (loop.visible && !loop.handle) {
        loop.last = 0;
        loop.handle = requestAnimationFrame(tick);
      }
    });
    observer.observe(root);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(loop.handle);
      renderer?.dispose();
      pillEl.removeAttribute("style");
      surface.style.opacity = "";
      image.style.visibility = "";
    };
  }, [reduced]);

  const first = queries[0];

  return (
    <section
      ref={section}
      aria-label="Describe it. That's the search."
      {...stylex.props(styles.section, reduced && styles.sectionStill)}
    >
      <div {...stylex.props(styles.stage)}>
        <img
          ref={still}
          src={first.src}
          alt={first.alt}
          {...stylex.props(styles.still)}
          style={{ aspectRatio: String(first.aspect) }}
        />
        <canvas ref={canvas} aria-hidden {...stylex.props(styles.canvas)} />
        <h2 {...stylex.props(styles.headline)}>
          <span {...stylex.props(styles.line)}>Describe it.</span>
          <span {...stylex.props(styles.line)}>That&apos;s the search.</span>
        </h2>
        <div ref={pill} {...stylex.props(styles.pill)}>
          <span ref={found} {...stylex.props(styles.found, reduced && styles.shown)} />
          <span ref={query} {...stylex.props(styles.query)}>
            {first.text}
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

const styles = stylex.create({
  section: {
    position: "relative",
    height: "460svh",
    backgroundColor: inkDevelopColor.water,
    color: inkDevelopColor.ink,
  },
  sectionStill: { height: "100svh" },
  stage: {
    position: "sticky",
    top: 0,
    height: "100svh",
    overflow: "hidden",
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
    left: { default: "64%", [phone]: "50%" },
    top: { default: "56%", [phone]: "60%" },
    height: { default: "70svh", [phone]: "min(44svh, 99vw)" },
    width: "auto",
    maxWidth: "82vw",
    objectFit: "cover",
    transform: "translate(-50%, -50%)",
  },
  headline: {
    position: "absolute",
    top: { default: "clamp(72px, 12svh, 140px)", [phone]: "56px" },
    left: "clamp(20px, 4vw, 64px)",
    margin: 0,
    fontFamily: '"Red Hat", sans-serif',
    fontWeight: 700,
    fontSize: {
      default: "clamp(2.75rem, 5.6vw, 6.25rem)",
      [phone]: "clamp(2.25rem, 10.5vw, 3rem)",
    },
    lineHeight: 0.94,
    letterSpacing: "-0.045em",
    pointerEvents: "none",
  },
  line: { display: "block" },
  pill: {
    position: "absolute",
    top: { default: "calc(56% - 35svh - 36px)", [phone]: "calc(60% - 22svh - 28px)" },
    left: { default: "64%", [phone]: "50%" },
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
    transform: "translate(-50%, -100%)",
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
