import * as stylex from "@stylexjs/stylex";
import { createFileRoute } from "@tanstack/react-router";
import { useReducedMotion } from "../../../renderer/src/mascot/motion.ts";
import { MemoryMatch } from "../../../renderer/src/onboarding/MemoryMatch.tsx";
import { CardKinds } from "../features/CardKinds.tsx";
import { Shortcuts } from "../features/Shortcuts.tsx";
import { Spaces } from "../features/Spaces.tsx";
import { DownloadBand } from "../home/DownloadBand.tsx";
import { page } from "../layout/page.ts";
import { Stage } from "../parts/Stage.tsx";
import { type } from "../parts/type.ts";

export const Route = createFileRoute("/features")({
  head: () => ({ meta: [{ title: "Features · inkling" }] }),
  component: Features,
});

// The two cards of the welcome screen's memory demo.
const memoryCrop = { x: 115, y: 0, width: 730, height: 320 };

function Features() {
  const reducedMotion = useReducedMotion();
  return (
    <main {...stylex.props(styles.main)}>
      <section {...stylex.props(page.column, styles.intro)}>
        <h1 {...stylex.props(type.display, styles.title)}>Everything gets its own card.</h1>
        <p {...stylex.props(type.lede)}>
          inkling looks at what you saved and draws it the way it should look: a photo as a photo, a
          quote as a quote, an article as a page you can read later.
        </p>
      </section>

      <section {...stylex.props(page.column)}>
        <CardKinds />
      </section>

      <section {...stylex.props(page.column, styles.split)}>
        <div {...stylex.props(styles.copy)}>
          <h2 {...stylex.props(type.heading)}>Half a memory is enough.</h2>
          <p {...stylex.props(type.body)}>
            Describe it the way it comes back to you. inkling searches the words you saved, the
            words inside your pictures, and what things are about, so a search for orange cliffs
            finds the photo you never named.
          </p>
          <p {...stylex.props(type.body)}>Open any image to see the ones that look like it.</p>
        </div>
        <Stage crop={memoryCrop}>
          <MemoryMatch reducedMotion={reducedMotion} />
        </Stage>
      </section>

      <section {...stylex.props(page.column, styles.split)}>
        <div {...stylex.props(styles.copy)}>
          <h2 {...stylex.props(type.heading)}>Spaces that fill themselves.</h2>
          <p {...stylex.props(type.body)}>
            A Smart Space is a search you keep. Save one for everything tagged reference and new
            references show up in it on their own. Name one after a subject, like Cats, and it
            gathers the photos with cats in them.
          </p>
          <p {...stylex.props(type.body)}>
            When you would rather choose, a regular Space holds exactly the things you put in it.
            Deleting a Space never deletes what was in it.
          </p>
        </div>
        <Spaces />
      </section>

      <section {...stylex.props(page.column, styles.stack)}>
        <h2 {...stylex.props(type.heading)}>Made for the keyboard.</h2>
        <p {...stylex.props(type.body)}>
          Everything has a shortcut, and search is always one key away.
        </p>
        <Shortcuts />
      </section>

      <DownloadBand />
    </main>
  );
}

const styles = stylex.create({
  main: {
    display: "flex",
    flexDirection: "column",
    gap: { default: "128px", "@media (max-width: 640px)": "88px" },
    paddingTop: "72px",
  },
  intro: { display: "flex", flexDirection: "column", gap: "28px", marginBottom: "-64px" },
  title: { maxWidth: "13ch" },
  split: {
    display: "grid",
    gridTemplateColumns: { default: "1fr 1fr", "@media (max-width: 860px)": "1fr" },
    gap: "48px",
    alignItems: "center",
  },
  copy: { display: "flex", flexDirection: "column", gap: "20px" },
  stack: { display: "flex", flexDirection: "column", gap: "20px" },
});
