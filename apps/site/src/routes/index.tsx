import * as stylex from "@stylexjs/stylex";
import { createFileRoute } from "@tanstack/react-router";
import { Capture } from "../home/Capture.tsx";
import { DownloadBand } from "../home/DownloadBand.tsx";
import { Hero } from "../home/Hero.tsx";
import { PrivateSection } from "../home/PrivateSection.tsx";
import { ReadsPicturesSection } from "../home/ReadsPicturesSection.tsx";
import { seo } from "../layout/seo.ts";

export const Route = createFileRoute("/")({
  head: () =>
    seo({
      title: "inkling: save anything, find it by describing it",
      description:
        "A private library for the articles, images, screenshots, PDFs, notes, quotes and videos you want to keep. No folders: you search for what you remember. Free for Windows, Linux and Mac.",
      path: "/",
    }),
  component: Home,
});

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
