import { createFileRoute } from "@tanstack/react-router";
import { CloseSection } from "../ink/close/CloseSection.tsx";
import { seo } from "../layout/seo.ts";

export const Route = createFileRoute("/ink/close")({
  head: () =>
    seo({
      title: "Keep what matters · inkling",
      description:
        "A drop of ink in still water: the closing section of the inkling site, as a prototype.",
      path: "/ink/close",
    }),
  component: CloseSection,
});
