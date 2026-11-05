import * as stylex from "@stylexjs/stylex";
import { landingColor } from "@inkling/ui/tokens.stylex";
import { useEffect, useRef, useState } from "react";
import { useMediaQuery } from "../../landing/environment.ts";
import { landing, media } from "../../landing/landing.stylex.ts";
import { type Photo, savedItems } from "./items.ts";
import { play } from "./play.ts";

const faces = [
  ["/media/red-hat-500.ttf", "500"],
  ["/media/red-hat-700.ttf", "700"],
] as const;

function registerRedHat() {
  const known = [...document.fonts].some((face) => face.family.replaceAll('"', "") === "Red Hat");
  if (known) return;
  for (const [url, weight] of faces) {
    const face = new FontFace("Red Hat", `url(${url}) format("truetype")`, {
      weight,
      display: "swap",
    });
    document.fonts.add(face);
    void face.load().catch(() => {});
  }
}

export function Library() {
  const section = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [live, setLive] = useState(false);
  const calm = useMediaQuery("(prefers-reduced-motion: reduce)", true);

  useEffect(() => {
    registerRedHat();
    const element = canvas.current;
    const area = section.current;
    if (!element || !area) return;

    return play(element, area, calm, () => setLive(true));
  }, [calm]);

  const posters = savedItems.filter((item): item is Photo => item.kind === "photo").slice(0, 7);

  return (
    <section ref={section} {...stylex.props(styles.section, calm && styles.calmSection)}>
      <div {...stylex.props(styles.stage)}>
        <div aria-hidden {...stylex.props(styles.poster, live && styles.hidden)}>
          {posters.map((item, index) => (
            <img
              key={item.src}
              src={item.src}
              alt=""
              loading="lazy"
              {...stylex.props(styles.print, placements[index % placements.length])}
            />
          ))}
        </div>
        <canvas
          key={calm ? "still" : "moving"}
          ref={canvas}
          role="img"
          aria-label="Saved photos, a quote, an article and a note drifting in milky water"
          {...stylex.props(styles.canvas, live && styles.shown)}
        />
        <h2 {...stylex.props(styles.headline)}>No folders. Just everything you kept.</h2>
      </div>
    </section>
  );
}

const styles = stylex.create({
  section: {
    position: "relative",
    height: "480svh",
    backgroundColor: landingColor.sheet,
    color: landingColor.sheetInk,
  },
  calmSection: { height: "100svh" },
  stage: {
    position: "sticky",
    top: 0,
    height: "100svh",
    overflow: "hidden",
    isolation: "isolate",
  },
  canvas: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    display: "block",
    opacity: 0,
    transitionProperty: "opacity",
    transitionDuration: "1.6s",
    transitionTimingFunction: landing.ease,
  },
  shown: { opacity: 1 },
  poster: {
    position: "absolute",
    inset: 0,
    transitionProperty: "opacity",
    transitionDuration: "1.2s",
  },
  hidden: { opacity: 0 },
  print: {
    position: "absolute",
    width: "clamp(90px, 13vw, 210px)",
    height: "auto",
    opacity: 0.8,
  },
  headline: {
    position: "absolute",
    zIndex: 1,
    left: landing.gutter,
    bottom: { default: "clamp(28px, 7vh, 88px)", [media.phone]: "40px" },
    margin: 0,
    maxWidth: "9.5ch",
    fontFamily: landing.font,
    fontSize: landing.display,
    fontWeight: 700,
    lineHeight: 0.9,
    letterSpacing: "-0.055em",
    textWrap: "balance",
    pointerEvents: "none",
  },
});

const spots = stylex.create({
  a: { left: "44%", top: "30%", opacity: 1 },
  b: { left: "12%", top: "14%", filter: "blur(6px)", scale: "1.4" },
  c: { left: "70%", top: "10%", filter: "blur(2px)", scale: "0.8" },
  d: { left: "78%", top: "52%", filter: "blur(9px)", scale: "1.7" },
  e: { left: "28%", top: "54%", filter: "blur(3px)", scale: "0.7" },
  f: { left: "58%", top: "64%", filter: "blur(4px)", scale: "0.6" },
  g: { left: "4%", top: "60%", filter: "blur(12px)", scale: "1.9" },
});

const placements = [spots.a, spots.b, spots.c, spots.d, spots.e, spots.f, spots.g];
