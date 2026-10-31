import { createFileRoute } from "@tanstack/react-router";
import { NotFound } from "../layout/NotFound.tsx";

// Prerendered to 404.html, which Vercel serves at any path the site does not
// have. The router then shows the root's not-found page there, so this route
// adds no head tags of its own and the two hydrate as the same page.
export const Route = createFileRoute("/404")({ component: NotFound });
