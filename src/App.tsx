import { type ReactNode, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { VirtuosoMasonry } from "@virtuoso.dev/masonry";
import { gsap } from "gsap";
import {
  Archive,
  AlertCircle,
  ArrowUpRight,
  BadgeCheck,
  Bookmark,
  BookOpen,
  Camera,
  CircleHelp,
  Clock3,
  ExternalLink,
  FileText,
  Grid2X2,
  Image as ImageIcon,
  Layers3,
  LoaderCircle,
  Link2,
  List,
  AtSign,
  Heart,
  MessageCircle,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  Plus,
  Repeat2,
  Search,
  RotateCw,
  Share2,
  Settings2,
  Sparkles,
  X,
} from "lucide-react";
import {
  assetUrl,
  createQuote,
  createSpace,
  createUrl,
  currentDeepLinks,
  createNote,
  deleteSpace,
  initializeStorage,
  isTauriRuntime,
  listActiveItems,
  listSpaceItems,
  listSpaces,
  getJobStatus,
  retryProcessingJob,
  saveFile,
  searchItems,
  searchSimilarImages,
  summarizeProcessingJobs,
  type ProcessingSummary,
  type SmartSpaceQuery,
  type StoredLibraryItem,
  type StoredSpace,
} from "./lib/libraryApi";
import { classifyFile } from "./lib/ingestion/file-classification";
import { autoplayEmbedUrl, providerLabel, videoLinkFromSourceUrl, type VideoLinkEmbed } from "./lib/ingestion/video-links";
import PdfViewer from "./components/PdfViewer";
import { ReaderView, type ReaderItem, type ReaderOrigin } from "./ReaderView";
import { normalizeXPostOEmbed, xPostOEmbedUrl } from "./lib/ingestion/x-post";
import type { XPostMetadata } from "./lib/ingestion/types";
import "./App.css";

type ItemKind = "Article" | "Image" | "Note" | "PDF" | "Quote" | "Video" | "Post" | "File";
type CaptureMode = "note" | "url" | "file" | "quote";

export type LibraryItem = {
  id: string | number;
  kind: ItemKind;
  title: string;
  description: string;
  source: string;
  date: string;
  tags: string[];
  ocrText?: string;
  image?: string;
  mediaWidth?: number;
  mediaHeight?: number;
  mediaAspectRatio?: number;
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
  favorite?: boolean;
  processing?: ProcessingSummary;
   articleHtml?: string;
   articleAuthor?: string;
   publishedDate?: string;
   video?: VideoLinkEmbed;
};

function displayKind(kind: string): ItemKind {
  switch (kind.toLowerCase()) {
    case "article":
    case "url":
      return "Article";
    case "image":
      return "Image";
    case "note":
      return "Note";
    case "quote":
      return "Quote";
    case "pdf":
      return "PDF";
    case "video":
    case "embed":
      return "Video";
    case "post":
    case "tweet":
      return "Post";
    case "file":
      return "File";
    default:
      return "Note";
  }
}

function formatItemDate(timestamp: number) {
  const date = new Date(timestamp);
  const age = Date.now() - date.getTime();
  if (age < 60 * 60 * 1000) return "Just now";
  if (age < 24 * 60 * 60 * 1000) return "Today";
  return date.toLocaleDateString(undefined, { month: "short", day: "2-digit" });
}

function readXPostMetadata(value: unknown): XPostMetadata | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (record.provider !== "x" || typeof record.postUrl !== "string" || typeof record.postId !== "string") {
    return undefined;
  }

  return {
    provider: "x",
    postUrl: record.postUrl,
    postId: record.postId,
    embedHtml: typeof record.embedHtml === "string" ? record.embedHtml : undefined,
    authorName: typeof record.authorName === "string" ? record.authorName : undefined,
    authorUrl: typeof record.authorUrl === "string" ? record.authorUrl : undefined,
    authorHandle: typeof record.authorHandle === "string" ? record.authorHandle : undefined,
    text: typeof record.text === "string" ? record.text : undefined,
    publishedDate: typeof record.publishedDate === "string" ? record.publishedDate : null,
    width: typeof record.width === "number" ? record.width : null,
  };
}

function postFallbackFromMetadata(social: XPostMetadata): NonNullable<LibraryItem["post"]> {
  const published = social.publishedDate
    ? new Date(social.publishedDate).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : "On X";
  return {
    displayName: social.authorName ?? "X user",
    handle: social.authorHandle ? `@${social.authorHandle.replace(/^@/u, "")}` : "@x",
    body: social.text ?? "Post preview unavailable.",
    published,
  };
}

function positiveNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function mediaAspectRatioFor(item: LibraryItem): number {
  if (item.mediaAspectRatio && Number.isFinite(item.mediaAspectRatio) && item.mediaAspectRatio > 0) {
    return item.mediaAspectRatio;
  }
  if (item.mediaWidth && item.mediaHeight && item.mediaWidth > 0 && item.mediaHeight > 0) {
    return item.mediaWidth / item.mediaHeight;
  }

  switch (item.kind) {
    case "Video":
      return 16 / 9;
    case "Article":
      return 16 / 10;
    case "Image":
      return 4 / 3;
    case "Post":
      return 1.45;
    case "PDF":
      return 4 / 3;
    case "Quote":
      return 1.4;
    default:
      return 1.45;
  }
}

function readImageDimensions(src: string): Promise<{ width: number; height: number } | undefined> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const width = image.naturalWidth;
      const height = image.naturalHeight;
      resolve(width > 0 && height > 0 ? { width, height } : undefined);
    };
    image.onerror = () => resolve(undefined);
    image.src = src;
  });
}

async function storedItemToLibraryItem(
  item: StoredLibraryItem,
  processing?: ProcessingSummary,
): Promise<LibraryItem> {
  const social = readXPostMetadata(item.metadata.social);
  const baseKind = displayKind(item.kind);
  const videoLink = baseKind === "Article" ? videoLinkFromSourceUrl(item.sourceUrl) : null;
  const kind = social ? "Post" : videoLink ? "Video" : baseKind;
  const metadataTags = item.metadata.tags;
  const tags = Array.isArray(metadataTags)
    ? metadataTags.filter((tag): tag is string => typeof tag === "string")
    : [];
  const metadataHtml = typeof item.metadata.html === "string" ? item.metadata.html : undefined;
  const metadataAuthor = typeof item.metadata.author === "string" ? item.metadata.author : undefined;
  const metadataPublishedDate =
    typeof item.metadata.publishedDate === "string" ? item.metadata.publishedDate : undefined;

  const remoteImage = Array.isArray(item.metadata.imageUrls)
    ? item.metadata.imageUrls.find((value): value is string => typeof value === "string")
    : undefined;
  const indexedImageDimensions = Array.isArray(item.metadata.imageDimensions)
    ? item.metadata.imageDimensions.find((value): value is Record<string, unknown> => {
      if (!value || typeof value !== "object") return false;
      const record = value as Record<string, unknown>;
      return (!remoteImage || record.url === remoteImage) && positiveNumber(record.width) !== undefined && positiveNumber(record.height) !== undefined;
    })
    : undefined;
  const mediaWidth = positiveNumber(item.metadata.mediaWidth) ?? positiveNumber(indexedImageDimensions?.width);
  const mediaHeight = positiveNumber(item.metadata.mediaHeight) ?? positiveNumber(indexedImageDimensions?.height);
  const storedAspectRatio = positiveNumber(item.metadata.mediaAspectRatio);
  const image =
    (await assetUrl(item.thumbnailPath ?? (kind === "Image" ? item.localAssetPath : null))) ??
    remoteImage ??
    videoLink?.posterUrl;
  const fileUrl = kind === "PDF" || kind === "Video" ? await assetUrl(item.localAssetPath) : undefined;
  const source = social
    ? `X${social.authorHandle ? ` · @${social.authorHandle.replace(/^@/u, "")}` : ""}`
    : item.sourceLabel || item.sourceUrl || "Quick note";

  const isQuote = kind === "Quote";
  const rawTitle = item.title?.trim() || "Untitled note";
  const rawDescription =
    item.description?.trim() ||
    item.ocrText?.trim().slice(0, 180) ||
    (isQuote ? "" : "Saved to your mind.");

  return {
    id: item.id,
    kind,
    title: rawTitle,
    description: social?.text?.trim() || rawDescription,
    source,
    sourceUrl: item.sourceUrl ?? undefined,
    date: formatItemDate(item.createdAt),
    tags,
    ocrText: item.ocrText,
    image,
    mediaWidth,
    mediaHeight,
    mediaAspectRatio: storedAspectRatio ?? (mediaWidth && mediaHeight ? mediaWidth / mediaHeight : undefined),
    fileUrl,
    imageAlt: item.title?.trim() || undefined,
    social,
    post: social ? postFallbackFromMetadata(social) : undefined,
    accent: isQuote ? "paper-yellow" : undefined,
    favorite: item.favorite,
    processing,
    articleHtml: metadataHtml && metadataHtml.trim() ? metadataHtml : undefined,
    articleAuthor: metadataAuthor,
    publishedDate: metadataPublishedDate,
    video: videoLink ?? undefined,
  };
}


const seedItems: LibraryItem[] = [
  {
    id: 1,
    kind: "Article",
    title: "As We May Think",
    description:
      "Vannevar Bush imagines the memex: a personal desk for storing, linking, and revisiting everything worth reading.",
    source: "The Atlantic",
    sourceUrl: "https://www.theatlantic.com/magazine/archive/1945/07/as-we-may-think/303881/",
    author: "Vannevar Bush",
    image:
      "https://cdn.theatlantic.com/thumbor/p3pkh2RYR4qWpQk3qC6zhJpPd9Y=/0x350:2994x1909/1200x625/media/img/2018/03/AP_413517775098/original.jpg",
    mediaWidth: 1200,
    mediaHeight: 625,
    imageAlt: "A historical photograph from The Atlantic's archive accompanying As We May Think",
    date: "Saved today",
    tags: ["essay", "memory"],
    accent: "ink",
    featured: true,
    favorite: true,
  },
  {
    id: 2,
    kind: "Image",
    title: "Lago di Braies, Dolomites",
    description: "The boathouse at the north shore, before the day-trippers arrive.",
    source: "Unsplash",
    sourceUrl: "https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=1800&q=90",
    date: "Yesterday",
    tags: ["landscape", "reference"],
    image:
      "https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=1000&q=85",
    mediaAspectRatio: 3 / 2,
    imageAlt: "A wooden boat house beside a clear alpine lake with mountains behind it",
    favorite: true,
  },
  {
    id: 3,
    kind: "Article",
    title: "How to Do Great Work",
    description:
      "Paul Graham’s guide to choosing work, following curiosity to the frontier, and making successive versions until something great appears.",
    source: "Paul Graham",
    sourceUrl: "https://paulgraham.com/greatwork.html",
    author: "Paul Graham",
    image: "https://images.unsplash.com/photo-1499750310107-5fef28a66643?auto=format&fit=crop&w=1000&q=85",
    mediaAspectRatio: 3 / 2,
    imageAlt: "A notebook and coffee on a desk, a quiet setting for doing great work",
    date: "Aug 20",
    tags: ["essay", "work"],
    favorite: true,
  },
  {
    id: 4,
    kind: "Image",
    title: "Wireframes on a design desk",
    description: "A real product sketch: paper prototypes, a pencil, and the first shape of a flow.",
    source: "Unsplash",
    sourceUrl: "https://images.unsplash.com/photo-1581291518857-4e27b48ff24e?auto=format&fit=crop&w=1800&q=90",
    date: "Aug 18",
    tags: ["ui", "reference"],
    image:
      "https://images.unsplash.com/photo-1581291518857-4e27b48ff24e?auto=format&fit=crop&w=1000&q=85",
    mediaAspectRatio: 3 / 2,
    imageAlt: "A designer sketching interface wireframes on paper beside a laptop",
  },
  {
    id: 5,
    kind: "Post",
    title: "The first post on Twitter",
    description: "A two-word product launch document from the first day of Twitter.",
    source: "X · @jack",
    sourceUrl: "https://x.com/jack/status/20",
    date: "Mar 21, 2006",
    tags: ["twitter", "history", "post"],
    social: {
      provider: "x",
      postUrl: "https://x.com/jack/status/20",
      postId: "20",
      embedHtml:
        '<blockquote class="twitter-tweet" data-width="550" data-dnt="true" data-theme="light"><p lang="en" dir="ltr">just setting up my twttr</p>&mdash; jack (@jack) <a href="https://x.com/jack/status/20?ref_src=twsrc%5Etfw">March 21, 2006</a></blockquote>',
    },
    post: {
      displayName: "jack",
      handle: "@jack",
      body: "just setting up my twttr",
      published: "Mar 21, 2006",
      avatarUrl: "https://unavatar.io/twitter/jack",
    },
  },
  {
    id: 6,
    kind: "Image",
    title: "A dashboard worth studying",
    description: "Dark UI, dense information, and just enough color to make the important number pop.",
    source: "Unsplash",
    sourceUrl: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=1800&q=90",
    date: "Aug 12",
    tags: ["ui", "reference"],
    image:
      "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=1000&q=85",
    mediaAspectRatio: 3 / 2,
    imageAlt: "A dark analytics dashboard with charts and colorful data visualizations",
  },
  {
    id: 7,
    kind: "Article",
    title: "10 Usability Heuristics for User Interface Design",
    description:
      "Jakob Nielsen’s durable checklist for interfaces: visibility, user control, error recovery, consistency, and more.",
    source: "Nielsen Norman Group",
    sourceUrl: "https://www.nngroup.com/articles/ten-usability-heuristics/",
    author: "Jakob Nielsen",
    image: "https://media.nngroup.com/media/articles/opengraph_images/Updated10HeuristicSocialCard-36.png",
    mediaWidth: 1200,
    mediaHeight: 630,
    imageAlt: "Nielsen Norman Group social card for the ten usability heuristics",
    date: "Aug 08",
    tags: ["ui", "ux", "heuristics"],
  },
  {
    id: 8,
    kind: "Video",
    title: "Inventing on Principle",
    description:
      "Bret Victor argues creators should see and react to their work instantly — the talk that reframed how a generation thinks about tooling.",
    source: "Bret Victor",
    sourceUrl: "https://worrydream.com/#!/InventingOnPrinciple",
    author: "Bret Victor",
    image: "https://i.ytimg.com/vi/PUv66718DII/hqdefault.jpg",
    mediaAspectRatio: 16 / 9,
    imageAlt: "Bret Victor presenting Inventing on Principle",
    video: {
      provider: "youtube",
      embedUrl: "https://www.youtube-nocookie.com/embed/PUv66718DII",
      sourceUrl: "https://worrydream.com/#!/InventingOnPrinciple",
      posterUrl: "https://i.ytimg.com/vi/PUv66718DII/hqdefault.jpg",
    },
    date: "Aug 05",
    tags: ["talks", "design"],
  },
  {
    id: 9,
    kind: "Image",
    title: "Peaks above a sea of clouds",
    description: "Alpine dusk from above the cloud layer.",
    source: "Unsplash",
    sourceUrl: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=1800&q=90",
    date: "Aug 02",
    tags: ["landscape", "color"],
    image:
      "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=1000&q=85",
    mediaAspectRatio: 3 / 2,
    imageAlt: "Snowy mountain peaks glowing above a sea of clouds at sunset",
  },
  {
    id: 10,
    kind: "PDF",
    title: "Attention Is All You Need",
    description:
      "The transformer paper. Eight authors, one architecture, and the beginning of everything since.",
    source: "arXiv",
    sourceUrl: "https://arxiv.org/abs/1706.03762",
    image: "https://arxiv.org/html/1706.03762/x1.png",
    mediaAspectRatio: 4 / 3,
    imageAlt: "The transformer architecture diagram from Attention Is All You Need",
    date: "Jul 29",
    tags: ["research", "ml"],
    accent: "paper-green",
  },
  {
    id: 11,
    kind: "Image",
    title: "A web layout in the wild",
    description: "A product page on a laptop: editorial spacing, a strong image, and a single clear action.",
    source: "Unsplash",
    sourceUrl: "https://images.unsplash.com/photo-1467232004584-a241de8bcf5d?auto=format&fit=crop&w=1800&q=90",
    date: "Jul 24",
    tags: ["web", "ui", "reference"],
    image:
      "https://images.unsplash.com/photo-1467232004584-a241de8bcf5d?auto=format&fit=crop&w=1000&q=85",
    mediaAspectRatio: 3 / 2,
    imageAlt: "A laptop displaying a colorful web page on a wooden desk",
  },
  {
    id: 12,
    kind: "Note",
    title: "Books to reread this fall",
    description:
      "Pilgrim at Tinker Creek, The Design of Everyday Things, Seeing Like a State. Start with the Dillard.",
    source: "Quick note",
    date: "Jul 19",
    tags: ["books", "life"],
    accent: "paper-yellow",
  },
  {
    id: 13,
    kind: "Quote",
    title: "“It is not that we have a short time to live, but that we waste a lot of it.”",
    description: "— Seneca",
    source: "On the Shortness of Life",
    date: "Jul 11",
    tags: ["writing", "time"],
    accent: "paper-yellow",
    sourceUrl: "https://en.wikisource.org/wiki/Of_The_Shortness_of_Life/Chapter_1",
  },
];

const seedSpaces: StoredSpace[] = [
  {
    id: "seed-design-references",
    name: "Design references",
    color: "orange",
    query: { tag: "reference" },
    position: 1,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: "seed-read-later",
    name: "Read later",
    color: "green",
    query: { tag: "essay" },
    position: 2,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: "seed-top-picks",
    name: "Top picks",
    color: "blue",
    query: { favorite: true },
    position: 3,
    createdAt: 0,
    updatedAt: 0,
  },
];

const SPACE_COLORS = ["blue", "orange", "green", "pink", "purple"];

const LIBRARY_VIEW_TRANSITION_MS = 440;
const LIBRARY_VIEW_EASE = "circ.inOut";

const KIND_ALIASES: Record<string, string> = {
  article: "article",
  url: "article",
  image: "image",
  note: "note",
  quote: "quote",
  pdf: "pdf",
  video: "video",
  embed: "video",
  file: "file",
  post: "post",
  tweet: "post",
};

function canonicalKind(kind: string) {
  const normalized = kind.trim().toLowerCase();
  return KIND_ALIASES[normalized] ?? normalized;
}

// Mirrors the backend's Smart Space evaluation for browser (seed data) mode.
// In the Tauri runtime the saved query is evaluated lazily by the Rust core.
function itemMatchesSmartQuery(item: LibraryItem, spaceQuery: SmartSpaceQuery) {
  if (spaceQuery.favorite != null && Boolean(item.favorite) !== spaceQuery.favorite) return false;
  if (
    spaceQuery.tag &&
    !item.tags.some((tag) => tag.toLowerCase() === spaceQuery.tag?.toLowerCase())
  ) {
    return false;
  }
  if (spaceQuery.kind && canonicalKind(item.kind) !== canonicalKind(spaceQuery.kind)) return false;

  const text = spaceQuery.text?.trim().toLowerCase();
  if (text && ![item.title, item.description, item.source, ...item.tags].join(" ").toLowerCase().includes(text)) {
    return false;
  }

  return true;
}

function KindIcon({ kind }: { kind: ItemKind }) {
  const Icon =
    kind === "Image"
      ? ImageIcon
      : kind === "Article"
        ? Link2
        : kind === "PDF"
          ? FileText
          : kind === "Quote"
            ? Bookmark
            : kind === "Post"
              ? AtSign
              : kind === "Video"
                ? Play
                : Sparkles;
  return <Icon size={13} strokeWidth={1.8} />;
}

function PostArtwork({ post }: { post: NonNullable<LibraryItem["post"]> }) {
  return (
    <div className="post-art" aria-hidden="true">
      <div className="post-author">
        <span className="post-avatar">
          <span>j</span>
          {post.avatarUrl && <img src={post.avatarUrl} alt="" />}
        </span>
        <span>
          <strong>{post.displayName}</strong>
          <BadgeCheck size={13} />
          <small>{post.handle}</small>
        </span>
        <span className="post-platform">X</span>
      </div>
      <p>{post.body}</p>
      <div className="post-date">{post.published}</div>
      <div className="post-actions">
        <MessageCircle size={14} />
        <Repeat2 size={14} />
        <Heart size={14} />
        <Share2 size={14} />
      </div>
    </div>
  );
}

const VIDEO_IFRAME_ALLOW =
  "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";

function LibraryVideoMedia({ item }: { item: LibraryItem }) {
  const [isPlaying, setIsPlaying] = useState(false);
  useEffect(() => setIsPlaying(false), [item.id]);

  if (!item.video && !item.fileUrl) {
    return item.image
      ? <div className="card-image-wrap"><img src={item.image} alt={item.imageAlt ?? item.title} className="card-image" loading="lazy" decoding="async" /></div>
      : <div className="card-paper-art" aria-hidden="true"><span className="video-paper-play"><Play size={20} /></span></div>;
  }

  if (isPlaying) {
    return (
      <div className="card-image-wrap card-video-playing" onClick={(event) => event.stopPropagation()}>
        {item.video ? (
          <iframe
            src={autoplayEmbedUrl(item.video.embedUrl)}
            title={item.title}
            allow={VIDEO_IFRAME_ALLOW}
            allowFullScreen
          />
        ) : (
          <video className="card-video-player" src={item.fileUrl} controls autoPlay playsInline preload="metadata" />
        )}
      </div>
    );
  }

  return (
    <div className="card-image-wrap">
      <button
        type="button"
        className="card-video-poster"
        onClick={(event) => {
          event.stopPropagation();
          setIsPlaying(true);
        }}
        aria-label={`Play video: ${item.title}`}
      >
        {item.image && <img src={item.image} alt="" className="card-image" loading="lazy" decoding="async" />}
        <span className="card-video-scrim" aria-hidden="true" />
        <span className="card-play" aria-hidden="true"><Play size={16} /></span>
        <span className="card-video-badge">{item.video ? providerLabel(item.video.provider) : "Video"}</span>
      </button>
    </div>
  );
}

function InspectorVideoMedia({ item }: { item: LibraryItem }) {
  const [isPlaying, setIsPlaying] = useState(false);
  useEffect(() => setIsPlaying(false), [item.id]);

  if (item.video) {
    const poster = item.image ?? item.video.posterUrl;
    return (
      <div className="inspector-video">
        {isPlaying ? (
          <iframe
            src={autoplayEmbedUrl(item.video.embedUrl)}
            title={item.title}
            allow={VIDEO_IFRAME_ALLOW}
            allowFullScreen
          />
        ) : (
          <button
            type="button"
            className="video-poster"
            onClick={() => setIsPlaying(true)}
            aria-label={`Play video: ${item.title}`}
          >
            {poster && <img src={poster} alt="" loading="lazy" />}
            <span className="video-poster-play" aria-hidden="true"><Play size={21} /></span>
            <span className="video-provider">{providerLabel(item.video.provider)}</span>
          </button>
        )}
      </div>
    );
  }

  if (item.fileUrl) {
    return (
      <div className="inspector-video">
        <video className="inspector-native-video" src={item.fileUrl} controls preload="metadata" />
      </div>
    );
  }

  return (
    <div className={`inspector-art ${item.accent ?? "ink"}`}><KindIcon kind={item.kind} /><span>{item.kind}</span></div>
  );
}

type XWidgets = {
  widgets?: {
    load: (element?: HTMLElement) => void;
  };
};

declare global {
  interface Window {
    twttr?: XWidgets;
  }
}

let xWidgetsPromise: Promise<void> | null = null;
const X_WIDGETS_SRC = "https://platform.twitter.com/widgets.js";

function loadXWidgets() {
  if (typeof window === "undefined" || window.twttr?.widgets) return Promise.resolve();
  if (xWidgetsPromise) return xWidgetsPromise;

  xWidgetsPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>("#twitter-wjs");
    const script = existing ?? document.createElement("script");
    let pollId: number | undefined;
    let timeoutId: number | undefined;
    let settled = false;

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      if (pollId !== undefined) window.clearInterval(pollId);
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      if (error) reject(error);
      else resolve();
    };

    const checkReady = () => {
      if (window.twttr?.widgets) finish();
    };

    const handleLoad = () => {
      checkReady();
      window.setTimeout(checkReady, 0);
    };
    const handleError = () => finish(new Error("X widgets could not be loaded."));

    script.addEventListener("load", handleLoad, { once: true });
    script.addEventListener("error", handleError, { once: true });

    if (!existing) {
      script.id = "twitter-wjs";
      script.src = X_WIDGETS_SRC;
      script.async = true;
      script.charset = "utf-8";
      document.head.appendChild(script);
    }

    checkReady();
    pollId = window.setInterval(checkReady, 100);
    timeoutId = window.setTimeout(() => finish(new Error("X widgets timed out.")), 15000);
  });

  return xWidgetsPromise;
}

function waitForXWidget(root: HTMLElement, timeoutMs = 8000): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    let observer: MutationObserver | null = null;
    let timeoutId: number | undefined;

    const finish = (loaded: boolean) => {
      if (settled) return;
      settled = true;
      observer?.disconnect();
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      resolve(loaded);
    };

    const watchWidget = () => {
      const iframe = root.querySelector<HTMLIFrameElement>("iframe");
      if (!iframe) return;

      // X replaces the blockquote with its official cross-origin iframe. The
      // iframe load event is not a reliable readiness signal here: cached
      // frames can finish before a listener is attached, and some browsers do
      // not surface a second load event for an already-created frame. Seeing
      // the official iframe is the stable signal that widgets.js transformed
      // this embed. Do not wait for requestAnimationFrame here: the preview
      // can be backgrounded, and browsers throttle animation frames in that
      // state even though the cross-origin iframe has already loaded.
      finish(true);
    };

    observer = new MutationObserver(watchWidget);
    observer.observe(root, { childList: true, subtree: true });
    watchWidget();
    timeoutId = window.setTimeout(() => finish(false), timeoutMs);
  });
}

function XPostEmbed({ social, fallback }: { social: XPostMetadata; fallback: ReactNode }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const nativeRef = useRef<HTMLDivElement>(null);
  const [shouldLoad, setShouldLoad] = useState(false);
  const [embedHtml, setEmbedHtml] = useState<string | undefined>(social.embedHtml);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "failed">("idle");

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (typeof IntersectionObserver === "undefined") {
      setShouldLoad(true);
      return;
    }

    const idleWindow = window as unknown as {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    let cancelScheduledLoad: (() => void) | undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        observer.disconnect();

        let cancelled = false;
        const start = () => {
          if (!cancelled) setShouldLoad(true);
        };
        const idleId = idleWindow.requestIdleCallback
          ? idleWindow.requestIdleCallback(start, { timeout: 1200 })
          : window.setTimeout(start, 0);
        cancelScheduledLoad = () => {
          cancelled = true;
          if (idleWindow.cancelIdleCallback && idleWindow.requestIdleCallback) {
            idleWindow.cancelIdleCallback(idleId);
          } else {
            window.clearTimeout(idleId);
          }
        };
      },
      { rootMargin: "120px 0px" },
    );
    observer.observe(host);

    return () => {
      observer.disconnect();
      cancelScheduledLoad?.();
    };
  }, [social.postUrl]);

  useEffect(() => {
    setShouldLoad(false);
    setEmbedHtml(social.embedHtml);
    setStatus("idle");
  }, [social.embedHtml, social.postUrl]);

  useEffect(() => {
    if (!shouldLoad) return;
    let cancelled = false;
    setStatus("loading");

    if (social.embedHtml) {
      setEmbedHtml(social.embedHtml);
      return () => {
        cancelled = true;
      };
    }

    fetch(xPostOEmbedUrl(social.postUrl), { headers: { Accept: "application/json" } })
      .then((response) => {
        if (!response.ok) throw new Error(`X oEmbed returned HTTP ${response.status}.`);
        return response.json() as Promise<unknown>;
      })
      .then((payload) => {
        if (cancelled) return;
        const normalized = normalizeXPostOEmbed(social.postUrl, payload as Parameters<typeof normalizeXPostOEmbed>[1]);
        if (!normalized?.embedHtml) throw new Error("X did not return embed markup.");
        setEmbedHtml(normalized.embedHtml);
      })
      .catch(() => {
        if (!cancelled) setStatus("failed");
      });

    return () => {
      cancelled = true;
    };
  }, [shouldLoad, social.embedHtml, social.postUrl]);

  useEffect(() => {
    const root = nativeRef.current;
    if (!root || !embedHtml) return;

    root.innerHTML = embedHtml;
    const updateEmbedWidth = () => {
      const width = Math.min(550, Math.max(280, Math.floor(root.getBoundingClientRect().width)));
      const iframe = root.querySelector<HTMLIFrameElement>("iframe");

      if (iframe) {
        // The iframe itself is width: 100%; changing its URL after X has
        // rendered causes the widget to reload and can create a resize loop.
        // Its document receives the new viewport width through the iframe box.
        return;
      }

      root.querySelector<HTMLElement>("blockquote.twitter-tweet")?.setAttribute("data-width", String(width));
    };

    updateEmbedWidth();
    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateEmbedWidth);
    resizeObserver?.observe(root);
    window.addEventListener("resize", updateEmbedWidth);
    let cancelled = false;
    loadXWidgets()
      .then(async () => {
        if (cancelled) return;
        const widgetLoad = waitForXWidget(root);
        window.twttr?.widgets?.load(root);
        const loaded = await widgetLoad;
        if (!cancelled) setStatus(loaded ? "ready" : "failed");
      })
      .catch(() => {
        if (!cancelled) setStatus("failed");
      });

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updateEmbedWidth);
      root.replaceChildren();
    };
  }, [embedHtml, shouldLoad]);

  return (
    <div className="x-post-embed" ref={hostRef} data-x-status={status}>
      <div className={`x-post-native ${status === "ready" ? "is-ready" : ""}`} ref={nativeRef} aria-hidden={status !== "ready"} />
      {status !== "ready" && <div className="x-post-fallback">{fallback}</div>}
    </div>
  );
}

type LibraryCardContext = {
  onSelectItem: (item: LibraryItem) => void;
  onOpenReader: (item: LibraryItem, origin?: ReaderOrigin) => void;
  onRetryJob: (jobId: string) => void | Promise<void>;
};

type VirtualizedLibraryItemProps = {
  data: LibraryItem;
  index: number;
  context: LibraryCardContext;
};

const VirtualizedLibraryItem = memo(function VirtualizedLibraryItem({
  data: item,
  index,
  context,
}: VirtualizedLibraryItemProps) {
  return (
    <div className="library-card-slot" data-library-index={index}>
      <article
        className={`library-card ${item.featured ? "featured-card" : ""} ${item.kind === "Note" ? "note-card" : item.kind === "Quote" ? "quote-card" : item.accent ?? ""}`}
        data-library-item-id={String(item.id)}
        style={{ "--card-media-ratio": String(mediaAspectRatioFor(item)) } as React.CSSProperties}
        onClick={() => context.onSelectItem(item)}
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          context.onSelectItem(item);
        }}
      >
        <div className="library-card-media">
          {item.social?.provider === "x" ? (
            <div className="x-post-art">
              <XPostEmbed
                social={item.social}
                fallback={item.post ? <PostArtwork post={item.post} /> : <div className="post-art">Post preview unavailable.</div>}
              />
            </div>
          ) : item.kind === "Video" ? (
            <LibraryVideoMedia item={item} />
          ) : item.image ? (
            <div className="card-image-wrap">
              <img src={item.image} alt={item.imageAlt ?? item.title} className="card-image" loading="lazy" decoding="async" />
            </div>
          ) : item.kind === "Post" && item.post ? (
            <PostArtwork post={item.post} />
          ) : (
            <div className={`card-paper-art ${item.kind === "Quote" ? "quote-art" : item.kind === "Note" ? "note-art" : item.accent ?? ""}`} aria-hidden="true">
              {item.kind === "Article" && <><span className="paper-line line-one" /><span className="paper-line line-two" /><span className="paper-seal">m</span></>}
              {item.kind === "Note" && <><span className="note-pin" /><span className="note-label">QUICK THOUGHT</span><span className="note-scribble">remember<br />the shape<br />of a day</span><span className="note-rule note-rule-one" /><span className="note-rule note-rule-two" /><span className="note-star">✳</span></>}
              {item.kind === "PDF" && <><span className="pdf-label">FIELD<br />NOTES</span><span className="pdf-rule" /></>}
              {item.kind === "Quote" && <><span className="quote-mark">“</span><span className="quote-line" /><span className="quote-attribution-preview">{item.description ? `${item.description.trim().startsWith("—") ? "" : "— "}${item.description.slice(0, 48)}` : ""}</span></>}
            </div>
          )}
        </div>
        <div className={`card-content ${item.kind === "Quote" ? "quote-content" : item.kind === "Note" ? "note-content" : ""}`}>
          <div className="card-kicker"><span><KindIcon kind={item.kind} />{item.kind}</span><span>{item.date}</span></div>
          <h2 className={item.kind === "Quote" ? "quote-title" : ""}>{item.kind === "Quote" ? (/^["“]/u.test(item.title.trim()) ? item.title : `“${item.title}”`) : item.title}</h2>
          <p className={item.kind === "Quote" ? "quote-attribution" : ""}>{item.description ? (item.kind === "Quote" && !item.description.trim().startsWith("—") ? `— ${item.description}` : item.description) : (item.kind === "Quote" ? "" : item.description)}</p>
          {item.processing?.active && (
            <div className="card-processing" role="status">
              <LoaderCircle size={13} />
              <span>{item.processing.message ?? "Processing"}</span>
              {item.processing.progressTotal != null && <span>{item.processing.progressCurrent}/{item.processing.progressTotal}</span>}
            </div>
          )}
          {item.processing?.failedJob && (
            <div className="card-processing failed" role="alert">
              <AlertCircle size={13} />
              <span>{item.processing.failedJob.errorMessage ?? "Processing failed"}</span>
              <button
                type="button"
                className="retry-button"
                onClick={(event) => {
                  event.stopPropagation();
                  void context.onRetryJob(item.processing?.failedJob?.id ?? "");
                }}
              >
                <RotateCw size={12} /> Try again
              </button>
            </div>
          )}
          <div className="card-footer">
            <span className="card-source">{item.source}</span>
            {item.kind === "Article" && (
              <button
                type="button"
                className="card-read"
                onClick={(event) => {
                  event.stopPropagation();
                  const rect = event.currentTarget.getBoundingClientRect();
                  context.onOpenReader(item, { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
                }}
                onKeyDown={(event) => {
                  event.stopPropagation();
                  if (event.key === "Enter") {
                    event.preventDefault();
                    context.onOpenReader(item);
                  }
                }}
                disabled={!item.articleHtml}
                title={item.articleHtml ? "Open reader" : "No saved article text"}
              >
                Read <ArrowUpRight size={13} />
              </button>
            )}
            {item.kind === "Video" && item.video && (
              <button
                type="button"
                className="card-read"
                onClick={(event) => {
                  event.stopPropagation();
                  context.onSelectItem(item);
                }}
              >
                Watch <Play size={11} />
              </button>
            )}
            {!(item.kind === "Article" || (item.kind === "Video" && item.video)) && <ArrowUpRight size={15} />}
          </div>
        </div>
      </article>
    </div>
  );
});

function masonryColumnCount(width: number): number {
  if (width < 560) return 1;
  if (width < 900) return 2;
  if (width < 1220) return 3;
  if (width < 1540) return 4;
  if (width < 1900) return 5;
  return 6;
}

type LibraryCardPosition = {
  left: number;
  top: number;
  width: number;
  height: number;
};

const LIBRARY_TRANSITION_TARGET_SELECTOR =
  ".library-card-media > .card-image-wrap, .library-card-media > .card-paper-art, .library-card-media > .post-art, .library-card-media > .x-post-art, .card-content";

function clearLibraryTransitionTargetStyle(target: HTMLElement) {
  for (const property of ["position", "box-sizing", "left", "top", "width", "height", "min-width", "min-height", "max-width", "max-height", "aspect-ratio"]) {
    target.style.removeProperty(property);
  }
}

function setLibraryTransitionTargetStyle(target: HTMLElement, left: number, top: number, width: number, height: number) {
  target.style.position = "absolute";
  target.style.boxSizing = "border-box";
  target.style.left = `${left}px`;
  target.style.top = `${top}px`;
  target.style.width = `${width}px`;
  target.style.height = `${height}px`;
  target.style.minWidth = "0px";
  target.style.minHeight = "0px";
  target.style.maxWidth = "none";
  target.style.maxHeight = "none";
  target.style.aspectRatio = "auto";
}

function App() {
  const [items, setItems] = useState<LibraryItem[]>(isTauriRuntime() ? [] : seedItems);
  const [spaces, setSpaces] = useState<StoredSpace[]>(isTauriRuntime() ? [] : seedSpaces);
  const [query, setQuery] = useState("");
  const [activeView, setActiveView] = useState("Everything");
  const [activeSpaceId, setActiveSpaceId] = useState<string | null>(null);
  const [isCreatingSpace, setIsCreatingSpace] = useState(false);
  const [newSpaceName, setNewSpaceName] = useState("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [captureMode, setCaptureMode] = useState<CaptureMode | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [captureUrl, setCaptureUrl] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [newQuoteText, setNewQuoteText] = useState("");
  const [newQuoteAttribution, setNewQuoteAttribution] = useState("");
  const [newQuoteSourceUrl, setNewQuoteSourceUrl] = useState("");
  const [selectedItem, setSelectedItem] = useState<LibraryItem | null>(null);
  const [pdfViewerItem, setPdfViewerItem] = useState<LibraryItem | null>(null);
  const [readingItem, setReadingItem] = useState<{ item: LibraryItem; origin: ReaderOrigin } | null>(null);
  const [listMode, setListMode] = useState(false);
  const [isLibraryViewTransitioning, setIsLibraryViewTransitioning] = useState(false);
  const [viewSelectionListMode, setViewSelectionListMode] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const [isFindingSimilar, setIsFindingSimilar] = useState(false);
  const [similaritySource, setSimilaritySource] = useState<{ id: string; title: string } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const libraryScrollRef = useRef<HTMLDivElement>(null);
  const libraryTransitionOverlayRef = useRef<HTMLDivElement>(null);
  const pendingLibraryViewPositionsRef = useRef<Map<string, LibraryCardPosition> | null>(null);
  const libraryViewAnimationsRef = useRef<Array<ReturnType<typeof gsap.timeline>>>([]);
  const libraryViewPreparationTimerRef = useRef<number | null>(null);
  const libraryViewTransitionRunRef = useRef(0);
  const [libraryViewportWidth, setLibraryViewportWidth] = useState(() =>
    typeof window === "undefined" ? 960 : window.innerWidth,
  );

  const selectLibraryItem = useCallback((item: LibraryItem) => {
    setSelectedItem(item);
  }, []);

  const retryJob = useCallback(async (jobId: string) => {
    setCaptureError(null);
    try {
      const retried = await retryProcessingJob(jobId);
      if (!retried) setCaptureError("That processing job is no longer available to retry.");
    } catch (error) {
      setCaptureError(error instanceof Error ? error.message : String(error));
    }
  }, []);

  const openReader = useCallback((item: LibraryItem, origin: ReaderOrigin = { x: window.innerWidth / 2, y: window.innerHeight / 2 }) => {
    if (!item.articleHtml) return;
    setReadingItem({ item, origin });
  }, []);

  const measureLibraryCards = useCallback(() => {
    const root = libraryScrollRef.current;
    if (!root) return new Map<string, LibraryCardPosition>();

    return new Map(
      Array.from(root.querySelectorAll<HTMLElement>(".library-grid .library-card[data-library-item-id]"))
        .map((card) => {
          const id = card.dataset.libraryItemId;
          if (!id) return null;
          const rect = card.getBoundingClientRect();
          return [id, { left: rect.left, top: rect.top, width: rect.width, height: rect.height }] as const;
        })
        .filter((entry): entry is readonly [string, LibraryCardPosition] => entry !== null),
    );
  }, []);

  const measureLibraryTransitionCards = useCallback(() => {
    const overlay = libraryTransitionOverlayRef.current;
    if (!overlay) return new Map<string, LibraryCardPosition>();

    return new Map(
      Array.from(overlay.querySelectorAll<HTMLElement>(".library-transition-card[data-library-item-id]"))
        .map((card) => {
          const id = card.dataset.libraryItemId;
          if (!id) return null;
          const rect = card.getBoundingClientRect();
          return [id, { left: rect.left, top: rect.top, width: rect.width, height: rect.height }] as const;
        })
        .filter((entry): entry is readonly [string, LibraryCardPosition] => entry !== null),
    );
  }, []);

  const clearLibraryTransitionOverlay = useCallback(() => {
    const overlay = libraryTransitionOverlayRef.current;
    if (!overlay) return;
    overlay.replaceChildren();
    overlay.classList.remove("is-visible", "is-list");
  }, []);

  const buildLibraryTransitionOverlay = useCallback((sourcePositions: Map<string, LibraryCardPosition>, sourceListMode: boolean) => {
    const root = libraryScrollRef.current;
    const overlay = libraryTransitionOverlayRef.current;
    if (!root || !overlay || sourcePositions.size === 0) return false;

    const rootRect = root.getBoundingClientRect();
    overlay.replaceChildren();
    overlay.classList.toggle("is-list", sourceListMode);

    for (const card of root.querySelectorAll<HTMLElement>(".library-grid .library-card[data-library-item-id]")) {
      const id = card.dataset.libraryItemId;
      const source = id ? sourcePositions.get(id) : undefined;
      if (!id || !source) continue;
      if (source.top >= rootRect.bottom || source.top + source.height <= rootRect.top) continue;

      const clone = card.cloneNode(true) as HTMLElement;
      clone.classList.add("library-transition-card");
      clone.dataset.flipId = `library-card-${id}`;
      clone.removeAttribute("tabindex");
      clone.inert = true;
      clone.setAttribute("aria-hidden", "true");
      clone.querySelectorAll("[id]").forEach((element) => element.removeAttribute("id"));
      clone.querySelectorAll("iframe").forEach((iframe) => {
        const placeholder = document.createElement("div");
        placeholder.className = "library-transition-embed-placeholder";
        iframe.replaceWith(placeholder);
      });
      clone.style.left = `${source.left - rootRect.left}px`;
      clone.style.top = `${source.top - rootRect.top}px`;
      clone.style.width = `${source.width}px`;
      clone.style.height = `${source.height}px`;
      clone.style.margin = "0";
      clone.style.transform = "none";
      clone.style.translate = "none";
      clone.style.willChange = "transform, opacity";
      overlay.appendChild(clone);

      const cloneRect = clone.getBoundingClientRect();
      for (const target of clone.querySelectorAll<HTMLElement>(LIBRARY_TRANSITION_TARGET_SELECTOR)) {
        const rect = target.getBoundingClientRect();
        setLibraryTransitionTargetStyle(target, rect.left - cloneRect.left, rect.top - cloneRect.top, rect.width, rect.height);
      }
    }

    return overlay.childElementCount > 0;
  }, []);

  const normalizeLibraryTransitionOverlay = useCallback(() => {
    const overlay = libraryTransitionOverlayRef.current;
    const root = libraryScrollRef.current;
    if (!overlay || !root || overlay.childElementCount === 0) return;

    const rootRect = root.getBoundingClientRect();
    for (const card of overlay.querySelectorAll<HTMLElement>(".library-transition-card")) {
      const rect = card.getBoundingClientRect();
      card.style.left = `${rect.left - rootRect.left}px`;
      card.style.top = `${rect.top - rootRect.top}px`;
      card.style.width = `${rect.width}px`;
      card.style.height = `${rect.height}px`;
      card.style.transform = "none";
      card.style.opacity = "1";
    }
  }, []);

  const cancelLibraryViewAnimations = useCallback(() => {
    for (const animation of libraryViewAnimationsRef.current) animation.kill();
    libraryViewAnimationsRef.current = [];
  }, []);

  const switchLibraryView = useCallback((nextListMode: boolean) => {
    if (nextListMode === listMode) return;

    if (libraryViewPreparationTimerRef.current !== null) {
      window.clearTimeout(libraryViewPreparationTimerRef.current);
      libraryViewPreparationTimerRef.current = null;
    }
    libraryViewTransitionRunRef.current += 1;

    const transitionIsActive = (libraryTransitionOverlayRef.current?.childElementCount ?? 0) > 0;
    const currentPositions = transitionIsActive ? measureLibraryTransitionCards() : measureLibraryCards();
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    cancelLibraryViewAnimations();
    if (transitionIsActive && !prefersReducedMotion) normalizeLibraryTransitionOverlay();

    if (prefersReducedMotion || currentPositions.size === 0) {
      pendingLibraryViewPositionsRef.current = null;
      clearLibraryTransitionOverlay();
      setIsLibraryViewTransitioning(false);
      setViewSelectionListMode(nextListMode);
      setListMode(nextListMode);
      return;
    }

    if (!transitionIsActive) buildLibraryTransitionOverlay(currentPositions, listMode);
    pendingLibraryViewPositionsRef.current = currentPositions;
    setViewSelectionListMode(listMode);
    setIsLibraryViewTransitioning(true);
    setListMode(nextListMode);
  }, [buildLibraryTransitionOverlay, cancelLibraryViewAnimations, clearLibraryTransitionOverlay, listMode, measureLibraryCards, measureLibraryTransitionCards, normalizeLibraryTransitionOverlay]);

  useEffect(() => {
    const element = libraryScrollRef.current;
    if (!element) return;

    const updateWidth = () => {
      const nextWidth = element.clientWidth;
      if (nextWidth > 0) setLibraryViewportWidth((current) => current === nextWidth ? current : nextWidth);
    };
    updateWidth();

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(updateWidth);
      observer.observe(element);
      return () => observer.disconnect();
    }

    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, []);

  useLayoutEffect(() => {
    const firstPositions = pendingLibraryViewPositionsRef.current;
    pendingLibraryViewPositionsRef.current = null;
    if (!firstPositions || firstPositions.size === 0) {
      setIsLibraryViewTransitioning(false);
      setViewSelectionListMode(listMode);
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      clearLibraryTransitionOverlay();
      setIsLibraryViewTransitioning(false);
      setViewSelectionListMode(listMode);
      return;
    }

    const root = libraryScrollRef.current;
    const overlay = libraryTransitionOverlayRef.current;
    if (!root || !overlay || overlay.childElementCount === 0) {
      clearLibraryTransitionOverlay();
      setIsLibraryViewTransitioning(false);
      setViewSelectionListMode(listMode);
      return;
    }

    overlay.classList.add("is-visible");

    const run = libraryViewTransitionRunRef.current;
    const startedAt = performance.now();
    const quietPeriod = 64;
    const maxPreparationTime = 800;
    const columnCount = listMode ? 1 : gridColumnCount;
    const minimumMountedCards = Math.min(firstPositions.size, 5);
    let stableSignature = "";
    let stableSince = startedAt;
    let cancelled = false;

    const positionSignature = (positions: Map<string, LibraryCardPosition>) =>
      Array.from(positions.entries())
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([id, position]) => `${id}:${Math.round(position.left)}:${Math.round(position.top)}:${Math.round(position.width)}:${Math.round(position.height)}`)
        .join("|");

    const finishTransition = (animations: Array<ReturnType<typeof gsap.timeline>>) => {
      if (libraryViewAnimationsRef.current !== animations || run !== libraryViewTransitionRunRef.current) return;
      for (const animation of animations) animation.kill();
      libraryViewAnimationsRef.current = [];
      setIsLibraryViewTransitioning(false);
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          if (run === libraryViewTransitionRunRef.current) clearLibraryTransitionOverlay();
        });
      });
    };

    const animateSettledLayout = (lastPositions: Map<string, LibraryCardPosition>) => {
      if (cancelled || run !== libraryViewTransitionRunRef.current) return;

      const rootRect = root.getBoundingClientRect();
      const clones = Array.from(overlay.querySelectorAll<HTMLElement>(".library-transition-card[data-library-item-id]"));
      const leavingTargets: HTMLElement[] = [];
      const layoutTargets: Array<{
        clone: HTMLElement;
        source: LibraryCardPosition;
        position: LibraryCardPosition;
        sourceBoxes: Array<{ target: HTMLElement; left: number; top: number; width: number; height: number }>;
      }> = [];

      for (const clone of clones) {
        const id = clone.dataset.libraryItemId;
        const first = id ? firstPositions.get(id) : undefined;
        const last = id ? lastPositions.get(id) : undefined;
        if (!id || !first) continue;

        clone.style.willChange = "transform, opacity";
        if (!last) {
          leavingTargets.push(clone);
          continue;
        }

        const sourceCardRect = clone.getBoundingClientRect();
        const sourceTargets = Array.from(clone.querySelectorAll<HTMLElement>(LIBRARY_TRANSITION_TARGET_SELECTOR));
        const sourceBoxes = sourceTargets.map((target) => {
          const rect = target.getBoundingClientRect();
          return {
            target,
            left: rect.left - sourceCardRect.left,
            top: rect.top - sourceCardRect.top,
            width: rect.width,
            height: rect.height,
          };
        });
        layoutTargets.push({ clone, source: first, position: last, sourceBoxes });
      }

      if (layoutTargets.length === 0 && leavingTargets.length === 0) {
        const noAnimations: Array<ReturnType<typeof gsap.timeline>> = [];
        libraryViewAnimationsRef.current = noAnimations;
        finishTransition(noAnimations);
        return;
      }

      for (const { sourceBoxes } of layoutTargets) {
        for (const { target } of sourceBoxes) clearLibraryTransitionTargetStyle(target);
      }
      overlay.classList.toggle("is-list", listMode);
      for (const { clone, position } of layoutTargets) {
        clone.style.left = `${position.left - rootRect.left}px`;
        clone.style.top = `${position.top - rootRect.top}px`;
        clone.style.width = `${position.width}px`;
        clone.style.height = `${position.height}px`;
      }

      const layoutAnimation = gsap.timeline({ paused: true });
      for (const { clone, source, position, sourceBoxes } of layoutTargets) {
        const destinationCardRect = clone.getBoundingClientRect();

        for (const sourceBox of sourceBoxes) {
          const destinationRect = sourceBox.target.getBoundingClientRect();
          const destinationBox = {
            left: destinationRect.left - destinationCardRect.left,
            top: destinationRect.top - destinationCardRect.top,
            width: destinationRect.width,
            height: destinationRect.height,
          };
          setLibraryTransitionTargetStyle(sourceBox.target, sourceBox.left, sourceBox.top, sourceBox.width, sourceBox.height);
          layoutAnimation.fromTo(sourceBox.target, {
            left: sourceBox.left,
            top: sourceBox.top,
            width: sourceBox.width,
            height: sourceBox.height,
          }, {
            left: destinationBox.left,
            top: destinationBox.top,
            width: destinationBox.width,
            height: destinationBox.height,
            duration: LIBRARY_VIEW_TRANSITION_MS / 1000,
            ease: LIBRARY_VIEW_EASE,
            autoRound: false,
          }, 0);
        }

        clone.style.left = `${source.left - rootRect.left}px`;
        clone.style.top = `${source.top - rootRect.top}px`;
        clone.style.width = `${source.width}px`;
        clone.style.height = `${source.height}px`;
        layoutAnimation.fromTo(clone, {
          left: source.left - rootRect.left,
          top: source.top - rootRect.top,
          width: source.width,
          height: source.height,
        }, {
          left: position.left - rootRect.left,
          top: position.top - rootRect.top,
          width: position.width,
          height: position.height,
          duration: LIBRARY_VIEW_TRANSITION_MS / 1000,
          ease: LIBRARY_VIEW_EASE,
          autoRound: false,
        }, 0);
      }

      const animations: Array<ReturnType<typeof gsap.timeline>> = [layoutAnimation];
      if (leavingTargets.length > 0) {
        animations.push(gsap.timeline({ paused: true }).to(leavingTargets, {
            opacity: 0,
            duration: 0.22,
            ease: "power1.out",
          }));
      }

      libraryViewAnimationsRef.current = animations;
      setViewSelectionListMode(listMode);
      let completedAnimations = 0;
      const finishWhenReady = () => {
        completedAnimations += 1;
        if (completedAnimations === animations.length) finishTransition(animations);
      };
      for (const animation of animations) {
        animation.eventCallback("onComplete", finishWhenReady);
        animation.play(0);
      }
    };

    const waitForSettledLayout = () => {
      if (cancelled || run !== libraryViewTransitionRunRef.current) return;
      const positions = measureLibraryCards();
      const signature = positionSignature(positions);
      const now = performance.now();

      const rootWidth = root.clientWidth;
      const gridGap = Number.parseFloat(getComputedStyle(root).gap) || 14;
      const expectedCardWidth = columnCount > 0
        ? (rootWidth - gridGap * Math.max(0, columnCount - 1)) / columnCount
        : 0;
      const layoutIsReady = positions.size >= minimumMountedCards && Array.from(positions.values()).every((position) =>
        rootWidth > 0 && Math.abs(position.width - expectedCardWidth) < 2,
      );
      if (!layoutIsReady) {
        stableSignature = signature;
        stableSince = now;
      } else if (signature !== stableSignature) {
        stableSignature = signature;
        stableSince = now;
      }
      if ((layoutIsReady && now - stableSince >= quietPeriod) || now - startedAt >= maxPreparationTime) {
        animateSettledLayout(positions);
        return;
      }
      libraryViewPreparationTimerRef.current = window.setTimeout(waitForSettledLayout, 16);
    };

    libraryViewPreparationTimerRef.current = window.setTimeout(waitForSettledLayout, 16);
    return () => {
      cancelled = true;
      if (libraryViewPreparationTimerRef.current !== null) {
        window.clearTimeout(libraryViewPreparationTimerRef.current);
        libraryViewPreparationTimerRef.current = null;
      }
    };
  }, [clearLibraryTransitionOverlay, listMode, measureLibraryCards]);

  useEffect(() => () => {
    if (libraryViewPreparationTimerRef.current !== null) {
      window.clearTimeout(libraryViewPreparationTimerRef.current);
      libraryViewPreparationTimerRef.current = null;
    }
    cancelLibraryViewAnimations();
    clearLibraryTransitionOverlay();
  }, [cancelLibraryViewAnimations, clearLibraryTransitionOverlay]);

  async function persistFile(file: File, captureSource: string) {
    const kind = classifyFile(file);
    const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
    if (isTauriRuntime()) {
      const storedItem = await saveFile({
        fileName: file.name,
        mimeType: file.type,
        kind,
        bytes,
      });
      const libraryItem = await storedItemToLibraryItem(storedItem);
      setItems((current) => [libraryItem, ...current]);
      return;
    }

    const image = kind === "image" ? URL.createObjectURL(file) : undefined;
    const mediaDimensions = image ? await readImageDimensions(image) : undefined;

    const item: LibraryItem = {
      id: Date.now(),
      kind: kind === "image" ? "Image" : kind === "pdf" ? "PDF" : kind === "video" ? "Video" : "File",
      title: file.name,
      description: `Saved from ${captureSource}.`,
      source: captureSource,
      date: "Just now",
      tags: [],
      image,
      mediaWidth: mediaDimensions?.width,
      mediaHeight: mediaDimensions?.height,
    };
    setItems((current) => [item, ...current]);
  }

  async function captureFile(file: File, captureSource: string) {
    setCaptureError(null);
    setIsCapturing(true);
    try {
      await persistFile(file, captureSource);
      setSelectedFile(null);
      setIsAdding(false);
      setCaptureMode(null);
    } catch (error) {
      setCaptureError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsCapturing(false);
    }
  }

  async function persistArticle(sourceUrl: string, captureSource: string) {
    const { ingestUrl } = await import("./lib/ingestion");
    const article = await ingestUrl(sourceUrl);
    const metadata = {
      author: article.author,
      publishedDate: article.publishedDate,
      extractedText: article.text,
      html: article.html,
      imageUrls: article.imageUrls,
      imageDimensions: article.imageDimensions,
      safeEmbeds: article.safeEmbeds,
      extractor: article.extractor,
      social: article.social,
      captureSource,
    };

    if (isTauriRuntime()) {
      const storedItem = await createUrl({
        sourceUrl: article.canonicalUrl,
        title: article.title,
        description: article.description,
        body: article.text,
        metadata,
      });
      const libraryItem = await storedItemToLibraryItem(storedItem);
      setItems((current) => [libraryItem, ...current]);
      return;
    }

    const social = article.social;
    const videoLink = social ? null : videoLinkFromSourceUrl(article.canonicalUrl);
    const firstImageDimensions = article.imageDimensions.find((value) => value.url === article.imageUrls[0]);
    const item: LibraryItem = {
      id: Date.now(),
      kind: social ? "Post" : videoLink ? "Video" : "Article",
      title: article.title,
      description: article.description || article.text.slice(0, 180),
      source: social
        ? `X${social.authorHandle ? ` · @${social.authorHandle.replace(/^@/u, "")}` : ""}`
        : new URL(article.canonicalUrl).hostname,
      sourceUrl: article.canonicalUrl,
      author: article.author,
      date: "Just now",
      tags: [],
      image: article.imageUrls[0],
      mediaWidth: firstImageDimensions?.width,
      mediaHeight: firstImageDimensions?.height,
      mediaAspectRatio: firstImageDimensions
        ? firstImageDimensions.width / firstImageDimensions.height
        : undefined,
      articleAuthor: article.author || undefined,
      publishedDate: article.publishedDate ?? undefined,
      articleHtml: article.html,
      social,
      post: social ? postFallbackFromMetadata(social) : undefined,
      video: videoLink ?? undefined,
    };
    setItems((current) => [item, ...current]);
  }

  async function captureArticle(sourceUrl: string, captureSource: string) {
    setCaptureError(null);
    setIsCapturing(true);
    try {
      await persistArticle(sourceUrl, captureSource);
      setCaptureUrl("");
      setIsAdding(false);
      setCaptureMode(null);
    } catch (error) {
      setCaptureError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsCapturing(false);
    }
  }

  async function captureText(text: string, captureSource: string) {
    setCaptureError(null);
    setIsCapturing(true);
    try {
      await persistText(text, captureSource);
    } catch (error) {
      setCaptureError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsCapturing(false);
    }
  }

  async function persistText(text: string, captureSource: string) {
    const value = text.trim();
    if (!value) return;
    if (/^https?:\/\//iu.test(value)) {
      await persistArticle(value, captureSource);
      return;
    }

    if (isTauriRuntime()) {
      const storedItem = await createNote({
        body: value,
        metadata: { captureSource },
      });
      const libraryItem = await storedItemToLibraryItem(storedItem);
      setItems((current) => [libraryItem, ...current]);
      return;
    }

    const item: LibraryItem = {
      id: Date.now(),
      kind: "Note",
      title: value,
      description: "Saved from the clipboard.",
      source: captureSource,
      date: "Just now",
      tags: [],
      accent: "paper-blue",
    };
    setItems((current) => [item, ...current]);
  }

  async function persistQuote(
    quoteText: string,
    attribution: string,
    sourceUrl: string,
    captureSource: string,
  ) {
    const body = quoteText.trim();
    if (!body) throw new Error("Quote text cannot be empty.");
    const trimmedAttribution = attribution.trim();
    const rawSource = sourceUrl.trim();
    const trimmedSource = rawSource && !/^[a-zA-Z][a-zA-Z0-9+.-]*:/u.test(rawSource) && rawSource.includes(".") && !rawSource.includes(" ")
      ? `https://${rawSource}`
      : rawSource;

    if (isTauriRuntime()) {
      const storedItem = await createQuote({
        body,
        attribution: trimmedAttribution || undefined,
        sourceUrl: trimmedSource || undefined,
        metadata: { captureSource },
      });
      const libraryItem = await storedItemToLibraryItem(storedItem);
      setItems((current) => [libraryItem, ...current]);
      return;
    }

    let sourceLabel = "Quote";
    if (trimmedSource) {
      try {
        sourceLabel = new URL(trimmedSource).hostname.replace(/^www\./u, "");
      } catch {
        sourceLabel = trimmedSource;
      }
    } else if (trimmedAttribution) {
      sourceLabel = trimmedAttribution.split(",")[0]?.trim() || "Quote";
    }

    const item: LibraryItem = {
      id: Date.now(),
      kind: "Quote",
      title: body,
      description: trimmedAttribution,
      source: sourceLabel,
      date: "Just now",
      tags: [],
      accent: "paper-yellow",
      sourceUrl: trimmedSource || undefined,
    };
    setItems((current) => [item, ...current]);
  }

  async function captureScreenshot() {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setCaptureError("Screenshot capture is not available in this window.");
      return;
    }

    setCaptureError(null);
    setIsCapturing(true);
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const video = document.createElement("video");
      video.srcObject = stream;
      await video.play();
      const width = video.videoWidth;
      const height = video.videoHeight;
      if (width === 0 || height === 0) throw new Error("The selected display has no capturable frame.");
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d")?.drawImage(video, 0, 0, width, height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("The screenshot could not be encoded.");
      const file = new File([blob], `screenshot-${Date.now()}.png`, { type: "image/png" });
      await persistFile(file, "screenshot");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setCaptureError(error instanceof Error ? error.message : String(error));
    } finally {
      stream?.getTracks().forEach((track) => track.stop());
      setIsCapturing(false);
    }
  }

  function extensionCaptureTarget(value: string): string | null {
    try {
      const parsed = new URL(value);
      if (!["inkling:", "mymind:"].includes(parsed.protocol) || parsed.hostname !== "capture") return null;
      const target = parsed.searchParams.get("url") ?? parsed.searchParams.get("source");
      return target && /^https?:\/\//iu.test(target) ? target : null;
    } catch {
      return null;
    }
  }

  async function findSimilarImages(item: LibraryItem) {
    if (!isTauriRuntime()) {
      setCaptureError("Image similarity is available in the Windows app.");
      return;
    }

    setCaptureError(null);
    setIsFindingSimilar(true);
    try {
      const storedItems = await searchSimilarImages(String(item.id));
      const libraryItems = await Promise.all(storedItems.map(async (storedItem) => {
        const jobs = await getJobStatus(storedItem.id);
        return storedItemToLibraryItem(storedItem, summarizeProcessingJobs(jobs));
      }));
      setQuery("");
      setSimilaritySource({ id: String(item.id), title: item.title });
      setItems(libraryItems);
      setSelectedItem(null);
    } catch (error) {
      setCaptureError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsFindingSimilar(false);
    }
  }

  function selectSpace(space: StoredSpace) {
    setActiveSpaceId(space.id);
    setActiveView(space.name);
    setQuery("");
    setSimilaritySource(null);
    setSelectedItem(null);
  }

  function clearToDefaultView() {
    setActiveSpaceId(null);
    setActiveView("Everything");
  }

  function beginSaveSearch() {
    setIsCreatingSpace(true);
    setNewSpaceName(query.trim());
  }

  async function handleCreateSpace(event: React.FormEvent) {
    event.preventDefault();
    const name = newSpaceName.trim();
    if (!name) return;

    const spaceQuery: SmartSpaceQuery = query.trim() ? { text: query.trim() } : {};
    const color = SPACE_COLORS[spaces.length % SPACE_COLORS.length];
    setCaptureError(null);

    try {
      const created = isTauriRuntime()
        ? await createSpace({ name, color, query: spaceQuery })
        : {
            id: `local-space-${Date.now()}`,
            name,
            color,
            query: spaceQuery,
            position: spaces.length + 1,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
      setSpaces((current) => [...current, created]);
      setIsCreatingSpace(false);
      setNewSpaceName("");
      selectSpace(created);
    } catch (error) {
      setCaptureError(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleDeleteSpace(space: StoredSpace) {
    setCaptureError(null);
    try {
      if (isTauriRuntime()) await deleteSpace(space.id);
      setSpaces((current) => current.filter((candidate) => candidate.id !== space.id));
      if (activeSpaceId === space.id) clearToDefaultView();
    } catch (error) {
      setCaptureError(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleDeepLinkPayload(payload: unknown) {
    const values: string[] = Array.isArray(payload)
      ? payload.filter((value): value is string => typeof value === "string")
      : typeof payload === "string"
        ? [payload]
        : [];
    for (const value of values) {
      const target = extensionCaptureTarget(value);
      if (target) await captureArticle(target, "browser extension");
    }
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (readingItem) return;
      if (event.key === "/" && document.activeElement?.tagName !== "INPUT") {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === "Escape") {
        setSelectedItem(null);
        setIsAdding(false);
        setCaptureMode(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [readingItem]);

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLElement && target.isContentEditable) {
        return;
      }

      const file = Array.from(event.clipboardData?.files ?? [])[0];
      if (file) {
        event.preventDefault();
        void captureFile(file, "clipboard");
        return;
      }

      const text = event.clipboardData?.getData("text/plain").trim();
      if (text) {
        event.preventDefault();
        void captureText(text, "clipboard");
      }
    };

    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    let cancelled = false;
    const unlisten: Array<() => void> = [];

    async function connectCaptureEvents() {
      const removeListener = await listen<string[]>("deep-link://new-url", (event) => {
        void handleDeepLinkPayload(event.payload);
      });
      if (cancelled) {
        removeListener();
      } else {
        unlisten.push(removeListener);
      }

      const links = await currentDeepLinks();
      if (!cancelled) {
        for (const link of links ?? []) await handleDeepLinkPayload(link);
      }
    }

    void connectCaptureEvents().catch((error: unknown) => {
      if (!cancelled) setCaptureError(error instanceof Error ? error.message : String(error));
    });
    return () => {
      cancelled = true;
      unlisten.forEach((removeListener) => removeListener());
    };
  }, []);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    let cancelled = false;
    listSpaces()
      .then((storedSpaces) => {
        if (!cancelled) setSpaces(storedSpaces);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    let cancelled = false;
    let loading = false;

    async function loadItems() {
      if (loading) return;
      loading = true;
      try {
        await initializeStorage();
        const storedItemsPromise = similaritySource
          ? searchSimilarImages(similaritySource.id)
          : activeSpaceId
            ? listSpaceItems(activeSpaceId)
            : query.trim()
              ? searchItems(query)
              : listActiveItems();
        const storedItems = await storedItemsPromise;
        const libraryItems = await Promise.all(storedItems.map(async (item) => {
          const jobs = await getJobStatus(item.id);
          return storedItemToLibraryItem(item, summarizeProcessingJobs(jobs));
        }));
        if (!cancelled) {
          setItems(libraryItems);
        }
      } catch (error) {
        if (!cancelled) setCaptureError(error instanceof Error ? error.message : String(error));
      } finally {
        loading = false;
      }
    }

    void loadItems();
    const refreshTimer = window.setInterval(() => void loadItems(), 1000);
    return () => {
      cancelled = true;
      window.clearInterval(refreshTimer);
    };
  }, [query, similaritySource?.id, activeSpaceId]);

  const activeSpace = useMemo(
    () => spaces.find((space) => space.id === activeSpaceId) ?? null,
    [spaces, activeSpaceId],
  );

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return items.filter((item) => {
      const matchesQuery = !normalizedQuery
        ? true
        : isTauriRuntime() || similaritySource || activeSpace
          ? true
          : [item.title, item.description, item.source, item.kind, ...item.tags]
            .join(" ")
            .toLowerCase()
            .includes(normalizedQuery);
      const matchesView =
        activeView === "Everything" ||
        (activeView === "Top of mind" && item.favorite) ||
        (activeSpace
          ? isTauriRuntime() || itemMatchesSmartQuery(item, activeSpace.query)
          : false);
      return matchesQuery && matchesView;
    });
  }, [activeSpace, activeView, items, query, similaritySource]);

  async function saveCapture(event: React.FormEvent) {
    event.preventDefault();
    setCaptureError(null);

    if (!captureMode) return;

    try {
      if (captureMode === "note") {
        if (!newTitle.trim()) return;
        await persistText(newTitle.trim(), "quick note");
      } else if (captureMode === "quote") {
        if (!newQuoteText.trim()) return;
        await persistQuote(newQuoteText, newQuoteAttribution, newQuoteSourceUrl, "quick quote");
      } else if (captureMode === "url") {
        if (!captureUrl.trim()) return;
        await persistArticle(captureUrl.trim(), "quick link");
      } else {
        if (!selectedFile) return;
        await persistFile(selectedFile, "file picker");
      }

      setNewTitle("");
      setNewQuoteText("");
      setNewQuoteAttribution("");
      setNewQuoteSourceUrl("");
      setCaptureUrl("");
      setSelectedFile(null);
      setIsAdding(false);
      setCaptureMode(null);
    } catch (error) {
      setCaptureError(error instanceof Error ? error.message : String(error));
    }
  }

  function selectCaptureMode(mode: CaptureMode) {
    setCaptureMode(mode);
    setCaptureError(null);
  }

  function openCapture(mode: CaptureMode | null = null) {
    setCaptureError(null);
    setSelectedFile(null);
    setCaptureMode(mode);
    setIsAdding(true);
  }

  function openCaptureModal() {
    openCapture();
  }

  function closeCaptureModal() {
    if (isCapturing) return;
    setIsAdding(false);
    setCaptureMode(null);
    setSelectedFile(null);
  }

  function startScreenshotCapture() {
    setIsAdding(false);
    setCaptureMode(null);
    void captureScreenshot();
  }

  function handleDragOver(event: React.DragEvent<HTMLElement>) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setIsDragActive(true);
  }

  function handleDragLeave(event: React.DragEvent<HTMLElement>) {
    if (event.currentTarget === event.target) setIsDragActive(false);
  }

  function handleDrop(event: React.DragEvent<HTMLElement>) {
    event.preventDefault();
    setIsDragActive(false);
    const file = Array.from(event.dataTransfer.files)[0];
    if (file) {
      void captureFile(file, "drag and drop");
      return;
    }

    const droppedText = (event.dataTransfer.getData("text/uri-list") || event.dataTransfer.getData("text/plain"))
      .split(/\r?\n/u)
      .map((value) => value.trim())
      .find(Boolean);
    if (!droppedText) return;
    if (/^https?:\/\//iu.test(droppedText)) {
      void captureArticle(droppedText, "drag and drop");
    } else {
      void captureText(droppedText, "drag and drop");
    }
  }

  const libraryCardContext = useMemo<LibraryCardContext>(() => ({
    onSelectItem: selectLibraryItem,
    onOpenReader: openReader,
    onRetryJob: retryJob,
  }), [openReader, retryJob, selectLibraryItem]);

  const gridColumnCount = masonryColumnCount(libraryViewportWidth);

  return (
    <MotionConfig reducedMotion="user">
      <div className={`app-shell ${isDragActive ? "drag-active" : ""}`} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
        <AnimatePresence>
          {isSidebarOpen && (
            <motion.button
              key="sidebar-scrim"
              type="button"
              className="sidebar-scrim"
              aria-label="Close navigation"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
              onClick={() => setIsSidebarOpen(false)}
            />
          )}
        </AnimatePresence>
      <aside id="library-navigation" className={`sidebar ${isSidebarOpen ? "is-open" : ""}`}>
          <div className="brand-lockup" data-tauri-drag-region>
          <div className="brand-mark" aria-hidden="true">
            <svg viewBox="-125 -125 250 250" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <mask id="bot-mask-2xogmq" maskUnits="userSpaceOnUse" x="-158" y="-158" width="316" height="316">
                  <path d="M98.02 0.27C97.53 3.45 96.85 6.6 96.04 9.68C95.23 12.75 94.25 15.76 93.17 18.7C92.08 21.63 90.85 24.49 89.54 27.27C88.22 30.05 86.79 32.76 85.27 35.38C83.76 38 82.15 40.54 80.47 43.01C78.78 45.48 77.02 47.86 75.18 50.17C73.34 52.48 71.43 54.72 69.45 56.87C67.47 59.02 65.42 61.1 63.29 63.09C61.17 65.08 58.97 66.99 56.71 68.8C54.44 70.62 52.1 72.35 49.69 73.97C47.29 75.59 44.81 77.12 42.27 78.53C39.73 79.93 37.11 81.24 34.45 82.41C31.78 83.58 29.05 84.63 26.28 85.54C23.51 86.45 20.67 87.24 17.82 87.87C14.97 88.51 12.06 89.01 9.15 89.35C6.24 89.7 3.3 89.91 0.36 89.96C-2.57 90.02 -5.53 89.93 -8.46 89.7C-11.39 89.47 -14.33 89.1 -17.23 88.59C-20.14 88.09 -23.03 87.44 -25.89 86.67C-28.75 85.9 -31.58 84.99 -34.37 83.97C-37.15 82.95 -39.91 81.8 -42.62 80.55C-45.33 79.29 -48 77.91 -50.61 76.43C-53.22 74.94 -55.8 73.34 -58.3 71.63C-60.81 69.92 -63.27 68.1 -65.65 66.17C-68.04 64.24 -70.37 62.2 -72.6 60.05C-74.84 57.89 -77.01 55.63 -79.06 53.25C-81.12 50.87 -83.1 48.38 -84.93 45.78C-86.77 43.19 -88.51 40.47 -90.09 37.67C-91.66 34.87 -93.11 31.95 -94.37 28.96C-95.63 25.97 -96.74 22.87 -97.64 19.73C-98.53 16.59 -99.25 13.35 -99.74 10.11C-100.24 6.87 -100.53 3.56 -100.58 0.27C-100.64 -3.02 -100.47 -6.34 -100.07 -9.61C-99.67 -12.87 -99.04 -16.13 -98.19 -19.3C-97.34 -22.47 -96.25 -25.6 -94.97 -28.6C-93.69 -31.6 -92.18 -34.53 -90.51 -37.31C-88.85 -40.09 -86.96 -42.76 -84.96 -45.26C-82.96 -47.77 -80.78 -50.14 -78.51 -52.34C-76.24 -54.55 -73.82 -56.6 -71.36 -58.49C-68.9 -60.39 -66.32 -62.12 -63.73 -63.72C-61.14 -65.31 -58.48 -66.75 -55.82 -68.07C-53.16 -69.4 -50.46 -70.57 -47.78 -71.66C-45.1 -72.75 -42.41 -73.72 -39.73 -74.62C-37.06 -75.52 -34.39 -76.32 -31.73 -77.08C-29.07 -77.84 -26.42 -78.52 -23.77 -79.16C-21.12 -79.81 -18.48 -80.4 -15.82 -80.96C-13.16 -81.52 -10.5 -82.04 -7.8 -82.52C-5.11 -82.99 -2.39 -83.43 0.36 -83.81C3.12 -84.18 5.91 -84.52 8.75 -84.76C11.59 -85.01 14.48 -85.2 17.41 -85.26C20.34 -85.33 23.32 -85.32 26.32 -85.15C29.33 -84.98 32.38 -84.71 35.44 -84.25C38.49 -83.8 41.58 -83.2 44.63 -82.41C47.68 -81.61 50.76 -80.65 53.74 -79.48C56.73 -78.31 59.71 -76.95 62.56 -75.38C65.41 -73.82 68.21 -72.05 70.84 -70.09C73.48 -68.13 76.02 -65.96 78.37 -63.64C80.71 -61.31 82.93 -58.78 84.92 -56.13C86.91 -53.48 88.73 -50.65 90.32 -47.73C91.91 -44.82 93.3 -41.75 94.46 -38.64C95.61 -35.53 96.55 -32.3 97.26 -29.07C97.98 -25.85 98.46 -22.54 98.75 -19.27C99.03 -15.99 99.09 -12.68 98.96 -9.43C98.84 -6.17 98.51 -2.91 98.02 0.27Z" fill="#fff" />
                  <path d="M-12 -11A12 12 0 0 1 0 -23L0 -23A12 12 0 0 1 12 -11L12 11A12 12 0 0 1 0 23L0 23A12 12 0 0 1 -12 11Z" transform="matrix(0.95,-0.3,0.3,0.93,0.76,17.82)" opacity="1" fill="#000" />
                  <path d="M-10 -9A10 10 0 0 1 0 -19L0 -19A10 10 0 0 1 10 -9L10 9A10 10 0 0 1 0 19L0 19A10 10 0 0 1 -10 9Z" transform="matrix(0.77,-0.39,0.28,0.91,51.44,6.78)" opacity="1" fill="#000" />
                </mask>
              </defs>
              <path d="M98.02 0.27C97.53 3.45 96.85 6.6 96.04 9.68C95.23 12.75 94.25 15.76 93.17 18.7C92.08 21.63 90.85 24.49 89.54 27.27C88.22 30.05 86.79 32.76 85.27 35.38C83.76 38 82.15 40.54 80.47 43.01C78.78 45.48 77.02 47.86 75.18 50.17C73.34 52.48 71.43 54.72 69.45 56.87C67.47 59.02 65.42 61.1 63.29 63.09C61.17 65.08 58.97 66.99 56.71 68.8C54.44 70.62 52.1 72.35 49.69 73.97C47.29 75.59 44.81 77.12 42.27 78.53C39.73 79.93 37.11 81.24 34.45 82.41C31.78 83.58 29.05 84.63 26.28 85.54C23.51 86.45 20.67 87.24 17.82 87.87C14.97 88.51 12.06 89.01 9.15 89.35C6.24 89.7 3.3 89.91 0.36 89.96C-2.57 90.02 -5.53 89.93 -8.46 89.7C-11.39 89.47 -14.33 89.1 -17.23 88.59C-20.14 88.09 -23.03 87.44 -25.89 86.67C-28.75 85.9 -31.58 84.99 -34.37 83.97C-37.15 82.95 -39.91 81.8 -42.62 80.55C-45.33 79.29 -48 77.91 -50.61 76.43C-53.22 74.94 -55.8 73.34 -58.3 71.63C-60.81 69.92 -63.27 68.1 -65.65 66.17C-68.04 64.24 -70.37 62.2 -72.6 60.05C-74.84 57.89 -77.01 55.63 -79.06 53.25C-81.12 50.87 -83.1 48.38 -84.93 45.78C-86.77 43.19 -88.51 40.47 -90.09 37.67C-91.66 34.87 -93.11 31.95 -94.37 28.96C-95.63 25.97 -96.74 22.87 -97.64 19.73C-98.53 16.59 -99.25 13.35 -99.74 10.11C-100.24 6.87 -100.53 3.56 -100.58 0.27C-100.64 -3.02 -100.47 -6.34 -100.07 -9.61C-99.67 -12.87 -99.04 -16.13 -98.19 -19.3C-97.34 -22.47 -96.25 -25.6 -94.97 -28.6C-93.69 -31.6 -92.18 -34.53 -90.51 -37.31C-88.85 -40.09 -86.96 -42.76 -84.96 -45.26C-82.96 -47.77 -80.78 -50.14 -78.51 -52.34C-76.24 -54.55 -73.82 -56.6 -71.36 -58.49C-68.9 -60.39 -66.32 -62.12 -63.73 -63.72C-61.14 -65.31 -58.48 -66.75 -55.82 -68.07C-53.16 -69.4 -50.46 -70.57 -47.78 -71.66C-45.1 -72.75 -42.41 -73.72 -39.73 -74.62C-37.06 -75.52 -34.39 -76.32 -31.73 -77.08C-29.07 -77.84 -26.42 -78.52 -23.77 -79.16C-21.12 -79.81 -18.48 -80.4 -15.82 -80.96C-13.16 -81.52 -10.5 -82.04 -7.8 -82.52C-5.11 -82.99 -2.39 -83.43 0.36 -83.81C3.12 -84.18 5.91 -84.52 8.75 -84.76C11.59 -85.01 14.48 -85.2 17.41 -85.26C20.34 -85.33 23.32 -85.32 26.32 -85.15C29.33 -84.98 32.38 -84.71 35.44 -84.25C38.49 -83.8 41.58 -83.2 44.63 -82.41C47.68 -81.61 50.76 -80.65 53.74 -79.48C56.73 -78.31 59.71 -76.95 62.56 -75.38C65.41 -73.82 68.21 -72.05 70.84 -70.09C73.48 -68.13 76.02 -65.96 78.37 -63.64C80.71 -61.31 82.93 -58.78 84.92 -56.13C86.91 -53.48 88.73 -50.65 90.32 -47.73C91.91 -44.82 93.3 -41.75 94.46 -38.64C95.61 -35.53 96.55 -32.3 97.26 -29.07C97.98 -25.85 98.46 -22.54 98.75 -19.27C99.03 -15.99 99.09 -12.68 98.96 -9.43C98.84 -6.17 98.51 -2.91 98.02 0.27Z" fill="#f9f9f9" />
              <g mask="url(#bot-mask-2xogmq)">
                <rect x="-158" y="-158" width="316" height="316" fill="#0a0a0c" />
              </g>
            </svg>
          </div>
          <div>
            <strong>inkling</strong>
            <span>library</span>
          </div>
          <button
            type="button"
            className="sidebar-close"
            aria-label="Close panel"
            onClick={() => setIsSidebarOpen(false)}
          >
            <PanelLeftClose size={16} />
          </button>
        </div>

        <nav className="primary-nav" aria-label="Main navigation">
          <button
            className={`nav-item ${activeView === "Everything" && !activeSpaceId ? "active" : ""}`}
            onClick={clearToDefaultView}
          >
            <Layers3 size={17} />
            <span>Everything</span>
            <span className="nav-count">{items.length}</span>
          </button>
          <button
            className={`nav-item ${activeView === "Top of mind" && !activeSpaceId ? "active" : ""}`}
            onClick={() => {
              setActiveSpaceId(null);
              setActiveView("Top of mind");
            }}
          >
            <Sparkles size={17} />
            <span>Top of mind</span>
          </button>
          <button className="nav-item" onClick={() => { setActiveSpaceId(null); setActiveView("Serendipity"); }}>
            <Clock3 size={17} />
            <span>Serendipity</span>
          </button>
          <button className="nav-item" onClick={() => { setActiveSpaceId(null); setActiveView("Archive"); }}>
            <Archive size={17} />
            <span>Archive</span>
          </button>
        </nav>

        <div className="sidebar-section">
          <div className="sidebar-heading">
            <span>Spaces</span>
            <button
              className="icon-button small"
              aria-label="Add a Space"
              title="Add a Smart Space"
              onClick={() => {
                setIsCreatingSpace((current) => !current);
                setNewSpaceName("");
              }}
            >
              <Plus size={15} />
            </button>
          </div>
          <div className="space-list">
            {spaces.map((space) => (
              <div
                className={`space-item ${activeSpaceId === space.id ? "selected" : ""}`}
                key={space.id}
                role="button"
                tabIndex={0}
                onClick={() => selectSpace(space)}
                onKeyDown={(event) => event.key === "Enter" && selectSpace(space)}
              >
                <span className={`space-dot ${space.color}`} />
                <span>{space.name}</span>
                <span className="space-count">{activeSpaceId === space.id ? filteredItems.length : ""}</span>
                <button
                  type="button"
                  className="space-delete"
                  aria-label={`Delete ${space.name}`}
                  title="Delete Space"
                  onClick={(event) => {
                    event.stopPropagation();
                    void handleDeleteSpace(space);
                  }}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
          <AnimatePresence mode="wait">
            {isCreatingSpace && (
              <motion.form
                key="space-form"
                className="space-form"
                initial={{ opacity: 0, transform: "translateY(-6px)" }}
                animate={{ opacity: 1, transform: "translateY(0)" }}
                exit={{ opacity: 0, transform: "translateY(-4px)" }}
                transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                onSubmit={handleCreateSpace}
              >
              <input
                autoFocus
                value={newSpaceName}
                onChange={(event) => setNewSpaceName(event.target.value)}
                placeholder={query.trim() ? `Save “${query.trim()}” as…` : "Name this space"}
                aria-label="Space name"
                maxLength={80}
              />
              <p className="space-form-hint">
                {query.trim()
                  ? "A Smart Space that updates automatically as items match this search."
                  : "An empty Smart Space matches everything you have saved."}
              </p>
              <div className="space-form-actions">
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setIsCreatingSpace(false);
                    setNewSpaceName("");
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className="capture-save">Create Space</button>
              </div>
              </motion.form>
            )}
          </AnimatePresence>
        </div>

        <div className="sidebar-footer">
          <button className="nav-item footer-item" aria-label="Settings" title="Settings">
            <Settings2 size={17} />
            <span>Settings</span>
          </button>
          <button className="nav-item footer-item" aria-label="Help & shortcuts" title="Help & shortcuts">
            <CircleHelp size={17} />
            <span>Help & shortcuts</span>
          </button>
        </div>
      </aside>

      <button
        type="button"
        className="sidebar-toggle"
        aria-label={isSidebarOpen ? "Close navigation" : "Open navigation"}
        aria-expanded={isSidebarOpen}
        aria-controls="library-navigation"
        onClick={() => setIsSidebarOpen((current) => !current)}
      >
        {isSidebarOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
      </button>

      <main className="main-content">
        <section className="library-header">
        </section>

        <section className="capture-bar" aria-label="Capture and search">
          <div className="search-field">
            <Search size={19} />
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => {
                setSimilaritySource(null);
                setActiveSpaceId(null);
                setActiveView("Everything");
                setQuery(event.target.value);
              }}
              placeholder="Search your mind"
              aria-label="Search your mind"
            />
            <kbd><span>/</span> to search</kbd>
          </div>
          <button className="add-button" onClick={openCaptureModal} disabled={isCapturing} title="Add something to your library">
            <Plus size={18} />
            <span>{isCapturing ? "Saving…" : "Add to library"}</span>
          </button>
        </section>

        <AnimatePresence>
          {isAdding && (
            <motion.div
              key="capture-modal"
              className="capture-modal-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
              onMouseDown={(event) => event.target === event.currentTarget && closeCaptureModal()}
            >
              <motion.section
                className="capture-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="capture-modal-title"
                initial={{ opacity: 0, transform: "translateY(8px) scale(0.98)" }}
                animate={{ opacity: 1, transform: "translateY(0) scale(1)" }}
                exit={{ opacity: 0, transform: "translateY(8px) scale(0.98)" }}
                transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
              >
              <header className="capture-modal-header">
                <div>
                  <h2 id="capture-modal-title">Add to your library</h2>
                  <p>Choose what you want to save.</p>
                </div>
                <button className="icon-button small" type="button" onClick={closeCaptureModal} aria-label="Close add menu"><X size={16} /></button>
              </header>

              <div className="capture-options" aria-label="Add options">
                <button type="button" className={`capture-option ${captureMode === "note" ? "selected" : ""}`} onClick={() => selectCaptureMode("note")} aria-pressed={captureMode === "note"}>
                  <span className="capture-option-icon"><FileText size={18} /></span>
                  <span className="capture-option-copy"><strong>Note</strong><span>Write something to remember.</span></span>
                </button>
                <button type="button" className={`capture-option ${captureMode === "url" ? "selected" : ""}`} onClick={() => selectCaptureMode("url")} aria-pressed={captureMode === "url"}>
                  <span className="capture-option-icon"><Link2 size={18} /></span>
                  <span className="capture-option-copy"><strong>Link</strong><span>Save an article, page, or X post.</span></span>
                </button>
                <button type="button" className={`capture-option ${captureMode === "file" ? "selected" : ""}`} onClick={() => selectCaptureMode("file")} aria-pressed={captureMode === "file"}>
                  <span className="capture-option-icon"><ImageIcon size={18} /></span>
                  <span className="capture-option-copy"><strong>File</strong><span>Upload an image, PDF, or video.</span></span>
                </button>
                <button type="button" className={`capture-option ${captureMode === "quote" ? "selected" : ""}`} onClick={() => selectCaptureMode("quote")} aria-pressed={captureMode === "quote"}>
                  <span className="capture-option-icon"><Bookmark size={18} /></span>
                  <span className="capture-option-copy"><strong>Quote</strong><span>Save a passage with its source.</span></span>
                </button>
                <button type="button" className="capture-option" onClick={startScreenshotCapture} disabled={isCapturing}>
                  <span className="capture-option-icon"><Camera size={18} /></span>
                  <span className="capture-option-copy"><strong>Screenshot</strong><span>Capture a window or display.</span></span>
                </button>
              </div>

              <AnimatePresence mode="wait">
                {captureMode && (
                  <motion.form
                    key={captureMode}
                    className="capture-editor"
                    initial={{ opacity: 0, transform: "translateY(6px)" }}
                    animate={{ opacity: 1, transform: "translateY(0)" }}
                    exit={{ opacity: 0, transform: "translateY(-4px)" }}
                    transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                    onSubmit={saveCapture}
                  >
                  <div className="capture-editor-heading">
                    <strong>{captureMode === "note" ? "New note" : captureMode === "quote" ? "New quote" : captureMode === "url" ? "Save a link" : "Upload a file"}</strong>
                  </div>
                  {captureMode === "note" && <input
                    autoFocus
                    value={newTitle}
                    onChange={(event) => setNewTitle(event.target.value)}
                    placeholder="A thought, a link, a small beginning…"
                    aria-label="New note"
                  />}
                  {captureMode === "url" && <input
                    autoFocus
                    type="url"
                    value={captureUrl}
                    onChange={(event) => setCaptureUrl(event.target.value)}
                    placeholder="Paste a link to save and read later…"
                    aria-label="URL to save"
                  />}
                  {captureMode === "quote" && <div className="quote-capture-fields">
                    <textarea
                      autoFocus
                      value={newQuoteText}
                      onChange={(event) => setNewQuoteText(event.target.value)}
                      placeholder="“The mind is a place with weather…”"
                      aria-label="Quote text"
                      rows={3}
                      maxLength={2000}
                    />
                    <div className="quote-capture-row">
                      <input
                        value={newQuoteAttribution}
                        onChange={(event) => setNewQuoteAttribution(event.target.value)}
                        placeholder="Attribution"
                        aria-label="Quote attribution"
                        maxLength={240}
                      />
                      <input
                        type="text"
                        value={newQuoteSourceUrl}
                        onChange={(event) => setNewQuoteSourceUrl(event.target.value)}
                        placeholder="Source URL (optional)"
                        aria-label="Quote source URL"
                        inputMode="url"
                      />
                    </div>
                  </div>}
                  {captureMode === "file" && <>
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="visually-hidden"
                      accept="image/*,application/pdf,video/*"
                      onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
                    />
                    <button type="button" className="file-picker" onClick={() => fileInputRef.current?.click()}>
                      {selectedFile ? selectedFile.name : "Choose an image, PDF, or video"}
                    </button>
                  </>}
                  <div className="capture-editor-actions">
                    <button className="capture-cancel" type="button" onClick={() => setCaptureMode(null)}>Back</button>
                    <button className="capture-save" type="submit" disabled={isCapturing}>{isCapturing ? "Saving…" : "Save to library"}</button>
                  </div>
                  </motion.form>
                )}
              </AnimatePresence>

              {captureError && <p className="capture-error" role="alert">Couldn’t save this yet: {captureError}</p>}
              </motion.section>
            </motion.div>
          )}
        </AnimatePresence>

        {captureError && !isAdding && <p className="capture-error">Couldn’t save this yet: {captureError}</p>}

        <div className="library-toolbar">
          <div className="result-context">
            <span className="result-count">{filteredItems.length}</span> items in library
            {similaritySource ? (
              <span className="search-context">similar to “{similaritySource.title}”</span>
            ) : query.trim() ? (
              <>
                <span className="search-context">for “{query}”</span>
                <button type="button" className="quiet-link save-space-link" onClick={beginSaveSearch}>
                  <Bookmark size={13} /> Save as Space
                </button>
              </>
            ) : null}
          </div>
          <div className="toolbar-actions">
            <div className="view-controls" aria-label="View options">
              <motion.span
                className="view-selection"
                aria-hidden="true"
                initial={false}
                animate={{ transform: viewSelectionListMode ? "translateX(30px)" : "translateX(0px)" }}
                transition={{ duration: LIBRARY_VIEW_TRANSITION_MS / 1000, ease: [0.77, 0, 0.175, 1] }}
              />
              <button className={`view-button ${!listMode ? "selected" : ""}`} onClick={() => switchLibraryView(false)} aria-label="Grid view" aria-pressed={!listMode} title="Grid view"><Grid2X2 size={16} /></button>
              <button className={`view-button ${listMode ? "selected" : ""}`} onClick={() => switchLibraryView(true)} aria-label="List view" aria-pressed={listMode} title="List view"><List size={16} /></button>
            </div>
          </div>
        </div>

        <div className="library-scroll" ref={libraryScrollRef}>
        {filteredItems.length > 0 && (
          <VirtuosoMasonry
            className={`library-grid ${listMode ? "list-mode" : ""} ${isLibraryViewTransitioning ? "view-transitioning" : ""}`}
            columnCount={listMode ? 1 : gridColumnCount}
            data={filteredItems}
            context={libraryCardContext}
            ItemContent={VirtualizedLibraryItem}
            style={{ height: "100%", width: "100%" }}
          />
        )}

        <div ref={libraryTransitionOverlayRef} className="library-transition-overlay" aria-hidden="true" />

        {filteredItems.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon"><Search size={20} /></div>
            <h2>Nothing surfaced yet.</h2>
            <p>Try another word, or save something new to your mind.</p>
            <button className="text-button" onClick={() => { setQuery(""); setSimilaritySource(null); clearToDefaultView(); }}>Clear search</button>
          </div>
        )}

        </div>
      </main>

      <AnimatePresence>
        {selectedItem && (
          <motion.aside
            key="inspector"
            className="item-inspector"
            aria-label="Selected item"
            initial={{ opacity: 0, transform: "translateX(12px)" }}
            animate={{ opacity: 1, transform: "translateX(0)" }}
            exit={{ opacity: 0, transform: "translateX(12px)" }}
            transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
          >
          <button type="button" className="inspector-close icon-button small" onClick={() => setSelectedItem(null)} aria-label="Close details"><X size={16} /></button>
          {selectedItem.social?.provider === "x" ? (
            <div className="x-post-inspector">
              <XPostEmbed
                social={selectedItem.social}
                fallback={selectedItem.post ? <PostArtwork post={selectedItem.post} /> : <div className="inspector-art ink">Post preview unavailable.</div>}
              />
            </div>
          ) : selectedItem.kind === "Video" ? (
            <InspectorVideoMedia item={selectedItem} />
          ) : selectedItem.image ? (
            <img src={selectedItem.image} alt={selectedItem.imageAlt ?? selectedItem.title} className="inspector-image" />
          ) : selectedItem.kind === "Quote" ? (
            <div className="inspector-art quote-inspector-art paper-yellow"><span className="inspector-quote-mark">“</span><span>{selectedItem.kind}</span></div>
          ) : selectedItem.kind === "Post" && selectedItem.post ? (
            <PostArtwork post={selectedItem.post} />
          ) : (
            <div className={`inspector-art ${selectedItem.accent ?? "ink"}`}><KindIcon kind={selectedItem.kind} /><span>{selectedItem.kind}</span></div>
          )}
          <div className="inspector-copy">
            <div className="card-kicker"><span><KindIcon kind={selectedItem.kind} />{selectedItem.kind}</span><span>{selectedItem.date}</span></div>
            {selectedItem.kind === "Quote" ? (
              <>
                <blockquote className="inspector-quote">“{selectedItem.title}”</blockquote>
                {selectedItem.description && <p className="inspector-attribution">— {selectedItem.description.replace(/^—\s*/u, "")}</p>}
              </>
            ) : (
              <>
                <h2>{selectedItem.title}</h2>
                <p>{selectedItem.description}</p>
              </>
            )}
            {selectedItem.processing?.active && (
              <div className="inspector-processing" role="status">
                <LoaderCircle size={14} />
                <span>{selectedItem.processing.message ?? "Processing"}</span>
                {selectedItem.processing.progressTotal != null && <span>{selectedItem.processing.progressCurrent}/{selectedItem.processing.progressTotal}</span>}
              </div>
            )}
            {selectedItem.processing?.failedJob && (
              <div className="inspector-processing failed" role="alert">
                <AlertCircle size={14} />
                <span>{selectedItem.processing.failedJob.errorMessage ?? "Processing failed"}</span>
                <button type="button" className="retry-button" onClick={() => void retryJob(selectedItem.processing?.failedJob?.id ?? "")}>
                  <RotateCw size={12} /> Try again
                </button>
              </div>
            )}
            <div className="inspector-source"><span>Source</span><strong>{selectedItem.source}</strong></div>
            <div className="tag-row">{selectedItem.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div>
            {selectedItem.kind === "PDF" && selectedItem.fileUrl && (
              <button className="similar-button" type="button" onClick={() => setPdfViewerItem(selectedItem)}>
                <FileText size={15} /> Read PDF
              </button>
            )}
            {selectedItem.kind === "Image" && isTauriRuntime() && (
              <button className="similar-button" type="button" onClick={() => void findSimilarImages(selectedItem)} disabled={isFindingSimilar}>
                <Sparkles size={15} /> {isFindingSimilar ? "Finding similar…" : "Find similar images"}
              </button>
            )}
            {selectedItem.kind === "Article" && (
              <button
                className="similar-button read-button"
                type="button"
                onClick={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  openReader(selectedItem, { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
                }}
                disabled={!selectedItem.articleHtml}
                title={selectedItem.articleHtml ? "Open reader" : "No saved article text"}
              >
                <BookOpen size={15} /> Read
              </button>
            )}
            <button
              className="open-source"
              type="button"
              onClick={() => selectedItem.sourceUrl && window.open(selectedItem.sourceUrl, "_blank", "noopener,noreferrer")}
              disabled={!selectedItem.sourceUrl}
            >
              <ExternalLink size={15} /> Open original
            </button>
          </div>
          </motion.aside>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {pdfViewerItem?.fileUrl && (
          <motion.div
            key="pdf-viewer"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
          >
            <PdfViewer
              url={pdfViewerItem.fileUrl}
              title={pdfViewerItem.title}
              onClose={() => setPdfViewerItem(null)}
            />
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {readingItem?.item.articleHtml && (
          <ReaderView
            key={readingItem.item.id}
            item={
              {
                id: readingItem.item.id,
                title: readingItem.item.title,
                author: readingItem.item.articleAuthor,
                publishedDate: readingItem.item.publishedDate,
                savedDate: readingItem.item.date,
                sourceLabel: readingItem.item.source,
                sourceUrl: readingItem.item.sourceUrl ?? "",
                html: readingItem.item.articleHtml,
              } satisfies ReaderItem
            }
            origin={readingItem.origin}
            onRequestClose={() => setReadingItem(null)}
          />
        )}
      </AnimatePresence>
      </div>
    </MotionConfig>
  );
}

export default App;
