import * as stylex from "@stylexjs/stylex";
import { createFileRoute } from "@tanstack/react-router";
import { Capture } from "../home/Capture.tsx";
import { DownloadBand } from "../home/DownloadBand.tsx";
import { Hero } from "../home/Hero.tsx";
import { PrivateSection } from "../home/PrivateSection.tsx";
import { ReadsPicturesSection } from "../home/ReadsPicturesSection.tsx";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <main {...stylex.props(styles.main)}>
      <Hero />
      <Capture />
      <ReadsPicturesSection />
      <PrivateSection />
      <DownloadBand />
    </main>
  );
}

const styles = stylex.create({
  main: {
    display: "flex",
    flexDirection: "column",
    gap: { default: "128px", "@media (max-width: 640px)": "88px" },
  },
});
