import { BotEngine, type BotFrame } from "./bot/engine";
import { EXPRESSION_BY_ID, type BotExpression } from "./bot/expressions";
import type { Look } from "./bot/look";
import { RAYON } from "./bot/repere";
import { SHAPE_BY_ID } from "./bot/skins";
import type { StateId } from "./bot/states";
import type { MotionEnvironment } from "./motion.ts";

export type MascotPose = { state: StateId; expression: BotExpression["id"] };

type Painter = { paint: (frame: BotFrame) => void; visible: boolean };

/** A long frame (a stall, a background tab) advances the clock by at most this. */
const MAX_STEP = 0.064;
// Longer than any state, shape, expression or look morph (0.8 s at most). Under
// reduced motion the clock stands still, so a change is dated this far back, or
// the frame would show the old pose at the start of its morph. Moving the clock
// instead would land on the blink calendar and could freeze the eyes shut.
const SETTLE = 1;

/**
 * Drives one bot engine and paints its frames on the canvases attached to it.
 * The frame loop runs only while a canvas is visible, the page is shown and
 * reduced motion is off; otherwise the clock stops and changes paint once.
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

  /** Paints `paint` with every frame while it is visible; call `setVisible` once it is on screen. */
  attach(paint: (frame: BotFrame) => void) {
    const painter: Painter = { paint, visible: false };
    this.painters.add(painter);
    this.stopListening ??= this.env.subscribe(() => this.refresh());
    return {
      setVisible: (visible: boolean) => {
        painter.visible = visible;
        if (visible) paint(this.frame);
        this.sync();
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

  setPose(pose: MascotPose) {
    if (pose.state === this.pose.state && pose.expression === this.pose.expression) return;
    this.pose = pose;
    const at = this.changeTime();
    this.engine.setState(pose.state, at);
    this.engine.setExpression(EXPRESSION_BY_ID.get(pose.expression) ?? null, at);
    this.settle();
  }

  setLook(look: Look | null) {
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
    const wanted =
      !this.env.reducedMotion() &&
      !this.env.hidden() &&
      [...this.painters].some((painter) => painter.visible);
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
    const step = this.last ? Math.min((ms - this.last) / 1000, MAX_STEP) : 0;
    this.last = ms;
    this.clock += step * this.speed;
    this.frame = this.engine.sample(this.clock);
    this.paintVisible();
  };

  private paintVisible() {
    for (const painter of this.painters) if (painter.visible) painter.paint(this.frame);
  }
}
