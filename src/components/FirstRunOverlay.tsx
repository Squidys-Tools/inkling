import { useEffect, useState, type CSSProperties } from "react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "./Breadcrumb";
import { KeptFloating } from "./onboarding/KeptFloating";
import { MemoryMatch } from "./onboarding/MemoryMatch";
import { OnboardingMascot } from "./onboarding/OnboardingMascot";
import { preloadOnboardingPhotos } from "./onboarding/onboardingMedia";
import { ReadsPictures } from "./onboarding/ReadsPictures";
import { SplitText } from "./onboarding/SplitText";

const STAGE_WIDTH = 960;
const STAGE_HEIGHT = 540;
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
const FAREWELL_LOOK = { yaw: 30, pitch: 12 };
/** The big mascots run at this rate (1.8x slower), so they stay calm beside the text. */
const MASCOT_SPEED = 0.55;
/** "Half a memory" draws its whole stage this much larger; its content sits well inside the stage edges, so nothing crops. */
const MEMORY_ZOOM = 1.18;

const welcomeFaces = ["neutre", "curieux", "heureux", "attentif"] as const;
const farewellFaces = ["heureux", "neutre", "fier", "timide"] as const;

function fitScale() {
  return Math.min(1, window.innerWidth / STAGE_WIDTH, window.innerHeight / STAGE_HEIGHT);
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

  const mascotSize = MASCOT_SIZE * scale;

  return (
    <div
      className="first-run-overlay"
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
          style={{ left: -0.3 * mascotSize, bottom: -0.3 * mascotSize }}
        />
      ) : null}

      <div
        key={screen}
        className={
          screen === 0 || screen === LAST_SCREEN ? "first-run-stage is-large" : "first-run-stage"
        }
        style={{
          transform: `translate(-50%, -50%) scale(${screen === 2 ? scale * MEMORY_ZOOM : scale})`,
        }}
      >
        {screen === 0 ? (
          <>
            <SplitText
              text="Drop something in."
              className="first-run-headline"
              style={{ left: 24, top: 118 }}
            />
            <p className="first-run-body" style={{ left: 24, top: 203 }}>
              Paste a link, drop in a file, or grab a screenshot.
              <br />
              It&apos;s kept the moment it lands. No folders to pick.
            </p>
            <div className="first-run-keys" style={{ left: 24, top: 294 }}>
              <kbd>Ctrl</kbd>
              <kbd>V</kbd>
              <span>works anywhere in inkling</span>
            </div>
            {actions({ left: 24, top: 364 })}
          </>
        ) : null}

        {screen === 1 ? (
          <>
            <KeptFloating />
            <SplitText
              text="Kept as it came."
              className="first-run-headline is-centered"
              style={{ top: 164 }}
            />
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
            <MemoryMatch />
            <SplitText
              text="Half a memory is enough."
              className="first-run-headline is-centered"
              style={{ top: 312 }}
              delay={0.4}
            />
            <p className="first-run-body is-centered" style={{ top: 376 }}>
              Describe it the way it comes back to you. Search runs on this
              <br />
              computer, so nothing you save leaves it.
            </p>
            {actions({ top: 449, left: 0, right: 0, justifyContent: "center" })}
          </>
        ) : null}

        {screen === 3 ? (
          <>
            <ReadsPictures />
            <SplitText
              text="It reads your pictures, too."
              className="first-run-headline is-wrapped"
              style={{ left: 72, top: 92, width: 390 }}
              delay={0.45}
            />
            <p className="first-run-body" style={{ left: 72, top: 230 }}>
              Words inside screenshots, photos and PDFs are
              <br />
              searchable. Remember one word, find the whole
              <br />
              thing. All on this computer.
            </p>
            <div className="first-run-keys" style={{ left: 72, top: 336 }}>
              <kbd>Ctrl</kbd>
              <kbd>K</kbd>
              <span>to search from anywhere</span>
            </div>
            {actions({ left: 72, top: 386 })}
          </>
        ) : null}

        {screen === LAST_SCREEN ? (
          <>
            <SplitText
              text="It's all yours."
              className="first-run-headline"
              style={{ left: 400, top: 112 }}
            />
            <p className="first-run-body" style={{ left: 400, top: 197 }}>
              Your library lives on this computer, not in an
              <br />
              account. Export a full copy whenever you like.
              <br />
              inkling only goes online to fetch the links you save.
            </p>
            <Breadcrumb className="first-run-crumb" style={{ left: 400, top: 332 }}>
              <BreadcrumbList>
                <BreadcrumbItem>Settings</BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>Data</BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>Export a copy</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
            {actions({ left: 400, top: 388 })}
          </>
        ) : null}
      </div>
    </div>
  );
}
