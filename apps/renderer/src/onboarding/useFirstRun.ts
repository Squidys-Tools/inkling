import { useQuery } from "@tanstack/react-query";
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
  // Keyed outside "library", so a restore or a library restart never asks again.
  const onboarding = useQuery({
    queryKey: ["onboardingCompleted"],
    queryFn: async () => (await libraryClient()).onboardingCompleted({}),
    enabled: desktop !== undefined,
  });
  const welcome = onboarding.data === false;
  const decided = !desktop || !onboarding.isPending;
  useEffect(() => {
    if (!decided) return;
    // The welcome page reports its own first render.
    if (welcome) void navigate({ to: "/welcome", replace: true });
    else firstScreenRendered();
  }, [decided, welcome, navigate]);
}
