import * as stylex from "@stylexjs/stylex";
import { landingColor } from "@inkling/ui/tokens.stylex";
import { useMotionValueEvent, useScroll, useSpring } from "motion/react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { base } from "./base.ts";
import { DemoLibrary } from "./DemoLibrary.tsx";
import { useCalm, useHydrated } from "./environment.ts";
import { inklingBody } from "./identity.ts";
import { landing, media } from "./landing.stylex.ts";
import { MascotHint } from "./MascotHint.tsx";

const clamp = (n: number) => Math.min(1, Math.max(0, n));
const spring = { stiffness: 130, damping: 28, mass: 0.4 };
const demoFocused = (frame: HTMLElement | null) =>
  document.activeElement === frame?.querySelector("iframe");

function aperturePose(value: number) {
  const p = clamp(value / 0.62);
  const scale = 5.1 + 14.9 * p * p;
  // The full organic upper contour fits before the mask opens past the frame.
  return {
    scale,
    rotate: -8 * (1 - p),
    y: Math.min(540, scale * 112 + 24),
    eyes: 1 - clamp((p - 0.14) / 0.2),
  };
}

export function Aperture() {
  const area = useRef<HTMLElement>(null),
    frame = useRef<HTMLDivElement>(null),
    path = useRef<SVGPathElement>(null),
    livePath = useRef<SVGPathElement>(null),
    eyes = useRef<SVGGElement>(null);
  const reduced = useCalm();
  const ready = useHydrated();
  const [demoLoaded, setDemoLoaded] = useState(false);
  const { scrollYProgress } = useScroll({ target: area, offset: ["start 55%", "end 100%"] });
  const progress = useSpring(scrollYProgress, spring);
  const focusFloor = useSpring(0, spring);
  const focusTarget = useRef(0);
  const subscribeLive = useCallback(
    (notify: () => void) => {
      const stopProgress = progress.on("change", notify);
      const stopFocus = focusFloor.on("change", notify);
      return () => {
        stopProgress();
        stopFocus();
      };
    },
    [progress, focusFloor],
  );
  const live = useSyncExternalStore(
    subscribeLive,
    () =>
      reduced || progress.get() >= 0.53 || (progress.get() > 0.12 && demoFocused(frame.current)),
    () => false,
  );
  const paint = useCallback(
    (value: number) => {
      const floor = demoFocused(frame.current) && value > 0.12 ? 0.62 : 0;
      if (reduced) {
        focusTarget.current = floor;
        if (focusFloor.get() !== floor) focusFloor.jump(floor);
      } else if (focusTarget.current !== floor) {
        focusTarget.current = floor;
        // Start at the visible scroll pose; the hidden floor need not catch up from zero.
        if (floor > 0 && focusFloor.get() < value) focusFloor.jump(value);
        focusFloor.set(floor);
      }
      // Focus keeps the usable mask open through the same spring, never a geometry snap.
      const shown = reduced ? 1 : Math.max(value, focusFloor.get());
      const pose = aperturePose(shown);
      const w = frame.current?.clientWidth || 1920,
        h = frame.current?.clientHeight || 1080,
        unit = Math.min(w / 1920, h / 1080),
        initialHold = reduced ? 0 : 1 - clamp(shown / 0.53);
      if (w < 640) {
        pose.scale += 2.3 * initialHold * initialHold;
        pose.y += Math.max(0, pose.scale * 105 + 30 - pose.y) * initialHold * initialHold;
      }
      path.current?.setAttribute(
        "transform",
        `translate(960 ${pose.y}) rotate(${pose.rotate}) scale(${pose.scale})`,
      );
      // Keep the initial silhouette isotropic, then grow it to cover this viewport's
      // aspect ratio before interaction starts (the phone is taller than the artboard).
      const growth = clamp((shown - 0.18) / 0.35),
        blend = growth * growth * (3 - 2 * growth);
      const coveringScale = pose.scale * (1 + (Math.max(w / 1920, h / 1080) / unit - 1) * blend);
      livePath.current?.setAttribute(
        "transform",
        `translate(.5 ${(pose.y * unit) / h}) scale(${(coveringScale * unit) / w} ${(coveringScale * unit) / h}) rotate(${pose.rotate})`,
      );
      if (eyes.current) {
        eyes.current.style.opacity = reduced ? "0" : String(pose.eyes);
        eyes.current.setAttribute("transform", `translate(0 ${pose.y - 540})`);
      }
    },
    [reduced, focusFloor],
  );
  useMotionValueEvent(progress, "change", paint);
  useMotionValueEvent(focusFloor, "change", () => paint(progress.get()));
  useEffect(() => {
    let handle = 0;
    const syncFocus = () => {
      cancelAnimationFrame(handle);
      handle = requestAnimationFrame(() => paint(progress.get()));
    };
    window.addEventListener("blur", syncFocus);
    window.addEventListener("focus", syncFocus);
    document.addEventListener("focusin", syncFocus);
    return () => {
      cancelAnimationFrame(handle);
      window.removeEventListener("blur", syncFocus);
      window.removeEventListener("focus", syncFocus);
      document.removeEventListener("focusin", syncFocus);
    };
  }, [paint, progress]);
  useLayoutEffect(() => {
    paint(progress.get());
    const observer = new ResizeObserver(() => paint(progress.get()));
    if (frame.current) observer.observe(frame.current);
    return () => observer.disconnect();
  }, [paint, progress]);
  const onDemoLoad = useCallback(() => setDemoLoaded(true), []);
  return (
    <section
      ref={area}
      id="library"
      aria-labelledby="library-heading"
      {...stylex.props(styles.area, ready && styles.scrollable)}
    >
      <div {...stylex.props(styles.sticky, ready && styles.pinned)}>
        <div ref={frame} {...stylex.props(styles.frame)}>
          <svg
            viewBox="0 0 1920 1080"
            preserveAspectRatio="xMidYMin meet"
            role="img"
            aria-label="Inkling’s real desktop library, with saved images, notes and screenshots in a visual grid"
            {...stylex.props(styles.canvas)}
          >
            <defs>
              <clipPath id="inkling-window" clipPathUnits="userSpaceOnUse">
                <path
                  id="inkling-shape"
                  ref={path}
                  d={inklingBody}
                  transform="translate(960 540) scale(13)"
                />
              </clipPath>
              <clipPath id="inkling-live-window" clipPathUnits="objectBoundingBox">
                <path
                  ref={livePath}
                  d={inklingBody}
                  transform="translate(.5 .5) scale(.00677 .01204)"
                />
              </clipPath>
            </defs>
            <image
              href="/media/library.png"
              width="1920"
              height="1080"
              clipPath="url(#inkling-window)"
              {...stylex.props(demoLoaded && styles.covered)}
            />
            <use
              href="#inkling-shape"
              {...stylex.props(styles.shade, live && styles.shadeGone, reduced && styles.still)}
            />
            <g ref={eyes} {...stylex.props(styles.eyes)}>
              <rect
                x="968"
                y="342"
                width="43"
                height="102"
                rx="21.5"
                transform="rotate(-26 990 394)"
              />
              <rect
                x="1090"
                y="324"
                width="35"
                height="88"
                rx="17.5"
                transform="rotate(-26 1108 368)"
              />
            </g>
          </svg>
          <DemoLibrary active={live} calm={reduced} loaded={demoLoaded} onLoad={onDemoLoad} />
        </div>
        <div {...stylex.props(styles.caption)}>
          <h2 id="library-heading" {...stylex.props(base.heading, styles.captionTitle)}>
            A little home for
            <br />
            everything worth keeping.
          </h2>
          <p {...stylex.props(base.flush, styles.captionText)}>
            Photos, screenshots, notes and more.
            <br />
            Saved on your computer. Found in your own words.
          </p>
        </div>
        <div {...stylex.props(styles.hint)}>
          <p {...stylex.props(base.flush, styles.hintText)}>
            Search titles, tags and notes. Try “dog”.
          </p>
        </div>
        <div {...stylex.props(styles.buddies)}>
          <MascotHint
            character={2}
            label="Inkling tip: find it in your own words"
            tip="Remember a colour, a subject, or a few words? Describe it to find what you saved."
            pinned
            style={styles.buddy}
          />
          <MascotHint
            character={3}
            side="right"
            label="Inkling tip: everything together"
            tip="Images, notes, articles and videos can all live in the same visual library. No perfect filing system required."
            pinned
            style={styles.buddy}
          />
        </div>
      </div>
      <noscript>
        <p {...stylex.props(base.flush, styles.noScript)}>
          <a href="/media/library.png" {...stylex.props(base.link, base.focus)}>
            Open the Inkling library screenshot
          </a>
        </p>
      </noscript>
    </section>
  );
}

const styles = stylex.create({
  area: {
    boxSizing: "border-box",
    position: "relative",
    paddingTop: { default: "24px", [media.phone]: "12px" },
  },
  // The scroll runway exists only once the script can drive the mask open.
  scrollable: {
    height: {
      default: "calc(185svh + 100px)",
      [media.phoneInMotion]: "calc(165svh + 150px)",
      [media.reduced]: "auto",
    },
    minHeight: { default: null, [media.phone]: "115svh" },
    paddingBottom: { default: null, [media.reducedAbovePhone]: "60px" },
  },
  sticky: {
    boxSizing: "border-box",
    position: "relative",
    display: { default: "grid", [media.phone]: "block" },
    gridTemplateColumns: "minmax(0, 1fr) 240px",
    columnGap: "24px",
    maxWidth: "1760px",
    margin: "auto",
    paddingBlock: 0,
    paddingInline: { default: landing.gutter, [media.phone]: "12px" },
  },
  pinned: {
    position: { default: "sticky", [media.reduced]: "relative" },
    top: { default: "24px", [media.phoneInMotion]: "18px", [media.reduced]: 0 },
  },
  frame: {
    position: "relative",
    isolation: "isolate",
    gridColumn: "1 / -1",
    width: "100%",
    height: { default: "min(73svh, 820px)", [media.tablet]: "67svh", [media.phone]: "500px" },
    minHeight: { default: "440px", [media.tablet]: "400px", [media.phone]: 0 },
    overflow: "hidden",
    borderRadius: "24px",
  },
  canvas: {
    position: "absolute",
    inset: 0,
    zIndex: 2,
    display: "block",
    width: "100%",
    height: "100%",
    overflow: "visible",
    pointerEvents: "none",
  },
  covered: { visibility: "hidden" },
  shade: {
    fill: landingColor.ink,
    opacity: 0.055,
    transitionProperty: "opacity",
    transitionDuration: "0.25s",
  },
  shadeGone: { opacity: 0 },
  still: { transitionDuration: "0s" },
  eyes: { fill: landingColor.ink, opacity: 0, display: { default: null, [media.reduced]: "none" } },
  caption: {
    position: "relative",
    zIndex: 2,
    gridColumn: "1 / -1",
    display: { default: "flex", [media.phone]: "block" },
    justifyContent: "space-between",
    alignItems: "end",
    gap: "32px",
    marginBottom: { default: "24px", [media.phone]: "16px" },
    paddingTop: "24px",
    paddingInline: { default: null, [media.phone]: "8px" },
  },
  captionTitle: {
    maxWidth: { default: null, [media.phone]: "18ch" },
    fontSize: { default: "clamp(1.625rem, 2.4vw, 2.25rem)", [media.phone]: "1.875rem" },
    lineHeight: 1.08,
    letterSpacing: "-0.035em",
  },
  captionText: {
    maxWidth: { default: null, [media.phone]: "33ch" },
    marginTop: { default: null, [media.phone]: "16px" },
    fontSize: "1rem",
    lineHeight: 1.5,
    textAlign: { default: "right", [media.phone]: "left" },
  },
  hint: {
    position: "relative",
    zIndex: 2,
    gridColumn: "1",
    gridRow: "3",
    alignSelf: "center",
    display: { default: "flex", [media.phone]: "block" },
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: { default: "24px", [media.phone]: "12px" },
    marginTop: { default: "24px", [media.phone]: "14px" },
    paddingInline: { default: null, [media.phone]: "8px" },
  },
  hintText: {
    color: landingColor.muted,
    fontSize: { default: "1rem", [media.phone]: "0.9375rem" },
    lineHeight: 1.35,
  },
  buddies: {
    gridColumn: "2",
    gridRow: "3",
    display: "flex",
    alignItems: "center",
    justifyContent: "end",
    gap: "8px",
    height: { default: "100px", [media.phone]: "85px" },
  },
  buddy: {
    position: "relative",
    width: { default: "100px", [media.phone]: "80px" },
    height: { default: "100px", [media.phone]: "80px" },
  },
  noScript: { padding: "24px", textAlign: "center" },
});
