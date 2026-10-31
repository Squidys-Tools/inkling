import * as stylex from "@stylexjs/stylex";
import { cardColor, color, radius } from "@inkling/ui/tokens.stylex";
import { lazy, type ReactNode, Suspense } from "react";
import { PostArtwork } from "../cards/PostArtwork.tsx";
import { QuoteArtwork } from "../cards/QuoteArtwork.tsx";
import { TypedArtworkFor } from "../cards/TypedArtwork.tsx";
import type { DescribedItem } from "./model.ts";
import { VideoPlayer } from "./VideoPlayer.tsx";
import { XPostFrame } from "./XPostFrame.tsx";
import { ZoomableImage } from "./ZoomableImage.tsx";

// pdf.js and its worker load only when a PDF is opened.
const PdfViewer = lazy(() =>
  import("./PdfViewer.tsx").then((module) => ({ default: module.PdfViewer })),
);

/** Warms the PDF viewer's code while a PDF item is open, so Open PDF does not wait for it. */
export const preloadPdfViewer = () => void import("./PdfViewer.tsx");

function ArtBox({ children, paper }: { children: ReactNode; paper?: boolean }) {
  return <div {...stylex.props(styles.artBox, paper && styles.paper)}>{children}</div>;
}

/** The item's media on the dotted stage, drawn by kind. */
export function Stage({
  item,
  pdfOpen,
  onClosePdf,
}: {
  item: DescribedItem;
  pdfOpen: boolean;
  onClosePdf: () => void;
}) {
  if (pdfOpen && item.file)
    return (
      <Suspense fallback={null}>
        <PdfViewer url={item.file} title={item.title} onClose={onClosePdf} />
      </Suspense>
    );
  if (item.post && item.xPostId)
    return (
      <ArtBox paper>
        <XPostFrame
          key={item.xPostId}
          postId={item.xPostId}
          fallback={<PostArtwork post={item.post} style={styles.fillArt} />}
        />
      </ArtBox>
    );
  if (item.kind === "Video")
    return (
      <ArtBox>
        <VideoPlayer key={item.id} item={item} />
      </ArtBox>
    );
  if (item.kind === "Quote")
    return (
      <ArtBox>
        <QuoteArtwork view={item} layout="fill" />
      </ArtBox>
    );
  if (item.image && item.kind !== "PDF")
    return (
      <ZoomableImage
        key={item.id}
        src={item.image}
        originalSrc={item.kind === "Image" ? item.file : undefined}
        alt={item.imageAlt || item.title}
      />
    );
  if (item.post)
    return (
      <ArtBox>
        <PostArtwork post={item.post} style={styles.fillArt} />
      </ArtBox>
    );
  return (
    <ArtBox>
      <TypedArtworkFor view={item} />
    </ArtBox>
  );
}

const styles = stylex.create({
  artBox: {
    position: "relative",
    width: "min(100%, 720px)",
    height: "min(100%, 520px)",
    overflow: "hidden",
    borderRadius: radius.tile,
    backgroundColor: color.surface,
  },
  paper: { backgroundColor: cardColor.embedPaper },
  fillArt: { height: "100%" },
});
