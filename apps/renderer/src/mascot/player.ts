import { BotEngine, type BotFrame } from "./bot/engine";
import { EXPRESSION_BY_ID, type BotExpression } from "./bot/expressions";
import { liveliness } from "./bot/face";
import type { Look } from "./bot/look";
import { RAYON } from "./bot/repere";
import { SHAPE_BY_ID } from "./bot/skins";
import type { StateId } from "./bot/states";
import type { MotionEnvironment } from "./motion.ts";

export type MascotPose = { state: StateId; expression: BotExpression["id"] };

type Painter = { paint: (frame: BotFrame) => void; visible: boolean; live: boolean };

/**
 * How long the figure keeps moving after something happens to it (shown, a
 * mood change, a pointer over it). Longer than any morph. After that an idle
 * figure rests on its last frame instead of repainting every display frame:
 * a 44px canvas kept the GPU process near full load while nothing changed.
 */
const WAKE_MS = 4000;

/** A long frame (a stall, a background tab) advances the clock by at most this. */
const MAX_STEP = 0.064;
// Longer than any state, shape, expression or look morph (0.8 s at most). Under
// reduced motion the clock stands still, so a change is dated this far back, or
// the frame would show the old pose at the start of its morph. Moving the clock
// instead would land on the blink calendar and could freeze the eyes shut.
const SETTLE = 1;

/**
 * Drives one bot engine and paints its frames on the canvases attached to it.
 * The frame loop runs only while a canvas is visible, the page is shown, motion
 * is allowed and the figure is awake or a `live` canvas shows; otherwise the
 * clock stops and changes paint once.
 */
export class MascotPlayer {
  private readonly engine: BotEngine;
  private readonly env: MotionEnvironment;
  private readonly painters = new Set<Painter>();
  private pose: MascotPose;
  private speed: number;
  private clock = 0;
  private frame: BotFrame;
  private handle = 0;
  private last = 0;
  private running = false;
  private awakeMs = 0;
  private stopListening: (() => void) | null = null;

  constructor(
    env: MotionEnvironment,
    pose: MascotPose,
    { speed = 1, look }: { speed?: number; look?: Look } = {},
  ) {
    this.env = env;
    this.pose = pose;
    this.speed = speed;
    this.engine = new BotEngine(
      RAYON,
      pose.state,
      SHAPE_BY_ID.get("inkling-splash")?.radii ?? null,
      EXPRESSION_BY_ID.get(pose.expression) ?? null,
    );
    // Dated before the clock starts, so the first frame already looks there.
    if (look) this.engine.setLook(look, -10);
    this.frame = this.engine.sample(0);
  }

  /**
   * Paints `paint` with every frame while it is visible; call `setVisible` once it is on screen.
   * A `live` canvas keeps the figure moving for as long as it is visible.
   */
  attach(paint: (frame: BotFrame) => void, { live = false }: { live?: boolean } = {}) {
    const painter: Painter = { paint, visible: false, live };
    this.painters.add(painter);
    this.stopListening ??= this.env.subscribe(() => this.refresh());
    return {
      setVisible: (visible: boolean) => {
        const shown = visible && !painter.visible;
        painter.visible = visible;
        if (visible) paint(this.frame);
        if (shown) this.wake();
        else this.sync();
      },
      detach: () => {
        this.painters.delete(painter);
        this.sync();
        if (this.painters.size > 0) return;
        this.stopListening?.();
        this.stopListening = null;
      },
    };
  }

  /** Keeps the figure moving for a while, e.g. while the pointer is over it. */
  wake(ms = WAKE_MS) {
    this.awakeMs = Math.max(this.awakeMs, ms);
    this.sync();
  }

  setPose(pose: MascotPose) {
    if (pose.state === this.pose.state && pose.expression === this.pose.expression) return;
    this.pose = pose;
    this.wake();
    const at = this.changeTime();
    this.engine.setState(pose.state, at);
    this.engine.setExpression(EXPRESSION_BY_ID.get(pose.expression) ?? null, at);
    this.settle();
  }

  setLook(look: Look | null) {
    this.wake();
    this.engine.setLook(look, this.changeTime());
    this.settle();
  }

  setSpeed(speed: number) {
    this.speed = speed;
  }

  /** Re-reads reduced motion and page visibility. */
  refresh() {
    this.sync();
    if (this.running) return;
    this.frame = this.engine.sample(this.clock);
    this.paintVisible();
  }

  private changeTime() {
    return !this.running && this.env.reducedMotion() ? this.clock - SETTLE : this.clock;
  }

  private settle() {
    if (this.running) return;
    this.frame = this.engine.sample(this.clock);
    this.paintVisible();
  }

  private sync() {
    const shown = [...this.painters].filter((painter) => painter.visible);
    const wanted =
      !this.env.reducedMotion() &&
      !this.env.hidden() &&
      shown.length > 0 &&
      // Finish a blink before resting, rather than freezing half-closed eyes.
      (this.awakeMs > 0 || shown.some((painter) => painter.live) || liveliness(this.clock).lid < 1);
    if (wanted === this.running) return;
    this.running = wanted;
    if (wanted) {
      this.last = 0;
      this.handle = this.env.requestFrame(this.tick);
    } else {
      this.env.cancelFrame(this.handle);
    }
  }

  private readonly tick = (ms: number) => {
    this.handle = this.env.requestFrame(this.tick);
    const elapsed = this.last ? ms - this.last : 0;
    const step = Math.min(elapsed / 1000, MAX_STEP);
    this.last = ms;
    this.clock += step * this.speed;
    this.frame = this.engine.sample(this.clock);
    this.paintVisible();
    this.awakeMs = Math.max(0, this.awakeMs - elapsed);
    // Rest on this frame once nothing keeps the figure awake.
    if (this.awakeMs === 0) this.sync();
  };

  private paintVisible() {
    for (const painter of this.painters) if (painter.visible) painter.paint(this.frame);
  }
}
