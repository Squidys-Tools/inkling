import * as stylex from "@stylexjs/stylex";
import { inkOcrColor } from "@inkling/ui/tokens.stylex";
import { useEffect, useRef } from "react";
import { landing, media } from "../../landing/landing.stylex.ts";
import { startOcr } from "./stage.ts";

export function OcrSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stillRef = useRef<HTMLImageElement>(null);
  const typedRef = useRef<HTMLSpanElement>(null);
  const foundRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    const canvas = canvasRef.current;
    const image = stillRef.current;
    const typed = typedRef.current;
    const found = foundRef.current;
    if (!section || !canvas || !image || !typed || !found) return;

    return startOcr({ section, canvas, image, typed, found });
  }, []);

  return (
    <section ref={sectionRef} {...stylex.props(styles.section)}>
      <div {...stylex.props(styles.stage)}>
        <img
          ref={stillRef}
          alt="A crumpled receipt sinking through milky water, the word ramen outlined in blue."
          hidden
          {...stylex.props(styles.fill, styles.still)}
        />
        <canvas ref={canvasRef} aria-hidden="true" {...stylex.props(styles.fill)} />
        <div {...stylex.props(styles.copy)}>
          <div role="search" {...stylex.props(styles.pill)}>
            <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
              <circle cx="8.5" cy="8.5" r="5.75" {...stylex.props(styles.icon)} />
              <path d="M13 13l4 4" {...stylex.props(styles.icon)} />
            </svg>
            <span {...stylex.props(styles.query)}>
              <span ref={typedRef} />
              <span aria-hidden="true" {...stylex.props(styles.caret)} />
            </span>
            <span ref={foundRef} aria-hidden="true" {...stylex.props(styles.found)} />
          </div>
          <h2 {...stylex.props(styles.headline)}>It reads the words in your pictures.</h2>
        </div>
      </div>
    </section>
  );
}

const blink = stylex.keyframes({
  "0%, 49%": { opacity: 1 },
  "50%, 100%": { opacity: 0 },
});

const styles = stylex.create({
  section: {
    position: "relative",
    height: { default: "340vh", [media.reduced]: "100vh" },
    backgroundColor: inkOcrColor.water,
    color: inkOcrColor.ink,
    fontFamily: landing.font,
  },
  stage: {
    position: "sticky",
    top: 0,
    height: "100vh",
    overflow: "hidden",
  },
  fill: {
    position: "absolute",
    inset: 0,
    display: "block",
    width: "100%",
    height: "100%",
  },
  still: { objectFit: "cover" },
  copy: {
    position: "absolute",
    left: landing.gutter,
    bottom: { default: "clamp(28px, 7vh, 72px)", [media.phone]: "32px" },
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: { default: "28px", [media.phone]: "20px" },
    pointerEvents: "none",
  },
  pill: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    minWidth: "176px",
    height: "44px",
    paddingInline: "16px 14px",
    boxSizing: "border-box",
    borderRadius: "999px",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: inkOcrColor.pillEdge,
    backgroundColor: inkOcrColor.pill,
    backdropFilter: "blur(14px)",
    boxShadow: `0 10px 30px ${inkOcrColor.pillShadow}`,
    color: inkOcrColor.inkSoft,
    fontSize: "16px",
    fontWeight: 500,
    letterSpacing: "0.005em",
  },
  icon: { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" },
  query: {
    display: "inline-flex",
    alignItems: "center",
    flexGrow: 1,
    color: inkOcrColor.ink,
  },
  caret: {
    width: "1.5px",
    height: "18px",
    marginLeft: "2px",
    backgroundColor: inkOcrColor.ink,
    animationName: { default: blink, [media.reduced]: "none" },
    animationDuration: "1.1s",
    animationIterationCount: "infinite",
  },
  found: {
    width: "7px",
    height: "7px",
    borderRadius: "50%",
    backgroundColor: inkOcrColor.found,
    boxShadow: `0 0 10px ${inkOcrColor.found}`,
    opacity: 0,
  },
  headline: {
    maxWidth: "9.5ch",
    margin: 0,
    color: inkOcrColor.ink,
    fontSize: { default: "clamp(2.75rem, 5.6vw, 6.25rem)", [media.phone]: "2.6rem" },
    fontWeight: 700,
    lineHeight: 0.93,
    letterSpacing: "-0.045em",
    textWrap: "balance",
  },
});
