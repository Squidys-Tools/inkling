import * as stylex from "@stylexjs/stylex";
import { inkHeroColor } from "@inkling/ui/tokens.stylex";
import { type PointerEvent, type RefObject, useCallback, useEffect, useRef, useState } from "react";
import release from "virtual:latest-release";
import { useMediaQuery } from "../../landing/environment.ts";
import { landing, media } from "../../landing/landing.stylex.ts";
import { usePlatform } from "../../parts/platform.ts";
import { createFluid, type Fluid } from "./fluid.ts";
import { useAutoType } from "./useAutoType.ts";

const still = "/media/ink/hero/still.webp";

const faces = [
  ["/media/red-hat-400.ttf", "400"],
  ["/media/red-hat-500.ttf", "500"],
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

function useDownloadHref() {
  const platform = usePlatform();
  if (platform === "win32" && release?.windows) return release.windows;
  if (platform === "darwin" && release?.mac) return release.mac;
  return "/download";
}

// Runs the field only while the section is on screen and the tab is visible.
function animate(
  canvas: HTMLCanvasElement,
  section: HTMLElement,
  fluidRef: RefObject<Fluid | null>,
  setLive: (live: boolean) => void,
) {
  const fluid = createFluid(canvas);
  if (!fluid) return;
  fluidRef.current = fluid;
  fluid.resize();
  const state = { frame: 0, visible: true, shown: false };
  const loop = (now: number) => {
    fluid.frame(now / 1000);
    if (!state.shown) {
      state.shown = true;
      setLive(true);
    }
    state.frame = requestAnimationFrame(loop);
  };
  const update = () => {
    cancelAnimationFrame(state.frame);
    state.frame = 0;
    if (state.visible && document.visibilityState === "visible")
      state.frame = requestAnimationFrame(loop);
  };
  const intersection = new IntersectionObserver(([entry]) => {
    state.visible = entry?.isIntersecting ?? true;
    update();
  });
  intersection.observe(section);
  const resize = new ResizeObserver(() => fluid.resize());
  resize.observe(canvas);
  const lost = (event: Event) => {
    event.preventDefault();
    state.visible = false;
    cancelAnimationFrame(state.frame);
    setLive(false);
  };
  canvas.addEventListener("webglcontextlost", lost);
  document.addEventListener("visibilitychange", update);
  update();
  return () => {
    cancelAnimationFrame(state.frame);
    intersection.disconnect();
    resize.disconnect();
    canvas.removeEventListener("webglcontextlost", lost);
    document.removeEventListener("visibilitychange", update);
    fluid.dispose();
    fluidRef.current = null;
    setLive(false);
  };
}

export function InkHero() {
  const calm = useMediaQuery("(prefers-reduced-motion: reduce)", true);
  const sectionRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pillRef = useRef<HTMLFormElement>(null);
  const fluidRef = useRef<Fluid | null>(null);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const [live, setLive] = useState(false);
  const [focused, setFocused] = useState(false);
  const [query, setQuery] = useState("");
  const downloadHref = useDownloadHref();

  useEffect(registerRedHat, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const section = sectionRef.current;
    if (calm || !canvas || !section) return;
    return animate(canvas, section, fluidRef, setLive);
  }, [calm]);

  // A keystroke kicks the ink just above the pill, roughly where the caret is.
  const stirFromKey = useCallback((progress: number) => {
    const fluid = fluidRef.current;
    const canvas = canvasRef.current;
    const pill = pillRef.current;
    if (!fluid || !canvas || !pill) return;
    const box = canvas.getBoundingClientRect();
    const rect = pill.getBoundingClientRect();
    const caret = rect.left + rect.width * (0.12 + 0.76 * Math.min(1, progress));
    const x = (caret - box.left) / box.width + (Math.random() - 0.5) * 0.06;
    const y = 1 - (rect.top - box.top) / box.height + 0.06 + Math.random() * 0.08;
    const angle = (Math.random() - 0.5) * 2.2;
    const force = 380 + Math.random() * 420;
    fluid.stir(x, y, Math.sin(angle) * force, Math.cos(angle) * force, 0.0022);
  }, []);

  const typed = useAutoType(!calm && live && !focused && query === "", stirFromKey);

  const stirFromPointer = (event: PointerEvent<HTMLElement>) => {
    const fluid = fluidRef.current;
    const canvas = canvasRef.current;
    if (!fluid || !canvas) return;
    const box = canvas.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width;
    const y = 1 - (event.clientY - box.top) / box.height;
    const previous = pointerRef.current;
    pointerRef.current = { x, y };
    if (!previous) return;
    const dx = (x - previous.x) * 5200;
    const dy = (y - previous.y) * 5200;
    const speed = Math.hypot(dx, dy);
    if (speed < 4) return;
    const clamp = Math.min(1, 900 / speed);
    fluid.stir(x, y, dx * clamp, dy * clamp, 0.0012);
  };

  const showTyped = query === "" && !focused;

  return (
    <section
      ref={sectionRef}
      aria-label="inkling"
      onPointerMove={stirFromPointer}
      onPointerLeave={() => {
        pointerRef.current = null;
      }}
      {...stylex.props(styles.section)}
    >
      <img src={still} alt="" aria-hidden="true" {...stylex.props(styles.layer, styles.still)} />
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        {...stylex.props(styles.layer, styles.canvas, live && styles.canvasLive)}
      />

      <a href="/" {...stylex.props(styles.wordmark)}>
        inkling
      </a>

      <form
        ref={pillRef}
        role="search"
        onSubmit={(event) => event.preventDefault()}
        {...stylex.props(styles.pill)}
      >
        <input
          type="search"
          aria-label="Describe what you saved"
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(event) => {
            if (event.key.length === 1 || event.key === "Backspace")
              stirFromKey(Math.min(1, (query.length + 1) / 38));
          }}
          {...stylex.props(styles.input)}
        />
        {showTyped && (
          <span aria-hidden="true" {...stylex.props(styles.typed)}>
            {typed}
            <span {...stylex.props(styles.caret, calm && styles.caretStill)} />
          </span>
        )}
      </form>

      <div {...stylex.props(styles.footer)}>
        <div {...stylex.props(styles.copy)}>
          <h1 {...stylex.props(styles.headline)}>You remember it. Roughly.</h1>
          <p {...stylex.props(styles.lede)}>inkling finds it anyway.</p>
        </div>
        <div {...stylex.props(styles.action)}>
          <a href={downloadHref} {...stylex.props(styles.download)}>
            Download
          </a>
          <p {...stylex.props(styles.fine)}>Free · Open source · Windows, Linux, Mac</p>
        </div>
      </div>
    </section>
  );
}

const blink = stylex.keyframes({
  "0%, 45%": { opacity: 1 },
  "55%, 100%": { opacity: 0 },
});

const styles = stylex.create({
  section: {
    position: "relative",
    isolation: "isolate",
    overflow: "hidden",
    boxSizing: "border-box",
    width: "100%",
    height: "100svh",
    minHeight: "560px",
    backgroundColor: inkHeroColor.water,
    color: inkHeroColor.ink,
    fontFamily: landing.font,
    touchAction: "pan-y",
  },
  layer: {
    position: "absolute",
    inset: 0,
    zIndex: -1,
    width: "100%",
    height: "100%",
    display: "block",
  },
  still: {
    objectFit: { default: "cover", [media.phone]: "contain" },
    objectPosition: { default: "50% 40%", [media.phone]: "50% 22%" },
    transform: { default: null, [media.phone]: "scale(1.65)" },
    transformOrigin: "50% 22%",
  },
  canvas: {
    opacity: 0,
    transitionProperty: "opacity",
    transitionDuration: "1.2s",
    transitionTimingFunction: landing.ease,
  },
  canvasLive: { opacity: 1 },
  wordmark: {
    position: "absolute",
    top: { default: "28px", [media.phone]: "20px" },
    left: landing.gutter,
    color: inkHeroColor.ink,
    fontSize: "15px",
    fontWeight: 500,
    letterSpacing: "-0.02em",
    textDecoration: "none",
    outline: { default: null, ":focus-visible": `2px solid ${inkHeroColor.found}` },
    outlineOffset: "4px",
  },
  pill: {
    position: "absolute",
    left: "50%",
    top: { default: "66%", [media.phone]: "56%" },
    transform: "translate(-50%, -50%)",
    boxSizing: "border-box",
    display: "flex",
    alignItems: "center",
    width: "min(400px, calc(100% - 40px))",
    height: "52px",
    margin: 0,
    paddingInline: "22px",
    borderRadius: "999px",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: inkHeroColor.glassEdge,
    backgroundColor: inkHeroColor.glass,
    backdropFilter: "blur(16px) saturate(140%)",
    WebkitBackdropFilter: "blur(16px) saturate(140%)",
    boxShadow: `0 22px 44px -22px ${inkHeroColor.glassShadow}, 0 0 0 1px ${inkHeroColor.glassRim}, inset 0 1px 0 ${inkHeroColor.glassEdge}`,
    outline: { default: null, ":focus-within": `2px solid ${inkHeroColor.found}` },
    outlineOffset: "3px",
  },
  input: {
    position: "relative",
    zIndex: 1,
    flex: 1,
    minWidth: 0,
    height: "100%",
    padding: 0,
    borderStyle: "none",
    backgroundColor: "transparent",
    color: inkHeroColor.ink,
    caretColor: inkHeroColor.ink,
    fontFamily: "inherit",
    fontSize: "16px",
    letterSpacing: "-0.01em",
    outline: "none",
    appearance: "none",
  },
  typed: {
    position: "absolute",
    left: "22px",
    right: "22px",
    top: "50%",
    transform: "translateY(-50%)",
    display: "flex",
    alignItems: "center",
    overflow: "hidden",
    whiteSpace: "pre",
    color: inkHeroColor.ink,
    fontSize: "16px",
    letterSpacing: "-0.01em",
    pointerEvents: "none",
  },
  caret: {
    display: "inline-block",
    flex: "none",
    width: "1.5px",
    height: "20px",
    marginLeft: "1px",
    backgroundColor: inkHeroColor.ink,
    animationName: blink,
    animationDuration: "1.05s",
    animationIterationCount: "infinite",
    animationTimingFunction: "steps(1, end)",
  },
  caretStill: { animationName: "none" },
  footer: {
    position: "absolute",
    left: landing.gutter,
    right: landing.gutter,
    bottom: { default: "clamp(24px, 5vh, 56px)", [media.phone]: "24px" },
    display: "flex",
    flexDirection: { default: "row", [media.phone]: "column" },
    alignItems: { default: "flex-end", [media.phone]: "flex-start" },
    justifyContent: "space-between",
    gap: { default: "32px", [media.phone]: "22px" },
    pointerEvents: "none",
  },
  copy: { display: "flex", flexDirection: "column", gap: "14px" },
  headline: {
    margin: 0,
    maxWidth: "11ch",
    fontSize: { default: "clamp(2.6rem, 5.4vw, 5.4rem)", [media.phone]: "2.6rem" },
    fontWeight: 400,
    lineHeight: 0.95,
    letterSpacing: "-0.055em",
  },
  lede: {
    margin: 0,
    color: inkHeroColor.muted,
    fontSize: { default: "17px", [media.phone]: "16px" },
    letterSpacing: "-0.01em",
  },
  action: {
    display: "flex",
    flexDirection: "column",
    alignItems: { default: "flex-end", [media.phone]: "flex-start" },
    gap: "12px",
    pointerEvents: "auto",
  },
  download: {
    display: "inline-flex",
    alignItems: "center",
    height: "46px",
    paddingInline: "26px",
    borderRadius: "999px",
    backgroundColor: inkHeroColor.ink,
    color: inkHeroColor.buttonInk,
    fontSize: "15px",
    fontWeight: 500,
    letterSpacing: "-0.01em",
    textDecoration: "none",
    transform: { default: null, ":active": "scale(0.98)" },
    transitionProperty: "transform",
    transitionDuration: "0.15s",
    outline: { default: null, ":focus-visible": `2px solid ${inkHeroColor.found}` },
    outlineOffset: "4px",
  },
  fine: {
    margin: 0,
    color: inkHeroColor.faint,
    fontSize: "12px",
    letterSpacing: "0.01em",
  },
});
