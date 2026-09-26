import { useEffect, useRef, useState, type CSSProperties } from "react";
import { MascotHomeSlot } from "./MascotHomeSlot";
import { MascotRoamLayer } from "./MascotRoamLayer";
import {
  getRoamState,
  roamAwakeLeft,
  setRoamManual,
  setRoamSeed,
  setRoamSpeed,
  stepRoam,
  useRoam,
} from "./roamStore";
import { MASCOT_SIZE } from "./safeSpots";

/**
 * Dev-only board for the wandering mascot. Open with ?mascot-roam.
 *
 * It renders the real app skeleton — same class names, same padding, same
 * capture bar — so the mascot is measured and placed against the geometry it
 * will really meet, then drives the same controller the app uses. Nothing here
 * is wired into the product.
 */

const CARD_TONES = ["#2a2724", "#1d1b19", "#332f2a", "#211f1c", "#2c2926"];

function FakeCard({ index }: { index: number }) {
  return (
    <div className="library-card-slot" style={{ paddingBottom: 14 }}>
      <div className="library-card" style={{ height: 321, background: CARD_TONES[index % CARD_TONES.length] }}>
        <div style={{ padding: 14, display: "grid", gap: 8 }}>
          <span className="card-kicker" style={{ fontSize: 10, letterSpacing: ".12em", color: "#8d867c", textTransform: "uppercase" }}>
            {["image", "article", "pdf", "note", "quote"][index % 5]}
          </span>
          <span style={{ fontSize: 15, lineHeight: 1.3, color: "#e5ddd2" }}>
            Card {index + 1} in a library the mascot may walk through
          </span>
        </div>
      </div>
    </div>
  );
}

interface Line {
  id: number;
  text: string;
}

const SPEEDS = [1, 10, 60, 240];

export function RoamBoard() {
  const roam = useRoam();
  const [lines, setLines] = useState<Line[]>([]);
  const [speed, setSpeed] = useState(10);
  const [manual, setManual] = useState(false);
  const [seed, setSeed] = useState(7);
  const nextId = useRef(1);
  const last = roam.last;

  // A board that waited out the real 90 seconds would be useless, so it starts
  // with the clock sped up and a seed, both of which production never sets.
  useEffect(() => {
    setRoamSpeed(10);
    setRoamSeed(7);
  }, []);

  // One line per decision, so a walk can be read like a sentence.
  useEffect(() => {
    if (!last) return;
    setLines((current) =>
      [
        { id: nextId.current++, text: `${last.kind} → ${last.target} · ${last.expression}` },
        ...current,
      ].slice(0, 12),
    );
  }, [last]);

  return (
    <div className="app-shell" style={{ display: "block", overflow: "auto", height: "100vh" }}>
      <aside className="sidebar is-open" style={{ position: "fixed", height: "100vh" }}>
        <div className="brand-lockup">
          <MascotHomeSlot isSearchFocused={false} />
          <div>
            <strong>inkling</strong>
          </div>
        </div>
      </aside>

      <main className="main-content" style={{ marginLeft: 248, height: "100vh" }}>
        <section className="library-header" />
        <div className="capture-bar" style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <div className="search-field" style={{ flex: 1, height: 50, border: "1px solid #4a4842", borderRadius: 12 }} />
          <div className="add-button" style={{ height: 50, padding: "0 17px" }}>
            Add
          </div>
        </div>
        <div className="library-toolbar" style={{ display: "flex", justifyContent: "space-between", padding: "16px 0 10px" }}>
          <span className="result-count">28 items</span>
        </div>
        <div className="library-scroll" style={{ flex: 1, minHeight: 0, position: "relative" }}>
          <div
            className="library-grid"
            style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, 257px)", gap: 14 }}
          >
            {Array.from({ length: 28 }, (_, index) => (
              <FakeCard key={index} index={index} />
            ))}
          </div>
        </div>
      </main>

      <div
        style={{
          position: "fixed",
          right: 16,
          bottom: 16,
          zIndex: 20,
          width: 320,
          padding: 16,
          borderRadius: 16,
          border: "1px solid #3b3934",
          background: "#141311",
          color: "#e5ddd2",
          font: "12px/1.5 'DM Sans', system-ui, sans-serif",
        }}
      >
        <strong style={{ display: "block", marginBottom: 8 }}>Wandering mascot</strong>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          <button type="button" onClick={stepRoam} style={button}>
            Leave now
          </button>
          <button
            type="button"
            onClick={() => {
              const next = !manual;
              setManual(next);
              setRoamManual(next);
            }}
            style={button}
          >
            {manual ? "Run free" : "Step mode"}
          </button>
          <button
            type="button"
            disabled={!manual}
            onClick={stepRoam}
            style={{ ...button, opacity: manual ? 1 : 0.4 }}
          >
            Step
          </button>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 10 }}>
          <span style={{ color: "#8d867c" }}>Speed</span>
          {SPEEDS.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setSpeed(value);
                setRoamSpeed(value);
              }}
              style={{ ...button, opacity: speed === value ? 1 : 0.5 }}
            >
              ×{value}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 10 }}>
          <span style={{ color: "#8d867c" }}>Seed</span>
          <input
            type="number"
            value={seed}
            onChange={(event) => {
              const value = Number(event.target.value);
              setSeed(value);
              if (Number.isFinite(value)) setRoamSeed(value);
            }}
            style={{ width: 70, background: "#1d1b19", border: "1px solid #3b3934", borderRadius: 6, color: "#e5ddd2", padding: "4px 6px" }}
          />
          <span style={{ color: "#8d867c" }}>· {seed} in use</span>
        </div>
        <div style={{ color: "#8d867c", marginBottom: 8 }}>
          away {String(roam.away)} · phase {roam.phase} · mood {getRoamState()?.mood ?? "—"} · stops {roam.stops} ·
          awake {(roamAwakeLeft() / 1000).toFixed(1)}s · {manual ? "manual" : "auto"} · {MASCOT_SIZE}px
        </div>
        <ol style={{ margin: 0, paddingLeft: 18, color: "#c9c2b6" }}>
          {lines.map((line) => (
            <li key={line.id}>{line.text}</li>
          ))}
        </ol>
      </div>

      <MascotRoamLayer />
    </div>
  );
}

const button: CSSProperties = {
  padding: "5px 9px",
  borderRadius: 8,
  border: "1px solid #3b3934",
  background: "#1d1b19",
  color: "#e5ddd2",
  cursor: "pointer",
  font: "inherit",
};
