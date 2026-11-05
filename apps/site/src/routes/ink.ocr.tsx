import { createFileRoute } from "@tanstack/react-router";
import { OcrSection } from "../ink/ocr/OcrSection.tsx";
import { seo } from "../layout/seo.ts";

export const Route = createFileRoute("/ink/ocr")({
  head: () => {
    const tags = seo({
      title: "Ink in water · OCR · inkling",
      description: "It reads the words in your pictures.",
      path: "/ink/ocr",
    });
    return {
      ...tags,
      links: [
        ...tags.links,
        ...["/media/red-hat-500.ttf", "/media/red-hat-700.ttf"].map((href) => ({
          rel: "preload",
          href,
          as: "font",
          type: "font/ttf",
          crossOrigin: "anonymous" as const,
        })),
      ],
    };
  },
  component: OcrSection,
});
