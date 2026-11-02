import * as React from "react";
import { motion, useScroll, useSpring, useMotionValueEvent } from "motion/react";
import { useHydrated } from "./environment";
import { inklingBody } from "./identity";
import { MascotHint, MotionContext, useCalm } from "./ui";
import { Story } from "./Story";
import { Header, Download, Finale } from "./Chrome";
import { DemoLibrary } from "./DemoLibrary";
const ease = [0.16, 1, 0.3, 1];
const reveal = (delay = 0) => ({
  initial: { y: 24 },
  animate: { y: 0 },
  transition: { duration: 0.85, delay, ease },
});
const clamp = (n) => Math.min(1, Math.max(0, n));
const screen = {
  src: "/media/library.png",
  alt: "Inkling’s real desktop library, with saved images, notes and screenshots in a visual grid",
};
function aperturePose(value) {
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
function Aperture() {
  const area = React.useRef(null),
    frame = React.useRef(null),
    path = React.useRef(null),
    livePath = React.useRef(null),
    eyes = React.useRef(null);
  const reduced = useCalm();
  const { scrollYProgress } = useScroll({ target: area, offset: ["start 55%", "end 100%"] });
  const progress = useSpring(scrollYProgress, { stiffness: 130, damping: 28, mass: 0.4 });
  const ready = useHydrated();
  const subscribeLive = React.useCallback((notify) => progress.on("change", notify), [progress]);
  const liveSnapshot = React.useCallback(
    () => reduced || progress.get() >= 0.53,
    [progress, reduced],
  );
  const live = React.useSyncExternalStore(subscribeLive, liveSnapshot, () => true);
  const paint = React.useCallback(
    (value) => {
      const pose = aperturePose(reduced ? 1 : value);
      const small = frame.current?.clientWidth < 640,
        initialHold = reduced ? 0 : 1 - clamp(value / 0.53);
      if (small) {
        pose.scale += 2.3 * initialHold * initialHold;
        pose.y += Math.max(0, pose.scale * 105 + 30 - pose.y) * initialHold * initialHold;
      }
      path.current?.setAttribute(
        "transform",
        `translate(960 ${pose.y}) rotate(${pose.rotate}) scale(${pose.scale})`,
      );
      const w = frame.current?.clientWidth || 1920,
        h = frame.current?.clientHeight || 1080,
        unit = Math.min(w / 1920, h / 1080);
      // Keep the initial silhouette isotropic, then grow it to cover this viewport's
      // aspect ratio before interaction starts (the phone is taller than the artboard).
      const growth = clamp(((reduced ? 1 : value) - 0.18) / 0.35),
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
      if (area.current) area.current.dataset.progress = value.toFixed(3);
    },
    [reduced],
  );
  useMotionValueEvent(progress, "change", paint);
  React.useLayoutEffect(() => {
    paint(progress.get());
    const observer = new ResizeObserver(() => paint(progress.get()));
    if (frame.current) observer.observe(frame.current);
    return () => observer.disconnect();
  }, [paint, progress]);
  return (
    <section
      ref={area}
      id="library"
      className={`aperture-story ${ready ? "aperture-ready" : ""}`}
      aria-labelledby="library-heading"
    >
      <div className="aperture-sticky">
        <div ref={frame} className="aperture-frame" data-live={live}>
          <svg
            className="aperture-canvas"
            viewBox="0 0 1920 1080"
            preserveAspectRatio="xMidYMin meet"
            role="img"
            aria-label={screen.alt}
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
            <image href={screen.src} width="1920" height="1080" clipPath="url(#inkling-window)" />
            <motion.use
              href="#inkling-shape"
              fill="var(--ink)"
              initial={false}
              animate={{ opacity: live ? 0 : 0.055 }}
              transition={{ duration: reduced ? 0 : 0.25 }}
            />
            <g ref={eyes} className="aperture-eyes" style={{ opacity: 0 }}>
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
          <DemoLibrary active={live} />
        </div>
        <div className="library-caption">
          <h2 id="library-heading">
            A little home for
            <br />
            everything worth keeping.
          </h2>
          <p>
            Photos, screenshots, notes and more.
            <br />
            Saved on your computer. Found in your own words.
          </p>
        </div>
        <div className="stage-bottom">
          <p>Search titles, tags and notes. Try “dog”.</p>
        </div>
        <div className="library-buddies">
          <MascotHint
            className="library-peek-left"
            expression="idle"
            label="Inkling tip: find it in your own words"
            tip="Remember a colour, a subject, or a few words? Describe it to find what you saved."
          />
          <MascotHint
            className="library-peek-right"
            side="right"
            expression="notify"
            label="Inkling tip: everything together"
            tip="Images, notes, articles and videos can all live in the same visual library. No perfect filing system required."
          />
        </div>
      </div>
      <noscript>
        <p className="no-script">
          <a href="/media/library.png">Open the Inkling library screenshot</a>
        </p>
      </noscript>
    </section>
  );
}
export function App() {
  const [calm, setCalm] = React.useState(false);
  return (
    <MotionContext.Provider value={calm}>
      <Site calm={calm} setCalm={setCalm} />
    </MotionContext.Provider>
  );
}
function Site({ calm, setCalm }) {
  const reduced = useCalm();
  return (
    <div id="top" data-theme="dark">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <Header />
      <main id="main">
        <section className="hero frame" aria-labelledby="hero-heading">
          <motion.h1 id="hero-heading" {...(reduced ? {} : reveal())}>
            <span>finally, you can</span>{" "}
            <span>
              just <strong>find it</strong>
            </span>
          </motion.h1>
          <motion.div className="hero-lower" {...(reduced ? {} : reveal(0.09))}>
            <div className="hero-center">
              <p>
                A quiet little home for your photos and screenshots.
                <br className="desktop-break" /> Find them later by describing what you remember.
              </p>
              <div className="hero-actions">
                <Download />
                <a className="text-link" href="#library">
                  See what’s inside
                </a>
              </div>
            </div>
          </motion.div>
          <MascotHint
            className="hero-peek-left"
            expression="wink"
            label="Inkling tip: save the good stuff"
            tip="Photos, screenshots, notes, links. Keep the things you want to come back to."
          />
          <MascotHint
            className="hero-peek-right"
            side="right"
            expression="wide"
            label="Inkling tip: your library stays yours"
            tip="Your library lives on your own computer. No cloud library. No account needed."
          />
        </section>
        <Aperture />
        <Story />
      </main>
      <Finale calm={calm} setCalm={setCalm} />
    </div>
  );
}
