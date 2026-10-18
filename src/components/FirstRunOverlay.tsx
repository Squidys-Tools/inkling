import { useEffect, useState, type CSSProperties } from "react";

const STAGE_WIDTH = 960;
const STAGE_HEIGHT = 540;
const LAST_SCREEN = 3;

type Tile = { tone: string; x: number; y: number; w: number; h: number; blur?: boolean };

const keptTiles: Tile[] = [
  { tone: "#9a948c", x: 245, y: 20, w: 110, h: 110 },
  { tone: "#36362e", x: 10, y: 80, w: 70, h: 70, blur: true },
  { tone: "#838480", x: 410, y: 12, w: 60, h: 86, blur: true },
  { tone: "#6e6951", x: 513, y: 28, w: 134, h: 89 },
  { tone: "#464441", x: 668, y: 52, w: 94, h: 85 },
  { tone: "#483f39", x: 870, y: 73, w: 70, h: 72, blur: true },
  { tone: "#684228", x: 110, y: 128, w: 110, h: 74 },
  { tone: "#b56035", x: 67, y: 232, w: 89, h: 134 },
  { tone: "#99a8aa", x: 753, y: 170, w: 134, h: 89 },
  { tone: "#58503f", x: 797, y: 302, w: 95, h: 126 },
  { tone: "#503b2c", x: 206, y: 396, w: 76, h: 89 },
  { tone: "#676458", x: 282, y: 401, w: 97, h: 122 },
  { tone: "#c6b28a", x: 523, y: 435, w: 134, h: 89 },
  { tone: "#656f83", x: 702, y: 395, w: 67, h: 120 },
];

const heroBlotPath =
  "M385 35C350 20 320 25 290 22C240 16 200 0 160 2C110 6 80 45 70 85C60 125 40 150 15 190C-5 225-2 265 0 300V345H385Z";
const sideBlotPath =
  "M0 40C40 10 70 0 120 3C180 8 220 30 270 28C320 26 360 50 365 110C368 160 345 180 330 215C315 250 325 290 322 345H0Z";

function fitScale() {
  return Math.min(1, window.innerWidth / STAGE_WIDTH, window.innerHeight / STAGE_HEIGHT);
}

function InkBlot({
  left,
  path,
  width,
  pills,
}: {
  left: number;
  path: string;
  width: number;
  pills: [number, number];
}) {
  return (
    <svg
      className="first-run-blot"
      aria-hidden="true"
      style={{ left, width, height: 345 }}
      viewBox={`0 0 ${width} 345`}
    >
      <path className="first-run-blot-shape" d={path} />
      <rect className="first-run-blot-pill" x={pills[0]} y={148} width={60} height={131} rx={30} />
      <rect className="first-run-blot-pill" x={pills[1]} y={148} width={60} height={131} rx={30} />
    </svg>
  );
}

export function FirstRunOverlay({ onFinish }: { onFinish: () => void }) {
  const [screen, setScreen] = useState(0);
  const [scale, setScale] = useState(fitScale);

  useEffect(() => {
    const update = () => setScale(fitScale());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onFinish();
    };
    window.addEventListener("resize", update);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onFinish]);

  const advance = () => (screen === LAST_SCREEN ? onFinish() : setScreen(screen + 1));

  const actions = (style: CSSProperties) => (
    <div className="first-run-actions" style={style}>
      <button type="button" className="first-run-primary" onClick={advance}>
        {screen === LAST_SCREEN ? "Open my library" : "Continue"}
      </button>
      {screen > 0 ? (
        <button type="button" className="first-run-quiet" onClick={() => setScreen(screen - 1)}>
          Back
        </button>
      ) : null}
      <button type="button" className="first-run-quiet" onClick={onFinish}>
        Skip
      </button>
    </div>
  );

  return (
    <div
      className="first-run-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to inkling"
    >
      <div
        className="first-run-stage"
        style={{ transform: `translate(-50%, -50%) scale(${scale})` }}
      >
        {screen === 0 ? (
          <>
            <h1 className="first-run-headline" style={{ left: 72, top: 156 }}>
              Drop something in.
            </h1>
            <p className="first-run-body" style={{ left: 72, top: 221 }}>
              Paste a link, drop in a file, or grab a screenshot.
              <br />
              It&apos;s kept the moment it lands. No folders to pick.
            </p>
            <div className="first-run-keys" style={{ left: 72, top: 291 }}>
              <kbd>Ctrl</kbd>
              <kbd>V</kbd>
              <span>works anywhere in inkling</span>
            </div>
            {actions({ left: 72, top: 348 })}
            <InkBlot left={575} path={heroBlotPath} width={385} pills={[142, 267]} />
          </>
        ) : null}

        {screen === 1 ? (
          <>
            {keptTiles.map((tile) => (
              <div
                key={`${tile.x}-${tile.y}`}
                className={`first-run-tile${tile.blur ? " is-blurred" : ""}`}
                style={{
                  left: tile.x,
                  top: tile.y,
                  width: tile.w,
                  height: tile.h,
                  background: tile.tone,
                }}
              />
            ))}
            <h1 className="first-run-headline is-centered" style={{ top: 164 }}>
              Kept as it came.
            </h1>
            <p className="first-run-body is-centered" style={{ top: 232 }}>
              Articles, photos, PDFs, quotes, notes and posts each get
              <br />
              their own card, right away. Reading and indexing happen
              <br />
              quietly while you keep going.
            </p>
            {actions({ top: 337, left: 0, right: 0, justifyContent: "center" })}
          </>
        ) : null}

        {screen === 2 ? (
          <>
            <div className="first-run-card is-blurred-card" style={{ left: 204, top: 52 }}>
              <span className="first-run-card-art" />
              <span className="first-run-card-text">that red rocky place, maybe autumn</span>
            </div>
            <div className="first-run-card is-sharp-card" style={{ left: 588, top: 52 }} />
            <div className="first-run-connector" style={{ left: 396, top: 150 }}>
              <span className="first-run-connector-dot" />
            </div>
            <span className="first-run-caption" style={{ left: 204, top: 260 }}>
              half a memory
            </span>
            <span className="first-run-caption" style={{ left: 588, top: 260 }}>
              the one you meant
            </span>
            <h1 className="first-run-headline is-centered" style={{ top: 311 }}>
              Half a memory is enough.
            </h1>
            <p className="first-run-body is-centered" style={{ top: 375 }}>
              Describe it the way it comes back to you. Search runs on this
              <br />
              computer, so nothing you save leaves it.
            </p>
            {actions({ top: 448, left: 0, right: 0, justifyContent: "center" })}
          </>
        ) : null}

        {screen === 3 ? (
          <>
            <h1 className="first-run-headline" style={{ left: 500, top: 145 }}>
              It&apos;s all yours.
            </h1>
            <p className="first-run-body" style={{ left: 500, top: 214 }}>
              Your library lives on this computer, not in an
              <br />
              account. Export a full copy whenever you like.
              <br />
              inkling only goes online to fetch the links you save.
            </p>
            <p className="first-run-crumb" style={{ left: 500, top: 305 }}>
              Settings <span>›</span> Data <span>›</span> <em>Export a copy</em>
            </p>
            {actions({ left: 500, top: 356 })}
            <InkBlot left={0} path={sideBlotPath} width={365} pills={[37, 162]} />
          </>
        ) : null}
      </div>
    </div>
  );
}
