import { createFileRoute } from "@tanstack/react-router";
import { Develop } from "../ink/develop/Develop.tsx";
import { seo } from "../layout/seo.ts";

export const Route = createFileRoute("/ink/develop")({
  head: () =>
    seo({
      title: "Describe it · inkling",
      description: "Describe it. That's the search.",
      path: "/ink/develop",
    }),
  component: Develop,
});
