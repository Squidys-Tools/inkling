import { gsap } from "gsap";
import type { LibraryItem } from "../../lib/types";
import { type FlightRect, OVERLAY_EASE, OVERLAY_FLIGHT_MS } from "./overlayMotion";

export type Flight =
  | { kind: "open"; id: number; from: FlightRect; to: FlightRect; progress: number }
  | {
      kind: "close";
      id: number;
      fromItem: LibraryItem;
      from: FlightRect;
      to: FlightRect | null;
      thenOpen: boolean;
    }
  /** Shrinks and fades where it is, then archives the item. */
  | { kind: "archive"; id: number; fromItem: LibraryItem; from: FlightRect; to: FlightRect };

// The settled view's corners match the library frame it covers.
const FRAME_RADIUS = "16px 0px 0px 16px";

// One timeline owns the frame, stage inset and inspector in both directions.
export function playFlight(dialog: HTMLElement, flight: Flight, onComplete: () => void) {
  const cardRadius = getComputedStyle(dialog).getPropertyValue("--radius-sidebar").trim() || "14px";
  const cardCorners = `${cardRadius} ${cardRadius} ${cardRadius} ${cardRadius}`;
  const duration = OVERLAY_FLIGHT_MS / 1000;
  const timeline = gsap.timeline({ onComplete });

  if (flight.kind === "open") {
    return timeline
      .fromTo(
        dialog,
        { ...flight.from, borderRadius: cardCorners, "--item-progress": flight.progress },
        {
          ...flight.to,
          "--item-progress": 1,
          borderRadius: FRAME_RADIUS,
          duration,
          ease: OVERLAY_EASE,
          autoRound: false,
        },
        0,
      )
      .fromTo(dialog, { opacity: 0 }, { opacity: 1, duration: 0.12, ease: "power1.out" }, 0);
  }

  // Closing: the view returns to its source card and dissolves into it, or —
  // when the source card is no longer mounted — fades out in place.
  if (!flight.to) return timeline.to(dialog, { opacity: 0, duration: 0.25, ease: "power1.in" });
  timeline.fromTo(
    dialog,
    { ...flight.from },
    {
      ...flight.to,
      "--item-progress": 0,
      borderRadius: cardCorners,
      duration,
      ease: OVERLAY_EASE,
      autoRound: false,
    },
    0,
  );
  return flight.kind === "archive"
    ? timeline.to(
        dialog,
        { opacity: 0, duration: duration * 0.7, ease: "power1.in" },
        duration * 0.3,
      )
    : timeline.to(dialog, { opacity: 0, duration: 0.18, ease: "power1.in" }, duration - 0.18);
}

// Where an open flight leaves the view.
export function settleFlight(dialog: HTMLElement, rect: FlightRect) {
  gsap.set(dialog, { ...rect, opacity: 1, borderRadius: FRAME_RADIUS, "--item-progress": 1 });
}
