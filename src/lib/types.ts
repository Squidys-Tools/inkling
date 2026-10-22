import type { ProcessingSummary } from "./libraryApi";
import type { XPostMetadata } from "./ingestion/types";
import type { VideoLinkEmbed } from "./ingestion/video-links";

export type ItemKind = "Article" | "Image" | "Note" | "PDF" | "Quote" | "Video" | "Post" | "File";

export type LibraryItem = {
  id: string | number;
  kind: ItemKind;
  title: string;
  description: string;
  noteBody?: string;
  source: string;
  date: string;
  createdAt?: number;
  tags: string[];
  ocrText?: string;
  image?: string;
  mediaWidth?: number;
  mediaHeight?: number;
  mediaAspectRatio?: number;
  /** Dominant colours as CSS colour strings, shown as swatches in the item view. */
  palette?: string[];
  pdfPageCount?: number;
  // Card-only facts the backend may index. Each one renders only when present.
  durationSeconds?: number;
  fileSizeBytes?: number;
  readingMinutes?: number;
  fileUrl?: string;
  imageAlt?: string;
  sourceUrl?: string;
  author?: string;
  social?: XPostMetadata;
  post?: {
    displayName: string;
    handle: string;
    body: string;
    published: string;
    avatarUrl?: string;
  };
  accent?: string;
  featured?: boolean;
  archived?: boolean;
  processing?: ProcessingSummary;
  hasArticleContent?: boolean;
  articleHtml?: string;
  articleAuthor?: string;
  publishedDate?: string;
  video?: VideoLinkEmbed;
};
