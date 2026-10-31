import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { desktop } from "../desktop.ts";
import { libraryClient } from "../library/connection.ts";

/**
 * Opens the welcome once, on the desktop app's first launch: when the library
 * says onboarding is not complete. A failed check counts as complete, so a
 * library error never traps the user in the welcome. The web preview never shows it.
 */
export function useFirstRun() {
  const navigate = useNavigate();
  useEffect(() => {
    if (!desktop) return;
    let cancelled = false;
    libraryClient()
      .then((client) => client.onboardingCompleted({}))
      .then(
        (completed) => {
          if (!cancelled && !completed) void navigate({ to: "/welcome", replace: true });
        },
        () => undefined,
      );
    return () => {
      cancelled = true;
    };
  }, [navigate]);
}
