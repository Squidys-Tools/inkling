import { applyRootStyles, registerFonts } from "@inkling/ui";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { desktop } from "./desktop.ts";
import { setSidebarOpen } from "./libraryView/viewState.ts";
import { followLibraryChanges, queryClient } from "./queryClient.ts";
import { preloadPagesWhenIdle, router } from "./router.tsx";
import { firstScreen } from "./shell/firstScreen.ts";

const root = document.getElementById("root");
if (!root) throw new Error("index.html has no #root");
applyRootStyles(root);
registerFonts();
followLibraryChanges();
// An open sidebar covers a phone-width library, so a narrow window starts on the compact rail.
if (matchMedia("(max-width: 780px)").matches) setSidebarOpen(false);

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);

// The window stays hidden until the screen it opens on has painted, so a first
// launch shows the welcome without flashing the library before it.
void firstScreen.then(() =>
  requestAnimationFrame(() => requestAnimationFrame(() => void desktop?.window.ready())),
);
preloadPagesWhenIdle();
