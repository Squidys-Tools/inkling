import * as React from "react";
import { GitHubLogoIcon } from "@radix-ui/react-icons";
import { useInView } from "motion/react";
import { Cast } from "./Cast";
import { Button, useCalm } from "./ui";
import { DownloadButton } from "./DownloadButton";
const repository = "https://github.com/Squidys-Tools/inkling";
function Brand() {
  return (
    <a className="brand" href="/" aria-label="inkling home">
      <img src="/media/inkling-mark.png" width="512" height="512" alt="" />
      <span>inkling</span>
    </a>
  );
}
export function Download({ compact = false }) {
  return <DownloadButton compact={compact} href={`${repository}/releases`} />;
}
export function Header() {
  return (
    <header className="site-header frame">
      <Brand />
      <nav aria-label="Main">
        <a href="/#library">The library</a>
        <a href="/#privacy">Yours, always</a>
      </nav>
      <div className="header-actions">
        <a className="github-link" href={repository} aria-label="inkling on GitHub">
          <GitHubLogoIcon width="24" height="24" />
        </a>
        <Download compact />
      </div>
    </header>
  );
}
function InklingWordmark() {
  const root = React.useRef(null),
    visible = useInView(root),
    calm = useCalm();
  return (
    <div ref={root} className="playful-wordmark" aria-hidden="true">
      <span className="dotless-i">
        ı
        <span className="tittle-blob">
          <Cast index={11} gaze="right" alive={visible && !calm} />
        </span>
      </span>
      <span>nkl</span>
      <span className="dotless-i">
        ı
        <span className="tittle-blob">
          <Cast index={12} gaze="left" alive={visible && !calm} />
        </span>
      </span>
      <span>ng.</span>
    </div>
  );
}
export function Finale({ calm, setCalm }) {
  const reduced = useCalm();
  return (
    <footer id="ending" className="scrapbook-ending" aria-label="Inkling">
      <div className="frame">
        <div className="ending-top">
          <a className="ending-mark" href="#top" aria-label="Back to the top of inkling">
            <InklingWordmark />
          </a>
          <p>
            For the things
            <br />
            you want to come back to.
          </p>
          <Download />
        </div>
        <div className="ending-bottom">
          <nav aria-label="Explore inkling">
            <a href="#library">Try the library</a>
            <a href={repository}>GitHub ↗</a>
            <a href={`${repository}/releases`}>Releases ↗</a>
            <a href="/media/stories/credits.html">Image credits</a>
          </nav>
          <Button
            variant="ghost"
            size="small"
            className="motion-preference"
            aria-pressed={reduced}
            onClick={() => setCalm(!calm)}
          >
            {reduced ? "Motion: calm" : "Motion: full"}
          </Button>
        </div>
      </div>
    </footer>
  );
}
