import { applyRootStyles, registerFonts } from "@inkling/ui";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { desktop } from "./desktop.ts";
import { preloadPagesWhenIdle, router } from "./router.tsx";
import { firstScreen } from "./shell/firstScreen.ts";

const root = document.getElementById("root");
if (!root) throw new Error("index.html has no #root");
applyRootStyles(root);
registerFonts();

createRoot(root).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);

// The window stays hidden until the screen it opens on has painted, so a first
// launch shows the welcome without flashing the library before it.
void firstScreen.then(() =>
  requestAnimationFrame(() => requestAnimationFrame(() => void desktop?.window.ready())),
);
preloadPagesWhenIdle();
