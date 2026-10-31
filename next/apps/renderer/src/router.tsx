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

const routes = [
  page("/", () => import("./pages/LibraryPage.tsx"), "LibraryPage"),
  page("/space/$id", () => import("./pages/LibraryPage.tsx"), "LibraryPage"),
  page("/item/$id", () => import("./pages/ItemPage.tsx"), "ItemPage"),
  page("/add/note", () => import("./pages/AddNotePage.tsx"), "AddNotePage"),
  page("/add/quote", () => import("./pages/AddQuotePage.tsx"), "AddQuotePage"),
  page("/add/link", () => import("./pages/AddLinkPage.tsx"), "AddLinkPage"),
  page("/archive", () => import("./pages/ArchivePage.tsx"), "ArchivePage"),
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
