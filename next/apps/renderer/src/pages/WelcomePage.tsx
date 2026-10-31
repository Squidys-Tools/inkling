import { useRouter } from "@tanstack/react-router";
import { desktop } from "../desktop.ts";
import { libraryClient } from "../library/connection.ts";
import { Welcome } from "../onboarding/Welcome.tsx";

export function WelcomePage() {
  const router = useRouter();
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
