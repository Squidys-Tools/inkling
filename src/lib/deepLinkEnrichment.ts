import { updateItem } from "./libraryApi";
import type { StoredLibraryItem } from "./libraryApi";
import type { NormalizedArticle } from "./ingestion/types";

type DeepLinkEnrichmentDependencies = {
  ingestUrl: (url: string) => Promise<NormalizedArticle>;
  updateItem: typeof updateItem;
};

export async function enrichDeepLinkCapture(
  item: StoredLibraryItem,
  extensionTitle: string | undefined,
  dependencies: Partial<DeepLinkEnrichmentDependencies> = {},
) {
  if (!item.sourceUrl) return null;
  const ingest =
    dependencies.ingestUrl ??
    ((url: string) => import("./ingestion").then(({ ingestUrl }) => ingestUrl(url)));
  const update = dependencies.updateItem ?? updateItem;
  try {
    const article = await ingest(item.sourceUrl);
    return await update({
      id: item.id,
      title: extensionTitle?.trim() || article.title,
      description: article.description || article.text.slice(0, 180),
      body: article.text,
      sourceUrl: article.canonicalUrl,
      sourceLabel: new URL(article.canonicalUrl).hostname,
      metadataPatch: {
        sourceUrl: article.canonicalUrl,
        text: article.text,
        extractedText: article.text,
        extractor: article.extractor,
        ...(article.author.trim() ? { author: article.author.trim() } : {}),
        ...(article.publishedDate ? { publishedDate: article.publishedDate } : {}),
        ...(article.html.trim() ? { html: article.html } : {}),
        ...(article.imageUrls.length > 0 ? { imageUrls: article.imageUrls } : {}),
        ...(article.imageDimensions.length > 0 ? { imageDimensions: article.imageDimensions } : {}),
        ...(article.safeEmbeds.length > 0 ? { safeEmbeds: article.safeEmbeds } : {}),
        ...(article.social ? { social: article.social } : {}),
      },
    });
  } catch {
    return null;
  }
}
