import { useEffect, useState, type CSSProperties } from "react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "./Breadcrumb";
import { KeptOrbit } from "./onboarding/KeptOrbit";
import { MemoryMatch } from "./onboarding/MemoryMatch";
import { OnboardingMascot } from "./onboarding/OnboardingMascot";
import { preloadOnboardingPhotos } from "./onboarding/onboardingMedia";
import { SplitText } from "./onboarding/SplitText";

const STAGE_WIDTH = 960;
const STAGE_HEIGHT = 540;
const LAST_SCREEN = 3;
/** Drawn size of the big cropped mascot at stage scale 1; the body is about 63% of it. */
const MASCOT_SIZE = 620;

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
          style={{ right: -0.2 * mascotSize, bottom: -0.3 * mascotSize }}
        />
      ) : null}
      {screen === LAST_SCREEN ? (
        <OnboardingMascot
          key="farewell"
          size={mascotSize}
          faces={farewellFaces}
          style={{ left: -0.22 * mascotSize, bottom: -0.3 * mascotSize }}
        />
      ) : null}

      <div
        key={screen}
        className="first-run-stage"
        style={{ transform: `translate(-50%, -50%) scale(${scale})` }}
      >
        {screen === 0 ? (
          <>
            <SplitText
              text="Drop something in."
              className="first-run-headline"
              style={{ left: 72, top: 156 }}
            />
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
          </>
        ) : null}

        {screen === 1 ? (
          <>
            <KeptOrbit />
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
              style={{ top: 311 }}
            />
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
            <SplitText
              text="It's all yours."
              className="first-run-headline"
              style={{ left: 500, top: 145 }}
            />
            <p className="first-run-body" style={{ left: 500, top: 214 }}>
              Your library lives on this computer, not in an
              <br />
              account. Export a full copy whenever you like.
              <br />
              inkling only goes online to fetch the links you save.
            </p>
            <Breadcrumb className="first-run-crumb" style={{ left: 500, top: 305 }}>
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
            {actions({ left: 500, top: 356 })}
          </>
        ) : null}
      </div>
    </div>
  );
}
