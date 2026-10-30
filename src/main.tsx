import React, { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/libre-baskerville/400.css";
import "@fontsource/libre-baskerville/700.css";
import "@fontsource/libre-baskerville/400-italic.css";
import "@fontsource-variable/dm-sans/wght.css";
import "@fontsource/dm-mono/400.css";
import App from "./App";
import { AppRecovery } from "./components/AppRecovery";
import "./index.css";

// Dev-only mascot boards (vendored bloub engine + inkling skins), not linked
// from the UI: open with ?mascot or ?mascot-alive.
const search = new URLSearchParams(window.location.search);
const MascotDevBoard = search.has("mascot-alive")
  ? lazy(() =>
      import("./components/mascot/AliveBoard").then((module) => ({ default: module.AliveBoard })),
    )
  : search.has("mascot")
    ? lazy(() =>
        import("./components/mascot/MascotBoard").then((module) => ({
          default: module.MascotBoard,
        })),
      )
    : null;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AppRecovery>
      {MascotDevBoard ? (
        <Suspense fallback={null}>
          <MascotDevBoard />
        </Suspense>
      ) : (
        <App />
      )}
    </AppRecovery>
  </React.StrictMode>,
);
