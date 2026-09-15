import { closedPath, type Point } from "./bot/shape";

export interface WaveOpts {
  amp1: number;
  wave1: number;
  amp2: number;
  wave2: number;
  speed1: number;
  speed2: number;
}

export const CALM_WAVE: WaveOpts = { amp1: 1.2, wave1: 320, amp2: 0.5, wave2: 130, speed1: 0.7, speed2: 1.1 };
export const LIVE_WAVE: WaveOpts = { amp1: 2.0, wave1: 300, amp2: 0.8, wave2: 120, speed1: 1.8, speed2: 2.6 };

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

/**
 * Wavy outline path in pixel space. Pure — two summed sines along the
 * perimeter. `gain` eases the whole wave 0 (straight) to 1 (full).
 */
export function wavyOutlinePath(w: number, h: number, r: number, t: number, o: WaveOpts, gain = 1): string {
  const moved: Point[] = walkRoundedRect(w, h, r).map(({ x, y, nx, ny, s }) => {
    const off =
      gain *
      (o.amp1 * Math.sin(TAU * (s / o.wave1) + t * o.speed1) +
        o.amp2 * Math.sin(TAU * (s / o.wave2) - t * o.speed2));
    return { x: x + nx * off, y: y + ny * off };
  });
  return closedPath(moved);
}
