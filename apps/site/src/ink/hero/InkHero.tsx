import * as stylex from "@stylexjs/stylex";
import { inkHeroColor } from "@inkling/ui/tokens.stylex";
import { type PointerEvent, type RefObject, useCallback, useEffect, useRef, useState } from "react";
import release from "virtual:latest-release";
import { useMediaQuery } from "../../landing/environment.ts";
import { landing, media } from "../../landing/landing.stylex.ts";
import { usePlatform } from "../../parts/platform.ts";
import { createInk, type Ink } from "./ink.ts";
import { useAutoType } from "./useAutoType.ts";

const plate = "/media/ink/hero/ink.webp";

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

const coarse = "(pointer: coarse)";

// Runs one loop only while the section is on screen and the tab is visible.
function animate(
  canvas: HTMLCanvasElement,
  section: HTMLElement,
  plate: HTMLImageElement,
  inkRef: RefObject<Ink | null>,
  setLive: (live: boolean) => void,
) {
  const state = { frame: 0, visible: true, shown: false, disposed: false };
  let teardown = () => {};
  const start = () => {
    if (state.disposed) return;
    const ink = createInk(canvas, plate, matchMedia(coarse).matches);
    if (!ink) return;
    inkRef.current = ink;
    const measure = () => {
      const box = section.getBoundingClientRect();
      const art = plate.getBoundingClientRect();
      const ratio = matchMedia(coarse).matches ? 1 : Math.min(window.devicePixelRatio || 1, 1.5);
      ink.resize(box.width, box.height, ratio, {
        left: art.left - box.left,
        top: art.top - box.top,
        width: art.width,
        height: art.height,
      });
    };
    measure();
    const loop = (now: number) => {
      ink.frame(now / 1000);
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
    const resize = new ResizeObserver(measure);
    resize.observe(section);
    const lost = (event: Event) => {
      event.preventDefault();
      state.visible = false;
      cancelAnimationFrame(state.frame);
      setLive(false);
    };
    canvas.addEventListener("webglcontextlost", lost);
    document.addEventListener("visibilitychange", update);
    update();
    teardown = () => {
      cancelAnimationFrame(state.frame);
      intersection.disconnect();
      resize.disconnect();
      canvas.removeEventListener("webglcontextlost", lost);
      document.removeEventListener("visibilitychange", update);
      ink.dispose();
      inkRef.current = null;
    };
  };
  plate.decode().then(start, () => {});
  return () => {
    state.disposed = true;
    teardown();
    setLive(false);
  };
}

export function InkHero() {
  const calm = useMediaQuery("(prefers-reduced-motion: reduce)", true);
  const sectionRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const plateRef = useRef<HTMLImageElement>(null);
  const pillRef = useRef<HTMLFormElement>(null);
  const inkRef = useRef<Ink | null>(null);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const [live, setLive] = useState(false);
  const [focused, setFocused] = useState(false);
  const [query, setQuery] = useState("");
  const downloadHref = useDownloadHref();

  useEffect(registerRedHat, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const section = sectionRef.current;
    const plate = plateRef.current;
    if (calm || !canvas || !section || !plate) return;
    return animate(canvas, section, plate, inkRef, setLive);
  }, [calm]);

  // A keystroke nudges the ink just above the pill, roughly where the caret is.
  const stirFromKey = useCallback((progress: number) => {
    const ink = inkRef.current;
    const section = sectionRef.current;
    const pill = pillRef.current;
    if (!ink || !section || !pill) return;
    const box = section.getBoundingClientRect();
    const rect = pill.getBoundingClientRect();
    const caret = rect.left + rect.width * (0.1 + 0.8 * Math.min(1, progress));
    const x = (caret - box.left) / box.width + (Math.random() - 0.5) * 0.04;
    const y = 1 - (rect.top - box.top) / box.height + 0.03 + Math.random() * 0.05;
    const angle = (Math.random() - 0.5) * 1.6;
    const force = 0.0018 + Math.random() * 0.002;
    ink.stir(x, y, Math.sin(angle) * force, Math.cos(angle) * force, 0.004);
  }, []);

  const typed = useAutoType(!calm && live && !focused && query === "", stirFromKey);

  const stirFromPointer = (event: PointerEvent<HTMLElement>) => {
    const ink = inkRef.current;
    const section = sectionRef.current;
    if (!ink || !section) return;
    const box = section.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width;
    const y = 1 - (event.clientY - box.top) / box.height;
    const previous = pointerRef.current;
    if (previous && Math.hypot((x - previous.x) * box.width, (y - previous.y) * box.height) < 24)
      return;
    pointerRef.current = { x, y };
    if (!previous) return;
    const aspect = box.width / box.height;
    const dx = (x - previous.x) * aspect * 0.35;
    const dy = (y - previous.y) * 0.35;
    const clamp = Math.min(1, 0.03 / Math.max(1e-4, Math.hypot(dx, dy)));
    ink.stir(x, y, dx * clamp, dy * clamp, 0.006);
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
      <img
        ref={plateRef}
        src={plate}
        alt=""
        aria-hidden="true"
        decoding="async"
        {...stylex.props(styles.plate)}
      />
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        {...stylex.props(styles.canvas, live && styles.canvasLive)}
      />

      <a href="/" {...stylex.props(styles.wordmark)}>
        inkling
      </a>
      <nav aria-label="inkling" {...stylex.props(styles.nav)}>
        <a href="/features" {...stylex.props(styles.navLink)}>
          features
        </a>
        <a href={downloadHref} {...stylex.props(styles.navLink)}>
          download
        </a>
      </nav>

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
          <a href={downloadHref} {...stylex.props(styles.navLink, styles.phoneOnly)}>
            download
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

// The plate is the moodboard ink cut to 664x639 frame pixels, with the pill's centre at
// (314.5, 626). Both scale from the pill's height in the section so they stay registered.
// The live ink reads the plate only as its guide; the plate itself shows only as the still
// for reduced motion or when WebGL2 is missing.
const styles = stylex.create({
  section: {
    position: "relative",
    isolation: "isolate",
    overflow: "hidden",
    containerType: "size",
    boxSizing: "border-box",
    width: "100%",
    height: "100svh",
    minHeight: "560px",
    backgroundColor: inkHeroColor.water,
    color: inkHeroColor.ink,
    fontFamily: landing.font,
    touchAction: "pan-y",
  },
  plate: {
    position: "absolute",
    zIndex: -2,
    top: 0,
    left: { default: "calc(50% - 36.17cqh)", [media.phone]: "calc(50% - 28.13cqh)" },
    width: { default: "76.37cqh", [media.phone]: "59.40cqh" },
    height: "auto",
    aspectRatio: "664 / 639",
    display: "block",
    pointerEvents: "none",
    userSelect: "none",
  },
  canvas: {
    position: "absolute",
    inset: 0,
    zIndex: -1,
    width: "100%",
    height: "100%",
    display: "block",
    opacity: 0,
    transitionProperty: "opacity",
    transitionDuration: "0.6s",
    transitionTimingFunction: landing.ease,
  },
  canvasLive: { opacity: 1 },
  wordmark: {
    position: "absolute",
    top: { default: "clamp(24px, 4.4cqh, 40px)", [media.phone]: "20px" },
    left: landing.gutter,
    color: inkHeroColor.ink,
    fontSize: { default: "clamp(22px, 2.2vw, 32px)", [media.phone]: "22px" },
    fontWeight: 400,
    letterSpacing: "-0.02em",
    lineHeight: 1,
    textDecoration: "none",
    outline: { default: null, ":focus-visible": `2px solid ${inkHeroColor.found}` },
    outlineOffset: "4px",
  },
  nav: {
    position: "absolute",
    display: { default: "flex", [media.phone]: "none" },
    top: { default: "clamp(28px, 4.8cqh, 44px)", [media.phone]: "22px" },
    right: landing.gutter,
    gap: "28px",
  },
  navLink: {
    color: inkHeroColor.ink,
    fontSize: "15px",
    letterSpacing: "-0.005em",
    lineHeight: 1,
    textDecoration: "none",
    opacity: { default: 1, ":hover": 0.6 },
    transitionProperty: "opacity",
    transitionDuration: "0.2s",
    outline: { default: null, ":focus-visible": `2px solid ${inkHeroColor.found}` },
    outlineOffset: "4px",
  },
  phoneOnly: { display: { default: "none", [media.phone]: "inline" } },
  pill: {
    position: "absolute",
    left: "50%",
    top: { default: "72%", [media.phone]: "56%" },
    transform: "translate(-50%, -50%)",
    boxSizing: "border-box",
    display: "flex",
    alignItems: "center",
    width: {
      default: "min(max(320px, 46.13cqh), calc(100% - 40px))",
      [media.phone]: "calc(100% - 48px)",
    },
    height: { default: "clamp(48px, 6.67cqh, 62px)", [media.phone]: "52px" },
    margin: 0,
    paddingInline: "24px",
    borderRadius: "999px",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: inkHeroColor.glassEdge,
    backgroundColor: inkHeroColor.glass,
    backdropFilter: "blur(14px) saturate(120%)",
    WebkitBackdropFilter: "blur(14px) saturate(120%)",
    boxShadow: `0 26px 40px -18px ${inkHeroColor.glassShadow}, 0 0 0 1px ${inkHeroColor.glassRim}, inset 0 1px 0 ${inkHeroColor.glassEdge}`,
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
    left: "24px",
    right: "24px",
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
    height: "22px",
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
    bottom: { default: "clamp(24px, 4.4cqh, 44px)", [media.phone]: "24px" },
    display: "flex",
    flexDirection: { default: "row", [media.phone]: "column" },
    alignItems: { default: "flex-end", [media.phone]: "flex-start" },
    justifyContent: "space-between",
    gap: { default: "32px", [media.phone]: "14px" },
    pointerEvents: "none",
  },
  copy: { display: "flex", flexDirection: "column", gap: "8px" },
  headline: {
    margin: 0,
    fontSize: { default: "clamp(1.6rem, 2.3vw, 2.25rem)", [media.phone]: "1.75rem" },
    fontWeight: 400,
    lineHeight: 1.05,
    letterSpacing: "-0.04em",
  },
  lede: {
    margin: 0,
    color: inkHeroColor.muted,
    fontSize: "15px",
    letterSpacing: "-0.01em",
  },
  action: {
    display: "flex",
    flexDirection: "column",
    alignItems: { default: "flex-end", [media.phone]: "flex-start" },
    gap: "16px",
    pointerEvents: "auto",
  },
  fine: {
    margin: 0,
    color: inkHeroColor.faint,
    fontSize: "12px",
    letterSpacing: "0.01em",
  },
});
