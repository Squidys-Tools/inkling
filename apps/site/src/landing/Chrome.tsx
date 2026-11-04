import * as stylex from "@stylexjs/stylex";
import { GithubIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { landingColor } from "@inkling/ui/tokens.stylex";
import { useInView } from "motion/react";
import { useRef } from "react";
import { repository } from "../layout/links.ts";
import { base } from "./base.ts";
import { Cast } from "./Cast.tsx";
import { DownloadButton } from "./DownloadButton.tsx";
import { useCalm } from "./environment.ts";
import { ExternalArrow } from "./ExternalArrow.tsx";
import { landing, media } from "./landing.stylex.ts";

export function Header() {
  return (
    <header {...stylex.props(base.frame, styles.header)}>
      <a href="/" aria-label="inkling home" {...stylex.props(base.link, base.focus, styles.brand)}>
        <img
          src="/media/inkling-mark.png"
          width="512"
          height="512"
          alt=""
          {...stylex.props(base.image, styles.logo)}
        />
        <span {...stylex.props(styles.brandName)}>inkling</span>
      </a>
      <nav aria-label="Main" {...stylex.props(styles.nav)}>
        <a href="/#library" {...stylex.props(base.link, base.focus, base.textLink)}>
          The library
        </a>
        <a
          href="/#privacy"
          {...stylex.props(base.link, base.focus, base.textLink, styles.secondaryLink)}
        >
          Yours, always
        </a>
      </nav>
      <div {...stylex.props(styles.actions)}>
        <a
          href={repository}
          aria-label="inkling on GitHub"
          {...stylex.props(base.link, base.focus, styles.github)}
        >
          <HugeiconsIcon icon={GithubIcon} size={24} />
        </a>
        <DownloadButton compact />
      </div>
    </header>
  );
}

function Wordmark() {
  const root = useRef<HTMLDivElement>(null);
  const visible = useInView(root);
  const calm = useCalm();
  const alive = visible && !calm;
  return (
    <div ref={root} aria-hidden="true" {...stylex.props(styles.wordmark)}>
      <span {...stylex.props(styles.dotlessI)}>
        ı
        <span {...stylex.props(styles.tittle)}>
          <Cast index={11} gaze="right" alive={alive} />
        </span>
      </span>
      <span>nkl</span>
      <span {...stylex.props(styles.dotlessI)}>
        ı
        <span {...stylex.props(styles.tittle)}>
          <Cast index={12} gaze="left" alive={alive} />
        </span>
      </span>
      <span>ng.</span>
    </div>
  );
}

export function Finale({ calm, setCalm }: { calm: boolean; setCalm: (calm: boolean) => void }) {
  const reduced = useCalm();
  return (
    <footer id="ending" aria-label="Inkling" {...stylex.props(styles.footer)}>
      <div {...stylex.props(base.frame)}>
        <div {...stylex.props(styles.top)}>
          <a
            href="#top"
            aria-label="Back to the top of inkling"
            {...stylex.props(base.link, base.focus, styles.endingMark)}
          >
            <Wordmark />
          </a>
          <p {...stylex.props(base.flush, styles.promise)}>
            For the things
            <br />
            you want to come back to.
          </p>
          <DownloadButton style={styles.download} />
        </div>
        <div {...stylex.props(styles.bottom)}>
          <nav aria-label="Explore inkling" {...stylex.props(styles.links)}>
            <a href="#library" {...stylex.props(base.link, base.focus, styles.link)}>
              Try the library
            </a>
            <a
              href={repository}
              {...stylex.props(stylex.defaultMarker(), base.link, base.focus, styles.link)}
            >
              GitHub
              <ExternalArrow />
            </a>
            <a
              href={`${repository}/releases`}
              {...stylex.props(stylex.defaultMarker(), base.link, base.focus, styles.link)}
            >
              Releases
              <ExternalArrow />
            </a>
            <a
              href="/media/stories/credits.html"
              {...stylex.props(base.link, base.focus, styles.link)}
            >
              Image credits
            </a>
          </nav>
          <button
            type="button"
            aria-pressed={reduced}
            onClick={() => setCalm(!calm)}
            {...stylex.props(base.button, styles.motionSwitch)}
          >
            {reduced ? "Motion: calm" : "Motion: full"}
          </button>
        </div>
      </div>
    </footer>
  );
}

const styles = stylex.create({
  header: {
    position: "relative",
    zIndex: 10,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: { default: "32px", [media.phone]: "16px" },
    height: { default: "112px", [media.tablet]: "96px", [media.phone]: "84px" },
  },
  brand: { display: "inline-flex", alignItems: "center", gap: "10px", minHeight: "48px" },
  logo: {
    width: { default: "44px", [media.phone]: "36px" },
    height: { default: "44px", [media.phone]: "36px" },
    objectFit: "contain",
    filter: "invert(1)",
  },
  brandName: {
    fontSize: { default: "1.65rem", [media.phone]: "1.375rem" },
    fontWeight: 700,
    letterSpacing: "-0.055em",
  },
  nav: {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    display: { default: "flex", [media.phone]: "none" },
    alignItems: "center",
    gap: { default: "32px", [media.tablet]: "22px" },
  },
  secondaryLink: { display: { default: "inline-flex", [media.tablet]: "none" } },
  actions: { display: "flex", alignItems: "center", gap: { default: "20px", [media.phone]: 0 } },
  github: {
    display: "grid",
    placeItems: "center",
    minWidth: "44px",
    minHeight: "44px",
    borderRadius: "50%",
    backgroundColor: { default: null, ":hover": landingColor.surface },
  },
  footer: {
    backgroundColor: landingColor.paper,
    color: landingColor.ink,
    paddingBlock: { default: "60px 32px", [media.phone]: "40px 24px" },
  },
  top: {
    display: "grid",
    gridTemplateColumns: {
      default: "1fr 1fr auto",
      [media.tablet]: "1fr auto",
      [media.phone]: "1fr",
    },
    alignItems: "center",
    gap: { default: "40px", [media.tablet]: "28px", [media.phone]: "24px" },
  },
  endingMark: { display: "inline-block", justifySelf: "start" },
  wordmark: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "center",
    paddingTop: "0.12em",
    fontSize: { default: "86px", [media.phone]: "78px" },
    lineHeight: 1,
    letterSpacing: "-0.075em",
    whiteSpace: "nowrap",
  },
  dotlessI: { position: "relative", display: "inline-block" },
  tittle: {
    position: "absolute",
    left: "50%",
    top: "-0.035em",
    width: "0.19em",
    height: "0.19em",
    transform: "translateX(-25%)",
    color: landingColor.ink,
  },
  promise: {
    gridColumn: { default: null, [media.tablet]: "1" },
    gridRow: { default: null, [media.tablet]: "2" },
    fontSize: { default: "18px", [media.tablet]: "17px" },
    lineHeight: 1.45,
    letterSpacing: "-0.02em",
  },
  download: {
    gridColumn: { default: null, [media.tablet]: "2", [media.phone]: "1" },
    gridRow: { default: null, [media.tablet]: "1 / 3", [media.phone]: "3" },
    justifySelf: { default: null, [media.phone]: "start" },
    marginTop: { default: null, [media.phone]: "4px" },
  },
  bottom: {
    display: "flex",
    flexDirection: { default: "row", [media.phone]: "column" },
    justifyContent: "space-between",
    alignItems: { default: "center", [media.phone]: "flex-start" },
    gap: { default: "32px", [media.tablet]: "24px", [media.phone]: "18px" },
    marginTop: { default: "48px", [media.phone]: "30px" },
  },
  links: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: { default: "28px", [media.tablet]: "4px 22px", [media.phone]: "0 24px" },
  },
  link: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.3em",
    minHeight: "44px",
    fontSize: "14px",
    textDecoration: { default: "none", ":hover": "underline" },
    textUnderlineOffset: { default: null, ":hover": "5px" },
  },
  motionSwitch: {
    boxSizing: "border-box",
    display: "inline-flex",
    justifyContent: "center",
    alignItems: "center",
    gap: "16px",
    minHeight: "44px",
    margin: 0,
    padding: "10px 16px",
    borderStyle: "none",
    borderRadius: "12px",
    backgroundColor: {
      default: "transparent",
      [media.hover]: { default: "transparent", ":hover": landingColor.controlHover },
    },
    color: landingColor.ink,
    fontFamily: landing.font,
    fontSize: "14px",
    fontWeight: 500,
    lineHeight: 1.25,
    whiteSpace: "nowrap",
    transform: { default: null, ":active": "translateY(1px) scale(0.98)" },
    transitionProperty: "transform, background-color",
    transitionDuration: { default: "0.14s, 0.15s", [media.reduced]: "0s" },
    transitionTimingFunction: `${landing.controlEase}, ease`,
    outline: { default: null, ":focus-visible": `3px solid ${landingColor.ink}` },
    outlineOffset: { default: null, ":focus-visible": "4px" },
  },
});
