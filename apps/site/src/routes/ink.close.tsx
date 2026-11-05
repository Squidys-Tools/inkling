import * as stylex from "@stylexjs/stylex";
import { inkClose } from "@inkling/ui/tokens.stylex";
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
  component: Preview,
});

// The root layout wraps every page but the landing in the dark header and footer; the
// preview covers them so the light section is seen alone, without touching the layout.
function Preview() {
  return (
    <div {...stylex.props(styles.stage)}>
      <CloseSection />
    </div>
  );
}

const styles = stylex.create({
  stage: {
    position: "fixed",
    inset: 0,
    zIndex: 100,
    overflowY: "auto",
    overscrollBehavior: "contain",
    backgroundColor: inkClose.water,
  },
});
