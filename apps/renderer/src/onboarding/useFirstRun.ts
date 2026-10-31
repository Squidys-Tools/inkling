import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { desktop } from "../desktop.ts";
import { libraryClient } from "../library/connection.ts";
import { firstScreenRendered } from "../shell/firstScreen.ts";

/**
 * Decides once per launch whether the window opens on the welcome: on the
 * desktop app's first launch, when the library says onboarding is not
 * complete. A failed check counts as complete, so a library error never traps
 * the user in the welcome. The web preview never shows it.
 */
export function useFirstRun() {
  const navigate = useNavigate();
  useEffect(() => {
    if (!desktop) {
      firstScreenRendered();
      return;
    }
    let cancelled = false;
    libraryClient()
      .then((client) => client.onboardingCompleted({}))
      .then(
        (completed) => {
          if (cancelled) return;
          // The welcome page reports its own first render.
          if (completed) firstScreenRendered();
          else void navigate({ to: "/welcome", replace: true });
        },
        () => {
          if (!cancelled) firstScreenRendered();
        },
      );
    return () => {
      cancelled = true;
    };
  }, [navigate]);
}
