import { useEffect, useMemo, useRef, useState } from "react";
import { BotEngine, type BotFrame } from "./bot/engine";
import { EXPRESSION_BY_ID } from "./bot/expressions";
import { SHAPE_BY_ID } from "./bot/skins";
import { RAYON } from "./bot/repere";
import { InklingMascot, type StateId } from "./InklingMascot";
import { MascotFigure } from "./MascotFigure";

function Tile({ title, body, children }: { title: string; body: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#fff", borderRadius: 16, padding: 20, width: 280 }}>
      <div style={{ display: "flex", justifyContent: "center", padding: "8px 0 16px" }}>{children}</div>
      <div style={{ fontSize: 15, fontWeight: 650 }}>{title}</div>
      <div style={{ fontSize: 13, color: "#6b6b6b", marginTop: 4, lineHeight: 1.45 }}>{body}</div>
    </div>
  );
}

const SOCIAL_LOOP: StateId[] = ["idle", "wink", "wide", "sleep"];

function SocialTile() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setI((v) => (v + 1) % SOCIAL_LOOP.length), 3000);
    return () => window.clearInterval(id);
  }, []);
  return <InklingMascot size={160} state={SOCIAL_LOOP[i]} />;
}

function MorphTile() {
  return <InklingMascot size={160} state="inkling-drift" />;
}

function WatcherTile() {
  const boxRef = useRef<HTMLDivElement>(null);
  const clockRef = useRef(0);
  const engine = useMemo(
    () =>
      new BotEngine(
        RAYON,
        "idle",
        SHAPE_BY_ID.get("inkling-splash")?.radii ?? null,
        EXPRESSION_BY_ID.get("neutre") ?? null,
      ),
    [],
  );
  const [frame, setFrame] = useState<BotFrame>(() => engine.sample(0));

  useEffect(() => {
    let raf = 0;
    let last = 0;
    let clock = 0;
    const tick = (ms: number) => {
      raf = requestAnimationFrame(tick);
      const dt = last ? Math.min((ms - last) / 1000, 0.064) : 0;
      last = ms;
      clock += dt;
      clockRef.current = clock;
      setFrame(engine.sample(clock));
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [engine]);

  return (
    <div
      ref={boxRef}
      style={{ cursor: "crosshair" }}
      onPointerMove={(e) => {
        if (e.pointerType === "touch") return;
        const box = boxRef.current?.getBoundingClientRect();
        if (!box || box.width === 0) return;
        const nx = Math.max(-1, Math.min(1, (e.clientX - (box.left + box.width / 2)) / Math.max(1, window.innerWidth / 2)));
        const ny = Math.max(-1, Math.min(1, (e.clientY - (box.top + box.height / 2)) / Math.max(1, window.innerHeight / 2)));
        engine.setLook({ yaw: nx * 35, pitch: ny * 22, mix: 0.85, spin: 0, wander: 0.2 }, clockRef.current);
      }}
      onPointerLeave={() => engine.setLook(null, clockRef.current)}
    >
      <MascotFigure frame={frame} size={160} ink="#1a1a1a" paper="#ffffff" />
    </div>
  );
}

/**
 * Dev-only aliveness variations. Open with ?mascot-alive in the URL.
 * Nothing here is wired into the app — pick a direction first.
 */
export function AliveBoard() {
  return (
    <div style={{ padding: 32, fontFamily: "system-ui, sans-serif", background: "#faf9f6", minHeight: "100vh" }}>
      <h1 style={{ fontSize: 20, marginBottom: 4 }}>Splash aliveness variations</h1>
      <p style={{ color: "#6b6b6b", fontSize: 14, marginBottom: 16, maxWidth: 640 }}>
        Five ways to make the sidebar body live. Sway and jelly are new looping engine states;
        the rest reuse measured states and pointer tracking. Move your cursor over the watcher.
      </p>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <Tile
          title="1 · Slow sway"
          body="New inkling-sway state: the blot rotates ±6° over 6s with a faint vertical breath. Always on, never distracting."
        >
          <InklingMascot size={160} state="inkling-sway" />
        </Tile>
        <Tile
          title="2 · Jelly"
          body="New inkling-jelly state: squash and stretch peaking every 2.4s, volume-preserving. Cute, but the busiest option."
        >
          <InklingMascot size={160} state="inkling-jelly" />
        </Tile>
        <Tile
          title="3 · Social loop"
          body="No new engine code: cycles idle → wink → wide → sleep every 3s. Alive through behavior; the sidebar would visibly perform."
        >
          <SocialTile />
        </Tile>
        <Tile
          title="4 · Watcher"
          body="No new engine code: the eyes track your cursor (engine gaze-follow, already built for this). Most alive, most attention-seeking."
        >
          <WatcherTile />
        </Tile>
        <Tile
          title="5 · Slow spin"
          body="New inkling-drift state: one full turn every 24s under a still face. Ink stirring, not mascot spinning."
        >
          <MorphTile />
        </Tile>
      </div>
    </div>
  );
}
