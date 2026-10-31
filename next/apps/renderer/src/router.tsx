import {
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
} from "@tanstack/react-router";
import { AppShell } from "./shell/AppShell.tsx";

const root = createRootRoute({ component: AppShell });
const page = <const Path extends string>(
  path: Path,
  load: () => Promise<Record<string, unknown>>,
  name: string,
) => createRoute({ getParentRoute: () => root, path, component: lazyRouteComponent(load, name) });

// The library grid stays mounted under every page in the stage (see AppShell),
// so "/", "/space/$id" and "/archive" only choose what it shows, and closing
// an item returns to the same scroll position.
const routes = [
  page("/", () => import("./pages/LibraryRoute.tsx"), "LibraryRoute"),
  page("/space/$id", () => import("./pages/LibraryRoute.tsx"), "LibraryRoute"),
  page("/archive", () => import("./pages/LibraryRoute.tsx"), "LibraryRoute"),
  page("/item/$id", () => import("./pages/ItemPage.tsx"), "ItemPage"),
  page("/item/$id/read", () => import("./pages/ReaderPage.tsx"), "ReaderPage"),
  page("/item/$id/write", () => import("./pages/FocusPage.tsx"), "FocusPage"),
  page("/add/note", () => import("./pages/AddNotePage.tsx"), "AddNotePage"),
  page("/add/quote", () => import("./pages/AddQuotePage.tsx"), "AddQuotePage"),
  page("/add/link", () => import("./pages/AddLinkPage.tsx"), "AddLinkPage"),
  page("/settings/$section", () => import("./pages/SettingsPage.tsx"), "SettingsPage"),
  page("/welcome", () => import("./pages/WelcomePage.tsx"), "WelcomePage"),
  page("/dev/design", () => import("./pages/DesignPage.tsx"), "DesignPage"),
] as const;

// Hash history works on app://local/index.html and on the web preview alike.
export const router = createRouter({
  routeTree: root.addChildren(routes),
  history: createHashHistory(),
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

/** Loads every page's code once the app is idle, so no first visit waits on a chunk. */
export function preloadPagesWhenIdle() {
  requestIdleCallback(() => {
    for (const route of routes) void router.loadRouteChunk(route);
  });
}
