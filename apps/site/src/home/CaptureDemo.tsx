import * as stylex from "@stylexjs/stylex";
import { color, font, motion, radius } from "@inkling/ui/tokens.stylex";
import { useEffect, useState } from "react";
import { CardFace } from "../../../renderer/src/cards/CardFace.tsx";
import { useReducedMotion } from "../../../renderer/src/mascot/motion.ts";
import { demoViews } from "./demoLibrary.ts";

const link = "paulgraham.com/hundred.html";
// What the app's background jobs report while a saved link is read, in order.
const steps = ["Fetching the page", "Pulling out the article", "Indexing it for search"];
const STEP_MS = 900;
const article = demoViews.find((view) => view.id === "preview-article");
const ignore = () => {};

/** Press Save: the card is there at once, and the reading happens after, step by step. */
export function CaptureDemo() {
  const reducedMotion = useReducedMotion();
  const [step, setStep] = useState<number | null>(null);
  const [saves, setSaves] = useState(0);
  const done = step !== null && step >= steps.length;

  useEffect(() => {
    if (step === null || done) return;
    const timer = window.setTimeout(() => setStep(step + 1), STEP_MS);
    return () => window.clearTimeout(timer);
  }, [step, done]);

  if (!article) return null;
  // Until the page is read, a new card knows only its address.
  const view = step === 0 ? { ...article, title: link, readingMinutes: undefined } : article;
  const processing =
    step !== null && !done
      ? {
          active: true,
          message: steps[step] ?? null,
          progressCurrent: step,
          progressTotal: steps.length,
          failedJob: null,
        }
      : undefined;

  return (
    <div {...stylex.props(styles.demo)}>
      <div {...stylex.props(styles.bar)}>
        <span {...stylex.props(styles.link)}>{link}</span>
        <button
          type="button"
          onClick={() => {
            setSaves(saves + 1);
            setStep(reducedMotion ? steps.length : 0);
          }}
          {...stylex.props(styles.save)}
        >
          {step === null ? "Save" : "Save again"}
        </button>
      </div>
      <div {...stylex.props(styles.slot)}>
        {step === null && <div {...stylex.props(styles.empty)} />}
        {step !== null && (
          <div key={saves} inert {...stylex.props(styles.card)}>
            <CardFace
              view={view}
              index={0}
              list={false}
              selected={false}
              processing={processing}
              onOpen={ignore}
              onRead={ignore}
              onMenu={ignore}
              onRetry={ignore}
            />
          </div>
        )}
        <p role="status" {...stylex.props(styles.status)}>
          {step === null ? "" : done ? "Ready to read and to find." : `${steps[step]}…`}
        </p>
      </div>
    </div>
  );
}

const land = stylex.keyframes({
  from: { opacity: 0, transform: "translateY(8px) scale(0.98)" },
  to: { opacity: 1, transform: "none" },
});

const styles = stylex.create({
  demo: { display: "flex", flexDirection: "column", gap: "16px", maxWidth: "340px" },
  bar: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    height: "48px",
    paddingLeft: "16px",
    paddingRight: "6px",
    borderRadius: radius.round,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: color.borderStrong,
    backgroundColor: color.surface,
  },
  link: {
    flexGrow: 1,
    minWidth: 0,
    overflow: "hidden",
    color: color.inkSoft,
    fontFamily: font.mono,
    fontSize: "13px",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  save: {
    height: "36px",
    paddingInline: "16px",
    borderWidth: 0,
    borderRadius: radius.round,
    backgroundColor: { default: color.ink, ":hover": color.inkStrong },
    color: color.app,
    fontFamily: font.body,
    fontSize: "14px",
    fontWeight: 600,
    cursor: "pointer",
    flexShrink: 0,
    whiteSpace: "nowrap",
    outline: { default: "none", ":focus-visible": `2px solid ${color.accent}` },
    outlineOffset: "2px",
  },
  // Where the card will land, so saving does not push the page around.
  empty: {
    boxSizing: "border-box",
    height: "250px",
    marginBottom: "12px",
    borderRadius: radius.card,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: color.border,
  },
  slot: { minHeight: "300px" },
  card: {
    animationName: land,
    animationDuration: motion.layout,
    animationTimingFunction: motion.enter,
  },
  status: { minHeight: "1.5em", margin: 0, color: color.muted, fontSize: "14px" },
});
