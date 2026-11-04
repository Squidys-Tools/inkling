import * as stylex from "@stylexjs/stylex";
import { landingColor } from "@inkling/ui/tokens.stylex";
import { useInView } from "motion/react";
import { type ReactNode, useEffect, useRef } from "react";
import { repository } from "../layout/links.ts";
import { base } from "./base.ts";
import { Cast } from "./Cast.tsx";
import { useCalm, useHydrated } from "./environment.ts";
import { media } from "./landing.stylex.ts";
import { Questions } from "./Questions.tsx";
import { ScrollPanels } from "./ScrollPanels.tsx";

const practical = [
  {
    id: "account",
    title: "Do I need an account?",
    body: "No account is needed for your local library. Your database and saved assets live on your own disk, not in a cloud library.",
  },
  {
    id: "offline",
    title: "What works offline?",
    body: "Your saved library and local search work on your computer. Saving a web page, fetching remote media, playing an online video or checking for an update needs an internet connection.",
  },
  {
    id: "spaces",
    title: "Do I need to file everything?",
    body: "Only if you want to. Regular Spaces are collections you curate. Smart Spaces collect items that match a saved search.",
  },
  {
    id: "export",
    title: "Can I take my library with me?",
    body: "The desktop app can export your library together with its assets.",
  },
];

// The prerendered page shows every group in place. After hydration, groups still below
// the viewport drop back and rise once as they scroll in.
function Reveal({ children, style }: { children: ReactNode; style?: stylex.StyleXStyles }) {
  const reduced = useCalm();
  const hydrated = useHydrated();
  const ref = useRef<HTMLDivElement>(null);
  const seen = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || !hydrated) return;
    let animation: Animation | undefined;
    const settle = () => {
      animation?.cancel();
      el.style.opacity = "1";
      el.style.transform = "none";
    };
    if (reduced) {
      settle();
      seen.current = true;
      return;
    }
    if (seen.current || el.getBoundingClientRect().top < window.innerHeight) {
      seen.current = true;
      return;
    }
    el.style.transform = "translateY(24px)";
    el.style.opacity = ".35";
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        seen.current = true;
        observer.disconnect();
        el.style.opacity = "1";
        el.style.transform = "none";
        animation = el.animate(
          [
            { opacity: 0.35, transform: "translateY(24px)" },
            { opacity: 1, transform: "none" },
          ],
          { duration: 650, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
        );
      },
      { threshold: 0, rootMargin: "0px 0px 64px 0px" },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      settle();
    };
  }, [reduced, hydrated]);
  return (
    <div ref={ref} {...stylex.props(style)}>
      {children}
    </div>
  );
}

function HomeCompanion() {
  const ref = useRef<HTMLDivElement>(null);
  const visible = useInView(ref);
  const calm = useCalm();
  return (
    <div ref={ref} aria-hidden="true" {...stylex.props(styles.companion)}>
      <Cast index={6} gaze="left" alive={visible && !calm} onSheet />
    </div>
  );
}

function CloseToHome() {
  return (
    <section id="privacy" aria-labelledby="privacy-heading" {...stylex.props(styles.home)}>
      <div {...stylex.props(styles.sheet)}>
        <div {...stylex.props(base.frame)}>
          <div {...stylex.props(styles.homeTitle)}>
            <Reveal>
              <h2 id="privacy-heading" {...stylex.props(base.heading, styles.homeHeading)}>
                Not in a cloud.
                <br />
                In your corner.
              </h2>
            </Reveal>
            <div {...stylex.props(styles.companionSlot)}>
              <HomeCompanion />
            </div>
          </div>
          <div {...stylex.props(styles.explanation)}>
            <p {...stylex.props(base.flush, styles.explanationText)}>
              Your library lives on your computer.
              <br />A little less elsewhere. A little more yours.
            </p>
            <a
              href={repository}
              {...stylex.props(
                stylex.defaultMarker(),
                base.link,
                base.focus,
                base.focusOnSheet,
                base.textLink,
                styles.hood,
              )}
            >
              Look under the hood{" "}
              <span aria-hidden="true" {...stylex.props(base.textLinkArrow)}>
                ↗
              </span>
            </a>
          </div>
          <div id="questions" {...stylex.props(styles.questions)}>
            <h3 {...stylex.props(base.flush, styles.questionsHeading)}>The good-to-knows.</h3>
            <Questions items={practical} />
          </div>
        </div>
      </div>
    </section>
  );
}

export function Story() {
  return (
    <div {...stylex.props(styles.story)}>
      <section id="saving" aria-labelledby="saving-heading" {...stylex.props(styles.saving)}>
        <div {...stylex.props(base.frame, styles.savingHeading)}>
          <Reveal>
            <h2 id="saving-heading" {...stylex.props(base.heading, styles.savingTitle)}>
              Keep what
              <br />
              catches you.
            </h2>
          </Reveal>
          <Reveal style={styles.savingAside}>
            <p {...stylex.props(base.flush, styles.savingText)}>
              The picture you paused on.
              <br />
              The thought you almost lost.
              <br />
              There’s a place for that.
            </p>
          </Reveal>
        </div>
        <ScrollPanels />
      </section>
      <CloseToHome />
    </div>
  );
}

const styles = stylex.create({
  story: { backgroundColor: landingColor.paper },
  saving: {
    paddingBlock: { default: "clamp(80px, 9vw, 140px) 100px", [media.phone]: "80px 64px" },
    overflow: "clip",
  },
  savingHeading: {
    display: { default: "flex", [media.phone]: "block" },
    justifyContent: "space-between",
    alignItems: "flex-end",
    gap: { default: "60px", [media.tablet]: "40px" },
  },
  savingTitle: {
    fontSize: { default: "clamp(56px, 7.3vw, 108px)", [media.phone]: "clamp(52px, 14vw, 84px)" },
    lineHeight: { default: 0.98, [media.phone]: 1 },
    letterSpacing: "-0.065em",
  },
  savingAside: {
    marginBottom: "5px",
    marginRight: { default: "7%", [media.tablet]: 0 },
    marginTop: { default: null, [media.phone]: "32px" },
  },
  savingText: {
    maxWidth: "26ch",
    fontSize: { default: "clamp(18px, 1.65vw, 24px)", [media.phone]: "19px" },
    lineHeight: 1.5,
  },
  home: { backgroundColor: landingColor.paper, scrollMarginTop: 0 },
  sheet: {
    paddingBlock: {
      default: "110px 100px",
      [media.tablet]: "90px 80px",
      [media.phone]: "66px 60px",
    },
    backgroundColor: landingColor.sheet,
    color: landingColor.sheetInk,
  },
  homeTitle: {
    display: "flex",
    alignItems: { default: "center", [media.phone]: "flex-end" },
    justifyContent: "space-between",
    gap: { default: "50px", [media.tablet]: "32px", [media.phone]: "14px" },
  },
  homeHeading: {
    fontSize: {
      default: "clamp(60px, 8.8vw, 130px)",
      [media.tablet]: "9vw",
      [media.phone]: "clamp(43px, 11.5vw, 70px)",
      [media.narrow]: "40px",
    },
    lineHeight: { default: 1, [media.phone]: 1.04 },
    letterSpacing: "-0.065em",
  },
  companionSlot: {
    flex: "none",
    width: {
      default: "190px",
      [media.tablet]: "150px",
      [media.phone]: "64px",
      [media.narrow]: "52px",
    },
    height: {
      default: null,
      [media.tablet]: "150px",
      [media.phone]: "64px",
      [media.narrow]: "52px",
    },
    marginRight: { default: "5%", [media.tablet]: 0 },
  },
  companion: {
    position: "relative",
    flex: "none",
    width: {
      default: "190px",
      [media.tablet]: "150px",
      [media.phone]: "64px",
      [media.narrow]: "52px",
    },
    height: {
      default: "190px",
      [media.tablet]: "150px",
      [media.phone]: "64px",
      [media.narrow]: "52px",
    },
    pointerEvents: "auto",
  },
  explanation: {
    display: { default: "flex", [media.phone]: "block" },
    justifyContent: "space-between",
    alignItems: "flex-end",
    gap: "60px",
    marginTop: { default: "50px", [media.phone]: "34px" },
  },
  explanationText: {
    maxWidth: { default: "40ch", [media.phone]: "30ch" },
    fontSize: { default: "22px", [media.tablet]: "19px", [media.phone]: "18px" },
    lineHeight: { default: 1.5, [media.phone]: 1.55 },
  },
  hood: {
    flex: "none",
    fontSize: { default: "16px", [media.phone]: "15px" },
    marginTop: { default: null, [media.phone]: "18px" },
  },
  questions: {
    display: { default: "grid", [media.phone]: "block" },
    gridTemplateColumns: { default: "1fr 1.6fr", [media.tablet]: "0.8fr 1.4fr" },
    gap: { default: "9%", [media.tablet]: "50px" },
    marginTop: { default: "100px", [media.tablet]: "80px", [media.phone]: "54px" },
    scrollMarginTop: "40px",
  },
  questionsHeading: {
    paddingTop: { default: "24px", [media.phone]: 0 },
    marginBottom: { default: null, [media.phone]: "18px" },
    fontSize: { default: "26px", [media.phone]: "24px" },
    fontWeight: 400,
    lineHeight: 1.3,
    letterSpacing: "-0.04em",
  },
});
