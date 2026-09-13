import { useState } from "react";
import { InklingMascot, isKnownMascotState, type StateId } from "./InklingMascot";

const SHAPES = ["inkling-blot", "inkling-wobble", "inkling-splash", "cercle"];
const STATES: StateId[] = ["idle", "wink", "wide", "notify", "thinking", "sleep"];

/** Dev-only board. Open with ?mascot in the URL. Not linked from the app UI. */
export function MascotBoard() {
  const [shape, setShape] = useState("inkling-blot");
  const [state, setState] = useState<StateId>("idle");
  const [frozen, setFrozen] = useState(false);

  return (
    <div style={{ padding: 32, fontFamily: "system-ui, sans-serif", background: "#faf9f6", minHeight: "100vh" }}>
      <h1 style={{ fontSize: 20, marginBottom: 4 }}>Inkling mascot board</h1>
      <p style={{ color: "#6b6b6b", fontSize: 14, marginBottom: 16 }}>
        Vendored bloub engine + inkling skins. Shapes only apply on baseBody states; gaze
        follow is disabled on frozen frames.
      </p>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {SHAPES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setShape(s)}
            style={{
              padding: "6px 12px",
              borderRadius: 8,
              border: shape === s ? "2px solid #1a1a1a" : "1px solid #e8e6e1",
              background: "#fff",
              cursor: "pointer",
            }}
          >
            {s}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {STATES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => (isKnownMascotState(s) ? setState(s) : undefined)}
            style={{
              padding: "6px 12px",
              borderRadius: 8,
              border: state === s ? "2px solid #1a1a1a" : "1px solid #e8e6e1",
              background: "#fff",
              cursor: "pointer",
            }}
          >
            {s}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setFrozen((f) => !f)}
          style={{
            padding: "6px 12px",
            borderRadius: 8,
            border: "1px solid #e8e6e1",
            background: frozen ? "#1a1a1a" : "#fff",
            color: frozen ? "#fff" : "#1a1a1a",
            cursor: "pointer",
          }}
        >
          {frozen ? "frozen @1.0s" : "live"}
        </button>
      </div>
      <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ background: "#fff", borderRadius: 16, padding: 24 }}>
          <InklingMascot
            size={240}
            shape={shape}
            state={state}
            frozenAt={frozen ? 1.0 : undefined}
            playing={!frozen}
          />
        </div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          {STATES.map((s) => (
            <div key={s} style={{ textAlign: "center" }}>
              <div style={{ background: "#fff", borderRadius: 12, padding: 8 }}>
                <InklingMascot size={96} shape={shape} state={s} frozenAt={1.0} playing={false} />
              </div>
              <div style={{ fontSize: 12, color: "#6b6b6b", marginTop: 4 }}>{s}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
