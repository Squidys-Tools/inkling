import * as stylex from "@stylexjs/stylex";
import { landingColor } from "@inkling/ui/tokens.stylex";
import { type MouseEvent, useEffect, useState } from "react";
import { Aperture } from "./Aperture.tsx";
import { base } from "./base.ts";
import { Finale, Header } from "./Chrome.tsx";
import { DownloadButton } from "./DownloadButton.tsx";
import { CalmContext, useCalm, useHydrated } from "./environment.ts";
import { landing, media } from "./landing.stylex.ts";
import { MascotHint } from "./MascotHint.tsx";
import { Story } from "./Story.tsx";

// Registered through the FontFace API, as the rest of the site's faces are: the
// route preloads the same files so the first paint rarely waits for them.
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

export function LandingPage() {
  const [calm, setCalm] = useState(false);
  useEffect(registerRedHat, []);
  return (
    <CalmContext.Provider value={calm}>
      <Site calm={calm} setCalm={setCalm} />
    </CalmContext.Provider>
  );
}

// Links to the library promise the usable demo, not its masked opening.
function openLibrary(event: MouseEvent<HTMLDivElement>) {
  const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
  if (
    !(anchor instanceof HTMLAnchorElement) ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  )
    return;
  const url = new URL(anchor.href, window.location.href);
  if (
    url.origin !== window.location.origin ||
    url.pathname !== window.location.pathname ||
    url.hash !== "#library"
  )
    return;
  if (!document.getElementById("library")) return;
  event.preventDefault();
  // TanStack observes history writes and otherwise realigns #library to its
  // masked opening after our scroll. Keep the hash, but own this offset.
  if (window.location.hash !== url.hash)
    window.history.pushState(
      { ...window.history.state, __hashScrollIntoViewOptions: false },
      "",
      url.hash,
    );
  requestAnimationFrame(() => scrollLibraryIntoView("smooth"));
}

function scrollLibraryIntoView(behavior: ScrollBehavior) {
  const section = document.getElementById("library");
  if (!section) return;
  const top = section.getBoundingClientRect().top + window.scrollY;
  const destination =
    section.offsetHeight > window.innerHeight
      ? top - window.innerHeight * 0.55 + (section.offsetHeight - window.innerHeight * 0.45) * 0.7
      : top;
  window.scrollTo({
    top: Math.max(0, destination),
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : behavior,
  });
}

function Site({ calm, setCalm }: { calm: boolean; setCalm: (calm: boolean) => void }) {
  const reduced = useCalm();
  const hydrated = useHydrated();
  // The hero rises only when it mounts after hydration, as on a client-side visit;
  // the prerendered page is already in place.
  const [rise] = useState(!reduced);
  useEffect(() => {
    if (!hydrated || window.location.hash !== "#library") return;
    // Covers a direct hash reload or a native link clicked before hydration.
    const handle = requestAnimationFrame(() => scrollLibraryIntoView("instant"));
    return () => cancelAnimationFrame(handle);
  }, [hydrated]);
  return (
    <div id="top" onClick={openLibrary} {...stylex.props(styles.page)}>
      <a href="#main" {...stylex.props(base.link, base.focus, styles.skip)}>
        Skip to content
      </a>
      <Header />
      <main id="main">
        <section aria-labelledby="hero-heading" {...stylex.props(base.frame, styles.hero)}>
          <h1 id="hero-heading" {...stylex.props(base.heading, styles.title, rise && styles.rise)}>
            <span {...stylex.props(styles.line)}>finally, you can</span>{" "}
            <span {...stylex.props(styles.line)}>
              just <strong {...stylex.props(styles.strong)}>find it</strong>
            </span>
          </h1>
          <div {...stylex.props(styles.lower, rise && styles.rise, rise && styles.later)}>
            <div>
              <p {...stylex.props(base.flush, styles.lede)}>
                A quiet little home for your photos and screenshots.
                <br {...stylex.props(styles.desktopBreak)} /> Find them later by describing what you
                remember.
              </p>
              <div {...stylex.props(styles.actions)}>
                <DownloadButton style={styles.heroDownload} />
                <a href="#library" {...stylex.props(base.link, base.focus, base.textLink)}>
                  See what’s inside
                </a>
              </div>
            </div>
          </div>
          <MascotHint
            character={0}
            label="Inkling tip: save the good stuff"
            tip="Photos, screenshots, notes, links. Keep the things you want to come back to."
            style={styles.peekLeft}
          />
          <MascotHint
            character={1}
            side="right"
            label="Inkling tip: your library stays yours"
            tip="Your library lives on your own computer. No cloud library. No account needed."
            style={styles.peekRight}
          />
        </section>
        <Aperture />
        <Story />
      </main>
      <Finale calm={calm} setCalm={setCalm} />
    </div>
  );
}

const rise = stylex.keyframes({ from: { transform: "translateY(24px)" } });

const styles = stylex.create({
  page: { overflowX: "clip" },
  skip: {
    boxSizing: "border-box",
    position: "fixed",
    zIndex: 100,
    top: "12px",
    left: "20px",
    padding: "12px 20px",
    backgroundColor: landingColor.ink,
    color: landingColor.paper,
    transform: { default: "translateY(-150%)", ":focus": "none" },
  },
  hero: {
    position: "relative",
    paddingTop: {
      default: "36px",
      [media.wide]: "70px",
      [media.tablet]: "48px",
      [media.phone]: "40px",
    },
    paddingBottom: { default: "18px", [media.phone]: "82px" },
    textAlign: "center",
  },
  title: {
    position: "relative",
    zIndex: 2,
    maxWidth: "1200px",
    marginInline: "auto",
    fontSize: landing.display,
    lineHeight: { default: 0.96, [media.phone]: 1.02 },
  },
  rise: {
    animationName: rise,
    animationDuration: "0.85s",
    animationTimingFunction: landing.ease,
    animationFillMode: "backwards",
  },
  later: { animationDelay: "0.09s" },
  line: { display: "block" },
  strong: { fontWeight: 700 },
  lower: {
    position: "relative",
    zIndex: 2,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    marginTop: { default: "32px", [media.phone]: "24px" },
  },
  lede: {
    maxWidth: { default: "680px", [media.phone]: "29ch" },
    marginInline: "auto",
    fontSize: landing.body,
    lineHeight: 1.5,
  },
  desktopBreak: { display: { default: null, [media.phone]: "none" } },
  actions: {
    display: "flex",
    flexWrap: { default: null, [media.phone]: "wrap" },
    alignItems: "center",
    justifyContent: "center",
    gap: { default: "28px", [media.phone]: "14px" },
    marginTop: { default: "28px", [media.phone]: "24px" },
  },
  heroDownload: { padding: { default: "6px", [media.phone]: "14px 24px" } },
  peekLeft: {
    left: { default: `calc(-1 * ${landing.gutter} - 100px)`, [media.phone]: "-96px" },
    top: { default: "205px", [media.phone]: "auto" },
    bottom: { default: null, [media.phone]: "-42px" },
    width: { default: "220px", [media.phone]: "125px" },
    height: { default: "220px", [media.phone]: "125px" },
  },
  peekRight: {
    right: { default: `calc(-1 * ${landing.gutter} - 100px)`, [media.phone]: "-100px" },
    top: { default: "66px", [media.phone]: "auto" },
    bottom: { default: null, [media.phone]: "-28px" },
    width: { default: "280px", [media.phone]: "145px" },
    height: { default: "280px", [media.phone]: "145px" },
  },
});
