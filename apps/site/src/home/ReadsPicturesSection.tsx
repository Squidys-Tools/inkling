import * as stylex from "@stylexjs/stylex";
import { ReadsPictures } from "../../../renderer/src/onboarding/ReadsPictures.tsx";
import { useReducedMotion } from "../../../renderer/src/mascot/motion.ts";
import { page } from "../layout/page.ts";
import { Stage } from "../parts/Stage.tsx";
import { type } from "../parts/type.ts";

// Where the demo sits on the welcome screen's stage.
const crop = { x: 524, y: 0, width: 428, height: 540 };

export function ReadsPicturesSection() {
  const reducedMotion = useReducedMotion();
  return (
    <section {...stylex.props(page.column, styles.section)}>
      <div {...stylex.props(styles.copy)}>
        <h2 {...stylex.props(type.heading)}>It reads your pictures, too.</h2>
        <p {...stylex.props(type.body)}>
          Words inside screenshots, photos and scanned PDFs are searchable. Remember one word from a
          receipt and the receipt comes back. The reading happens on your computer.
        </p>
        <p {...stylex.props(type.body)}>
          Search also goes by meaning, so <q>red apple</q> finds the photo you never captioned, and
          any picture can show you the ones that look like it.
        </p>
      </div>
      <div {...stylex.props(styles.demo)}>
        <Stage crop={crop}>
          <ReadsPictures reducedMotion={reducedMotion} />
        </Stage>
      </div>
    </section>
  );
}

const styles = stylex.create({
  section: {
    display: "grid",
    gridTemplateColumns: { default: "1fr 1fr", "@media (max-width: 860px)": "1fr" },
    gap: "48px",
    alignItems: "center",
  },
  copy: { display: "flex", flexDirection: "column", gap: "20px" },
  demo: { width: "100%", maxWidth: "428px", justifySelf: "center" },
});
