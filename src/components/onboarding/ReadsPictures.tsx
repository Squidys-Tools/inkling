import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { prefersReducedMotion } from "../../ui/reducedMotion";
import { onboardingPhotos } from "./onboardingMedia";

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
// its own aspect ratio like the library grid. The grid holds still while
// "lumen" is typed; only the receipt is picked out of it.
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
    spots.set(key, { x: col * (THUMB_W + GAP), y: tops[col] });
    tops[col] += heightOf(aspect) + GAP;
  }
  return spots;
})();
const spotOf = (key: CardKey) => SPOTS.get(key) ?? { x: 0, y: GRID_TOP };

/** Deterministic, so a re-render never reshuffles glyphs mid-step. */
function glyphAt(seed: number) {
  const n = Math.sin(seed * 127.1) * 43758.5453;
  return GLYPHS[Math.floor((n - Math.floor(n)) * GLYPHS.length)];
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

/**
 * The "It reads your pictures, too." demo: "lumen" typed into search, the receipt
 * picked out of a still grid of results and raised to the front, a scan beam reading it (the words
 * resolve out of scrambled glyphs as the beam passes), and the match marked.
 * Plays once per visit; reduced motion lands on the finished frame.
 */
export function ReadsPictures() {
  const [reduced] = useState(prefersReducedMotion);
  const [typed, setTyped] = useState(reduced ? QUERY.length : 0);
  const [phase, setPhase] = useState<Phase>(reduced ? "found" : "typing");
  const receiptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (reduced) return;
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
  }, [reduced]);

  // Until the beam reaches a line its words stay unread. Writes into the
  // existing text nodes, so React's tree is left alone.
  useLayoutEffect(() => {
    if (reduced) return;
    const els = scanLines(receiptRef.current);
    const finals = els.map((el) => el.textContent ?? "");
    els.forEach((el, i) => {
      if (el.firstChild) el.firstChild.nodeValue = scrambled(finals[i], 0, i, 0);
    });
    return () => {
      els.forEach((el, i) => {
        if (el.firstChild) el.firstChild.nodeValue = finals[i];
      });
    };
  }, [reduced]);

  // The beam's sweep is pure CSS; this resolves each line as the beam reaches
  // it, then stops. One animation frame loop for about two seconds.
  useEffect(() => {
    if (phase !== "scan") return;
    const root = receiptRef.current;
    if (!root) return;
    const box = root.getBoundingClientRect();
    const plan = scanLines(root).map((el, i) => {
      const rect = el.getBoundingClientRect();
      const center = (rect.top + rect.height / 2 - box.top) / box.height;
      return { text: el.dataset.scan ?? "", node: el.firstChild, at: center * SCAN_MS, line: i };
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
  const receiptSlot = spotOf("receipt");
  const receiptShift = {
    x: receiptSlot.x + THUMB_W / 2 - (RECEIPT_LEFT + RECEIPT_W / 2),
    y: receiptSlot.y + heightOf(RECEIPT_W / RECEIPT_H) / 2 - (GRID_TOP + RECEIPT_H / 2),
  };

  return (
    <div className={`reads-pictures is-${phase}`} aria-hidden="true">
      {ORDER.map(([key, aspect], index) => {
        if (key === "receipt") return null;
        const spot = spotOf(key);
        return (
          <img
            key={key}
            className={`reads-card${raised ? " is-behind" : ""}`}
            src={onboardingPhotos[key]}
            alt=""
            draggable={false}
            style={
              {
                height: heightOf(aspect),
                transform: `translate(${spot.x}px, ${spot.y}px)`,
                "--order": index,
              } as CSSProperties
            }
          />
        );
      })}
      <div className="reads-search">
        <span className="reads-eyes">
          <span />
          <span />
        </span>
        <span>{QUERY.slice(0, typed)}</span>
        {phase === "found" ? null : <span className="reads-caret" />}
      </div>
      <div
        ref={receiptRef}
        className="reads-receipt"
        style={
          {
            transform: raised
              ? "none"
              : `translate(${receiptShift.x}px, ${receiptShift.y}px) scale(${THUMB_SCALE})`,
            "--order": 1,
          } as CSSProperties
        }
      >
        <span className="reads-beam" />
        <span className="reads-receipt-kicker" data-scan="— RECEIPT —">
          — RECEIPT —
        </span>
        <span className="reads-receipt-name">
          <span className="reads-receipt-mark" />
          <span data-scan="CAFÉ LUMEN">CAFÉ LUMEN</span>
        </span>
        <span className="reads-receipt-kicker" data-scan="Rua das Flores 28, Lisboa">
          Rua das Flores 28, Lisboa
        </span>
        <span className="reads-receipt-rule" />
        {LINES.map(([item, price]) => (
          <span key={item} className="reads-receipt-line">
            <span data-scan={item}>{item}</span>
            <span data-scan={price}>{price}</span>
          </span>
        ))}
        <span className="reads-receipt-rule" />
        <span className="reads-receipt-line is-total">
          <span data-scan="TOTAL">TOTAL</span>
          <span data-scan="€5.60">€5.60</span>
        </span>
        <span className="reads-receipt-kicker is-footer" data-scan="14 MAR 2026 · 09:12">
          14 MAR 2026 · 09:12
        </span>
        <span className="reads-receipt-kicker" data-scan="obrigado!">
          obrigado!
        </span>
      </div>
    </div>
  );
}
