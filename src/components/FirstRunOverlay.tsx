import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { prefersReducedMotion } from "./mascot/mascotStore";
import { KeptFloating } from "./onboarding/KeptFloating";
import { MemoryMatch } from "./onboarding/MemoryMatch";
import { OnboardingMascot } from "./onboarding/OnboardingMascot";
import { preloadOnboardingPhotos } from "./onboarding/onboardingMedia";
import { ReadsPictures } from "./onboarding/ReadsPictures";
import { SplitText } from "./onboarding/SplitText";
import "./onboarding/onboarding.css";

/**
 * Every screen is drawn on a 960x540 stage that keeps a fixed share of the
 * window: 1:1 at 1280x720 (or 1280x800), smaller below that, larger above it
 * up to a cap (about 1080p), past which more window only adds margin.
 */
const STAGE_FIT_WIDTH = 1280;
const STAGE_FIT_HEIGHT = 720;
const MAX_STAGE_SCALE = 1.35;
const LAST_SCREEN = 4;
/**
 * Drawn size of the big cropped mascot at stage scale 1; the body is about 63% of it.
 * Its centre sits 0.2 of this from the window's side and bottom edges. The body
 * never shrinks below 0.237 of it, so the blob keeps bleeding off both edges
 * however it breathes and turns.
 */
const MASCOT_SIZE = 860;
/** Eyes stay turned toward each screen's text (yaw + is right, pitch + is up). */
const WELCOME_LOOK = { yaw: -15, pitch: 24 };
const FAREWELL_LOOK = { yaw: 26, pitch: 12 };
/** The big mascots run at this rate (1.8x slower), so they stay calm beside the text. */
const MASCOT_SPEED = 0.55;
/** How long a screen takes to leave before the next one comes in; matches fr-stage-out in onboarding.css. */
const LEAVE_MS = 320;
/**
 * When each screen's headline starts, in seconds. Screens whose demo opens
 * the scene hold the headline back; the rest of the copy follows it.
 */
const HEADLINE_DELAY = [0.15, 0.2, 0.45, 0.45, 0.15];

const welcomeFaces = ["neutre", "curieux", "heureux", "attentif"] as const;
const farewellFaces = ["heureux", "neutre", "fier", "timide"] as const;

function CrumbSeparator() {
  return (
    <li aria-hidden="true" className="inline-flex opacity-80" role="presentation">
      <HugeiconsIcon icon={ArrowRight01Icon} size={14} />
    </li>
  );
}

function stageScale() {
  return Math.min(
    MAX_STAGE_SCALE,
    window.innerWidth / STAGE_FIT_WIDTH,
    window.innerHeight / STAGE_FIT_HEIGHT,
  );
}

export function FirstRunOverlay({ onFinish }: { onFinish: () => void }) {
  const [screen, setScreen] = useState(0);
  const [scale, setScale] = useState(stageScale);
  /** Set while the current screen plays its exit: 1 forward, -1 back, 0 closing. */
  const [leaving, setLeaving] = useState<number | null>(null);
  /** Which way the last move went, so the next screen comes in from that side. */
  const [direction, setDirection] = useState(1);
  const leaveTimer = useRef(0);

  useEffect(() => () => window.clearTimeout(leaveTimer.current), []);

  // Plays the current screen's exit, then lands on `next` (or closes the welcome).
  const go = (next: number | "close") => {
    if (leaving !== null) return;
    const step = next === "close" ? 0 : next > screen ? 1 : -1;
    const land = () => {
      setLeaving(null);
      if (next === "close") onFinish();
      else {
        setDirection(step);
        setScreen(next);
      }
    };
    if (prefersReducedMotion()) return land();
    setLeaving(step);
    leaveTimer.current = window.setTimeout(land, LEAVE_MS);
  };
  const goRef = useRef(go);
  useEffect(() => {
    goRef.current = go;
  });

  useEffect(() => {
    const update = () => setScale(stageScale());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") goRef.current("close");
    };
    window.addEventListener("resize", update);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  // First launch keeps the window hidden until this screen has painted, and
  // the later screens' photos decode meanwhile so none of them pop in.
  useEffect(() => {
    preloadOnboardingPhotos();
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(
        () => void window.inkling?.windowControls.ready().catch(() => null),
      );
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const advance = () => go(screen === LAST_SCREEN ? "close" : screen + 1);

  const actions = (style: CSSProperties) => (
    <div className="first-run-actions" style={style}>
      <button type="button" className="first-run-primary" onClick={advance}>
        {screen === LAST_SCREEN ? "Open my library" : "Continue"}
      </button>
      {screen > 0 ? (
        <button type="button" className="first-run-quiet" onClick={() => go(screen - 1)}>
          Back
        </button>
      ) : null}
      <button type="button" className="first-run-quiet" onClick={() => go("close")}>
        Skip
      </button>
    </div>
  );

  const mascotSize = MASCOT_SIZE * scale;

  return (
    <div
      className={leaving === 0 ? "first-run-overlay is-closing" : "first-run-overlay"}
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to inkling"
    >
      {/* The big mascot hangs off the window's corner, not the stage's, so it
          stays cropped by the window edge at any size. */}
      {screen === 0 ? (
        <OnboardingMascot
          key="welcome"
          size={mascotSize}
          faces={welcomeFaces}
          look={WELCOME_LOOK}
          speed={MASCOT_SPEED}
          side="right"
          leaving={leaving !== null}
          style={{ right: -0.3 * mascotSize, bottom: -0.3 * mascotSize }}
        />
      ) : null}
      {screen === LAST_SCREEN ? (
        <OnboardingMascot
          key="farewell"
          size={mascotSize}
          faces={farewellFaces}
          look={FAREWELL_LOOK}
          speed={MASCOT_SPEED}
          side="left"
          leaving={leaving !== null}
          style={{ left: -0.3 * mascotSize, bottom: -0.3 * mascotSize }}
        />
      ) : null}

      <div
        key={screen}
        className={leaving === null ? "first-run-stage" : "first-run-stage is-leaving"}
        style={
          {
            transform: `translate(-50%, -50%) scale(${scale})`,
            "--fr-dir": leaving === null ? direction : leaving,
            "--fr-copy-delay": `${HEADLINE_DELAY[screen] + 0.5}s`,
          } as CSSProperties
        }
      >
        {screen === 0 ? (
          <>
            <SplitText
              text="Drop something in."
              className="first-run-headline"
              style={{ left: 40, top: 128 }}
              delay={HEADLINE_DELAY[0]}
            />
            <p className="first-run-body" style={{ left: 40, top: 214 }}>
              Paste a link, drop in a file, or grab a screenshot.
              <br />
              It&apos;s kept the moment it lands. No folders to pick.
            </p>
            <div className="first-run-keys" style={{ left: 40, top: 300 }}>
              <kbd>Ctrl</kbd>
              <kbd>V</kbd>
              <span>works anywhere in inkling</span>
            </div>
            {actions({ left: 40, top: 362 })}
          </>
        ) : null}

        {screen === 1 ? (
          <>
            <KeptFloating />
            <SplitText
              text="Kept as it came."
              className="first-run-headline is-centered"
              style={{ top: 137 }}
              delay={HEADLINE_DELAY[1]}
            />
            <p className="first-run-body is-centered" style={{ top: 222 }}>
              Articles, photos, PDFs, quotes, notes and posts each get
              <br />
              their own card, right away. Reading and indexing happen
              <br />
              quietly while you keep going.
            </p>
            {actions({ top: 350, left: 0, right: 0, justifyContent: "center" })}
          </>
        ) : null}

        {screen === 2 ? (
          <>
            <MemoryMatch />
            <SplitText
              text="Half a memory is enough."
              className="first-run-headline is-centered"
              style={{ top: 326 }}
              delay={HEADLINE_DELAY[2]}
            />
            <p className="first-run-body is-centered" style={{ top: 408 }}>
              Describe it the way it comes back to you. Search runs on this
              <br />
              computer, so nothing you save leaves it.
            </p>
            {actions({ top: 492, left: 0, right: 0, justifyContent: "center" })}
          </>
        ) : null}

        {screen === 3 ? (
          <>
            <ReadsPictures />
            <SplitText
              text="It reads your pictures, too."
              className="first-run-headline is-wrapped"
              style={{ left: 24, top: 76, width: 440 }}
              delay={HEADLINE_DELAY[3]}
            />
            <p className="first-run-body" style={{ left: 24, top: 233 }}>
              Words inside screenshots, photos and PDFs are
              <br />
              searchable. Remember one word, find the whole
              <br />
              thing. All on this computer.
            </p>
            <div className="first-run-keys" style={{ left: 24, top: 352 }}>
              <kbd>Ctrl</kbd>
              <kbd>K</kbd>
              <span>to search from anywhere</span>
            </div>
            {actions({ left: 24, top: 414 })}
          </>
        ) : null}

        {screen === LAST_SCREEN ? (
          <>
            <SplitText
              text="It's all yours."
              className="first-run-headline"
              style={{ left: 400, top: 116 }}
              delay={HEADLINE_DELAY[4]}
            />
            <p className="first-run-body" style={{ left: 400, top: 202 }}>
              Your library lives on this computer, not in an
              <br />
              account. Export a full copy whenever you like.
              <br />
              inkling only goes online to fetch the links you save.
            </p>
            <nav
              aria-label="breadcrumb"
              className="first-run-crumb"
              style={{ left: 400, top: 322 }}
            >
              <ol className="m-0 flex list-none flex-wrap items-center gap-2 p-0 font-body text-[13px]/[1.4] text-muted">
                <li className="inline-flex items-center gap-1.5">Settings</li>
                <CrumbSeparator />
                <li className="inline-flex items-center gap-1.5">Data</li>
                <CrumbSeparator />
                <li className="inline-flex items-center gap-1.5">
                  <span aria-current="page" className="text-accent">
                    Export a copy
                  </span>
                </li>
              </ol>
            </nav>
            {actions({ left: 400, top: 378 })}
          </>
        ) : null}
      </div>
    </div>
  );
}
