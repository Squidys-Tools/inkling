import type { Plugin } from "vite";

/**
 * Serves `/demo/` from the dev server as production does. Vite's public folder
 * only matches exact files, so without this the request reaches the site's
 * router, which redirects it to `/demo` and answers 404.
 */
export function demoIndex(): Plugin {
  return {
    name: "inkling-demo-index",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.url === "/demo/") req.url = "/demo/index.html";
        next();
      });
    },
  };
}
