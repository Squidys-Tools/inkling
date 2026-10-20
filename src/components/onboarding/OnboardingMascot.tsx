import { useEffect, useState, type CSSProperties } from "react";
import { InklingMascot } from "../mascot/InklingMascot";
import { prefersReducedMotion } from "../mascot/mascotStore";

/** How long each face holds before the next one glides in. */
const FACE_HOLD_MS = 3400;

/**
 * The large, cropped mascot on the first and last welcome screens. It drifts
 * and blinks like the sidebar one, and wanders through a few calm faces. It
 * owns its own engine, so the library's mascot keeps its clock and its face.
 */
export function OnboardingMascot({
  size,
  faces,
  look,
  speed = 1,
  style,
}: {
  size: number;
  faces: readonly string[];
  /** Where the eyes stay pointed (toward the screen's text) through every face. */
  look: { yaw: number; pitch: number };
  /** Playback rate of the animation and the face changes (1 = normal). */
  speed?: number;
  style?: CSSProperties;
}) {
  const [reduced] = useState(prefersReducedMotion);
  const [faceIndex, setFaceIndex] = useState(0);

  useEffect(() => {
    if (reduced || faces.length < 2) return;
    const timer = window.setInterval(
      () => setFaceIndex((index) => (index + 1) % faces.length),
      FACE_HOLD_MS / speed,
    );
    return () => window.clearInterval(timer);
  }, [faces, reduced, speed]);

  return (
    <div className="first-run-mascot" style={style} aria-hidden="true">
      <InklingMascot
        size={size}
        state="inkling-drift-faced"
        expression={faces[faceIndex]}
        ink="#2b2623"
        paper="#e5ddd2"
        playing={!reduced}
        look={look}
        speed={speed}
      />
    </div>
  );
}
