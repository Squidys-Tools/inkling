import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
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
  Menu,
  PanelRight,
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

async function storedItemToLibraryItem(
  item: StoredLibraryItem,
  processing?: ProcessingSummary,
): Promise<LibraryItem> {
  const social = readXPostMetadata(item.metadata.social);
  const kind = social ? "Post" : displayKind(item.kind);
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
  const image = (await assetUrl(item.thumbnailPath ?? item.localAssetPath)) ?? remoteImage;
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
    imageAlt: item.title?.trim() || undefined,
    social,
    post: social ? postFallbackFromMetadata(social) : undefined,
    accent: isQuote ? "paper-yellow" : undefined,
    favorite: item.favorite,
    processing,
    articleHtml: metadataHtml && metadataHtml.trim() ? metadataHtml : undefined,
    articleAuthor: metadataAuthor,
    publishedDate: metadataPublishedDate,
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
    imageAlt: "Bret Victor presenting Inventing on Principle",
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

function App() {
  const [items, setItems] = useState<LibraryItem[]>(isTauriRuntime() ? [] : seedItems);
  const [spaces, setSpaces] = useState<StoredSpace[]>(isTauriRuntime() ? [] : seedSpaces);
  const [query, setQuery] = useState("");
  const [activeView, setActiveView] = useState("Everything");
  const [activeSpaceId, setActiveSpaceId] = useState<string | null>(null);
  const [isCreatingSpace, setIsCreatingSpace] = useState(false);
  const [newSpaceName, setNewSpaceName] = useState("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [captureMode, setCaptureMode] = useState<CaptureMode | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [captureUrl, setCaptureUrl] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [newQuoteText, setNewQuoteText] = useState("");
  const [newQuoteAttribution, setNewQuoteAttribution] = useState("");
  const [newQuoteSourceUrl, setNewQuoteSourceUrl] = useState("");
  const [selectedItem, setSelectedItem] = useState<LibraryItem | null>(null);
  const [readingItem, setReadingItem] = useState<{ item: LibraryItem; origin: ReaderOrigin } | null>(null);
  const [listMode, setListMode] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const [isFindingSimilar, setIsFindingSimilar] = useState(false);
  const [similaritySource, setSimilaritySource] = useState<{ id: string; title: string } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

    const item: LibraryItem = {
      id: Date.now(),
      kind: kind === "image" ? "Image" : kind === "pdf" ? "PDF" : kind === "video" ? "Video" : "File",
      title: file.name,
      description: `Saved from ${captureSource}.`,
      source: captureSource,
      date: "Just now",
      tags: [],
      image: kind === "image" ? URL.createObjectURL(file) : undefined,
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
    const item: LibraryItem = {
      id: Date.now(),
      kind: social ? "Post" : "Article",
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
      articleAuthor: article.author || undefined,
      publishedDate: article.publishedDate ?? undefined,
      articleHtml: article.html,
      social,
      post: social ? postFallbackFromMetadata(social) : undefined,
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
    const trimmedSource = sourceUrl.trim();

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
      if (parsed.protocol !== "mymind:" || parsed.hostname !== "capture") return null;
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

  async function retryJob(jobId: string) {
    setCaptureError(null);
    try {
      const retried = await retryProcessingJob(jobId);
      if (!retried) setCaptureError("That processing job is no longer available to retry.");
    } catch (error) {
      setCaptureError(error instanceof Error ? error.message : String(error));
    }
  }

  function selectSpace(space: StoredSpace) {
    setActiveSpaceId(space.id);
    setActiveView(space.name);
    setQuery("");
    setSimilaritySource(null);
    setSelectedItem(null);
    setIsSidebarOpen(false);
  }

  function clearToDefaultView() {
    setActiveSpaceId(null);
    setActiveView("Everything");
    setIsSidebarOpen(false);
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
        setIsSidebarOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [readingItem]);

  function openReader(item: LibraryItem, origin: ReaderOrigin = { x: window.innerWidth / 2, y: window.innerHeight / 2 }) {
    if (!item.articleHtml) return;
    setReadingItem({ item, origin });
  }

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
    setIsSidebarOpen(false);
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

  return (
    <div className={`app-shell ${isDragActive ? "drag-active" : ""}`} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
      {isSidebarOpen && <button type="button" className="sidebar-scrim" aria-label="Close navigation" onClick={() => setIsSidebarOpen(false)} />}
      <aside id="library-navigation" className={`sidebar ${isSidebarOpen ? "is-open" : ""}`}>
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">
            <span />
          </div>
          <div>
            <strong>mymind</strong>
            <span>library</span>
          </div>
          <button type="button" className="sidebar-close" aria-label="Close navigation" onClick={() => setIsSidebarOpen(false)}>
            <X size={18} />
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
              setIsSidebarOpen(false);
            }}
          >
            <Sparkles size={17} />
            <span>Top of mind</span>
          </button>
          <button className="nav-item" onClick={() => { setActiveSpaceId(null); setActiveView("Serendipity"); setIsSidebarOpen(false); }}>
            <Clock3 size={17} />
            <span>Serendipity</span>
          </button>
          <button className="nav-item" onClick={() => { setActiveSpaceId(null); setActiveView("Archive"); setIsSidebarOpen(false); }}>
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
          {isCreatingSpace && (
            <form className="space-form" onSubmit={handleCreateSpace}>
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
            </form>
          )}
        </div>

        <div className="sidebar-footer">
          <button className="nav-item footer-item">
            <Settings2 size={17} />
            <span>Settings</span>
          </button>
          <button className="nav-item footer-item">
            <CircleHelp size={17} />
            <span>Help & shortcuts</span>
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <button
            type="button"
            className="mobile-menu"
            aria-label={isSidebarOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={isSidebarOpen}
            aria-controls="library-navigation"
            onClick={() => setIsSidebarOpen((current) => !current)}
          >
            <Menu size={19} />
          </button>
          <div className="breadcrumb"><span>Library</span><span className="slash">/</span><strong>{activeView}</strong></div>
          <div className="topbar-actions">
            <button className="icon-button" aria-label="Open panel" title="Open panel"><PanelRight size={17} /></button>
            <div className="avatar">M</div>
          </div>
        </header>

        <section className="library-header">
          <h1>{activeView === "Everything" ? "Everything" : activeView}</h1>
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

        {isAdding && (
          <div className="capture-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && closeCaptureModal()}>
            <section className="capture-modal" role="dialog" aria-modal="true" aria-labelledby="capture-modal-title">
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

              {captureMode && (
                <form className="capture-editor" onSubmit={saveCapture}>
                  <div className="capture-editor-heading">
                    <strong>{captureMode === "note" ? "New note" : captureMode === "quote" ? "New quote" : captureMode === "url" ? "Save a link" : "Upload a file"}</strong>
                    <span>{captureMode === "note" ? "Quick note" : captureMode === "quote" ? "Quote with source" : captureMode === "url" ? "Article or social post" : "Local file"}</span>
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
                        type="url"
                        value={newQuoteSourceUrl}
                        onChange={(event) => setNewQuoteSourceUrl(event.target.value)}
                        placeholder="Source URL (optional)"
                        aria-label="Quote source URL"
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
                </form>
              )}

              {captureError && <p className="capture-error" role="alert">Couldn’t save this yet: {captureError}</p>}
            </section>
          </div>
        )}

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
              <button className={`view-button ${!listMode ? "selected" : ""}`} onClick={() => setListMode(false)} aria-label="Grid view" title="Grid view"><Grid2X2 size={16} /></button>
              <button className={`view-button ${listMode ? "selected" : ""}`} onClick={() => setListMode(true)} aria-label="List view" title="List view"><List size={16} /></button>
            </div>
          </div>
        </div>

        <div className="library-scroll">
        <div className={`library-grid ${listMode ? "list-mode" : ""}`}>
          {filteredItems.map((item, index) => (
            <article
              className={`library-card ${item.featured ? "featured-card" : ""} ${item.kind === "Note" ? "note-card" : item.kind === "Quote" ? "quote-card" : item.accent ?? ""}`}
              key={item.id}
              style={{ "--card-index": index } as React.CSSProperties}
              onClick={() => setSelectedItem(item)}
              tabIndex={0}
              onKeyDown={(event) => event.key === "Enter" && setSelectedItem(item)}
            >
              {item.social?.provider === "x" ? (
                <div className="x-post-art">
                  <XPostEmbed
                    social={item.social}
                    fallback={item.post ? <PostArtwork post={item.post} /> : <div className="post-art">Post preview unavailable.</div>}
                  />
                </div>
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
                        void retryJob(item.processing?.failedJob?.id ?? "");
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
                        openReader(item, { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
                      }}
                      onKeyDown={(event) => {
                        event.stopPropagation();
                        if (event.key === "Enter") {
                          event.preventDefault();
                          openReader(item);
                        }
                      }}
                      disabled={!item.articleHtml}
                      title={item.articleHtml ? "Open reader" : "No saved article text"}
                    >
                      Read <ArrowUpRight size={13} />
                    </button>
                  )}
                  {!item.kind.startsWith("Article") && <ArrowUpRight size={15} />}
                </div>
              </div>
            </article>
          ))}
        </div>

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

      {selectedItem && (
        <aside className="item-inspector" aria-label="Selected item">
          <div className="inspector-top"><span>Item details</span><button className="icon-button small" onClick={() => setSelectedItem(null)} aria-label="Close details"><X size={16} /></button></div>
          {selectedItem.social?.provider === "x" ? (
            <div className="x-post-inspector">
              <XPostEmbed
                social={selectedItem.social}
                fallback={selectedItem.post ? <PostArtwork post={selectedItem.post} /> : <div className="inspector-art ink">Post preview unavailable.</div>}
              />
            </div>
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
        </aside>
      )}
      {readingItem?.item.articleHtml && (
        <ReaderView
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
    </div>
  );
}

export default App;
