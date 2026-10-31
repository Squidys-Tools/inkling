import type { ItemRecord } from "@inkling/contracts";
import { videoLinkFromSourceUrl } from "@inkling/ingestion/video-links";
import { assetUrl } from "../library/assets.ts";
import { cardFromDetail, toCardView } from "../library/cardModel.ts";

const positive = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;

function xPostId(value: unknown) {
  if (!value || typeof value !== "object" || !("postId" in value)) return undefined;
  return typeof value.postId === "string" ? value.postId : undefined;
}

/** The card's view of an item, plus what only the item view shows. */
export function describeItem(detail: ItemRecord) {
  const card = toCardView(cardFromDetail(detail));
  const width = positive(detail.metadata.mediaWidth);
  const height = positive(detail.metadata.mediaHeight);
  return {
    ...card,
    /** The full-size file: the original image, the PDF, a local video. */
    file:
      card.kind === "Image" || card.kind === "PDF" || card.kind === "Video"
        ? assetUrl(detail.localAssetPath)
        : undefined,
    hasFile: Boolean(detail.localAssetPath),
    size: width && height ? { width, height } : undefined,
    palette: detail.palette ?? [],
    ocrText: detail.ocrText.trim(),
    xPostId: card.isXPost ? xPostId(detail.metadata.social) : undefined,
    // Rebuilt from the video id alone, so no other part of the saved URL reaches the frame.
    video: card.isVideoLink ? (videoLinkFromSourceUrl(detail.sourceUrl) ?? undefined) : undefined,
  };
}

export type DescribedItem = ReturnType<typeof describeItem>;
