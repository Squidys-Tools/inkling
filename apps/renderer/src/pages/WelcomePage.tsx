import { useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { desktop } from "../desktop.ts";
import { libraryClient } from "../library/connection.ts";
import { Welcome } from "../onboarding/Welcome.tsx";
import { firstScreenRendered } from "../shell/firstScreen.ts";

export function WelcomePage() {
  const router = useRouter();
  useEffect(firstScreenRendered, []);
  const finish = () => {
    if (desktop) {
      libraryClient()
        .then((client) => client.completeOnboarding({}))
        .catch(() => undefined);
    }
    // A replay from Settings returns there; the first run has nowhere to go back to.
    if (router.history.canGoBack()) router.history.back();
    else void router.navigate({ to: "/", replace: true });
  };
  return <Welcome onFinish={finish} />;
}
