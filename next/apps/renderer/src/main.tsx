import { applyRootStyles, registerFonts } from "@inkling/ui";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { desktop } from "./desktop.ts";
import { preloadPagesWhenIdle, router } from "./router.tsx";

const root = document.getElementById("root");
if (!root) throw new Error("index.html has no #root");
applyRootStyles(root);
registerFonts();

createRoot(root).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);

// Show the window after the first frame with content has painted, not before.
requestAnimationFrame(() => requestAnimationFrame(() => void desktop?.window.ready()));
preloadPagesWhenIdle();
