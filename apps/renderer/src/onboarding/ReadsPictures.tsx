import * as stylex from "@stylexjs/stylex";
import { color, font, onboardingColor } from "@inkling/ui/tokens.stylex";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { onboardingPhotos } from "./media.ts";

const QUERY = "lumen";

// Timeline in ms from arrival: a beat, the grid of results settles in, "lumen"
// is typed, the receipt rises to the front, the scan beam reads it, then the
// match is marked. Everything is a one-shot.
const TYPE_START_MS = 1500;
const TYPE_MS = 230;
const RAISE_MS = 2900;
const SCAN_START_MS = 3400;
const SCAN_MS = 1500;
const FOUND_MS = SCAN_START_MS + SCAN_MS + 300;
/** How long one line takes to resolve from scrambled glyphs to its words. */
const RESOLVE_MS = 380;
const SCRAMBLE_STEP_MS = 55;

const GLYPHS = "ABCDEFGHJKLMNPRSTUVWXYZ0123456789#%&";

const LINES = [
  ["2 × galão", "3.40"],
  ["1 × pastel de nata", "1.30"],
  ["1 × água", "0.90"],
] as const;

// Results grid: a four-column masonry under the search field, each picture at
// its own aspect ratio like the library grid. Only the receipt is picked out.
const THUMB_W = 92;
const GAP = 20;
const COLUMNS = 4;
const GRID_TOP = 146;
// The receipt's resting box, and the scale that turns it into a grid thumbnail.
const RECEIPT_W = 220;
const RECEIPT_H = 330;
const RECEIPT_LEFT = 104;
const THUMB_SCALE = THUMB_W / RECEIPT_W;

type Phase = "typing" | "raise" | "scan" | "found";

/** Grid order, each with its width over height. */
const ORDER = [
  ["record", 1],
  ["receipt", RECEIPT_W / RECEIPT_H],
  ["stairs", 0.8],
  ["book", 1.5],
  ["car", 1.5],
  ["vases", 0.76],
  ["sea", 1.5],
  ["pottery", 1],
] as const;
type CardKey = (typeof ORDER)[number][0];

const heightOf = (aspect: number) => Math.round(THUMB_W / aspect);

/** Masonry: each card to the shortest column, in grid order. */
const SPOTS = (() => {
  const tops = Array<number>(COLUMNS).fill(GRID_TOP);
  const spots = new Map<CardKey, { x: number; y: number }>();
  for (const [key, aspect] of ORDER) {
    const col = tops.indexOf(Math.min(...tops));
    spots.set(key, { x: col * (THUMB_W + GAP), y: tops[col] ?? GRID_TOP });
    tops[col] = (tops[col] ?? GRID_TOP) + heightOf(aspect) + GAP;
  }
  return spots;
})();
const spotOf = (key: CardKey) => SPOTS.get(key) ?? { x: 0, y: GRID_TOP };

/** Deterministic, so a re-render never reshuffles glyphs mid-step. */
function glyphAt(seed: number) {
  const n = Math.sin(seed * 127.1) * 43758.5453;
  return GLYPHS[Math.floor((n - Math.floor(n)) * GLYPHS.length)] ?? "#";
}

function scrambled(text: string, step: number, line: number, keep: number) {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    out += i < keep || ch === " " ? ch : glyphAt(step * 131 + line * 17 + i);
  }
  return out;
}

const scanLines = (root: HTMLElement | null) =>
  Array.from(root?.querySelectorAll<HTMLElement>("[data-scan]") ?? []);

const receiptShift = (() => {
  const slot = spotOf("receipt");
  return {
    x: slot.x + THUMB_W / 2 - (RECEIPT_LEFT + RECEIPT_W / 2),
    y: slot.y + heightOf(RECEIPT_W / RECEIPT_H) / 2 - (GRID_TOP + RECEIPT_H / 2),
  };
})();

function Scanned({ text, style }: { text: string; style?: stylex.StyleXStyles }) {
  return (
    <span data-scan={text} {...stylex.props(style)}>
      {text}
    </span>
  );
}

/**
 * Screen four's demo: "lumen" typed into search, the receipt picked out of a
 * still grid of results and raised to the front, a scan beam reading it (the
 * words resolve out of scrambled glyphs as the beam passes), and the match
 * marked. Plays once per visit; reduced motion lands on the finished frame.
 */
export function ReadsPictures({ reducedMotion }: { reducedMotion: boolean }) {
  const [typed, setTyped] = useState(reducedMotion ? QUERY.length : 0);
  const [phase, setPhase] = useState<Phase>(reducedMotion ? "found" : "typing");
  const receiptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (reducedMotion) return;
    const timers: number[] = [];
    const at = (ms: number, run: () => void) => timers.push(window.setTimeout(run, ms));
    for (let i = 1; i <= QUERY.length; i++)
      at(TYPE_START_MS + (i - 1) * TYPE_MS, () => setTyped(i));
    at(RAISE_MS, () => setPhase("raise"));
    at(SCAN_START_MS, () => setPhase("scan"));
    at(FOUND_MS, () => setPhase("found"));
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, [reducedMotion]);

  // Until the beam reaches a line its words stay unread. Writes into the
  // existing text nodes, so React's tree is left alone.
  useLayoutEffect(() => {
    if (reducedMotion) return;
    const lines = scanLines(receiptRef.current);
    lines.forEach((el, i) => {
      if (el.firstChild) el.firstChild.nodeValue = scrambled(el.dataset.scan ?? "", 0, i, 0);
    });
    return () => {
      for (const el of lines) if (el.firstChild) el.firstChild.nodeValue = el.dataset.scan ?? "";
    };
  }, [reducedMotion]);

  // The beam's sweep is CSS; this resolves each line as the beam reaches it,
  // then stops. Layout is read once, before the loop starts.
  useEffect(() => {
    if (phase !== "scan") return;
    const root = receiptRef.current;
    if (!root) return;
    const box = root.getBoundingClientRect();
    const plan = scanLines(root).map((el, line) => {
      const rect = el.getBoundingClientRect();
      const center = (rect.top + rect.height / 2 - box.top) / box.height;
      return { text: el.dataset.scan ?? "", node: el.firstChild, at: center * SCAN_MS, line };
    });
    const started = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const elapsed = now - started;
      let pending = false;
      for (const { text, node, at, line } of plan) {
        if (!node) continue;
        const progress = Math.min(1, Math.max(0, (elapsed - at) / RESOLVE_MS));
        if (progress <= 0) {
          pending = true;
          continue;
        }
        pending ||= progress < 1;
        node.nodeValue =
          progress >= 1
            ? text
            : scrambled(
                text,
                Math.floor(elapsed / SCRAMBLE_STEP_MS),
                line,
                Math.floor(progress * text.length),
              );
      }
      if (pending) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [phase]);

  const raised = phase !== "typing";

  return (
    <div {...stylex.props(styles.root)} aria-hidden="true">
      {ORDER.map(([key, aspect], index) => {
        if (key === "receipt") return null;
        const spot = spotOf(key);
        return (
          <img
            key={key}
            src={onboardingPhotos[key]}
            alt=""
            draggable={false}
            {...stylex.props(
              styles.card,
              styles.cardAt(heightOf(aspect), spot.x, spot.y, 300 + index * 70),
              raised && styles.behind,
            )}
          />
        );
      })}
      <div {...stylex.props(styles.search)}>
        <span {...stylex.props(styles.eyes)}>
          <span {...stylex.props(styles.eye, phase === "scan" && styles.blink)} />
          <span {...stylex.props(styles.eye, phase === "scan" && styles.blink)} />
        </span>
        <span>{QUERY.slice(0, typed)}</span>
        {phase === "found" ? null : <span {...stylex.props(styles.caret)} />}
      </div>
      <div
        ref={receiptRef}
        {...stylex.props(
          styles.receipt,
          !raised && styles.thumbnail(receiptShift.x, receiptShift.y, THUMB_SCALE),
        )}
      >
        <span {...stylex.props(styles.beam, phase === "scan" && styles.scanning)} />
        <Scanned text="— RECEIPT —" style={styles.kicker} />
        <span {...stylex.props(styles.name)}>
          <span {...stylex.props(styles.mark, phase === "found" && styles.marked)} />
          <Scanned text="CAFÉ LUMEN" />
        </span>
        <Scanned text="Rua das Flores 28, Lisboa" style={styles.kicker} />
        <span {...stylex.props(styles.rule)} />
        {LINES.map(([item, price]) => (
          <span key={item} {...stylex.props(styles.line)}>
            <Scanned text={item} />
            <Scanned text={price} />
          </span>
        ))}
        <span {...stylex.props(styles.rule)} />
        <span {...stylex.props(styles.line, styles.total)}>
          <Scanned text="TOTAL" />
          <Scanned text="€5.60" />
        </span>
        <Scanned text="14 MAR 2026 · 09:12" style={[styles.kicker, styles.footer]} />
        <Scanned text="obrigado!" style={styles.kicker} />
      </div>
    </div>
  );
}

const reduced = "@media (prefers-reduced-motion: reduce)";
const easeOut = "cubic-bezier(0.22, 1, 0.36, 1)";
const cardIn = stylex.keyframes({ from: { translate: "0 16px", opacity: 0 } });
const rise = stylex.keyframes({ from: { opacity: 0, translate: "0 14px" } });
const caretBlink = stylex.keyframes({ "50%": { opacity: 0 } });
const eyeBlink = stylex.keyframes({ "50%": { transform: "scaleY(0.15)" } });
const scan = stylex.keyframes({
  "0%": { transform: "translateY(-58px)", opacity: 0 },
  "8%": { opacity: 1 },
  "92%": { opacity: 1 },
  "100%": { transform: "translateY(272px)", opacity: 0 },
});

const styles = stylex.create({
  root: { position: "absolute", left: 524, top: 0, width: 428, height: 540 },
  card: {
    position: "absolute",
    left: 0,
    top: 0,
    width: THUMB_W,
    borderRadius: 10,
    objectFit: "cover",
    animationName: { default: cardIn, [reduced]: "none" },
    animationDuration: "520ms",
    animationTimingFunction: easeOut,
    animationFillMode: "backwards",
  },
  cardAt: (height: number, x: number, y: number, delay: number) => ({
    height,
    transform: `translate(${x}px, ${y}px)`,
    animationDelay: `${delay}ms`,
  }),
  behind: {
    opacity: 0.18,
    transitionProperty: { default: "transform, opacity", [reduced]: "none" },
    transitionDuration: "600ms",
    transitionTimingFunction: `${easeOut}, ease-out`,
  },
  search: {
    position: "absolute",
    left: 0,
    top: 64,
    display: "flex",
    alignItems: "center",
    gap: 12,
    width: 428,
    height: 50,
    paddingInline: 18,
    boxSizing: "border-box",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: color.borderStrong,
    borderRadius: 20,
    backgroundColor: color.surface,
    fontSize: 15,
    animationName: { default: rise, [reduced]: "none" },
    animationDuration: "640ms",
    animationTimingFunction: easeOut,
    animationDelay: "150ms",
    animationFillMode: "both",
  },
  eyes: { display: "flex", gap: 4, paddingTop: 3, paddingLeft: 2 },
  eye: { width: 5, height: 11, borderRadius: 3, backgroundColor: color.ink },
  blink: {
    animationName: eyeBlink,
    animationDuration: "320ms",
    animationTimingFunction: "ease-in-out",
    animationDelay: "250ms",
  },
  caret: {
    width: "1.5px",
    height: 18,
    marginLeft: -10,
    backgroundColor: color.muted,
    animationName: caretBlink,
    animationDuration: "1s",
    animationTimingFunction: "steps(1)",
    animationIterationCount: "infinite",
  },
  receipt: {
    position: "absolute",
    zIndex: 1,
    left: RECEIPT_LEFT,
    top: GRID_TOP,
    display: "flex",
    flexDirection: "column",
    gap: 6,
    width: RECEIPT_W,
    height: RECEIPT_H,
    boxSizing: "border-box",
    paddingBlock: 26,
    paddingInline: 22,
    overflow: "hidden",
    borderRadius: 16,
    backgroundColor: onboardingColor.receiptPaper,
    boxShadow: `0 24px 56px ${onboardingColor.deepShadow}`,
    color: onboardingColor.receiptInk,
    fontFamily: font.body,
    fontSize: 11,
    lineHeight: "16px",
    whiteSpace: "nowrap",
    transform: "none",
    transitionProperty: { default: "transform", [reduced]: "none" },
    transitionDuration: "700ms",
    transitionTimingFunction: easeOut,
    transitionDelay: "170ms",
    animationName: { default: cardIn, [reduced]: "none" },
    animationDuration: "520ms",
    animationTimingFunction: easeOut,
    animationDelay: "370ms",
    animationFillMode: "backwards",
  },
  thumbnail: (x: number, y: number, scale: number) => ({
    transform: `translate(${x}px, ${y}px) scale(${scale})`,
  }),
  beam: {
    position: "absolute",
    zIndex: 2,
    left: 0,
    right: 0,
    top: 0,
    height: 56,
    borderBottomWidth: 2,
    borderBottomStyle: "solid",
    borderBottomColor: color.accent,
    backgroundImage: `linear-gradient(to bottom, transparent, ${onboardingColor.scanWash})`,
    boxShadow: `0 6px 18px ${onboardingColor.scanGlow}`,
    opacity: 0,
    pointerEvents: "none",
    display: { default: "block", [reduced]: "none" },
  },
  scanning: {
    animationName: scan,
    animationDuration: `${SCAN_MS}ms`,
    animationTimingFunction: "linear",
  },
  kicker: {
    color: onboardingColor.receiptMuted,
    fontSize: 10,
    lineHeight: "14px",
    letterSpacing: "0.06em",
    textAlign: "center",
  },
  footer: { paddingTop: 18 },
  name: {
    position: "relative",
    alignSelf: "center",
    marginTop: 8,
    paddingBlock: 3,
    paddingInline: 8,
    color: onboardingColor.receiptStrong,
    fontSize: 17,
    fontWeight: 500,
    lineHeight: "22px",
    letterSpacing: "0.06em",
    isolation: "isolate",
  },
  mark: {
    position: "absolute",
    inset: 0,
    zIndex: -1,
    borderWidth: "1.5px",
    borderStyle: "solid",
    borderColor: color.accent,
    borderRadius: 6,
    backgroundColor: onboardingColor.matchWash,
    transform: "scaleX(0)",
    transformOrigin: "left",
    transitionProperty: { default: "transform", [reduced]: "none" },
    transitionDuration: "500ms",
    transitionTimingFunction: "cubic-bezier(0.65, 0, 0.35, 1)",
  },
  marked: { transform: "none" },
  rule: {
    marginTop: 8,
    marginBottom: 2,
    borderBottomWidth: 1,
    borderBottomStyle: "dashed",
    borderBottomColor: onboardingColor.receiptRule,
  },
  line: { display: "flex", justifyContent: "space-between" },
  total: { paddingTop: 6, color: onboardingColor.receiptStrong, fontSize: 12, fontWeight: 500 },
});
