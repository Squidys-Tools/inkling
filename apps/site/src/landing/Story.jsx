import * as React from "react";
import { useInView } from "motion/react";
import { Reveal, useCalm, Questions } from "./ui";
import { Cast } from "./Cast";
import { ScrollPanels } from "./ScrollPanels";
const practical = [
  {
    id: "account",
    title: "Do I need an account?",
    body: "No account is needed for your local library. Your database and saved assets live on your own disk, not in a cloud library.",
  },
  {
    id: "offline",
    title: "What works offline?",
    body: "Your saved library and local search work on your computer. Saving a web page, fetching remote media, playing an online video or checking for an update needs an internet connection.",
  },
  {
    id: "spaces",
    title: "Do I need to file everything?",
    body: "Only if you want to. Regular Spaces are collections you curate. Smart Spaces collect items that match a saved search.",
  },
  {
    id: "export",
    title: "Can I take my library with me?",
    body: "The desktop app can export your library together with its assets.",
  },
];
function HomeCompanion() {
  const ref = React.useRef(null),
    visible = useInView(ref),
    calm = useCalm();
  return (
    <div ref={ref} className="paper-companion" aria-hidden="true">
      <Cast index={6} gaze="left" alive={visible && !calm} />
    </div>
  );
}
// Keep the long reading surface in normal paint. Section-sized animated
// clipping is unnecessary while scrolling answers; local text/face motion stays.
function CloseToHome() {
  return (
    <section id="privacy" className="close-to-home" aria-labelledby="privacy-heading">
      <div className="home-paper">
        <div className="frame">
          <div className="home-title">
            <Reveal>
              <h2 id="privacy-heading">
                Not in a cloud.
                <br />
                In your corner.
              </h2>
            </Reveal>
            <div className="home-companion">
              <HomeCompanion />
            </div>
          </div>
          <div className="home-explanation">
            <p>
              Your library lives on your computer.
              <br />A little less elsewhere. A little more yours.
            </p>
            <a className="text-link" href="https://github.com/Squidys-Tools/inkling">
              Look under the hood <span aria-hidden="true">↗</span>
            </a>
          </div>
          <div id="questions" className="practical-bottom">
            <h3>The good-to-knows.</h3>
            <Questions items={practical} />
          </div>
        </div>
      </div>
    </section>
  );
}
export function Story() {
  return (
    <div className="after-library">
      <section id="saving" className="curiosity-room" aria-labelledby="saving-heading">
        <div className="frame curiosity-heading">
          <Reveal>
            <h2 id="saving-heading">
              Keep what
              <br />
              catches you.
            </h2>
          </Reveal>
          <Reveal>
            <p>
              The picture you paused on.
              <br />
              The thought you almost lost.
              <br />
              There’s a place for that.
            </p>
          </Reveal>
        </div>
        <ScrollPanels />
      </section>
      <CloseToHome />
    </div>
  );
}
