import { Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import * as stylex from "@stylexjs/stylex";
import { color, font, plainsColor, radius } from "@inkling/ui/tokens.stylex";
import { useEffect, useRef } from "react";
import { latestRelease } from "../layout/links.ts";
import { useMediaQuery } from "../landing/environment.ts";
import { LibraryScreen } from "./LibraryScreen.tsx";
import { media, nothing } from "./media.ts";
import { app, laptop, photo, screenPolygon } from "./scene.ts";

const desk = "(min-width: 768px)";
const phone = "(max-width: 767px)";
const headline = "For the things you want to come back to.";
const line = ["Describe it.", "inkling finds it."];

function registerNewsreader() {
  if ([...document.fonts].some((face) => face.family.replaceAll('"', "") === "Newsreader")) return;
  const face = new FontFace("Newsreader", `url(${media.newsreader}) format("woff2")`, {
    weight: "400",
    display: "swap",
  });
  document.fonts.add(face);
  void face.load().catch(() => {});
}

/** A picture that only downloads where `when` matches. */
function Picture({
  sources,
  when,
  sizes,
  style,
}: {
  sources: { avif: string; webp: string };
  when: string;
  sizes: string;
  style: stylex.StyleXStyles;
}) {
  return (
    <picture>
      <source media={when} type="image/avif" srcSet={sources.avif} sizes={sizes} />
      <source media={when} type="image/webp" srcSet={sources.webp} sizes={sizes} />
      <img src={nothing} alt="" decoding="async" {...stylex.props(style)} />
    </picture>
  );
}

function HeroSearch() {
  return (
    <div {...stylex.props(styles.heroSearch)}>
      <HugeiconsIcon icon={Search01Icon} size={17} />
      <span>Search by describing it</span>
    </div>
  );
}

function Copy({ style }: { style: stylex.StyleXStyles }) {
  return (
    <p data-plains-copy {...stylex.props(styles.copy, style)}>
      {line[0]}
      <br />
      {line[1]}
    </p>
  );
}

const wide = (100 * photo.width) / photo.height;
const percent = (part: number, whole: number) => `${(100 * part) / whole}%`;
// Covers the viewport, centred, at the photo's proportions; camera() assumes the same.
const stageBox = () =>
  styles.cover(
    `calc(50vw - max(100vw, ${wide}vh) / 2)`,
    `calc(50vh - max(${(100 * photo.height) / photo.width}vw, 100vh) / 2)`,
    `max(100vw, ${wide}vh)`,
    `${photo.width} / ${photo.height}`,
  );
const laptopBox = () =>
  styles.place(
    percent(laptop.x, photo.width),
    percent(laptop.y, photo.height),
    percent(laptop.width, photo.width),
    percent(laptop.height, photo.height),
  );
const appSize = () => styles.size(`${app.width}px`, `${app.height}px`);
// endFrame() in scene.ts: the app is 70% wide unless the height runs out first.
const gutter = `calc((100vw - min(70vw, (100vh - 144px) * ${app.width / app.height})) / 2)`;

function Desk() {
  return (
    <section data-plains-desk {...stylex.props(styles.desk)}>
      <div data-plains-pin {...stylex.props(styles.pin)}>
        <div data-plains-back {...stylex.props(styles.stage, stageBox())}>
          <Picture
            sources={media.meadow}
            when={desk}
            sizes="max(100vw, 179vh)"
            style={styles.fill}
          />
          <svg
            data-plains-fill
            viewBox={`0 0 ${photo.width} ${photo.height}`}
            aria-hidden
            {...stylex.props(styles.fill)}
          >
            <polygon points={screenPolygon} {...stylex.props(styles.screenFill)} />
          </svg>
          <img
            data-plains-blur
            src={media.blurred}
            alt=""
            {...stylex.props(styles.fill, styles.blur)}
          />
        </div>
        <div data-plains-app {...stylex.props(styles.app, appSize())}>
          <LibraryScreen layout="desktop" />
        </div>
        <div data-plains-front {...stylex.props(styles.stage, stageBox(), styles.front)}>
          <div data-plains-laptop {...stylex.props(styles.laptop, laptopBox())}>
            <Picture sources={media.laptop} when={desk} sizes="40vw" style={styles.fill} />
          </div>
          <div data-plains-drift {...stylex.props(styles.fill, styles.driftLayer)}>
            <div {...stylex.props(styles.cloud, styles.cloudA)} />
            <div {...stylex.props(styles.cloud, styles.cloudB)} />
          </div>
        </div>
        <div data-plains-hero {...stylex.props(styles.hero)}>
          <h1 {...stylex.props(styles.headline)}>{headline}</h1>
          <HeroSearch />
        </div>
        <Copy style={[styles.deskCopy, styles.gutter(gutter)]} />
      </div>
    </section>
  );
}

function Phone() {
  return (
    <section data-plains-phone {...stylex.props(styles.phone)}>
      <div data-plains-pin {...stylex.props(styles.pin, styles.phonePin)}>
        <Picture sources={media.tall} when={phone} sizes="100vw" style={styles.fill} />
        <div data-plains-hero {...stylex.props(styles.phoneHero)}>
          <h1 {...stylex.props(styles.headline, styles.phoneHeadline)}>{headline}</h1>
        </div>
        <Copy style={styles.phoneCopy} />
        <div data-plains-device {...stylex.props(styles.device)}>
          <div {...stylex.props(styles.deviceScreen)}>
            <LibraryScreen layout="phone" />
          </div>
          <span {...stylex.props(styles.island)} />
        </div>
      </div>
    </section>
  );
}

/** The scroll's finished frame, shown still below the first under reduced motion on a desk. */
function Still() {
  return (
    <section data-plains-still {...stylex.props(styles.still)}>
      <img src={media.blurred} alt="" {...stylex.props(styles.fill, styles.cropped)} />
      <Copy style={styles.stillCopy} />
      <div {...stylex.props(styles.stillDesk, styles.ratio(`${app.width} / ${app.height}`))}>
        <div data-plains-flat {...stylex.props(styles.flat, appSize())}>
          <LibraryScreen layout="desktop" />
        </div>
      </div>
    </section>
  );
}

// The scroll code and GSAP load after the first paint, which the prerendered page already shows.
function start(element: HTMLElement, calm: boolean) {
  let stop = () => {};
  let gone = false;
  void import("./dive.ts").then(({ dive }) => {
    if (!gone) stop = dive(element, calm);
  });
  return () => {
    gone = true;
    stop();
  };
}

export function Plains() {
  const root = useRef<HTMLDivElement>(null);
  const calm = useMediaQuery("(prefers-reduced-motion: reduce)", true);

  useEffect(registerNewsreader, []);
  useEffect(() => {
    const element = root.current;
    return element ? start(element, calm) : undefined;
  }, [calm]);

  return (
    <div ref={root} {...stylex.props(styles.page)}>
      <header {...stylex.props(styles.header)}>
        <a href="/" aria-label="inkling home" {...stylex.props(styles.brand)}>
          <img src={media.mark} alt="" {...stylex.props(styles.mark)} />
          <span {...stylex.props(styles.wordmark)}>inkling</span>
        </a>
        <a href={latestRelease} {...stylex.props(styles.download)}>
          Download
        </a>
      </header>
      <Desk />
      <Phone />
      <Still />
      <div {...stylex.props(styles.after)}>
        <img src={media.blurred} alt="" {...stylex.props(styles.fill, styles.cropped)} />
      </div>
    </div>
  );
}

const drift = stylex.keyframes({
  from: { transform: "translate3d(-6%, -2%, 0) rotate(-3deg)" },
  to: { transform: "translate3d(7%, 3%, 0) rotate(2deg)" },
});

const sway = stylex.keyframes({
  from: { transform: "translate3d(4%, 1%, 0) scale(1)" },
  to: { transform: "translate3d(-5%, -2%, 0) scale(1.08)" },
});

const reduced = "@media (prefers-reduced-motion: reduce)";
const onPhone = "@media (max-width: 767px)";
const calmDesk = "@media (min-width: 768px) and (prefers-reduced-motion: reduce)";
const serif = '"Newsreader", "Libre Baskerville", Georgia, serif';

const styles = stylex.create({
  page: {
    position: "relative",
    overflowX: "clip",
    backgroundColor: plainsColor.sky,
    color: plainsColor.onPhoto,
    fontFamily: font.body,
  },
  header: {
    position: "fixed",
    zIndex: 10,
    top: 0,
    left: 0,
    right: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBlock: "22px",
    paddingInline: { default: "32px", [onPhone]: "18px" },
    pointerEvents: "none",
  },
  brand: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    color: plainsColor.onPhoto,
    textDecoration: "none",
    pointerEvents: "auto",
  },
  mark: { width: "28px", height: "28px" },
  wordmark: {
    fontFamily: font.quote,
    fontSize: "21px",
    letterSpacing: "-0.04em",
    lineHeight: 1,
    marginLeft: "-3px",
    textShadow: `0 1px 2px ${plainsColor.photoShadow}, 0 1px 14px ${plainsColor.photoShadow}`,
  },
  download: {
    display: "inline-flex",
    alignItems: "center",
    height: "38px",
    paddingInline: "18px",
    borderRadius: radius.round,
    backgroundColor: plainsColor.pill,
    color: plainsColor.pillInk,
    fontSize: "14px",
    fontWeight: 600,
    textDecoration: "none",
    pointerEvents: "auto",
    boxShadow: `0 6px 24px ${plainsColor.photoShadow}`,
  },
  desk: { display: { default: "block", [onPhone]: "none" } },
  phone: { display: { default: "none", [onPhone]: "block" } },
  pin: { position: "relative", height: "100vh", overflow: "hidden" },
  phonePin: { height: "100svh" },
  stage: {
    position: "absolute",
    zIndex: 1,
    transformOrigin: "0 0",
    willChange: "transform",
  },
  front: { zIndex: 3, pointerEvents: "none" },
  fill: {
    position: "absolute",
    inset: 0,
    display: "block",
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  cropped: { objectFit: "cover" },
  screenFill: { fill: color.window },
  blur: { opacity: 0, willChange: "opacity" },
  laptop: { position: "absolute", willChange: "opacity" },
  place: (left: string, top: string, width: string, height: string) => ({
    left,
    top,
    width,
    height,
  }),
  cover: (left: string, top: string, width: string, aspectRatio: string) => ({
    left,
    top,
    width,
    aspectRatio,
  }),
  size: (width: string, height: string) => ({ width, height }),
  gutter: (width: string) => ({ width }),
  ratio: (aspectRatio: string) => ({ aspectRatio }),
  driftLayer: { overflow: "hidden", opacity: 0.9 },
  cloud: {
    position: "absolute",
    borderRadius: "50%",
    animationDirection: "alternate",
    animationIterationCount: "infinite",
    animationTimingFunction: "ease-in-out",
    animationName: { default: drift, [reduced]: "none" },
    willChange: "transform",
  },
  cloudA: {
    left: "-20%",
    top: "30%",
    width: "70%",
    height: "60%",
    backgroundImage: `radial-gradient(closest-side, ${plainsColor.leafShade}, transparent)`,
    animationDuration: "19s",
  },
  cloudB: {
    left: "55%",
    top: "55%",
    width: "60%",
    height: "70%",
    backgroundImage: `radial-gradient(closest-side, ${plainsColor.leafShade}, transparent)`,
    opacity: 0.7,
    animationName: { default: sway, [reduced]: "none" },
    animationDuration: "23s",
  },
  app: {
    position: "absolute",
    zIndex: 2,
    top: 0,
    left: 0,
    transformOrigin: "0 0",
    opacity: 0,
    willChange: "transform",
    boxShadow: `0 30px 80px ${plainsColor.appShadow}`,
  },
  hero: {
    position: "absolute",
    zIndex: 5,
    left: "6vw",
    top: "24vh",
    width: "min(40vw, 620px)",
    willChange: "transform, opacity",
  },
  headline: {
    margin: 0,
    fontFamily: serif,
    fontWeight: 400,
    fontSize: "clamp(44px, 5.1vw, 84px)",
    lineHeight: 1.02,
    letterSpacing: "-0.02em",
    textWrap: "balance",
    textShadow: `0 2px 28px ${plainsColor.photoShadow}`,
  },
  heroSearch: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    width: "min(400px, 34vw)",
    height: "46px",
    marginTop: "34px",
    paddingInline: "18px",
    boxSizing: "border-box",
    borderRadius: radius.round,
    backgroundColor: plainsColor.frost,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: plainsColor.frostEdge,
    backdropFilter: "blur(14px) saturate(1.2)",
    color: plainsColor.onPhotoSoft,
    fontSize: "15px",
  },
  copy: {
    position: "absolute",
    zIndex: 5,
    margin: 0,
    fontFamily: serif,
    fontWeight: 400,
    lineHeight: 1.12,
    letterSpacing: "-0.01em",
    textShadow: `0 1px 18px ${plainsColor.photoShadow}`,
    opacity: 0,
    willChange: "transform, opacity",
  },
  deskCopy: {
    top: "50%",
    left: 0,
    marginTop: "-1.2em",
    paddingInline: "18px",
    boxSizing: "border-box",
    textAlign: "center",
    fontSize: "clamp(20px, 1.9vw, 30px)",
  },
  phoneHero: {
    position: "absolute",
    zIndex: 2,
    top: "96px",
    left: "22px",
    right: "22px",
  },
  phoneHeadline: { fontSize: "clamp(36px, 10.4vw, 46px)" },
  phoneCopy: {
    zIndex: 2,
    top: "84px",
    left: 0,
    right: 0,
    textAlign: "center",
    fontSize: "28px",
  },
  device: {
    position: "absolute",
    zIndex: 3,
    left: "50%",
    bottom: "4svh",
    width: "min(74vw, 300px)",
    aspectRatio: "9 / 19",
    marginLeft: "calc(min(74vw, 300px) / -2)",
    boxSizing: "border-box",
    padding: "9px",
    borderRadius: "46px",
    backgroundColor: plainsColor.phoneBody,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: plainsColor.phoneEdge,
    boxShadow: `0 30px 70px ${plainsColor.appShadow}`,
    transform: "translate3d(0, 46%, 0) scale(0.94)",
    transformOrigin: "50% 100%",
    willChange: "transform",
  },
  deviceScreen: {
    width: "100%",
    height: "100%",
    overflow: "hidden",
    borderRadius: "37px",
    paddingTop: "30px",
    boxSizing: "border-box",
    backgroundColor: color.window,
  },
  island: {
    position: "absolute",
    top: "18px",
    left: "50%",
    width: "84px",
    height: "24px",
    marginLeft: "-42px",
    borderRadius: radius.round,
    backgroundColor: plainsColor.phoneBody,
  },
  still: {
    position: "relative",
    display: { default: "none", [calmDesk]: "flex" },
    alignItems: "center",
    gap: "32px",
    minHeight: "100vh",
    paddingBlock: "96px",
    paddingInline: "4vw",
    boxSizing: "border-box",
  },
  stillCopy: {
    position: "relative",
    opacity: 1,
    flexBasis: "18%",
    fontSize: "clamp(22px, 2vw, 30px)",
    textAlign: "center",
  },
  stillDesk: {
    position: "relative",
    flexGrow: 1,
    width: "100%",
    overflow: "hidden",
    borderRadius: radius.frame,
  },
  flat: { transformOrigin: "0 0" },
  after: { position: "relative", height: "60vh", overflow: "hidden" },
});
