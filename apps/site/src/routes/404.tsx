import { createFileRoute } from "@tanstack/react-router";
import { NotFound } from "../layout/NotFound.tsx";

// Prerendered to 404.html, which Vercel serves for any path the site does not have.
export const Route = createFileRoute("/404")({
  head: () => ({
    meta: [{ title: "Not found · inkling" }, { name: "robots", content: "noindex" }],
  }),
  component: NotFound,
});
