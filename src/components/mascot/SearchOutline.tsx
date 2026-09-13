import { useEffect, useRef } from "react";
import { closedPath, type Point } from "./bot/shape";

export interface WaveOpts {
  amp1: number;
  wave1: number;
  amp2: number;
  wave2: number;
  speed1: number;
  speed2: number;
}

export const CALM_WAVE: WaveOpts = { amp1: 1.6, wave1: 320, amp2: 0.7, wave2: 130, speed1: 0.7, speed2: 1.1 };
export const LIVE_WAVE: WaveOpts = { amp1: 2.8, wave1: 300, amp2: 1.0, wave2: 120, speed1: 1.8, speed2: 2.6 };

const TAU = Math.PI * 2;
const SAMPLES = 160;

interface Walked {
  x: number;
  y: number;
  nx: number;
  ny: number;
  s: number;
}

/** Evenly spaced points with outward normals around a pixel-space rounded rect. */
function walkRoundedRect(w: number, h: number, r: number): Walked[] {
  const segs: { len: number; at: (s: number) => Omit<Walked, "s"> }[] = [];
  const straight = (x0: number, y0: number, x1: number, y1: number, nx: number, ny: number) => {
    const len = Math.hypot(x1 - x0, y1 - y0);
    segs.push({
      len,
      at: (s) => {
        const k = len === 0 ? 0 : s / len;
        return { x: x0 + (x1 - x0) * k, y: y0 + (y1 - y0) * k, nx, ny };
      },
    });
  };
  const arc = (cx: number, cy: number, a0: number, a1: number) => {
    const len = Math.abs(a1 - a0) * r;
    segs.push({
      len,
      at: (s) => {
        const a = a0 + (a1 - a0) * (len === 0 ? 0 : s / len);
        const dx = Math.cos(a);
        const dy = Math.sin(a);
        return { x: cx + dx * r, y: cy + dy * r, nx: dx, ny: dy };
      },
    });
  };
  straight(r, 0, w - r, 0, 0, -1);
  arc(w - r, r, -Math.PI / 2, 0);
  straight(w, r, w, h - r, 1, 0);
  arc(w - r, h - r, 0, Math.PI / 2);
  straight(w - r, h, r, h, 0, 1);
  arc(r, h - r, Math.PI / 2, Math.PI);
  straight(0, h - r, 0, r, -1, 0);
  arc(r, r, Math.PI, Math.PI * 1.5);
  const total = segs.reduce((a, g) => a + g.len, 0);
  const out: Walked[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    let s = (i / SAMPLES) * total;
    for (const g of segs) {
      if (s <= g.len) {
        out.push({ ...g.at(Math.max(0, s)), s: (i / SAMPLES) * total });
        break;
      }
      s -= g.len;
    }
  }
  return out;
}

/** Wavy outline path in pixel space. Pure — two summed sines along the perimeter. */
export function wavyOutlinePath(w: number, h: number, r: number, t: number, o: WaveOpts): string {
  const moved: Point[] = walkRoundedRect(w, h, r).map(({ x, y, nx, ny, s }) => {
    const off =
      o.amp1 * Math.sin(TAU * (s / o.wave1) + t * o.speed1) +
      o.amp2 * Math.sin(TAU * (s / o.wave2) - t * o.speed2);
    return { x: x + nx * off, y: y + ny * off };
  });
  return closedPath(moved);
}

/**
 * Live wavy outline for the search field, drawn on all four edges. Updates one
 * path attribute per frame via ref (no React re-renders); loop lives only
 * while mounted (i.e. while search is focused). Reduced motion draws one
 * frozen wave.
 */
export function SearchOutline({ lively }: { lively: boolean }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const livelyRef = useRef(lively);
  livelyRef.current = lively;

  useEffect(() => {
    const svg = svgRef.current;
    const path = pathRef.current;
    if (!svg || !path) return;
    const reduced =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let w = 0;
    let h = 0;
    const draw = (t: number, o: WaveOpts) => {
      if (w < 10 || h < 10) return;
      path.setAttribute("d", wavyOutlinePath(w, h, 20, t, o));
    };
    const measure = () => {
      const rect = svg.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
      if (reduced) draw(0, CALM_WAVE);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(svg);
    if (reduced) return () => ro.disconnect();

    let raf = 0;
    const t0 = performance.now();
    const frame = (ms: number) => {
      raf = requestAnimationFrame(frame);
      draw((ms - t0) / 1000, livelyRef.current ? LIVE_WAVE : CALM_WAVE);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return (
    <svg ref={svgRef} className="field-outline" aria-hidden="true" focusable="false">
      <path ref={pathRef} d="" />
    </svg>
  );
}
