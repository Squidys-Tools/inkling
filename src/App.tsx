// biome-ignore-all lint/a11y/noNoninteractiveTabindex: Library cards contain nested controls and media, so the article cannot become a button; Enter and Space select the focused card.
import {
  lazy,
  memo,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { VirtuosoMasonry } from "@virtuoso.dev/masonry";
import { gsap } from "gsap";
import { Toaster, toast } from "sonner";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  AlertCircleIcon,
  Archive01Icon,
  BookOpen01Icon,
  Copy01Icon,
  LinkSquare02Icon,
  ArrowDown01Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  ArrowUp01Icon,
  ArrowUpRight01Icon,
  Bookmark01Icon,
  Clock01Icon,
  Database02Icon,
  Download04Icon,
  Grid2X2Icon,
  Edit01Icon,
  Link01Icon,
  ListViewIcon,
  Loading01Icon,
  PlusSignIcon,
  PlayIcon,
  PinIcon,
  RotateCwIcon,
  RotateLeft01Icon,
  Search01Icon,
  Settings01Icon,
  ShuffleIcon,
  SidebarLeftIcon,
  StarIcon,
  Delete02Icon,
  ViewSidebarLeftIcon,
  Cancel01Icon,
  CircleCheckIcon,
  CircleIcon,
  Folder01Icon,
  Upload04Icon,
  LicenseThirdPartyIcon,
  PaintBoardIcon,
} from "@hugeicons/core-free-icons";
import {
  assetUrl,
  archiveItem,
  addSpaceItem,
  checkForUpdates,
  completeOnboarding,
  countActiveJobs,
  getOnboardingState,
  createQuote,
  createSpace,
  captureUrlItem,
  swapSpacePositions,
  updateSpace,
  currentDeepLinks,
  createNote,
  deleteSpace,
  initializeStorage,
  installUpdate,
  listActiveItems,
  listArchivedItems,
  listItemSpaces,
  listSpaceItems,
  listSpaces,
  removeSpaceItem,
  getProcessingSummaries,
  enqueueOcrJob,
  getItem,
  getItemContent,
  retryProcessingJob,
  getCaptureStatus,
  getAppVersion,
  getLastExport,
  getLibrarySize,
  type LibrarySize,
  getPairingToken,
  regeneratePairingToken,
  showItemInFolder,
  showLibraryFolder,
  isDesktopRuntime,
  isElectronRuntime,
  listenForDeepLinks,
  listenForJobUpdates,
  saveFile,
  deleteItem,
  exportLibrary,
  importLibrary,
  selectLibraryDirectory,
  searchItems,
  searchSimilarItems,
  updateItem,
  type CaptureStatus,
  type AvailableUpdate,
  type LibraryExportReport,
  type LastExport,
  type LibraryImportReport,
  type ProcessingSummary,
  type SmartSpaceQuery,
  type SpaceColor,
  type SpaceKind,
  type StoredLibraryCard,
  type StoredLibraryItemDetail,
  type StoredLibraryItem,
  type StoredSpace,
} from "./lib/libraryApi";
import { classifyFile } from "./lib/ingestion/file-classification";
import { parseDeepLinkCapture, validateDeepLinkCapture } from "./lib/deepLink";
import { parseHttpUrl, safePublicImageUrl } from "./lib/ingestion/url";
import { AnimatedCount } from "./components/AnimatedCount";
import { ElectronWindowControls } from "./components/ElectronWindowControls";
import { FirstRunOverlay } from "./components/FirstRunOverlay";
import { LibraryEdgeFade } from "./components/LibraryEdgeFade";
import { ContextMenu, type ContextMenuEntry } from "./components/ContextMenu/ContextMenu";
import { TooltipLayer } from "./components/Tooltip/TooltipLayer";
import { type AddMode, AddMenu } from "./components/AddMenu/AddMenu";
import { OpenSourceLicenses } from "./components/OpenSourceLicenses/OpenSourceLicenses";
import { SegmentedControl } from "./components/SegmentedControl/SegmentedControl";
import { APPEARANCE_OPTIONS, useAppearance } from "./lib/appearance";
import { canvasImageCrossOrigin, LiquidGlass } from "./components/LiquidGlass";
import { appKeyboardShortcut } from "./lib/keyboardShortcuts";
import { videoLinkFromSourceUrl } from "./lib/ingestion/video-links";
// Below-the-fold / on-demand surfaces stay off the boot bundle and load from
// local disk on first open (Suspense fallback null: no spinner, no layout
// shift — the chunk resolves in milliseconds).
const PdfViewer = lazy(() => import("./components/PdfViewer"));
const MascotBoard = lazy(() =>
  import("./components/mascot/MascotBoard").then((module) => ({ default: module.MascotBoard })),
);
const AliveBoard = lazy(() =>
  import("./components/mascot/AliveBoard").then((module) => ({ default: module.AliveBoard })),
);
type NavSnapshot = {
  view: string;
  spaceId: string | null;
  query: string;
  itemId: string | null;
};

const ExpandedItemOverlay = lazy(() =>
  import("./components/ExpandedItemOverlay").then((module) => ({
    default: module.ExpandedItemOverlay,
  })),
);
import { LiveMascotSearchEyes, pushMascotParams } from "./components/mascot/mascotStore";
import { MascotHomeSlot } from "./components/mascot/MascotHomeSlot";
import type { ExpandedOverlayActions } from "./components/ExpandedItemOverlay";
import {
  isCardTooFarOffscreen,
  queryCardRects,
  scrollViewport,
  scrollViewportRect,
  type SourceRects,
} from "./components/overlayMotion";
import {
  FileArtwork,
  KindIcon,
  NoteArtwork,
  PdfArtwork,
  PostArtwork,
  formatDuration,
  mediaAspectRatioFor,
} from "./components/ItemMedia";
const ReaderView = lazy(() =>
  import("./ReaderView").then((module) => ({ default: module.ReaderView })),
);
import type { ReaderItem, ReaderOrigin } from "./ReaderView";
import type { XPostMetadata } from "./lib/ingestion/types";
import type { ItemKind, LibraryItem } from "./lib/types";
import { shouldUseSeedLibrary } from "./lib/previewMode";
import { markdownToPlainText, normalizeNoteBody, NOTE_BODY_FORMAT } from "./lib/notes";
import { serendipityItems } from "./lib/serendipity";
import { isEmptyPinsView, matchesPinsView } from "./lib/pinsView";
// DEMO seed (committed): src/seedPersonal.ts and public/seed-demo/ ship with
// the repo so the web preview shows a real library out of the box. The eager
// glob below resolves to an empty map when that file is absent, so clones
// still fall back to the original 17-item demo library below.
//
// The glob is conditional so a shipped app build never bundles the seed: a
// build-time `define` in vite.config.ts replaces VITE_INKLING_SEED with "0"
// for `--mode app`, so this resolves to an empty object and the module is
// never included. Gating it with `shouldUseSeedLibrary()` instead would keep
// the seed in the bundle, because the bytes are already there before any
// runtime check runs. See scripts/assert-no-demo-seed.ts for the guard.
const personalSeedModules: Record<string, { personalSeedItems?: LibraryItem[] }> =
  import.meta.env.VITE_INKLING_SEED === "0"
    ? {}
    : import.meta.glob<{ personalSeedItems?: LibraryItem[] }>("./seedPersonal.ts", {
        eager: true,
      });
const localSeedItems: LibraryItem[] =
  Object.values(personalSeedModules)[0]?.personalSeedItems ?? [];
import "./App.css";

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

function formatByteSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

function formatExportSummary(report: LibraryExportReport) {
  const summary = `${report.items} items · ${report.assetFiles} files · ${formatByteSize(report.databaseBytes + report.assetsBytes)}`;
  if (report.skippedAssets === 0) return summary;
  const assets = report.skippedAssets === 1 ? "asset" : "assets";
  return `${summary} · ${report.skippedAssets} ${assets} skipped`;
}

function formatLastCopy(copy: LastExport) {
  const date = new Date(copy.exportedAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  return `last copy ${date} · ${copy.items.toLocaleString()} ${copy.items === 1 ? "item" : "items"}`;
}

function formatImportSummary(report: LibraryImportReport) {
  const summary = [
    `${report.importedItems} ${report.importedItems === 1 ? "item" : "items"} restored`,
    `${report.importedSpaces} ${report.importedSpaces === 1 ? "Space" : "Spaces"} added`,
  ];
  if (report.skippedDuplicateItems > 0) {
    summary.push(
      `${report.skippedDuplicateItems} existing ${report.skippedDuplicateItems === 1 ? "item" : "items"} left unchanged`,
    );
  }
  if (report.skippedDuplicateSpaces > 0) {
    summary.push(
      `${report.skippedDuplicateSpaces} existing ${report.skippedDuplicateSpaces === 1 ? "Space" : "Spaces"} left unchanged`,
    );
  }
  if (report.assetFiles > 0) {
    summary.push(`${report.assetFiles} ${report.assetFiles === 1 ? "file" : "files"} copied`);
  }
  if (report.unverifiedAssetFiles > 0) {
    summary.push(
      `${report.unverifiedAssetFiles} ${report.unverifiedAssetFiles === 1 ? "file" : "files"} from an older export could not be verified`,
    );
  }
  return summary.join(" · ");
}

function readXPostMetadata(value: unknown): XPostMetadata | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (
    record.provider !== "x" ||
    typeof record.postUrl !== "string" ||
    typeof record.postId !== "string"
  ) {
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
    ? new Date(social.publishedDate).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
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
  item: StoredLibraryItem | StoredLibraryCard,
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
  const hasArticleContent =
    "hasArticleContent" in item
      ? item.hasArticleContent
      : typeof item.metadata.html === "string" && Boolean(item.metadata.html.trim());
  const pdfPageCount =
    baseKind === "PDF" &&
    typeof item.metadata.pdfPageCount === "number" &&
    Number.isInteger(item.metadata.pdfPageCount) &&
    item.metadata.pdfPageCount > 0
      ? item.metadata.pdfPageCount
      : undefined;

  const remoteImage = Array.isArray(item.metadata.imageUrls)
    ? item.metadata.imageUrls
        .map(safePublicImageUrl)
        .find((value): value is string => value !== undefined)
    : undefined;
  const indexedImageDimensions = Array.isArray(item.metadata.imageDimensions)
    ? item.metadata.imageDimensions.find((value): value is Record<string, unknown> => {
        if (!value || typeof value !== "object") return false;
        const record = value as Record<string, unknown>;
        return (
          (!remoteImage || record.url === remoteImage) &&
          positiveNumber(record.width) !== undefined &&
          positiveNumber(record.height) !== undefined
        );
      })
    : undefined;
  const mediaWidth =
    positiveNumber(item.metadata.mediaWidth) ?? positiveNumber(indexedImageDimensions?.width);
  const mediaHeight =
    positiveNumber(item.metadata.mediaHeight) ?? positiveNumber(indexedImageDimensions?.height);
  const storedAspectRatio = positiveNumber(item.metadata.mediaAspectRatio);
  const image =
    (await assetUrl(item.thumbnailPath ?? (kind === "Image" ? item.localAssetPath : null))) ??
    remoteImage ??
    videoLink?.posterUrl;
  // For an image this is the original file, which the item view swaps in once
  // the user zooms past fit. It is not a fallback thumbnail.
  const fileUrl =
    kind === "PDF" || kind === "Video" || kind === "Image"
      ? await assetUrl(item.localAssetPath)
      : undefined;
  const source = social
    ? `X${social.authorHandle ? ` · @${social.authorHandle.replace(/^@/u, "")}` : ""}`
    : item.sourceLabel || item.sourceUrl || "Quick note";

  const isQuote = kind === "Quote";
  const noteBody =
    kind === "Note" && "body" in item && typeof item.body === "string"
      ? normalizeNoteBody(item.body)
      : undefined;
  const rawTitle = item.title?.trim() || "Untitled note";
  // The backend already stored `markdownToPlainText(body)` as the
  // description, so a note's plain text arrives ready to read. Projecting the
  // body again here would only ever disagree with the stored row, and would
  // eat the brackets in prose that happens to look like a link.
  const rawDescription =
    item.description?.trim() ||
    item.ocrText?.trim().slice(0, 180) ||
    (isQuote ? "" : "Saved to your mind.");

  return {
    id: item.id,
    kind,
    title: rawTitle,
    description: social?.text?.trim() || rawDescription,
    noteBody,
    source,
    sourceUrl: item.sourceUrl ?? undefined,
    date: formatItemDate(item.createdAt),
    createdAt: item.createdAt,
    tags,
    ocrText: item.ocrText,
    image,
    mediaWidth,
    mediaHeight,
    mediaAspectRatio:
      storedAspectRatio ?? (mediaWidth && mediaHeight ? mediaWidth / mediaHeight : undefined),
    pdfPageCount,
    palette: item.palette?.length ? item.palette : undefined,
    durationSeconds: positiveNumber(item.metadata.durationSeconds),
    fileSizeBytes: positiveNumber(item.metadata.fileSizeBytes),
    readingMinutes: positiveNumber(item.metadata.readingMinutes),
    fileUrl,
    imageAlt: item.title?.trim() || undefined,
    social,
    post: social ? postFallbackFromMetadata(social) : undefined,
    accent: isQuote ? "paper-yellow" : undefined,
    favorite: item.favorite,
    archived: item.archived,
    processing,
    hasArticleContent,
    video: videoLink ?? undefined,
  };
}

function withArticleContent(item: LibraryItem, storedItem: StoredLibraryItemDetail): LibraryItem {
  const articleHtml =
    typeof storedItem.metadata.html === "string" && storedItem.metadata.html.trim()
      ? storedItem.metadata.html
      : undefined;
  return {
    ...item,
    hasArticleContent: Boolean(articleHtml),
    articleHtml,
    articleAuthor:
      typeof storedItem.metadata.author === "string" ? storedItem.metadata.author : undefined,
    publishedDate:
      typeof storedItem.metadata.publishedDate === "string"
        ? storedItem.metadata.publishedDate
        : undefined,
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
    sourceUrl:
      "https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=1800&q=90",
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
    image:
      "https://images.unsplash.com/photo-1499750310107-5fef28a66643?auto=format&fit=crop&w=1000&q=85",
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
    description:
      "A real product sketch: paper prototypes, a pencil, and the first shape of a flow.",
    source: "Unsplash",
    sourceUrl:
      "https://images.unsplash.com/photo-1581291518857-4e27b48ff24e?auto=format&fit=crop&w=1800&q=90",
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
    description:
      "Dark UI, dense information, and just enough color to make the important number pop.",
    source: "Unsplash",
    sourceUrl:
      "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=1800&q=90",
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
    image:
      "https://media.nngroup.com/media/articles/opengraph_images/Updated10HeuristicSocialCard-36.png",
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
    sourceUrl:
      "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=1800&q=90",
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
    description:
      "A product page on a laptop: editorial spacing, a strong image, and a single clear action.",
    source: "Unsplash",
    sourceUrl:
      "https://images.unsplash.com/photo-1467232004584-a241de8bcf5d?auto=format&fit=crop&w=1800&q=90",
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
    noteBody:
      "# Books to reread this fall\n\n- [ ] Pilgrim at Tinker Creek\n- [ ] The Design of Everyday Things\n- [ ] Seeing Like a State\n\nStart with the Dillard.",
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
  {
    id: 14,
    kind: "Image",
    title: "Ceramic pour-over set",
    description: "Brewing over a ceramic dripper — comparing this carafe before ordering.",
    source: "Design Milk",
    sourceUrl: "https://design-milk.com/",
    date: "Aug 28",
    tags: ["kitchen", "wishlist"],
    image:
      "https://app.paper.design/file-assets/01M0A79VARA1BWFSH86J9CHQG6/01M1PZCZB7TW62ZG0D1W6ZSFA2.png",
    mediaWidth: 1024,
    mediaHeight: 1024,
    imageAlt: "A ceramic pour-over coffee dripper brewing into a glass carafe on an oak counter",
  },
  {
    id: 15,
    kind: "Image",
    title: "Reading corner for the new place",
    description: "Low oak shelf, boucle chair, warm lamp — the layout to steal.",
    source: "Dezeen",
    sourceUrl: "https://www.dezeen.com/",
    date: "Aug 26",
    tags: ["interior", "reference"],
    image:
      "https://app.paper.design/file-assets/01M0A79VARA1BWFSH86J9CHQG6/01M1PZDKY4T8RYWPH59K4BP4QY.png",
    mediaWidth: 1232,
    mediaHeight: 816,
    imageAlt: "A cozy reading nook with a low bookshelf, boucle armchair, and floor lamp",
  },
  {
    id: 16,
    kind: "Image",
    title: "Spiral stairwell in concrete",
    description: "Daylight down a concrete spiral — saved for the presentation moodboard.",
    source: "ArchDaily",
    sourceUrl: "https://www.archdaily.com/",
    date: "Aug 22",
    tags: ["architecture", "reference"],
    image:
      "https://app.paper.design/file-assets/01M0A79VARA1BWFSH86J9CHQG6/01M1PZDZZZ3CZ3W7HBVKXDMN0M.png",
    mediaWidth: 1232,
    mediaHeight: 816,
    imageAlt: "Looking up inside a brutalist concrete spiral stairwell lit by a skylight",
  },
  {
    id: 17,
    kind: "Image",
    title: "Café to try in Lisbon",
    description: "Pastéis de nata and a cortado — saved from the travel thread.",
    source: "Time Out",
    sourceUrl: "https://www.timeout.com/lisbon",
    date: "Aug 19",
    tags: ["travel", "food"],
    image:
      "https://app.paper.design/file-assets/01M0A79VARA1BWFSH86J9CHQG6/01M1PZECGMBTJFQEFCEYN8N27F.png",
    mediaWidth: 1232,
    mediaHeight: 816,
    imageAlt: "A cortado and two custard tarts on a marble café table",
  },
];

// DEMO seed swap. With the personal files present, your items plus
// the four keepers are shuffled together (shuffledDemo is just below). Without
// them this is just the original demo library again — to restore that
// permanently, point the useState initializers below back at `seedItems`
// and delete seedPersonal.ts + public/seed-demo/.
const demoSeedItems: LibraryItem[] =
  localSeedItems.length > 0
    ? shuffledDemo([
        ...localSeedItems,
        // Kept from the original set: the X post (5), the PDF document (10),
        // the note (12), and the quote (13) — shuffled in with everything else.
        ...seedItems.filter((item) => [5, 10, 12, 13].includes(Number(item.id))),
      ])
    : seedItems;
// DEMO shuffle (fixed seed) so the demo order looks
// mixed but stays stable across reloads. Delete with the rest of the demo
// swap above.
function shuffledDemo<T>(input: T[]): T[] {
  const array = [...input];
  let seed = 0x9e3779b9;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

const previewArchivedItems: LibraryItem[] = demoSeedItems
  .filter((item) => [10, 12, 5].includes(Number(item.id)))
  .map((item) => ({ ...item, id: `archive-${item.id}`, archived: true }));
const browserArchivedItems = import.meta.env.DEV ? previewArchivedItems : [];

const seedSpaces: StoredSpace[] = [
  {
    id: "seed-design-references",
    name: "Design references",
    color: "orange",
    query: { tag: "reference" },
    kind: "smart",
    position: 1,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: "seed-read-later",
    name: "Read later",
    color: "green",
    query: { tag: "essay" },
    kind: "smart",
    position: 2,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: "seed-top-picks",
    name: "Top picks",
    color: "blue",
    query: { favorite: true },
    kind: "smart",
    position: 3,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: "seed-weekend-reading",
    name: "Weekend reading",
    color: "pink",
    query: {},
    kind: "regular",
    position: 4,
    createdAt: 0,
    updatedAt: 0,
  },
];

// Manual membership for the seeded Regular Space, so preview mode can exercise
// the same add/remove flow the Electron backend serves from the database. These are
// ids the demo seed actually keeps (5, 10, 12, 13); the archived copies in
// previewArchivedItems are re-keyed, so the originals stay in the library.
const seedSpaceItems: Record<string, string[]> = {
  "seed-weekend-reading": ["5", "13"],
};

const SPACE_COLORS: SpaceColor[] = ["blue", "orange", "green", "pink", "purple", "yellow"];

const LIBRARY_VIEW_TRANSITION_MS = 440;
const SERENDIPITY_BATCH_SIZE = 12;

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
// In the desktop app the saved query is evaluated lazily by the Electron backend.
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
  if (
    text &&
    ![item.title, item.description, item.source, ...item.tags]
      .join(" ")
      .toLowerCase()
      .includes(text)
  ) {
    return false;
  }

  return true;
}

// The pill is the only play affordance on a video card. Duration is shown when the
// backend knows it; otherwise the pill is just the play glyph.
function VideoPill({ item }: { item: LibraryItem }) {
  return (
    <span className="card-video-badge glass" aria-hidden="true">
      <HugeiconsIcon icon={PlayIcon} size={10} />
      {item.durationSeconds !== undefined && <span>{formatDuration(item.durationSeconds)}</span>}
    </span>
  );
}

function LibraryVideoMedia({ item, index }: { item: LibraryItem; index: number }) {
  if (!item.video && !item.fileUrl && !item.image) {
    return (
      <div className="card-paper-art video-art" aria-hidden={!item.sourceUrl}>
        <UrlFallbackLabel item={item} />
        <VideoPill item={item} />
      </div>
    );
  }

  // Cards are static thumbnails that open the details overlay on click. The
  // pill is a purely visual affordance — playback happens in the overlay.
  return (
    <div className="card-image-wrap">
      {item.image ? (
        <img
          src={item.image}
          crossOrigin={canvasImageCrossOrigin(item.image)}
          alt={item.imageAlt ?? item.title}
          className="card-image"
          loading="lazy"
          decoding="async"
          fetchPriority={index < 6 ? "high" : undefined}
        />
      ) : item.fileUrl ? (
        <video
          className="card-image"
          src={item.fileUrl}
          muted
          playsInline
          preload="metadata"
          aria-label={item.title}
          onLoadedMetadata={(event) => {
            event.currentTarget.currentTime = 0.01;
          }}
        />
      ) : null}
      <VideoPill item={item} />
    </div>
  );
}

function UrlFallbackLabel({ item }: { item: LibraryItem }) {
  return (
    <span className="url-fallback-label">
      <span className="url-fallback-title">{item.title}</span>
      <span className="url-fallback-domain">{item.source}</span>
    </span>
  );
}

// Quotes show in full on the card; CSS clamps only very long ones.
function cardText(value: string | undefined, fallback: string): string {
  return value?.replace(/\s+/gu, " ").trim() || fallback;
}

// Each type gets its own card class; App.css keys the typed layouts off these.
// Posts and images with no artwork fall back to the typed file layout.
function cardKindClass(item: LibraryItem): string {
  switch (item.kind) {
    case "Note":
      return "note-card";
    case "Quote":
      return "quote-card";
    case "PDF":
      return "pdf-card";
    case "Article":
      return "article-card";
    case "Video":
      return "video-card";
    case "File":
      return "file-card";
    case "Post":
    case "Image":
      return !item.image && !item.post ? "file-card" : "";
    default:
      return item.accent ?? "";
  }
}

function quoteAttribution(description: string): string {
  const text = description.trim();
  if (!text) return "";
  return text.startsWith("—") ? text : `— ${text}`;
}

type LibraryCardContext = {
  onSelectItem: (item: LibraryItem, rects?: SourceRects) => void;
  onOpenReader: (item: LibraryItem, origin?: ReaderOrigin) => void;
  onRetryJob: (jobId: string) => void | Promise<void>;
  onDeleteArchivedItem?: (item: LibraryItem) => void | Promise<void>;
  archiveSelectionMode?: boolean;
  isArchivedItemSelected?: (item: LibraryItem) => boolean;
  onToggleArchivedItem?: (item: LibraryItem) => void;
  onRestoreArchivedItem?: (item: LibraryItem) => void | Promise<void>;
  onOpenMenu?: (item: LibraryItem, event: React.MouseEvent<HTMLElement>) => void;
};

// Captures the card and its media box before selection state changes, so the
// overlay's opening flight starts from the card's exact position.
function cardRectsFor(card: HTMLElement): SourceRects {
  const cardRect = card.getBoundingClientRect();
  const mediaRect = card.querySelector<HTMLElement>(".library-card-media")?.getBoundingClientRect();
  return {
    card: {
      left: cardRect.left,
      top: cardRect.top,
      width: cardRect.width,
      height: cardRect.height,
    },
    media: mediaRect
      ? {
          left: mediaRect.left,
          top: mediaRect.top,
          width: mediaRect.width,
          height: mediaRect.height,
        }
      : { left: cardRect.left, top: cardRect.top, width: cardRect.width, height: 0 },
  };
}

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
  const isArchiveTile = Boolean(context.onDeleteArchivedItem);
  const archiveSelectionMode = context.archiveSelectionMode === true;
  const isArchivedItemSelected = context.isArchivedItemSelected?.(item) ?? false;
  const canOpenReader = Boolean(item.articleHtml || item.hasArticleContent);
  const attribution = item.kind === "Quote" ? quoteAttribution(item.description) : "";
  const handleCardSelect = (event: React.MouseEvent<HTMLElement>) => {
    if (archiveSelectionMode) {
      event.preventDefault();
      context.onToggleArchivedItem?.(item);
      return;
    }
    context.onSelectItem(item, cardRectsFor(event.currentTarget));
  };

  return (
    <div className="library-card-slot" data-library-index={index}>
      <article
        className={`library-card ${item.featured ? "featured-card" : ""} ${cardKindClass(item)} ${archiveSelectionMode ? "archive-selection-mode" : ""} ${isArchivedItemSelected ? "archive-card-selected" : ""}`}
        data-library-item-id={String(item.id)}
        style={{ "--card-media-ratio": String(mediaAspectRatioFor(item)) } as React.CSSProperties}
        onClick={handleCardSelect}
        onContextMenu={
          context.onOpenMenu && !archiveSelectionMode
            ? (event) => context.onOpenMenu?.(item, event)
            : undefined
        }
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          if (archiveSelectionMode) {
            context.onToggleArchivedItem?.(item);
          } else {
            context.onSelectItem(item, cardRectsFor(event.currentTarget));
          }
        }}
      >
        <div className="library-card-media">
          {item.social?.provider === "x" && item.post ? (
            <div className="x-post-art">
              <PostArtwork post={item.post} />
            </div>
          ) : item.kind === "Video" ? (
            <LibraryVideoMedia item={item} index={index} />
          ) : item.image ? (
            <div className="card-image-wrap">
              <img
                src={item.image}
                crossOrigin={canvasImageCrossOrigin(item.image)}
                alt={item.imageAlt ?? item.title}
                className="card-image"
                loading="lazy"
                decoding="async"
                fetchPriority={index < 6 ? "high" : undefined}
              />
            </div>
          ) : item.kind === "Post" && item.post ? (
            <PostArtwork post={item.post} />
          ) : (
            <div
              className={`card-paper-art ${item.kind === "Quote" ? "quote-art" : (item.accent ?? "")}`}
              aria-hidden={item.kind !== "Article" || !item.sourceUrl}
            >
              {item.kind === "Article" && (
                <>
                  <span className="paper-line line-one" />
                  <span className="paper-line line-two" />
                  <span className="paper-seal">m</span>
                  {item.sourceUrl && <UrlFallbackLabel item={item} />}
                </>
              )}
              {item.kind === "Note" && <NoteArtwork item={item} />}
              {item.kind === "PDF" && <PdfArtwork item={item} />}
              {item.kind === "Quote" && (
                <>
                  <span className="quote-mark">“</span>
                  <p className="quote-preview">{cardText(item.title, "Saved quote")}</p>
                  {attribution && (
                    <>
                      <span className="quote-line" />
                      <span className="quote-attribution-preview">{attribution}</span>
                    </>
                  )}
                </>
              )}
              {(item.kind === "File" || item.kind === "Post" || item.kind === "Image") && (
                <FileArtwork item={item} />
              )}
            </div>
          )}
          {isArchiveTile && (
            <div className="archive-tile-actions">
              {!archiveSelectionMode && (
                <button
                  type="button"
                  className="archive-tile-restore"
                  data-tooltip="Restore to library"
                  onClick={(event) => {
                    event.stopPropagation();
                    void context.onRestoreArchivedItem?.(item);
                  }}
                >
                  <HugeiconsIcon icon={RotateLeft01Icon} size={12} />
                  Restore
                </button>
              )}
              <button
                type="button"
                className={`archive-card-delete ${archiveSelectionMode ? "archive-card-select" : ""} ${isArchivedItemSelected ? "is-selected" : ""}`}
                aria-label={
                  archiveSelectionMode
                    ? `${isArchivedItemSelected ? "Deselect" : "Select"} ${item.title}`
                    : `Delete ${item.title}`
                }
                aria-pressed={archiveSelectionMode ? isArchivedItemSelected : undefined}
                data-tooltip={
                  archiveSelectionMode
                    ? isArchivedItemSelected
                      ? "Deselect item"
                      : "Select item"
                    : "Delete permanently"
                }
                onClick={(event) => {
                  event.stopPropagation();
                  if (archiveSelectionMode) {
                    context.onToggleArchivedItem?.(item);
                  } else {
                    void context.onDeleteArchivedItem?.(item);
                  }
                }}
              >
                <HugeiconsIcon
                  icon={
                    archiveSelectionMode
                      ? isArchivedItemSelected
                        ? CircleCheckIcon
                        : CircleIcon
                      : Delete02Icon
                  }
                  size={archiveSelectionMode ? 18 : 13}
                />
              </button>
            </div>
          )}
        </div>
        {isArchiveTile && (
          <div className="archive-tile-caption">
            <span className="archive-tile-title">{item.title}</span>
            <span className="archive-tile-meta">
              {item.kind} · {item.date}
            </span>
          </div>
        )}
        <div
          className={`card-content ${item.kind === "Quote" ? "quote-content" : item.kind === "Note" ? "note-content" : ""}`}
        >
          <div className="card-kicker">
            <span>
              <KindIcon kind={item.kind} />
              {item.kind}
            </span>
            <span>{item.date}</span>
          </div>
          <h2 className={item.kind === "Quote" ? "quote-title" : ""}>
            {item.kind === "Quote"
              ? /^["“]/u.test(item.title.trim())
                ? item.title
                : `“${item.title}”`
              : item.title}
          </h2>
          <p className={item.kind === "Quote" ? "quote-attribution" : ""}>
            {item.description
              ? item.kind === "Quote" && !item.description.trim().startsWith("—")
                ? `— ${item.description}`
                : item.description
              : item.kind === "Quote"
                ? ""
                : item.description}
          </p>
          {item.processing?.active && (
            <div className="card-processing" role="status">
              <HugeiconsIcon icon={Loading01Icon} size={13} />
              <span>{item.processing.message ?? "Processing"}</span>
              {item.processing.progressTotal != null && (
                <span>
                  {item.processing.progressCurrent}/{item.processing.progressTotal}
                </span>
              )}
            </div>
          )}
          {item.processing?.failedJob && (
            <div className="card-processing failed" role="alert">
              <HugeiconsIcon icon={AlertCircleIcon} size={13} />
              <span>{item.processing.failedJob.errorMessage ?? "Processing failed"}</span>
              <button
                type="button"
                className="retry-button"
                onClick={(event) => {
                  event.stopPropagation();
                  void context.onRetryJob(item.processing?.failedJob?.id ?? "");
                }}
              >
                <HugeiconsIcon icon={RotateCwIcon} size={12} /> Try again
              </button>
            </div>
          )}
          <div className="card-footer">
            <span className="card-source">
              {item.readingMinutes ? `${item.source} · ${item.readingMinutes} min` : item.source}
            </span>
            {item.kind === "Article" && (
              <button
                type="button"
                className="card-read"
                onClick={(event) => {
                  event.stopPropagation();
                  const rect = event.currentTarget.getBoundingClientRect();
                  context.onOpenReader(item, {
                    x: rect.left + rect.width / 2,
                    y: rect.top + rect.height / 2,
                  });
                }}
                onKeyDown={(event) => {
                  event.stopPropagation();
                  if (event.key === "Enter") {
                    event.preventDefault();
                    context.onOpenReader(item);
                  }
                }}
                disabled={!canOpenReader}
                data-tooltip={canOpenReader ? "Open reader" : "No saved article text"}
              >
                Read <HugeiconsIcon icon={ArrowUpRight01Icon} size={13} />
              </button>
            )}
            {item.kind === "Video" && item.video && (
              <button
                type="button"
                className="card-read"
                onClick={(event) => {
                  event.stopPropagation();
                  const card = event.currentTarget.closest<HTMLElement>(".library-card");
                  context.onSelectItem(item, card ? cardRectsFor(card) : undefined);
                }}
              >
                Watch <HugeiconsIcon icon={PlayIcon} size={11} />
              </button>
            )}
            {!(item.kind === "Article" || (item.kind === "Video" && item.video)) && (
              <HugeiconsIcon icon={ArrowUpRight01Icon} size={15} />
            )}
          </div>
        </div>
      </article>
    </div>
  );
});

// Mirrors `.library-grid` gap and the Paper column width (artboard 1.1). Virtuoso
// lays columns out in a flex row, so the CSS gap is the real column gap.
const GRID_GAP = 12;
const TARGET_CARD_WIDTH = 286;
const MAX_GRID_COLUMNS = 12;

function masonryColumnCount(width: number): number {
  const columns = Math.round((width + GRID_GAP) / (TARGET_CARD_WIDTH + GRID_GAP));
  return Math.min(Math.max(columns, 1), MAX_GRID_COLUMNS);
}

// One accepted archive delete: the timer waiting out the undo window, plus the
// item that timer needs to restore or reconcile if the delete does not land.
type PendingPermanentDelete = {
  timer: number;
  item: LibraryItem;
};

// Pairing panel inside the existing Settings modal. Shows the per-install
// pairing token for the browser extension (reveal-on-click, never rendered
// by default) with copy, renew, and a live check against /v1/health.
function ExtensionPairing() {
  const [status, setStatus] = useState<CaptureStatus | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isRevealed, setIsRevealed] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isConfirmingRenew, setIsConfirmingRenew] = useState(false);

  useEffect(() => {
    if (!isDesktopRuntime()) return;
    void getCaptureStatus()
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  if (!isDesktopRuntime()) {
    return (
      <div className="settings-empty-state">
        <div className="settings-empty-icon">
          <HugeiconsIcon icon={Link01Icon} size={19} />
        </div>
        <h4>Pairing needs the desktop app.</h4>
        <p>Open Settings in the installed app to pair the browser extension.</p>
      </div>
    );
  }

  const revealToken = () => {
    if (isRevealed) {
      setIsRevealed(false);
      setToken(null);
      return;
    }
    void getPairingToken()
      .then((value) => {
        setToken(value);
        setIsRevealed(true);
      })
      .catch(() => toast.error("Could not load the pairing token.", { duration: 5000 }));
  };

  const copyToken = () => {
    if (!token) return;
    void navigator.clipboard
      .writeText(token)
      .then(() => toast.success("Pairing token copied. Paste it into the extension."))
      .catch(() =>
        toast.error("Copy failed. Reveal the token and copy it by hand.", { duration: 5000 }),
      );
  };

  const renewToken = () => {
    setIsConfirmingRenew(false);
    void regeneratePairingToken()
      .then((value) => {
        setToken(value);
        setIsRevealed(true);
        toast.success("New pairing token issued. Update the extension.");
      })
      .catch(() => toast.error("Could not renew the pairing token.", { duration: 5000 }));
  };

  const testConnection = () => {
    const healthUrl = status?.healthUrl;
    if (!healthUrl || isTesting) return;
    setIsTesting(true);
    const check = async () => {
      const bearer = token ?? (await getPairingToken());
      const response = await fetch(healthUrl, {
        headers: { Authorization: `Bearer ${bearer}` },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    };
    void check()
      .then(() => toast.success("Extension receiver is reachable."))
      .catch(() =>
        toast.error("No answer from the receiver. Is the app running?", { duration: 5000 }),
      )
      .finally(() => setIsTesting(false));
  };

  return (
    <div className="settings-pairing">
      <p className="settings-panel-note">
        Paste this token into the browser extension once. Saves go straight to this library over a
        local connection; nothing leaves the machine.
      </p>
      <div className="settings-pairing-row">
        <span className="settings-pairing-status" role="status">
          {status
            ? status.running
              ? `Listening on 127.0.0.1:${status.port}`
              : "Receiver not running"
            : "Checking receiver…"}
        </span>
        <button
          type="button"
          className="settings-batch-button"
          disabled={!status?.healthUrl || isTesting}
          onClick={testConnection}
        >
          {isTesting ? "Testing…" : "Test connection"}
        </button>
      </div>
      <div className="settings-pairing-row">
        <span className="visually-hidden">
          {isRevealed ? "Pairing token" : "Pairing token hidden"}
        </span>
        <code className="settings-token" aria-hidden={!isRevealed}>
          {isRevealed && token ? token : "••••••••••••••••••••••••"}
        </code>
        <button type="button" className="settings-batch-button" onClick={revealToken}>
          {isRevealed ? "Hide" : "Reveal"}
        </button>
        <button
          type="button"
          className="settings-batch-button"
          disabled={!isRevealed || !token}
          onClick={copyToken}
        >
          Copy
        </button>
        <button
          type="button"
          className="settings-batch-button settings-batch-delete"
          onClick={() => setIsConfirmingRenew(true)}
        >
          Renew
        </button>
      </div>
      {isConfirmingRenew && (
        <section className="settings-confirm" aria-label="Renew the pairing token">
          <p>Renew the pairing token? The extension will need the new token.</p>
          <div className="settings-confirm-actions">
            <button
              type="button"
              className="settings-batch-button"
              onClick={() => setIsConfirmingRenew(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="settings-batch-button settings-batch-delete"
              onClick={renewToken}
            >
              Renew
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

// Note bodies are cached so an opened note is not re-fetched and a refresh does
// not drop a body the list query never carries. Same LRU shape as the asset URL
// cache: writes re-insert, so the oldest key is the least recently used body.
const NOTE_BODY_CACHE_LIMIT = 200;
function rememberNoteBody(cache: Map<string, string>, id: string, body: string) {
  cache.delete(id);
  if (cache.size >= NOTE_BODY_CACHE_LIMIT) {
    const oldest = cache.keys().next();
    if (oldest.value !== undefined) cache.delete(oldest.value);
  }
  cache.set(id, body);
}

function keepTabFocusInside(event: KeyboardEvent, dialog: HTMLElement) {
  if (event.key !== "Tab") return;
  const focusable = Array.from(
    dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href], input:not([disabled]):not([type="file"]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => element.getClientRects().length > 0);
  if (focusable.length === 0) {
    event.preventDefault();
    dialog.focus();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

// Library makeup for Settings: how many things are kept, split by kind.
const MAKEUP_GROUPS: Array<{ label: string; kinds: ItemKind[]; color: string }> = [
  { label: "Images", kinds: ["Image"], color: "#B0714F" },
  { label: "Articles", kinds: ["Article"], color: "#C9A57A" },
  { label: "PDFs", kinds: ["PDF"], color: "#7E9A86" },
  { label: "Notes & quotes", kinds: ["Note", "Quote"], color: "#8B93B5" },
  { label: "Videos & posts", kinds: ["Video", "Post"], color: "#A88AAE" },
  { label: "Files", kinds: ["File"], color: "#4A443E" },
];

function LibraryMakeup({
  items,
  sizeBytes,
  onShowFolder,
}: {
  items: LibraryItem[];
  sizeBytes: number | null;
  onShowFolder?: () => void;
}) {
  const groups = MAKEUP_GROUPS.map((group) => ({
    ...group,
    count: items.filter((item) => group.kinds.includes(item.kind)).length,
  })).filter((group) => group.count > 0);
  return (
    <div className="settings-makeup">
      <div className="settings-makeup-head">
        <div className="settings-makeup-figures">
          <p className="settings-makeup-total">
            {items.length.toLocaleString()} {items.length === 1 ? "thing" : "things"}
          </p>
          {sizeBytes !== null && (
            <span className="settings-makeup-size">{formatByteSize(sizeBytes)} on disk</span>
          )}
        </div>
        {onShowFolder && (
          <button type="button" className="settings-makeup-folder" onClick={onShowFolder}>
            <HugeiconsIcon icon={Folder01Icon} size={13} />
            Show folder
          </button>
        )}
      </div>
      {groups.length > 0 && (
        <>
          <div className="settings-makeup-bar" aria-hidden="true">
            {groups.map((group) => (
              <span key={group.label} style={{ flexGrow: group.count, background: group.color }} />
            ))}
          </div>
          <ul className="settings-makeup-legend">
            {groups.map((group) => (
              <li key={group.label}>
                <span style={{ background: group.color }} aria-hidden="true" />
                {group.label} {group.count.toLocaleString()}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

// Paper's Everything glyph. Hugeicons has no 3x3 dot grid, so it is drawn here.
function NavDotGridIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
      {[5, 12, 19].flatMap((cy) =>
        [5, 12, 19].map((cx) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="2.2" fill="currentColor" />
        )),
      )}
    </svg>
  );
}

// Paper's Space mark, one blob for every Space. The colour is the row's colour class.
const SPACE_MARK_PATH =
  "M-96.539 5.45c-1.2 0-2.475-0.125-4-0.7-1.1-0.375-2.125-1-3.35-1.2-2.225-0.375-4.1-0.15-5.775 0.775-1.55 0.825-2.925 2.275-3.725 3.925-0.975 2.075-0.75 4.375-2.4 6.575-0.9 1.275-1.6 1.675-2.4 2.8-0.85 1.2-1.325 2.4-1.35 4.05-0.075 4.8 4.375 10.35 9.225 12.05 2.025 0.65 3.7 0.55 5.45-0.075 1-0.35 2.175-0.95 3.175-1.325 1.325-0.375 2.375-0.5 3.875-0.35 1.275 0.125 2.375 0.425 3.6 0.375 3.275-0.075 5.65-2.175 5.65-5.95 0-1.4-0.25-2.475-0.15-4.1 0.3-3.05 1.925-4.025 2.75-6.475 0.925-3.1 0.4-6.95-3.1-9.15-1.1-0.65-2.3-1.3-3.875-1.45-0.95-0.025-1.825 0.1-2.775 0.175l-0.825 0.05z";

function SpaceMark() {
  return (
    <svg width="15" height="14" viewBox="-121.289 2 37.5 34" aria-hidden="true">
      <path d={SPACE_MARK_PATH} fill="currentColor" />
    </svg>
  );
}

// Desktop sidebar toggle attached to the library frame's left edge. When the
// sidebar opens or closes it flips over that edge: the old side turns edge-on,
// then the new side turns in. The drawn side lags `isOpen` until the turn ends.
function SidebarEdgeTab({ isOpen, onToggle }: { isOpen: boolean; onToggle: () => void }) {
  const [side, setSide] = useState(isOpen);
  const [phase, setPhase] = useState<"idle" | "out" | "in">("idle");
  useEffect(() => {
    if (isOpen !== side && phase === "idle") setPhase("out");
  }, [isOpen, side, phase]);
  return (
    <button
      type="button"
      className={`edge-tab ${isOpen ? "at-sidebar" : ""} ${side ? "is-open" : "is-closed"} ${phase === "idle" ? "" : `flip-${phase}`}`}
      aria-label={isOpen ? "Close navigation" : "Open navigation"}
      data-tooltip={isOpen ? "Close sidebar" : "Open sidebar"}
      aria-expanded={isOpen}
      aria-controls="library-navigation"
      onClick={onToggle}
      onAnimationEnd={() => {
        if (phase === "out") {
          setSide(isOpen);
          setPhase("in");
        } else {
          setPhase("idle");
        }
      }}
    >
      <HugeiconsIcon icon={side ? ArrowLeft01Icon : ArrowRight01Icon} size={14} />
    </button>
  );
}

function App() {
  const canUseDesktopBackend = isDesktopRuntime() && !shouldUseSeedLibrary();
  const canUseLibraryFolderPicker = isDesktopRuntime() && !shouldUseSeedLibrary();
  const [items, setItems] = useState<LibraryItem[]>(shouldUseSeedLibrary() ? demoSeedItems : []);
  const [activeJobCount, setActiveJobCount] = useState<number | null>(null);
  const [spaces, setSpaces] = useState<StoredSpace[]>(shouldUseSeedLibrary() ? seedSpaces : []);
  const [query, setQuery] = useState("");
  // Debounced copy of the search box. The input stays instant; only the
  // backend round trip waits, so typing "design" issues one search instead
  // of six full reloads (search + N x job status + N x asset URL).
  const [debouncedQuery, setDebouncedQuery] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 200);
    return () => window.clearTimeout(timer);
  }, [query]);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [activeView, setActiveView] = useState("Everything");
  const [serendipityKeptIds, setSerendipityKeptIds] = useState<Set<string>>(() => new Set());
  const [activeSpaceId, setActiveSpaceId] = useState<string | null>(null);
  const [isCreatingSpace, setIsCreatingSpace] = useState(false);
  const [newSpaceName, setNewSpaceName] = useState("");
  const [newSpaceKind, setNewSpaceKind] = useState<SpaceKind>("smart");
  // Manual membership, keyed by space id then item id. Only read in preview and
  // seed mode; the desktop backend owns membership through the space item commands.
  const [localSpaceItems, setLocalSpaceItems] = useState<Map<string, Set<string>>>(
    () => new Map(Object.entries(seedSpaceItems).map(([spaceId, ids]) => [spaceId, new Set(ids)])),
  );
  // Which Regular Spaces hold the item open in the overlay, so its chips can
  // render in the right state. Cleared whenever the overlay closes.
  const [itemSpaceIds, setItemSpaceIds] = useState<string[]>([]);
  const [renamingSpaceId, setRenamingSpaceId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [availableUpdate, setAvailableUpdate] = useState<AvailableUpdate | null>(null);
  const [isInstallingUpdate, setIsInstallingUpdate] = useState(false);
  const [updateInstallFailed, setUpdateInstallFailed] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [isFirstRunOpen, setIsFirstRunOpen] = useState(false);
  const finishFirstRun = useCallback(() => {
    setIsFirstRunOpen(false);
    void completeOnboarding().catch(() => null);
  }, []);
  // The desktop window stays hidden until this settles (inkling:window:ready),
  // so a first launch opens straight onto the welcome instead of flashing the
  // library. When the welcome runs, it reports ready once it has painted.
  useEffect(() => {
    const showWindow = () => void window.inkling?.windowControls.ready().catch(() => null);
    if (!canUseDesktopBackend) {
      showWindow();
      return;
    }
    let cancelled = false;
    void getOnboardingState()
      .then(({ shouldAutoShow }) => shouldAutoShow)
      .catch(() => false)
      .then((welcome) => {
        if (cancelled) return;
        if (welcome) setIsFirstRunOpen(true);
        else showWindow();
      });
    return () => {
      cancelled = true;
    };
  }, [canUseDesktopBackend]);
  const [settingsTab, setSettingsTab] = useState<
    "general" | "licenses" | "appearance" | "archive" | "data" | "extension"
  >("general");
  const [appearance, setAppearanceOption] = useAppearance();
  // Optional facts Settings shows when the desktop backend can supply them.
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [librarySizeBytes, setLibrarySizeBytes] = useState<number | null>(null);
  const [lastCopy, setLastCopy] = useState<LastExport | null>(null);
  const [archivedItems, setArchivedItems] = useState<LibraryItem[]>(
    shouldUseSeedLibrary() ? browserArchivedItems : [],
  );
  const [isArchiveSelectionMode, setIsArchiveSelectionMode] = useState(false);
  const [isExportingLibrary, setIsExportingLibrary] = useState(false);
  const [lastExport, setLastExport] = useState<LibraryExportReport | null>(null);
  const [isImportingLibrary, setIsImportingLibrary] = useState(false);
  const [lastImport, setLastImport] = useState<LibraryImportReport | null>(null);
  const [selectedArchivedIds, setSelectedArchivedIds] = useState<Set<string>>(() => new Set());
  const [isAdding, setIsAdding] = useState(false);
  const [captureMode, setCaptureMode] = useState<AddMode | null>(null);
  const [selectedItem, setSelectedItem] = useState<LibraryItem | null>(null);
  const [pdfViewerItem, setPdfViewerItem] = useState<LibraryItem | null>(null);
  const [readingItem, setReadingItem] = useState<{
    item: LibraryItem;
    origin: ReaderOrigin;
  } | null>(null);
  useEffect(() => {
    if (!canUseDesktopBackend) return;
    let cancelled = false;
    void checkForUpdates()
      .then((update) => {
        if (!cancelled) setAvailableUpdate(update);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [canUseDesktopBackend]);
  const handleInstallUpdate = async () => {
    if (!availableUpdate) return;
    setIsInstallingUpdate(true);
    setUpdateInstallFailed(false);
    try {
      const latestUpdate = await installUpdate(availableUpdate.version);
      setAvailableUpdate(latestUpdate);
      setIsInstallingUpdate(false);
    } catch {
      setIsInstallingUpdate(false);
      setUpdateInstallFailed(true);
    }
  };
  // Warm the PDF viewer chunk while a PDF's overlay is open, so the first
  // open fades together with the backdrop instead of popping in after it.
  // Same chunk the lazy viewer resolves; this only moves the fetch earlier.
  useEffect(() => {
    if (selectedItem?.kind === "PDF" && selectedItem.fileUrl) {
      void import("./components/PdfViewer");
    }
  }, [selectedItem]);
  const noteContentRequestsRef = useRef(new Set<string>());
  const processingSummaryRequestsRef = useRef(new Set<string>());
  const pendingOcrRequestsRef = useRef(new Set<string>());
  const noteBodyCacheRef = useRef(new Map<string, string>());
  const itemDetailsRequestsRef = useRef(new Map<string, Promise<StoredLibraryItemDetail | null>>());
  const loadStoredItem = useCallback((id: string) => {
    const existing = itemDetailsRequestsRef.current.get(id);
    if (existing) return existing;
    const request = getItem(id).finally(() => itemDetailsRequestsRef.current.delete(id));
    itemDetailsRequestsRef.current.set(id, request);
    return request;
  }, []);
  const selectedItemId = selectedItem ? String(selectedItem.id) : null;
  const selectedItemKind = selectedItem?.kind;
  const selectedItemOcrText = selectedItem?.ocrText;
  const selectedItemProcessing = selectedItem?.processing;
  const readerRequestIdRef = useRef(0);
  const selectedItemIdRef = useRef(selectedItemId);
  useEffect(() => {
    if (selectedItemIdRef.current === selectedItemId) return;
    readerRequestIdRef.current += 1;
    selectedItemIdRef.current = selectedItemId;
  }, [selectedItemId]);
  useEffect(() => {
    if (!canUseDesktopBackend || !selectedItemId) return;
    const itemId = selectedItemId;
    if (!selectedItemProcessing) {
      if (processingSummaryRequestsRef.current.has(itemId)) return;
      processingSummaryRequestsRef.current.add(itemId);
      void getProcessingSummaries([itemId])
        .then((summaries) => {
          const processing = summaries.get(itemId);
          if (!processing) return;
          setSelectedItem((current) =>
            current && String(current.id) === itemId ? { ...current, processing } : current,
          );
        })
        .catch(() => {})
        .finally(() => processingSummaryRequestsRef.current.delete(itemId));
      return;
    }
    if (selectedItemProcessing.hasOcrJob) {
      pendingOcrRequestsRef.current.delete(itemId);
      return;
    }
    if (
      (selectedItemKind !== "Image" && selectedItemKind !== "PDF") ||
      selectedItemOcrText?.trim() ||
      pendingOcrRequestsRef.current.has(itemId)
    )
      return;
    pendingOcrRequestsRef.current.add(itemId);
    void enqueueOcrJob(itemId).catch(() => {
      pendingOcrRequestsRef.current.delete(itemId);
    });
  }, [
    canUseDesktopBackend,
    selectedItemId,
    selectedItemKind,
    selectedItemOcrText,
    selectedItemProcessing,
  ]);
  useEffect(() => {
    if (
      !canUseDesktopBackend ||
      selectedItem?.kind !== "Note" ||
      selectedItem.noteBody !== undefined
    )
      return;
    const id = String(selectedItem.id);
    if (noteContentRequestsRef.current.has(id)) return;
    noteContentRequestsRef.current.add(id);
    let cancelled = false;
    void getItemContent(id)
      .then((content) => {
        if (cancelled) return;
        const noteBody = normalizeNoteBody(content.body);
        rememberNoteBody(noteBodyCacheRef.current, id, noteBody);
        // The body is the only thing still missing here. Its description came
        // back already projected, so the fetched content only fills the gap.
        const apply = (item: LibraryItem) =>
          String(item.id) === id ? { ...item, noteBody } : item;
        setItems((current) => current.map(apply));
        setArchivedItems((current) => current.map(apply));
        setSelectedItem((current) => (current ? apply(current) : current));
      })
      .catch((error: unknown) => {
        if (!cancelled) setCaptureError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        noteContentRequestsRef.current.delete(id);
      });
    return () => {
      cancelled = true;
    };
  }, [canUseDesktopBackend, selectedItem?.id, selectedItem?.kind, selectedItem?.noteBody]);
  const [listMode, setListMode] = useState(false);
  const [viewSelectionListMode, setViewSelectionListMode] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [sidebarActionError, setSidebarActionError] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const shortcutsModalRef = useRef<HTMLElement | null>(null);
  const shortcutsCloseRef = useRef<HTMLButtonElement>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const settingsDialogRef = useRef<HTMLElement>(null);
  const spaceRenameInputRef = useRef<HTMLInputElement>(null);
  const newSpaceNameInputRef = useRef<HTMLInputElement>(null);
  const libraryScrollRef = useRef<HTMLDivElement>(null);
  const captureBarRef = useRef<HTMLElement>(null);
  const viewDockRef = useRef<HTMLDivElement>(null);
  const tooltipLayerRef = useRef<HTMLDivElement>(null);
  const libraryFrameRef = useRef<HTMLElement>(null);
  const libraryViewAnimationRef = useRef<gsap.core.Animation | null>(null);
  const libraryViewEnteringRef = useRef(false);
  const pendingPermanentDeletesRef = useRef<Map<string, PendingPermanentDelete>>(new Map());
  // Latest active list, mirrored so a delete that fails ten seconds from now
  // reads the library as it is then, not as it was when the timer was set.
  const activeItemsRef = useRef<LibraryItem[]>(items);
  useEffect(() => {
    activeItemsRef.current = items;
  }, [items]);
  const libraryViewTransitionRunRef = useRef(0);
  const selectionRectsRef = useRef<SourceRects | null>(null);
  const selectionRunRef = useRef(0);
  const selectionScrollRef = useRef(false);
  // Latest loadItems, assigned by the data effect. Job-event callbacks and
  // post-mutation refreshes call through here so they never go stale.
  const loadItemsRef = useRef<() => void>(() => {});
  // Generation counter for space moves: only the latest move may apply its
  // backend result; older ones resync, so rapid clicks cannot overwrite newer state.
  const spaceMoveSeqRef = useRef(0);
  // Mirror of `items` for callbacks that must read the newest value without
  // being rebuilt on every load.
  const itemsRef = useRef<LibraryItem[]>([]);
  // Pins whose write has not been confirmed by the backend yet. A refresh that
  // was already in flight can resolve with the pre-pin value, so these are
  // re-applied when it lands.
  const pinnedOverridesRef = useRef<Map<string, boolean>>(new Map());
  const [libraryViewportWidth, setLibraryViewportWidth] = useState(() =>
    typeof window === "undefined" ? 960 : window.innerWidth,
  );

  const selectLibraryItem = useCallback((item: LibraryItem, rects?: SourceRects) => {
    const run = ++selectionRunRef.current;
    const sourceRects = rects ?? queryCardRects(item.id);
    const contentArea = libraryScrollRef.current;
    const scrollElement = scrollViewport(contentArea);
    if (
      !sourceRects ||
      !scrollElement ||
      !isCardTooFarOffscreen(
        sourceRects.card,
        scrollViewportRect(scrollElement, captureBarRef.current),
      )
    ) {
      selectionScrollRef.current = false;
      selectionRectsRef.current = sourceRects;
      setSelectedItem(item);
      return;
    }

    const viewportRect = scrollViewportRect(scrollElement, captureBarRef.current);
    const nextScrollTop = Math.max(
      0,
      scrollElement.scrollTop + sourceRects.card.top - viewportRect.top - 16,
    );
    selectionScrollRef.current = true;

    // The card is scrolled into view with an eased, smooth motion before the
    // overlay opens, so its rect is measured only once the scroll settles.
    const finish = () => {
      if (run !== selectionRunRef.current) return;
      selectionRectsRef.current = queryCardRects(item.id) ?? sourceRects;
      setSelectedItem(item);
      selectionScrollRef.current = false;
    };

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      scrollElement.scrollTop = nextScrollTop;
      finish();
      return;
    }

    gsap.to(scrollElement, {
      scrollTop: nextScrollTop,
      duration: 0.55,
      ease: "power2.inOut",
      overwrite: true,
      onComplete: finish,
    });
  }, []);

  const bringHistoryCardIntoView = useCallback(
    (item: LibraryItem, candidates: LibraryItem[]) =>
      new Promise<SourceRects | null>((resolve) => {
        const index = candidates.findIndex((candidate) => candidate.id === item.id);
        const contentArea = libraryScrollRef.current;
        const scrollElement = scrollViewport(contentArea);
        if (index < 0 || !scrollElement) {
          resolve(null);
          return;
        }

        const viewportRect = scrollViewportRect(scrollElement, captureBarRef.current);
        let rects = queryCardRects(item.id);
        if (!rects || isCardTooFarOffscreen(rects.card, viewportRect)) {
          if (rects) {
            scrollElement.scrollTop += rects.card.top - viewportRect.top - 16;
          } else {
            const maxScroll = scrollElement.scrollHeight - scrollElement.clientHeight;
            scrollElement.scrollTop = maxScroll * (index / Math.max(1, candidates.length - 1));
          }
        }

        let frames = 0;
        const waitForCard = () => {
          rects = queryCardRects(item.id);
          if (rects) {
            const currentViewport = scrollViewportRect(scrollElement, captureBarRef.current);
            if (isCardTooFarOffscreen(rects.card, currentViewport)) {
              // At either end of the list the scroll can't move, so take the card
              // where it is rather than waiting forever (Back would never close).
              const before = scrollElement.scrollTop;
              scrollElement.scrollTop += rects.card.top - currentViewport.top - 16;
              if (scrollElement.scrollTop !== before) {
                requestAnimationFrame(waitForCard);
                return;
              }
            }
            resolve(rects);
            return;
          }
          if (++frames >= 8) {
            resolve(null);
            return;
          }
          requestAnimationFrame(waitForCard);
        };
        requestAnimationFrame(waitForCard);
      }),
    [],
  );

  const retryJob = useCallback(async (jobId: string) => {
    setCaptureError(null);
    try {
      const retried = await retryProcessingJob(jobId);
      if (!retried) setCaptureError("That processing job is no longer available to retry.");
    } catch (error) {
      setCaptureError(error instanceof Error ? error.message : String(error));
    }
  }, []);

  const cancelPermanentDelete = useCallback((pending: PendingPermanentDelete) => {
    const id = String(pending.item.id);
    // Only the toast that scheduled a deletion may cancel it. Deleting the same
    // item again stores a new record, and that older Undo has to stay a no-op.
    if (pendingPermanentDeletesRef.current.get(id) !== pending) return false;
    window.clearTimeout(pending.timer);
    pendingPermanentDeletesRef.current.delete(id);
    return true;
  }, []);

  const restoreForgottenItem = useCallback(
    async (item: LibraryItem) => {
      // A restore un-archives the row, so any scheduled permanent delete for it
      // must be cancelled or its timer would still fire and destroy the assets.
      const pending = pendingPermanentDeletesRef.current.get(String(item.id));
      if (pending !== undefined) cancelPermanentDelete(pending);
      try {
        const restoredItem = canUseDesktopBackend
          ? await archiveItem(String(item.id), false).then(async (storedItem) => {
              const summary = (await getProcessingSummaries([storedItem.id])).get(storedItem.id);
              return storedItemToLibraryItem(storedItem, summary);
            })
          : { ...item, archived: false };
        const cachedNoteBody = noteBodyCacheRef.current.get(String(item.id));
        // The restore response carries the description the backend already
        // projected; the cache only holds a body this session edited, so it
        // re-attaches the body without re-deriving the description.
        const restoredLibraryItem =
          cachedNoteBody === undefined
            ? restoredItem
            : { ...restoredItem, noteBody: cachedNoteBody };
        setItems((current) =>
          current.some((currentItem) => String(currentItem.id) === String(item.id))
            ? current
            : [restoredLibraryItem, ...current],
        );
        setArchivedItems((current) =>
          current.filter((currentItem) => String(currentItem.id) !== String(item.id)),
        );
      } catch (error) {
        toast.error("Unable to restore this item", { duration: Infinity, closeButton: true });
        setCaptureError(error instanceof Error ? error.message : String(error));
      }
    },
    [canUseDesktopBackend, cancelPermanentDelete],
  );

  const forgetItem = useCallback(
    async (item: LibraryItem) => {
      setCaptureError(null);
      try {
        if (canUseDesktopBackend) {
          await archiveItem(String(item.id));
        } else {
          setArchivedItems((current) =>
            current.some((currentItem) => String(currentItem.id) === String(item.id))
              ? current
              : [{ ...item, archived: true }, ...current],
          );
        }
        setItems((current) =>
          current.filter((currentItem) => String(currentItem.id) !== String(item.id)),
        );
        setSelectedItem(null);

        const toastId = `forgot-${String(item.id)}-${Date.now()}`;
        toast("Forgotten from your library", {
          id: toastId,
          description: item.title,
          duration: Infinity,
          closeButton: true,
          className: "library-toast",
          action: {
            label: "Undo",
            onClick: () => void restoreForgottenItem(item),
          },
        });
      } catch (error) {
        setCaptureError(error instanceof Error ? error.message : String(error));
      }
    },
    [canUseDesktopBackend, restoreForgottenItem],
  );

  const keepSerendipityItem = useCallback((item: LibraryItem) => {
    setSerendipityKeptIds((current) => {
      const id = String(item.id);
      if (current.has(id)) return current;
      const next = new Set(current);
      next.add(id);
      return next;
    });
    setSelectedItem(null);
  }, []);

  const showLibraryFolderFromSettings = useCallback(() => {
    void showLibraryFolder().catch((error: unknown) => {
      toast.error("Could not open the library folder", {
        description: error instanceof Error ? error.message : String(error),
        closeButton: true,
      });
    });
  }, []);

  // The backend resolves false when the item has nothing on disk to point at.
  const showItemInFolderFromOverlay = useCallback((item: LibraryItem) => {
    void showItemInFolder(String(item.id))
      .then((shown) => {
        if (!shown) toast("Nothing is stored on disk for this item", { closeButton: true });
      })
      .catch((error: unknown) => {
        toast.error("Could not show the item in its folder", {
          description: error instanceof Error ? error.message : String(error),
          closeButton: true,
        });
      });
  }, []);

  // Export uses the native folder picker and storage backend for the active desktop shell.
  const exportLibraryToFolder = useCallback(async () => {
    if (!canUseLibraryFolderPicker || isExportingLibrary || isImportingLibrary) return;
    let destination: string | null = null;
    try {
      destination = await selectLibraryDirectory("Choose where to save the export");
    } catch (error) {
      toast.error("Could not open the folder picker", {
        description: error instanceof Error ? error.message : String(error),
        closeButton: true,
      });
      return;
    }
    if (!destination) return;

    setIsExportingLibrary(true);
    const toastId = toast.loading("Exporting library…", {
      description: "Copying the database and its files",
    });
    try {
      const report = await exportLibrary(destination);
      setLastExport(report);
      // The backend stamps the copy; read it back rather than guessing the time here.
      void getLastExport()
        .then((copy) => setLastCopy(copy ?? null))
        .catch(() => undefined);
      toast.success(
        report.skippedAssets > 0 ? "Library exported with skipped assets" : "Library exported",
        {
          id: toastId,
          description: formatExportSummary(report),
          duration: 4000,
          closeButton: true,
        },
      );
    } catch (error) {
      toast.error("Export failed", {
        id: toastId,
        description: error instanceof Error ? error.message : String(error),
        duration: Infinity,
        closeButton: true,
      });
    } finally {
      setIsExportingLibrary(false);
    }
  }, [canUseLibraryFolderPicker, isExportingLibrary, isImportingLibrary]);

  const importLibraryFromFolder = useCallback(async () => {
    if (!canUseLibraryFolderPicker || isExportingLibrary || isImportingLibrary) return;
    let exportDirectory: string | null = null;
    try {
      exportDirectory = await selectLibraryDirectory("Choose an Inkling export to restore");
    } catch (error) {
      toast.error("Could not open the export picker", {
        description: error instanceof Error ? error.message : String(error),
        closeButton: true,
      });
      return;
    }
    if (!exportDirectory) return;

    setIsImportingLibrary(true);
    const toastId = toast.loading("Restoring library…", {
      description: "Checking the export and copying its files",
    });
    try {
      const report = await importLibrary(exportDirectory);
      setLastImport(report);
      toast.success("Library restored", {
        id: toastId,
        description: `${formatImportSummary(report)}. Search indexing will continue in the background.`,
        duration: 5000,
        closeButton: true,
      });
      try {
        setSpaces(await listSpaces());
        const storedItems = await listArchivedItems();
        const summaries = await getProcessingSummaries(storedItems.map((item) => item.id));
        setArchivedItems(
          await Promise.all(
            storedItems.map((item) => storedItemToLibraryItem(item, summaries.get(item.id))),
          ),
        );
        loadItemsRef.current();
      } catch (error) {
        setCaptureError(error instanceof Error ? error.message : String(error));
      }
    } catch (error) {
      toast.error("Import failed", {
        id: toastId,
        description: error instanceof Error ? error.message : String(error),
        duration: Infinity,
        closeButton: true,
      });
    } finally {
      setIsImportingLibrary(false);
    }
  }, [canUseLibraryFolderPicker, isExportingLibrary, isImportingLibrary]);

  const addTagToItem = useCallback(
    async (item: LibraryItem, tag: string) => {
      const clean = tag.trim().replace(/^#+/u, "").trim().toLowerCase();
      if (!clean) return;
      try {
        let tags = canUseDesktopBackend ? [] : [...item.tags, clean];
        if (canUseDesktopBackend) {
          const storedItem = await updateItem({ id: String(item.id), addTag: clean });
          tags = Array.isArray(storedItem.metadata.tags)
            ? storedItem.metadata.tags.filter((value): value is string => typeof value === "string")
            : [];
        }
        const apply = (current: LibraryItem) => ({
          ...current,
          tags,
        });
        setItems((current) =>
          current.map((currentItem) =>
            String(currentItem.id) === String(item.id) ? apply(currentItem) : currentItem,
          ),
        );
        setSelectedItem((current) =>
          current && String(current.id) === String(item.id) ? apply(current) : current,
        );
      } catch {
        toast.error("Unable to save this tag", { duration: 5000 });
      }
    },
    [canUseDesktopBackend],
  );

  const updateNote = useCallback(
    async (item: LibraryItem, body: string) => {
      const nextBody = normalizeNoteBody(body);
      if (!nextBody) throw new Error("A note needs some text before it can be saved.");

      let nextItem: LibraryItem;
      if (canUseDesktopBackend) {
        const storedItem = await updateItem({
          id: String(item.id),
          body: nextBody,
          bodyFormat: NOTE_BODY_FORMAT,
        });
        const summary = (await getProcessingSummaries([storedItem.id])).get(storedItem.id);
        nextItem = {
          ...(await storedItemToLibraryItem(storedItem, summary)),
          noteBody: nextBody,
        };
      } else {
        nextItem = {
          ...item,
          description: markdownToPlainText(nextBody),
          noteBody: nextBody,
        };
      }

      // The saved response carries the row's pin as it was before an in-flight
      // write landed, so a pin the backend has not confirmed yet wins over it,
      // the same way a refresh re-applies its overrides.
      const apply = (current: LibraryItem) => {
        if (String(current.id) !== String(item.id)) return current;
        const saved = { ...current, ...nextItem, id: current.id };
        const pinned = pinnedOverridesRef.current.get(String(item.id));
        return pinned === undefined ? saved : { ...saved, favorite: pinned };
      };
      setItems((current) => current.map(apply));
      setArchivedItems((current) => current.map(apply));
      setSelectedItem((current) => (current ? apply(current) : current));
      rememberNoteBody(noteBodyCacheRef.current, String(item.id), nextBody);
    },
    [canUseDesktopBackend],
  );

  // Pins are flipped from current state, not from the item the click captured,
  // so a second click during a slow write reverses the first instead of
  // repeating it. Writes for one item chain instead of being dropped: the old
  // guard returned early on an in-flight id, so undoing a pin needed a third
  // click once the first write landed.
  const pinWritesRef = useRef<Map<string, Promise<void>>>(new Map());
  const togglePinItem = useCallback(
    async (item: LibraryItem) => {
      const id = String(item.id);
      // Read the live value so a repeat click reverses the previous one. An
      // archived item is not in the active list, so fall back to the item the
      // overlay handed over rather than treating it as unpinned.
      const live = itemsRef.current.find((candidate) => String(candidate.id) === id);
      const wasPinned = (live ?? item).favorite === true;
      const pinned = !wasPinned;
      const show = (next: boolean) => {
        const apply = (current: LibraryItem) =>
          String(current.id) === id ? { ...current, favorite: next } : current;
        setItems((current) => current.map(apply));
        setArchivedItems((current) => current.map(apply));
        setSelectedItem((current) => (current ? apply(current) : current));
      };
      // Optimistic, so a repeated click reads the new value. A refresh already
      // in flight can land older data, so the pin is re-applied until the
      // backend confirms it.
      pinnedOverridesRef.current.set(id, pinned);
      show(pinned);

      // A Space's rows come from its own query rather than a client-side
      // filter, so a Smart Space that filters on the pin keeps showing the old
      // contents until it is re-read. Only that case needs the extra load.
      const openSpace =
        activeSpaceId !== null ? spaces.find((space) => space.id === activeSpaceId) : undefined;
      const rereadsPins = openSpace?.kind === "smart" && openSpace.query.favorite != null;

      const write = (pinWritesRef.current.get(id) ?? Promise.resolve())
        .then(async () => {
          if (!canUseDesktopBackend) return;
          const confirmed = await updateItem({ id, favorite: pinned });
          // The stored value wins once it is known, including if it disagreed
          // with what was asked for.
          show(confirmed.favorite === true);
          if (rereadsPins) loadItemsRef.current();
        })
        .catch(() => {
          // A failed write must not leave the item looking pinned anywhere.
          show(wasPinned);
          // A later click already asked for something else and reports its own
          // outcome, so a superseded failure stays quiet rather than blaming the
          // user for a state that is no longer the one being written.
          if (pinWritesRef.current.get(id) === write) {
            toast.error(pinned ? "Unable to pin this item" : "Unable to unpin this item");
          }
        })
        .finally(() => {
          // Release the override only if no later click has claimed it in the
          // meantime, and only clear this item's slot if it is still the tail of
          // the chain.
          if (pinnedOverridesRef.current.get(id) === pinned) pinnedOverridesRef.current.delete(id);
          if (pinWritesRef.current.get(id) === write) pinWritesRef.current.delete(id);
        });
      pinWritesRef.current.set(id, write);
      await write;
    },
    [activeSpaceId, canUseDesktopBackend, spaces],
  );

  const openReader = useCallback(
    async (
      item: LibraryItem,
      origin: ReaderOrigin = { x: window.innerWidth / 2, y: window.innerHeight / 2 },
    ) => {
      const requestId = ++readerRequestIdRef.current;
      try {
        let readerItem = item;
        if (canUseDesktopBackend) {
          if (!readerItem.articleHtml && !readerItem.hasArticleContent) return;
          const storedItem = await loadStoredItem(String(item.id));
          if (requestId !== readerRequestIdRef.current || !storedItem) return;
          readerItem = withArticleContent(item, storedItem);
        } else if (!readerItem.articleHtml) {
          return;
        }
        if (requestId !== readerRequestIdRef.current || !readerItem.articleHtml) return;
        setReadingItem({ item: readerItem, origin });
      } catch (error) {
        if (requestId === readerRequestIdRef.current) {
          toast.error("Unable to open reader", {
            description: error instanceof Error ? error.message : String(error),
          });
        }
      }
    },
    [canUseDesktopBackend, loadStoredItem],
  );
  const closeReader = useCallback(() => {
    readerRequestIdRef.current += 1;
    setReadingItem(null);
  }, []);

  // Switching views fades the cards out, swaps the layout, then pops the new
  // cards in: list rows top to bottom, grid cards diagonally from the top left.
  // Only cards in view animate; the rest stay hidden until the entrance ends.
  const playLibraryEntrance = useCallback((list: boolean) => {
    const root = libraryScrollRef.current;
    const grid = root?.querySelector<HTMLElement>(".library-grid");
    if (!root || !grid) return;
    const run = ++libraryViewTransitionRunRef.current;
    grid.dataset.entering = "";
    gsap.set(grid, { clearProps: "opacity" });
    // Virtuoso mounts and measures the new layout over the next frames.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (run !== libraryViewTransitionRunRef.current) return;
        const view = root.getBoundingClientRect();
        const cards: HTMLElement[] = [];
        const delays: number[] = [];
        for (const card of grid.querySelectorAll<HTMLElement>(".library-card")) {
          const rect = card.getBoundingClientRect();
          if (rect.bottom <= view.top || rect.top >= view.bottom) continue;
          const down = Math.max(0, rect.top - view.top) / view.height;
          const across = Math.max(0, rect.left - view.left) / view.width;
          cards.push(card);
          delays.push(list ? down * 0.28 : (down + across) * 0.2);
        }
        const finish = () => {
          delete grid.dataset.entering;
          gsap.set(cards, { clearProps: "opacity,transform" });
        };
        libraryViewAnimationRef.current = gsap.fromTo(
          cards,
          list ? { opacity: 0, y: -6 } : { opacity: 0, scale: 0.96 },
          {
            opacity: 1,
            y: 0,
            scale: 1,
            duration: 0.3,
            ease: "power2.out",
            delay: (index: number) => delays[index] ?? 0,
            onComplete: finish,
            onInterrupt: finish,
          },
        );
      }),
    );
  }, []);

  const switchLibraryView = useCallback(
    (nextListMode: boolean) => {
      if (nextListMode === viewSelectionListMode) return;
      setViewSelectionListMode(nextListMode);
      libraryViewTransitionRunRef.current += 1;
      libraryViewAnimationRef.current?.kill();
      const grid = libraryScrollRef.current?.querySelector<HTMLElement>(".library-grid");
      if (!grid || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        if (grid) gsap.set(grid, { clearProps: "opacity" });
        setListMode(nextListMode);
        return;
      }
      libraryViewAnimationRef.current = gsap.to(grid, {
        opacity: 0,
        duration: 0.16,
        ease: "power1.in",
        onComplete: () => {
          // Back to the view already showing: nothing re-renders, so pop it in here.
          if (nextListMode === listMode) playLibraryEntrance(nextListMode);
          else {
            libraryViewEnteringRef.current = true;
            setListMode(nextListMode);
          }
        },
      });
    },
    [listMode, playLibraryEntrance, viewSelectionListMode],
  );

  useLayoutEffect(() => {
    if (!libraryViewEnteringRef.current) return;
    libraryViewEnteringRef.current = false;
    playLibraryEntrance(listMode);
  }, [listMode, playLibraryEntrance]);

  useEffect(
    () => () => {
      libraryViewAnimationRef.current?.kill();
    },
    [],
  );

  useEffect(() => {
    const element = libraryScrollRef.current;
    if (!element) return;

    const updateWidth = () => {
      const nextWidth = element.clientWidth;
      if (nextWidth > 0)
        setLibraryViewportWidth((current) => (current === nextWidth ? current : nextWidth));
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

  const gridColumnCount = masonryColumnCount(libraryViewportWidth);

  async function persistFile(file: File, captureSource: string) {
    const kind = classifyFile(file);
    const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
    if (canUseDesktopBackend) {
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
      kind:
        kind === "image" ? "Image" : kind === "pdf" ? "PDF" : kind === "video" ? "Video" : "File",
      title: file.name,
      description: `Saved from ${captureSource}.`,
      source: captureSource,
      date: "Just now",
      tags: [],
      image,
      fileUrl: kind === "video" ? URL.createObjectURL(file) : undefined,
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
      setIsAdding(false);
      setCaptureMode(null);
    } catch (error) {
      setCaptureError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsCapturing(false);
    }
  }

  async function persistArticle(sourceUrl: string, captureSource: string, extensionTitle?: string) {
    const parsedUrl = parseHttpUrl(sourceUrl);
    const normalizedUrl = parsedUrl.toString();
    const preservedTitle = extensionTitle?.trim();
    const fallbackTitle = preservedTitle || parsedUrl.hostname;
    if (canUseDesktopBackend) {
      const storedItem = await captureUrlItem({
        sourceUrl: normalizedUrl,
        captureSource,
        ...(preservedTitle ? { title: preservedTitle } : {}),
      });
      const libraryItem = await storedItemToLibraryItem(storedItem);
      setItems((current) =>
        current.some((item) => String(item.id) === String(libraryItem.id))
          ? current.map((item) => (String(item.id) === String(libraryItem.id) ? libraryItem : item))
          : [libraryItem, ...current],
      );
      return;
    }

    const fallbackItem: LibraryItem = {
      id: Date.now(),
      kind: "Article",
      title: fallbackTitle,
      description: "",
      source: parsedUrl.hostname,
      sourceUrl: normalizedUrl,
      date: "Just now",
      tags: [],
    };
    setItems((current) => [fallbackItem, ...current]);
    void import("./lib/ingestion")
      .then(({ ingestUrl }) => ingestUrl(normalizedUrl))
      .then((article) => {
        const social = article.social;
        const embeddedVideoLink = social ? null : videoLinkFromSourceUrl(article.canonicalUrl);
        const firstImageDimensions = article.imageDimensions.find(
          (value) => value.url === article.imageUrls[0],
        );
        const enrichedItem: LibraryItem = {
          ...fallbackItem,
          kind: social ? "Post" : embeddedVideoLink ? "Video" : "Article",
          title: article.title || fallbackTitle,
          description: article.description || article.text.slice(0, 180),
          source: social
            ? `X${social.authorHandle ? ` · @${social.authorHandle.replace(/^@/u, "")}` : ""}`
            : new URL(article.canonicalUrl).hostname,
          sourceUrl: article.canonicalUrl,
          author: article.author,
          image: article.imageUrls[0],
          mediaWidth: firstImageDimensions?.width,
          mediaHeight: firstImageDimensions?.height,
          mediaAspectRatio: firstImageDimensions
            ? firstImageDimensions.width / firstImageDimensions.height
            : undefined,
          articleAuthor: article.author || undefined,
          publishedDate: article.publishedDate ?? undefined,
          articleHtml: article.html || undefined,
          hasArticleContent: Boolean(article.html.trim()),
          social,
          post: social ? postFallbackFromMetadata(social) : undefined,
          video: embeddedVideoLink ?? undefined,
        };
        const applyEnrichment = (item: LibraryItem) =>
          String(item.id) === String(fallbackItem.id)
            ? {
                ...enrichedItem,
                title:
                  preservedTitle || item.title !== fallbackTitle
                    ? item.title
                    : article.title || item.title,
              }
            : item;
        setItems((current) => current.map(applyEnrichment));
        setSelectedItem((current) => (current ? applyEnrichment(current) : current));
      })
      .catch(() => {});
  }

  async function captureArticle(sourceUrl: string, captureSource: string, extensionTitle?: string) {
    setCaptureError(null);
    setIsCapturing(true);
    try {
      await persistArticle(sourceUrl, captureSource, extensionTitle);
      setIsAdding(false);
      setCaptureMode(null);
    } catch (error) {
      setCaptureError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsCapturing(false);
    }
  }

  async function captureDeepLinkUrl(sourceUrl: string, title: string | undefined) {
    setCaptureError(null);
    setIsCapturing(true);
    try {
      await persistArticle(sourceUrl, "browser extension", title);
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
    if (
      /^https?:\/\//iu.test(value) ||
      /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}(?::\d+)?(?:\/[^\s]*)?$/u.test(
        value,
      )
    ) {
      await persistArticle(value, captureSource);
      return;
    }

    if (canUseDesktopBackend) {
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
      description: markdownToPlainText(value),
      noteBody: normalizeNoteBody(value),
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
    const trimmedSource =
      rawSource &&
      !/^[a-zA-Z][a-zA-Z0-9+.-]*:/u.test(rawSource) &&
      rawSource.includes(".") &&
      !rawSource.includes(" ")
        ? `https://${rawSource}`
        : rawSource;

    if (canUseDesktopBackend) {
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
      if (width === 0 || height === 0)
        throw new Error("The selected display has no capturable frame.");
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
      stream?.getTracks().forEach((track) => {
        track.stop();
      });
      setIsCapturing(false);
    }
  }

  async function captureImageUrl(pageUrl: string, imageUrl: string, captureSource: string) {
    setCaptureError(null);
    setIsCapturing(true);
    try {
      const response = await fetch(imageUrl);
      if (!response.ok) throw new Error(`The image returned HTTP ${response.status}.`);
      const blob = await response.blob();
      const segment =
        imageUrl.split("?")[0].split("#")[0].split("/").filter(Boolean).pop() || "image";
      const file = new File([blob], segment.slice(0, 80), { type: blob.type || "image/png" });
      await persistFile(file, captureSource);
    } catch {
      // A direct download can fail on hotlink protection or CORS; the page
      // itself is still worth keeping.
      await persistArticle(pageUrl, captureSource);
    } finally {
      setIsCapturing(false);
    }
  }

  async function handleDeepLinkPayload(payload: unknown) {
    const values = Array.isArray(payload) ? payload : [payload];
    for (const value of values) {
      const capture =
        typeof value === "string" ? parseDeepLinkCapture(value) : validateDeepLinkCapture(value);
      if (!capture) continue;
      // Every path creates the provisional card immediately; extraction,
      // embeddings, and indexing run as background jobs from there.
      if (capture.kind === "quote") {
        await persistQuote(
          capture.selection,
          capture.attribution,
          capture.url,
          "browser extension",
        );
      } else if (capture.kind === "image") {
        await captureImageUrl(capture.pageUrl, capture.imageUrl, "browser extension");
      } else {
        await captureDeepLinkUrl(capture.url, capture.title);
      }
    }
  }

  function selectSpace(space: StoredSpace) {
    setActiveSpaceId(space.id);
    setActiveView(space.name);
    setQuery("");
    setSelectedItem(null);
  }

  function selectSerendipityView() {
    setActiveSpaceId(null);
    setActiveView("Serendipity");
    setQuery("");
    setSelectedItem(null);
  }

  function clearToDefaultView() {
    setActiveSpaceId(null);
    setActiveView("Everything");
  }

  function beginSaveSearch() {
    setIsCreatingSpace(true);
    setNewSpaceKind("smart");
    setNewSpaceName(query.trim());
  }

  async function handleCreateSpace(event: React.FormEvent) {
    event.preventDefault();
    const name = newSpaceName.trim();
    if (!name) return;

    // A Regular Space is filled by hand, so the search behind the sidebar "+"
    // does not become its query.
    const spaceQuery: SmartSpaceQuery =
      newSpaceKind === "smart" && query.trim() ? { text: query.trim() } : {};
    const color = SPACE_COLORS[spaces.length % SPACE_COLORS.length];
    try {
      const created = canUseDesktopBackend
        ? await createSpace({ name, color, query: spaceQuery, kind: newSpaceKind })
        : {
            id: `local-space-${Date.now()}`,
            name,
            color,
            query: spaceQuery,
            kind: newSpaceKind,
            position: spaces.length + 1,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
      setSpaces((current) => [...current, created]);
      setIsCreatingSpace(false);
      setNewSpaceName("");
      setNewSpaceKind("smart");
      selectSpace(created);
    } catch {
      setSidebarActionError("Couldn’t create this Space.");
    }
  }

  // The chips toggle from live membership, so this has to stay a stable
  // callback: the overlay actions memo closes over it, and a plain function
  // would leave that memo holding a pre-toggle membership read and turn
  // "Remove from" into a second add.
  //
  // The direction is applied before the write rather than after it, because a
  // second click while the first write is in flight has to reverse the first
  // instead of repeating it. Two writes for one Space are chained so the
  // reversal cannot land before the write it reverses.
  const spaceWritesRef = useRef<Map<string, Promise<void>>>(new Map());
  // Bumped by every chip toggle. A membership read already in flight carries the
  // value it saw here and drops its result if a toggle has landed since, so an
  // older read cannot roll back the chip the user just changed.
  const spaceMembershipEpochRef = useRef(0);
  const handleToggleItemInSpace = useCallback(
    async (item: LibraryItem, spaceId: string) => {
      const itemId = String(item.id);
      const wasMember = itemSpaceIds.includes(spaceId);
      // `adding` is the state being moved to, not the one being left. Naming it
      // after the destination keeps the write and the optimistic apply reading the
      // same way round, which is the trap the previous `member` name walked into.
      const adding = !wasMember;
      const show = (next: boolean) => {
        setItemSpaceIds((current) => {
          if (next) return current.includes(spaceId) ? current : [...current, spaceId];
          return current.filter((id) => id !== spaceId);
        });
      };
      if (!canUseDesktopBackend) {
        // Preview keeps membership in local state and an effect mirrors that into
        // itemSpaceIds, so there is no write to make and none to chain.
        setLocalSpaceItems((current) => {
          const next = new Map(current);
          const members = new Set(next.get(spaceId) ?? []);
          if (adding) members.add(itemId);
          else members.delete(itemId);
          next.set(spaceId, members);
          return next;
        });
        return;
      }

      spaceMembershipEpochRef.current += 1;
      show(adding);
      const write = (spaceWritesRef.current.get(spaceId) ?? Promise.resolve())
        .then(async () => {
          if (adding) await addSpaceItem(spaceId, itemId);
          else await removeSpaceItem(spaceId, itemId);
          // The open Space lists its own members, so its grid has to re-read.
          if (activeSpaceId === spaceId) loadItemsRef.current();
        })
        .catch(() => {
          // A failed write must not leave the chip claiming a membership the
          // library does not have.
          show(wasMember);
          setSidebarActionError(
            adding
              ? "Couldn’t add this item to the Space."
              : "Couldn’t remove this item from the Space.",
          );
        })
        .finally(() => {
          if (spaceWritesRef.current.get(spaceId) === write) spaceWritesRef.current.delete(spaceId);
        });
      spaceWritesRef.current.set(spaceId, write);
      await write;
    },
    [activeSpaceId, canUseDesktopBackend, itemSpaceIds],
  );

  async function handleDeleteSpace(space: StoredSpace) {
    try {
      if (canUseDesktopBackend) await deleteSpace(space.id);
      setSpaces((current) => current.filter((candidate) => candidate.id !== space.id));
      setLocalSpaceItems((current) => {
        const next = new Map(current);
        next.delete(space.id);
        return next;
      });
      setItemSpaceIds((current) => current.filter((id) => id !== space.id));
      if (activeSpaceId === space.id) clearToDefaultView();
    } catch {
      setSidebarActionError("Couldn’t delete this Space.");
    }
  }

  async function handleRenameSpace(space: StoredSpace, name: string) {
    const trimmed = name.trim().slice(0, 80);
    setRenamingSpaceId(null);
    if (!trimmed || trimmed === space.name) return;
    try {
      const updated = canUseDesktopBackend
        ? await updateSpace({ id: space.id, name: trimmed })
        : { ...space, name: trimmed, updatedAt: Date.now() };
      setSpaces((current) =>
        current.map((candidate) => (candidate.id === space.id ? updated : candidate)),
      );
      if (activeSpaceId === space.id) setActiveView(updated.name);
    } catch {
      // Reopen the rename input with the draft preserved: the name visibly
      // didn't stick, so the user can retry or Escape instead of wondering.
      setRenamingSpaceId(space.id);
      setRenameDraft(trimmed);
      setSidebarActionError("Couldn’t rename this Space.");
    }
  }

  async function handleCycleSpaceColor(space: StoredSpace) {
    const next = SPACE_COLORS[(SPACE_COLORS.indexOf(space.color) + 1) % SPACE_COLORS.length];
    if (next === space.color) return;
    try {
      const updated = canUseDesktopBackend
        ? await updateSpace({ id: space.id, color: next })
        : { ...space, color: next, updatedAt: Date.now() };
      setSpaces((current) =>
        current.map((candidate) => (candidate.id === space.id ? updated : candidate)),
      );
    } catch {
      setSidebarActionError("Couldn’t change this Space’s color.");
    }
  }

  async function handleMoveSpace(space: StoredSpace, direction: -1 | 1) {
    const ordered = [...spaces].sort((a, b) => a.position - b.position);
    const index = ordered.findIndex((candidate) => candidate.id === space.id);
    const other = ordered[index + direction];
    if (index < 0 || !other) return;
    // Optimistic swap so rapid clicks chain off fresh rendered state instead
    // of recomputing the same neighbor pair from a stale render.
    const locallySwapped = ordered
      .map((candidate) =>
        candidate.id === space.id
          ? { ...candidate, position: other.position }
          : candidate.id === other.id
            ? { ...candidate, position: space.position }
            : candidate,
      )
      .sort((a, b) => a.position - b.position);
    if (canUseDesktopBackend) {
      const seq = ++spaceMoveSeqRef.current;
      setSpaces(locallySwapped);
      try {
        const confirmed = await swapSpacePositions(space.id, other.id);
        if (spaceMoveSeqRef.current === seq) {
          setSpaces(confirmed);
        } else {
          setSpaces(await listSpaces());
        }
      } catch {
        let resynced = true;
        try {
          setSpaces(await listSpaces());
        } catch {
          // Keep the optimistic view, but say so: the sidebar may not match
          // the backend until the window reloads.
          resynced = false;
        }
        setSidebarActionError(
          resynced
            ? "Couldn’t move this Space."
            : "Couldn’t confirm the Space order. Reload the window to check it.",
        );
      }
      return;
    }
    // Seed path: derive the swap from fresh state inside the updater so a
    // concurrent space operation cannot leave stale positions behind.
    setSpaces((current) => {
      const fresh = [...current].sort((a, b) => a.position - b.position);
      const at = fresh.findIndex((candidate) => candidate.id === space.id);
      const neighbor = fresh[at + direction];
      if (at < 0 || !neighbor) return current;
      const freshPosition = fresh[at].position;
      return fresh
        .map((candidate) =>
          candidate.id === space.id
            ? { ...candidate, position: neighbor.position }
            : candidate.id === neighbor.id
              ? { ...candidate, position: freshPosition }
              : candidate,
        )
        .sort((a, b) => a.position - b.position);
    });
  }

  useLayoutEffect(() => {
    if (renamingSpaceId !== null) spaceRenameInputRef.current?.focus();
  }, [renamingSpaceId]);
  useLayoutEffect(() => {
    if (isCreatingSpace) newSpaceNameInputRef.current?.focus();
  }, [isCreatingSpace]);

  const openCaptureRef = useRef(openCapture);
  const closeCaptureModalRef = useRef(closeCaptureModal);
  openCaptureRef.current = openCapture;
  closeCaptureModalRef.current = closeCaptureModal;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isShortcutsOpen) {
        event.preventDefault();
        setIsShortcutsOpen(false);
        return;
      }
      if (readingItem || selectedItem || pdfViewerItem) return;
      if (event.key === "Escape") {
        if (isSettingsOpen) {
          event.preventDefault();
          setIsSettingsOpen(false);
        } else if (isAdding && captureMode) {
          event.preventDefault();
          setCaptureMode(null);
        } else if (isAdding) {
          event.preventDefault();
          closeCaptureModalRef.current();
        }
        return;
      }
      if (isShortcutsOpen || isSettingsOpen || isAdding) return;
      const target = event.target;
      const isEditableTarget =
        target instanceof HTMLElement &&
        (target.isContentEditable || target.matches('input, textarea, select, [role="textbox"]'));
      const shortcut = appKeyboardShortcut(event, isEditableTarget);
      if (!shortcut) return;
      event.preventDefault();
      if (shortcut === "search") searchRef.current?.focus();
      else if (shortcut === "new-note" && !isCapturing) openCaptureRef.current("note");
      else if (shortcut === "help") setIsShortcutsOpen(true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    captureMode,
    isAdding,
    isCapturing,
    isSettingsOpen,
    isShortcutsOpen,
    pdfViewerItem,
    readingItem,
    selectedItem,
  ]);

  const captureFileRef = useRef(captureFile);
  const captureTextRef = useRef(captureText);
  captureFileRef.current = captureFile;
  captureTextRef.current = captureText;
  useEffect(() => {
    if (!isShortcutsOpen) return;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = shortcutsModalRef.current;
    shortcutsCloseRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (dialog) keepTabFocusInside(event, dialog);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus();
    };
  }, [isShortcutsOpen]);

  useEffect(() => {
    if (!isSettingsOpen) return;

    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // Focus the dialog itself, not a control, so the sheet opens without a ring.
    const focusTimer = window.setTimeout(() => settingsDialogRef.current?.focus(), 0);

    const onSettingsKeyDown = (event: KeyboardEvent) => {
      const modal = document.querySelector<HTMLElement>(".settings-modal");
      if (modal) keepTabFocusInside(event, modal);
    };

    document.addEventListener("keydown", onSettingsKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", onSettingsKeyDown);
      previouslyFocused?.focus();
    };
  }, [isSettingsOpen]);

  // Settings reopens on Library, its first tab.
  useEffect(() => {
    if (!isSettingsOpen) setSettingsTab("general");
  }, [isSettingsOpen]);

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }

      const file = Array.from(event.clipboardData?.files ?? [])[0];
      if (file) {
        event.preventDefault();
        void captureFileRef.current(file, "clipboard");
        return;
      }

      const text = event.clipboardData?.getData("text/plain").trim();
      if (text) {
        event.preventDefault();
        void captureTextRef.current(text, "clipboard");
      }
    };

    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  const handleDeepLinkPayloadRef = useRef(handleDeepLinkPayload);
  handleDeepLinkPayloadRef.current = handleDeepLinkPayload;
  useEffect(() => {
    if (shouldUseSeedLibrary()) return;
    let cancelled = false;
    const unlisten: Array<() => void> = [];

    async function connectCaptureEvents() {
      const removeListener = await listenForDeepLinks((payload) => {
        void handleDeepLinkPayloadRef.current(payload);
      });
      if (cancelled) {
        removeListener();
      } else {
        unlisten.push(removeListener);
      }

      const links = await currentDeepLinks();
      if (!cancelled) {
        for (const link of links ?? []) await handleDeepLinkPayloadRef.current(link);
      }
    }

    void connectCaptureEvents().catch((error: unknown) => {
      if (!cancelled) setCaptureError(error instanceof Error ? error.message : String(error));
    });
    return () => {
      cancelled = true;
      unlisten.forEach((removeListener) => {
        removeListener();
      });
    };
  }, []);

  useEffect(() => {
    if (shouldUseSeedLibrary()) return;
    let cancelled = false;
    listSpaces()
      .then((storedSpaces) => {
        if (!cancelled) setSpaces(storedSpaces);
      })
      .catch((error: unknown) => {
        if (!cancelled) setCaptureError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Manual membership for the open overlay, read only while an item is open so
  // the grid load stays a single query.
  useEffect(() => {
    const itemId = selectedItemId;
    if (!itemId) {
      setItemSpaceIds([]);
      return;
    }
    if (shouldUseSeedLibrary()) {
      setItemSpaceIds(
        [...localSpaceItems]
          .filter(([, members]) => members.has(itemId))
          .map(([spaceId]) => spaceId),
      );
      return;
    }
    let cancelled = false;
    const issuedAt = spaceMembershipEpochRef.current;
    // One guard for both outcomes. A read a chip toggle has superseded has
    // nothing to report either way: the toggle's own write is now the
    // authoritative answer and reports its own failure. Checking the epoch on
    // the success path only would leave a stale rejection raising an error for
    // a read whose result nobody can use any more.
    const superseded = () => cancelled || issuedAt !== spaceMembershipEpochRef.current;
    listItemSpaces(itemId)
      .then((ids) => {
        if (superseded()) return;
        setItemSpaceIds(ids);
      })
      .catch((error: unknown) => {
        if (superseded()) return;
        setCaptureError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      cancelled = true;
    };
  }, [localSpaceItems, selectedItemId]);

  useEffect(() => {
    if (shouldUseSeedLibrary()) return;
    let cancelled = false;
    let loading = false;
    let queued = false;

    async function loadItems() {
      // A refresh requested mid-flight is requeued instead of dropped, so a
      // job event landing during a slow load still resolves promptly.
      if (loading) {
        queued = true;
        return;
      }
      loading = true;
      try {
        await initializeStorage();
        const storedItemsPromise = activeSpaceId
          ? listSpaceItems(activeSpaceId)
          : debouncedQuery.trim()
            ? searchItems(debouncedQuery)
            : listActiveItems();
        const activeJobsPromise = canUseDesktopBackend
          ? countActiveJobs().catch(() => null)
          : Promise.resolve(null);
        const [storedItems, activeJobs] = await Promise.all([
          storedItemsPromise,
          activeJobsPromise,
        ]);
        const summaries = await getProcessingSummaries(storedItems.map((item) => item.id));
        const libraryItems = await Promise.all(
          storedItems.map((item) => storedItemToLibraryItem(item, summaries.get(item.id))),
        );
        if (!cancelled) {
          if (activeJobs !== null) setActiveJobCount(activeJobs);
          // A refresh can resolve with data older than two writes this session
          // already made: a note body still in the cache, and a pin the backend
          // has not confirmed. Both are re-applied so the grid, the overlay, and
          // Top of mind cannot disagree with what the user just did.
          const noteBodies = noteBodyCacheRef.current;
          const overrides = pinnedOverridesRef.current;
          setItems(
            libraryItems.map((item) => {
              const noteBody = noteBodies.get(String(item.id));
              const pinned = overrides.get(String(item.id));
              const withNote = noteBody === undefined ? item : { ...item, noteBody };
              return pinned === undefined ? withNote : { ...withNote, favorite: pinned };
            }),
          );
          setSelectedItem((current) => {
            if (
              !current?.sourceUrl ||
              (current.kind !== "Article" && current.kind !== "Video" && current.kind !== "Post")
            ) {
              return current;
            }
            const refreshed = libraryItems.find((item) => String(item.id) === String(current.id));
            if (!refreshed) return current;
            const changed =
              current.kind !== refreshed.kind ||
              current.title !== refreshed.title ||
              current.description !== refreshed.description ||
              current.source !== refreshed.source ||
              current.sourceUrl !== refreshed.sourceUrl ||
              current.image !== refreshed.image ||
              current.mediaAspectRatio !== refreshed.mediaAspectRatio ||
              current.hasArticleContent !== refreshed.hasArticleContent ||
              current.processing?.active !== refreshed.processing?.active ||
              current.processing?.failedJob?.id !== refreshed.processing?.failedJob?.id ||
              current.processing?.failedJob?.status !== refreshed.processing?.failedJob?.status;
            return changed ? { ...current, ...refreshed } : current;
          });
        }
      } catch (error) {
        if (!cancelled) setCaptureError(error instanceof Error ? error.message : String(error));
      } finally {
        loading = false;
        if (queued && !cancelled) {
          queued = false;
          await loadItems();
        }
      }
    }

    void loadItems();
    // The worker pushes job events (see jobs.rs JOB_UPDATED_EVENT), so the
    // library refreshes when background work actually advances instead of
    // every second. Events are coalesced: a burst of progress ticks becomes
    // one trailing refresh. The slow fallback survives missed events (a
    // dropped listener must never mean a stale library), and restores still
    // refresh immediately.
    loadItemsRef.current = loadItems;
    let coalesceTimer = 0;
    let removeJobListener: (() => void) | null = null;
    void listenForJobUpdates(() => {
      window.clearTimeout(coalesceTimer);
      coalesceTimer = window.setTimeout(() => loadItemsRef.current(), 400);
    })
      .then((removeListener) => {
        if (cancelled) removeListener();
        else removeJobListener = removeListener;
      })
      .catch(() => {});
    const refreshTimer = window.setInterval(() => {
      if (document.hidden) return;
      void loadItems();
    }, 30000);
    const handleVisibility = () => {
      if (!document.hidden) void loadItems();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      cancelled = true;
      window.clearTimeout(coalesceTimer);
      removeJobListener?.();
      window.clearInterval(refreshTimer);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [debouncedQuery, activeSpaceId, canUseDesktopBackend]);

  // Version, size and last copy are optional: each stays hidden when the
  // desktop backend cannot supply it (preview, or a failed call). The size
  // walks every asset file, so Settings shows the last measured value at once
  // and replaces it when a fresh walk finishes, without holding up the rest.
  useEffect(() => {
    if (!isSettingsOpen || !isDesktopRuntime()) return;
    let cancelled = false;
    void Promise.all([
      getAppVersion().catch(() => undefined),
      getLastExport().catch(() => undefined),
    ]).then(([version, copy]) => {
      if (cancelled) return;
      setAppVersion(version ?? null);
      setLastCopy(copy ?? null);
    });
    const showSize = (size: LibrarySize | undefined) => {
      if (!cancelled && size) setLibrarySizeBytes(size.bytes);
    };
    // Fired together so a first open, with nothing cached yet, shares one walk.
    void getLibrarySize().then(showSize, () => undefined);
    void getLibrarySize(true).then(showSize, () => undefined);
    return () => {
      cancelled = true;
    };
  }, [isSettingsOpen]);

  useEffect(() => {
    if (!isSettingsOpen || shouldUseSeedLibrary()) return;
    let cancelled = false;

    async function loadArchivedItems() {
      try {
        await initializeStorage();
        const storedItems = await listArchivedItems();
        const summaries = await getProcessingSummaries(storedItems.map((item) => item.id));
        const nextItems = await Promise.all(
          storedItems.map((item) => storedItemToLibraryItem(item, summaries.get(item.id))),
        );
        if (!cancelled) {
          setArchivedItems(
            nextItems.map((item) => {
              const noteBody = noteBodyCacheRef.current.get(String(item.id));
              return noteBody === undefined ? item : { ...item, noteBody };
            }),
          );
        }
      } catch (error) {
        if (!cancelled) setCaptureError(error instanceof Error ? error.message : String(error));
      }
    }

    void loadArchivedItems();
    return () => {
      cancelled = true;
    };
  }, [isSettingsOpen]);

  useEffect(() => {
    if (isSettingsOpen) return;
    setIsArchiveSelectionMode(false);
    setSelectedArchivedIds(new Set());
  }, [isSettingsOpen]);

  useEffect(() => {
    const archivedIds = new Set(archivedItems.map((item) => String(item.id)));
    setSelectedArchivedIds((current) => {
      const next = new Set(Array.from(current).filter((id) => archivedIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [archivedItems]);

  const activeSpace = useMemo(
    () => spaces.find((space) => space.id === activeSpaceId) ?? null,
    [spaces, activeSpaceId],
  );
  const isSerendipityView = activeView === "Serendipity" && !activeSpaceId;
  const isPinsView = activeView === "Top of mind" && !activeSpaceId;
  const pinsCount = useMemo(() => items.filter((item) => matchesPinsView(item)).length, [items]);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // The pins nav item clears the query, so the view normally reads the whole
  // library. The flag still guards the empty state against a search that a
  // restored view can narrow.
  const pinsViewIsEmpty = isPinsView && isEmptyPinsView({ query });
  const serendipityCandidates = useMemo(
    () =>
      isSerendipityView
        ? serendipityItems(items, { excludedIds: serendipityKeptIds, limit: items.length })
        : [],
    [isSerendipityView, items, serendipityKeptIds],
  );
  const serendipityBatch = useMemo(
    () => serendipityCandidates.slice(0, SERENDIPITY_BATCH_SIZE),
    [serendipityCandidates],
  );
  const serendipityItem = serendipityBatch[0] ?? null;
  const serendipityRemainingCount = serendipityCandidates.length;

  const filteredItems = useMemo(() => {
    if (isSerendipityView) return serendipityBatch;
    const normalizedQuery = query.trim().toLowerCase();
    return items.filter((item) => {
      const matchesQuery = !normalizedQuery
        ? true
        : canUseDesktopBackend || activeSpace
          ? true
          : [item.title, item.description, item.source, item.kind, ...item.tags]
              .join(" ")
              .toLowerCase()
              .includes(normalizedQuery);
      const matchesView =
        activeView === "Everything" ||
        (activeView === "Top of mind" && matchesPinsView(item)) ||
        (activeSpace
          ? canUseDesktopBackend
            ? true
            : activeSpace.kind === "regular"
              ? // Mirror of the core's membership read for browser (seed) mode.
                (localSpaceItems.get(activeSpace.id)?.has(String(item.id)) ?? false)
              : itemMatchesSmartQuery(item, activeSpace.query)
          : false);
      return matchesQuery && matchesView;
    });
  }, [
    activeSpace,
    activeView,
    canUseDesktopBackend,
    isSerendipityView,
    items,
    localSpaceItems,
    query,
    serendipityBatch,
  ]);
  const filteredItemsRef = useRef(filteredItems);
  filteredItemsRef.current = filteredItems;
  const showLibraryEdges = !isSerendipityView && filteredItems.length > 0;
  // Both sit under the toolbar in one column, so a capture error and the pinned
  // query row stack instead of overlapping.
  const showFilterRow = !isSerendipityView && !isSearchFocused && query.trim() !== "";
  // A pinned query has its own band above the grid, so the grid starts below it.
  // Only this boolean reaches the DOM, so typing does not restyle the grid.
  const hasPinnedQuery = showFilterRow;
  // Serendipity is its own walk, and an empty Space has nothing to search or
  // re-lay out, so both drop the browsing controls.
  const isEmptySpace = Boolean(activeSpace) && filteredItems.length === 0 && !query.trim();
  const showBrowseControls = !isSerendipityView && !isEmptySpace;
  const showCaptureError = Boolean(captureError) && !isAdding;

  // The Regular Spaces an item can be filed into, and whether it already is.
  // Smart Spaces are excluded: their contents come from the query, so a chip
  // for them would be a claim that goes stale on its own.
  const manualSpaces = useMemo(() => spaces.filter((space) => space.kind === "regular"), [spaces]);
  const selectedItemSpaces = useMemo(
    () => manualSpaces.map((space) => ({ ...space, member: itemSpaceIds.includes(space.id) })),
    [itemSpaceIds, manualSpaces],
  );

  // VirtuosoMasonry keys rows by position, so a new result set must remount
  // the grid. Otherwise card state (video playback, embeds) sticks to the
  // wrong item after a filter change.
  const libraryGridKey = useMemo(
    () => filteredItems.map((item) => String(item.id)).join("|"),
    [filteredItems],
  );

  // A new grid opens scrolled past the gap under the toolbar (App.css,
  // --library-rest-gap), so cards fill to the frame's top edge. Virtuoso
  // sizes its columns a frame or two after mounting, so the offset is
  // reapplied until the grid can hold it.
  const restScrollKey = isSerendipityView ? "" : libraryGridKey;
  useLayoutEffect(() => {
    const scroll = libraryScrollRef.current;
    if (!restScrollKey || !scroll) return;
    const gap = Number.parseFloat(getComputedStyle(scroll).getPropertyValue("--library-rest-gap"));
    let frame = 0;
    let tries = 0;
    const apply = () => {
      const grid = scroll.querySelector<HTMLElement>(".library-grid");
      if (grid) grid.scrollTop = gap;
      if ((!grid || grid.scrollTop < gap) && ++tries < 10) frame = requestAnimationFrame(apply);
    };
    apply();
    return () => cancelAnimationFrame(frame);
  }, [restScrollKey]);

  // Saves from the Add menu. The card appears at once; the menu closes on
  // success and keeps the draft when the save fails.
  async function saveFromAddMenu(save: () => Promise<unknown>) {
    setCaptureError(null);
    try {
      await save();
      setIsAdding(false);
      setCaptureMode(null);
      return true;
    } catch (error) {
      setCaptureError(error instanceof Error ? error.message : String(error));
      return false;
    }
  }

  // Add lives in the sidebar, so opening it brings the sidebar out.
  function openCapture(mode: AddMode | null = null) {
    setCaptureError(null);
    setCaptureMode(mode);
    setIsAdding(true);
    setIsSidebarOpen(true);
  }

  function closeCaptureModal() {
    if (isCapturing) return;
    setIsAdding(false);
    setCaptureMode(null);
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

    const droppedText = (
      event.dataTransfer.getData("text/uri-list") || event.dataTransfer.getData("text/plain")
    )
      .split(/\r?\n/u)
      .map((value) => value.trim())
      .find(Boolean);
    if (!droppedText) return;
    if (
      /^https?:\/\//iu.test(droppedText) ||
      /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}(?::\d+)?(?:\/[^\s]*)?$/u.test(
        droppedText,
      )
    ) {
      void captureArticle(droppedText, "drag and drop");
    } else {
      void captureText(droppedText, "drag and drop");
    }
  }

  const [cardMenu, setCardMenu] = useState<{
    item: LibraryItem;
    card: HTMLElement;
    x: number;
    y: number;
  } | null>(null);
  const closeCardMenu = useCallback(() => setCardMenu(null), []);
  const openCardMenu = useCallback((item: LibraryItem, event: React.MouseEvent<HTMLElement>) => {
    event.preventDefault();
    const card = event.currentTarget;
    // The keyboard menu key reports no pointer, so anchor to the card instead.
    const fromKeyboard = event.clientX === 0 && event.clientY === 0;
    const rect = card.getBoundingClientRect();
    setCardMenu({
      item,
      card,
      x: fromKeyboard ? rect.left + 16 : event.clientX,
      y: fromKeyboard ? rect.top + 16 : event.clientY,
    });
  }, []);
  const cardMenuEntries = useMemo<ContextMenuEntry[]>(() => {
    if (!cardMenu) return [];
    const { item } = cardMenu;
    // Only web links: seeded and file items carry local paths here.
    const sourceUrl = item.sourceUrl?.match(/^https?:\/\//u) ? item.sourceUrl : undefined;
    const entries: ContextMenuEntry[] = [];
    if (item.articleHtml || item.hasArticleContent) {
      entries.push({ label: "Read", icon: BookOpen01Icon, onSelect: () => void openReader(item) });
    }
    entries.push({
      label: item.favorite ? "Unfavorite" : "Favorite",
      icon: StarIcon,
      onSelect: () => void togglePinItem(item),
    });
    if (sourceUrl) {
      let host = "original";
      try {
        host = new URL(sourceUrl).hostname.replace(/^www\./u, "");
      } catch {}
      entries.push(
        {
          label: `Open ${host}`,
          icon: LinkSquare02Icon,
          onSelect: () => window.open(sourceUrl, "_blank", "noopener,noreferrer"),
        },
        {
          label: "Copy link",
          icon: Copy01Icon,
          onSelect: () =>
            void navigator.clipboard.writeText(sourceUrl).then(
              () => toast("Link copied", { className: "library-toast", duration: 2000 }),
              () => toast.error("Could not copy the link", { closeButton: true }),
            ),
        },
      );
    }
    if (canUseDesktopBackend) {
      entries.push({
        label: "Show in folder",
        icon: Folder01Icon,
        onSelect: () => showItemInFolderFromOverlay(item),
      });
    }
    entries.push({
      label: "Archive",
      icon: Archive01Icon,
      onSelect: () => void forgetItem(item),
    });
    return entries;
  }, [
    canUseDesktopBackend,
    cardMenu,
    forgetItem,
    openReader,
    showItemInFolderFromOverlay,
    togglePinItem,
  ]);

  const libraryCardContext = useMemo<LibraryCardContext>(
    () => ({
      onSelectItem: selectLibraryItem,
      onOpenReader: openReader,
      onRetryJob: retryJob,
      onOpenMenu: openCardMenu,
    }),
    [openCardMenu, openReader, retryJob, selectLibraryItem],
  );

  const restoreArchivedItems = useCallback((restoredItems: LibraryItem[]) => {
    if (restoredItems.length === 0) return;
    // A settings reload can re-add a row that is still stored, so restore by
    // presence instead of blind prepending a second copy of the same item.
    setArchivedItems((current) => {
      const absent = restoredItems.filter(
        (item) => !current.some((candidate) => String(candidate.id) === String(item.id)),
      );
      return absent.length === 0 ? current : [...absent, ...current];
    });
  }, []);

  const schedulePermanentDelete = useCallback(
    (item: LibraryItem) => {
      const id = String(item.id);
      const previous = pendingPermanentDeletesRef.current.get(id);
      if (previous !== undefined) window.clearTimeout(previous.timer);
      const pending: PendingPermanentDelete = { timer: 0, item };
      pending.timer = window.setTimeout(() => {
        pendingPermanentDeletesRef.current.delete(id);
        if (!canUseDesktopBackend) return;
        void deleteItem(id)
          .then(() => {
            // The row is still in the database during the undo window, so a reload
            // can bring the card back; drop it again now the delete has landed.
            setArchivedItems((current) =>
              current.filter((candidate) => String(candidate.id) !== id),
            );
          })
          .catch((error) => {
            // A recovered item is no longer archived, so its delete fails on
            // purpose: leaving it out is already the desired end state and the error
            // would only confuse. An item that is still archived comes back here.
            if (activeItemsRef.current.some((candidate) => String(candidate.id) === id)) return;
            restoreArchivedItems([item]);
            setCaptureError(error instanceof Error ? error.message : String(error));
          });
      }, 10000);
      pendingPermanentDeletesRef.current.set(id, pending);
      return pending;
    },
    [canUseDesktopBackend, restoreArchivedItems],
  );

  const undoPermanentDelete = useCallback(
    (pendingDeletes: PendingPermanentDelete[]) => {
      const restored = pendingDeletes
        .filter((pending) => cancelPermanentDelete(pending))
        .map((pending) => pending.item);
      restoreArchivedItems(restored);
    },
    [cancelPermanentDelete, restoreArchivedItems],
  );

  useEffect(
    () => () => {
      // A pending delete is finalized by its own timer, and unmounting must not
      // run it: a remount (StrictMode, HMR) would flush real deletes, and closing
      // the window tears the webview down without unmounting anyway. Dropping the
      // timers leaves those items archived and recoverable, which is the state
      // the delete never left.
      for (const pending of pendingPermanentDeletesRef.current.values()) {
        window.clearTimeout(pending.timer);
      }
      pendingPermanentDeletesRef.current.clear();
    },
    [],
  );

  const deleteArchivedLibraryItem = useCallback(
    (item: LibraryItem) => {
      setCaptureError(null);
      const itemId = String(item.id);
      const pending = schedulePermanentDelete(item);
      setArchivedItems((current) => current.filter((candidate) => String(candidate.id) !== itemId));
      if (selectedItem && String(selectedItem.id) === itemId) setSelectedItem(null);
      toast("Deleted permanently", {
        description: item.title,
        duration: 10000,
        closeButton: true,
        className: "library-toast",
        action: { label: "Undo", onClick: () => undoPermanentDelete([pending]) },
      });
    },
    [schedulePermanentDelete, selectedItem, undoPermanentDelete],
  );

  const toggleArchiveSelectionMode = useCallback(() => {
    setIsArchiveSelectionMode((current) => {
      if (current) setSelectedArchivedIds(new Set());
      return !current;
    });
  }, []);

  const toggleArchivedLibraryItem = useCallback((item: LibraryItem) => {
    setSelectedArchivedIds((current) => {
      const next = new Set(current);
      const id = String(item.id);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const isArchivedLibraryItemSelected = useCallback(
    (item: LibraryItem) => selectedArchivedIds.has(String(item.id)),
    [selectedArchivedIds],
  );

  const restoreArchivedLibraryItems = useCallback(
    async (itemsToRestore: LibraryItem[]) => {
      if (itemsToRestore.length === 0) return;
      setCaptureError(null);
      try {
        // Restore every item first, then fetch all processing summaries in one
        // batched call instead of one round trip per restored item.
        const results = await Promise.allSettled(
          itemsToRestore.map(async (item) => {
            if (!canUseDesktopBackend) return null;
            // A restore un-archives the row, so cancel any scheduled permanent
            // delete for it before the timer can fire and destroy its assets.
            const pending = pendingPermanentDeletesRef.current.get(String(item.id));
            if (pending !== undefined) cancelPermanentDelete(pending);
            return archiveItem(String(item.id), false);
          }),
        );
        const restoredStored = results.flatMap((result) =>
          result.status === "fulfilled" && result.value ? [result.value] : [],
        );
        let failures = results.filter((result) => result.status === "rejected").length;
        // One batched summaries call for the whole restore. If it fails, the
        // items are still restored; only their processing badges fall back.
        let summaries = new Map<string, ProcessingSummary>();
        try {
          if (canUseDesktopBackend && restoredStored.length > 0) {
            summaries = await getProcessingSummaries(
              restoredStored.map((storedItem) => storedItem.id),
            );
          }
        } catch {
          summaries = new Map<string, ProcessingSummary>();
        }
        // Convert per item so one unreadable item cannot sink the whole batch.
        const settled = await Promise.allSettled(
          restoredStored.map((storedItem) =>
            storedItemToLibraryItem(storedItem, summaries.get(storedItem.id)),
          ),
        );
        failures += settled.filter((result) => result.status === "rejected").length;
        const converted = settled.flatMap((result) =>
          result.status === "fulfilled" ? [result.value] : [],
        );
        const restoredItems: LibraryItem[] = [
          ...itemsToRestore.filter(() => !canUseDesktopBackend),
          ...converted,
        ];
        const restoredIds = new Set(restoredItems.map((item) => String(item.id)));
        setItems((current) => [
          ...restoredItems.filter(
            (item) => !current.some((candidate) => String(candidate.id) === String(item.id)),
          ),
          ...current,
        ]);
        setArchivedItems((current) => current.filter((item) => !restoredIds.has(String(item.id))));
        if (restoredItems.length > 0)
          toast.success(
            `${restoredItems.length} ${restoredItems.length === 1 ? "item" : "items"} restored`,
          );
        if (failures > 0)
          setCaptureError(
            `${failures} ${failures === 1 ? "item" : "items"} could not be restored. They are still in the archive.`,
          );
      } catch (error) {
        setCaptureError(error instanceof Error ? error.message : String(error));
      }
    },
    [cancelPermanentDelete, canUseDesktopBackend],
  );

  const restoreSelectedArchivedItems = useCallback(async () => {
    const selectedItems = archivedItems.filter((item) => selectedArchivedIds.has(String(item.id)));
    await restoreArchivedLibraryItems(selectedItems);
    setSelectedArchivedIds(new Set());
    setIsArchiveSelectionMode(false);
  }, [archivedItems, restoreArchivedLibraryItems, selectedArchivedIds]);

  const restoreArchivedLibraryItem = useCallback(
    (item: LibraryItem) => restoreArchivedLibraryItems([item]),
    [restoreArchivedLibraryItems],
  );

  const deleteSelectedArchivedItems = useCallback(() => {
    const selectedItems = archivedItems.filter((item) => selectedArchivedIds.has(String(item.id)));
    if (selectedItems.length === 0) return;
    setCaptureError(null);
    const deletedIds = new Set(selectedItems.map((item) => String(item.id)));
    const pendingDeletes = selectedItems.map((item) => schedulePermanentDelete(item));
    setArchivedItems((current) => current.filter((item) => !deletedIds.has(String(item.id))));
    if (selectedItem && deletedIds.has(String(selectedItem.id))) setSelectedItem(null);
    setSelectedArchivedIds(new Set());
    setIsArchiveSelectionMode(false);
    toast(
      `${selectedItems.length} ${selectedItems.length === 1 ? "item" : "items"} deleted permanently`,
      {
        duration: 10000,
        closeButton: true,
        className: "library-toast",
        action: { label: "Undo", onClick: () => undoPermanentDelete(pendingDeletes) },
      },
    );
  }, [
    archivedItems,
    schedulePermanentDelete,
    selectedArchivedIds,
    selectedItem,
    undoPermanentDelete,
  ]);

  const selectArchivedLibraryItem = useCallback((item: LibraryItem, rects?: SourceRects) => {
    selectionScrollRef.current = false;
    selectionRectsRef.current = rects ?? null;
    setSelectedItem(item);
  }, []);

  const archivedCardContext = useMemo<LibraryCardContext>(
    () => ({
      onSelectItem: selectArchivedLibraryItem,
      onOpenReader: openReader,
      onRetryJob: retryJob,
      onDeleteArchivedItem: deleteArchivedLibraryItem,
      onRestoreArchivedItem: restoreArchivedLibraryItem,
      archiveSelectionMode: isArchiveSelectionMode,
      isArchivedItemSelected: isArchivedLibraryItemSelected,
      onToggleArchivedItem: toggleArchivedLibraryItem,
    }),
    [
      deleteArchivedLibraryItem,
      isArchiveSelectionMode,
      isArchivedLibraryItemSelected,
      openReader,
      restoreArchivedLibraryItem,
      retryJob,
      selectArchivedLibraryItem,
      toggleArchivedLibraryItem,
    ],
  );

  // In-memory back/forward history over view, search query, and open item.
  // Query changes commit after a pause so typing does not add an entry per key.
  const historyRef = useRef<{ entries: NavSnapshot[]; index: number }>({ entries: [], index: 0 });
  const restoringNavKeyRef = useRef<string | null>(null);
  const similarItemCacheRef = useRef(new Map<string, LibraryItem>());
  const pendingHistoryCloseRef = useRef<{ target: NavSnapshot; index: number } | null>(null);
  const [historyCloseRequest, setHistoryCloseRequest] = useState(0);
  const navSnapshot: NavSnapshot = {
    view: activeView,
    spaceId: activeSpaceId,
    query,
    itemId: selectedItemId,
  };
  const navKey = JSON.stringify(navSnapshot);
  // biome-ignore lint/correctness/useExhaustiveDependencies: navKey encodes the snapshot
  useEffect(() => {
    const restoringNavKey = restoringNavKeyRef.current;
    if (restoringNavKey) {
      if (restoringNavKey === navKey) restoringNavKeyRef.current = null;
      return;
    }
    const history = historyRef.current;
    const current = history.entries[history.index];
    if (current && JSON.stringify(current) === navKey) return;
    const commit = () => {
      history.entries.splice(history.index + 1, history.entries.length, navSnapshot);
      history.index = history.entries.length - 1;
    };
    if (!current || current.query === navSnapshot.query) {
      commit();
      return;
    }
    const timer = window.setTimeout(() => {
      if (restoringNavKeyRef.current || history.entries[history.index] !== current) return;
      commit();
    }, 600);
    return () => window.clearTimeout(timer);
  }, [navKey]);

  const stepHistory = useCallback(
    (delta: -1 | 1) => {
      const history = historyRef.current;
      const target = history.entries[history.index + delta];
      if (!target) return;
      // Similar items are not always in the grid's list, so a step back to one
      // falls back to the copy the Similar lookup kept.
      const item = target.itemId
        ? ([...items, ...archivedItems].find(
            (candidate) => String(candidate.id) === target.itemId,
          ) ?? similarItemCacheRef.current.get(target.itemId))
        : undefined;
      // A vanished item restores as a closed overlay; keep the stack in step so it is not re-pushed.
      if (target.itemId && !item) target.itemId = null;
      restoringNavKeyRef.current = JSON.stringify(target);
      if (!target.itemId && selectedItem) {
        pendingHistoryCloseRef.current = { target, index: history.index + delta };
        setActiveSpaceId(target.spaceId);
        setActiveView(target.view);
        setQuery(target.query);
        requestAnimationFrame(() => {
          void bringHistoryCardIntoView(selectedItem, filteredItemsRef.current).then((rects) => {
            selectionRectsRef.current = rects;
            setHistoryCloseRequest((request) => request + 1);
          });
        });
        return;
      }
      history.index += delta;
      selectionScrollRef.current = false;
      selectionRectsRef.current = null;
      setActiveSpaceId(target.spaceId);
      setActiveView(target.view);
      setQuery(target.query);
      if (item?.archived) selectArchivedLibraryItem(item);
      else if (item) {
        requestAnimationFrame(() => {
          void bringHistoryCardIntoView(item, filteredItemsRef.current).then((rects) => {
            selectionRectsRef.current = rects;
            setSelectedItem(item);
          });
        });
      } else setSelectedItem(null);
    },
    [archivedItems, bringHistoryCardIntoView, items, selectArchivedLibraryItem, selectedItem],
  );
  const stepHistoryRef = useRef(stepHistory);
  stepHistoryRef.current = stepHistory;
  useEffect(() => {
    const onMouseUp = (event: MouseEvent) => {
      if (event.button !== 3 && event.button !== 4) return;
      event.preventDefault();
      stepHistoryRef.current(event.button === 3 ? -1 : 1);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      stepHistoryRef.current(event.key === "ArrowLeft" ? -1 : 1);
    };
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  // The item view's Similar tab. It returns the items and leaves the library
  // grid alone.
  const loadSimilarLibraryItems = useCallback(
    async (item: LibraryItem): Promise<LibraryItem[]> => {
      if (!canUseDesktopBackend) return [];
      const storedItems = await searchSimilarItems(
        String(item.id),
        item.kind === "Image" ? "image" : "text",
      );
      const summaries = await getProcessingSummaries(
        storedItems.map((storedItem) => storedItem.id),
      );
      const libraryItems = await Promise.all(
        storedItems.map((storedItem) =>
          storedItemToLibraryItem(storedItem, summaries.get(storedItem.id)),
        ),
      );
      for (const libraryItem of libraryItems) {
        similarItemCacheRef.current.set(String(libraryItem.id), libraryItem);
      }
      return libraryItems;
    },
    [canUseDesktopBackend],
  );

  // Opening a similar item is a history step like any other, so it goes through
  // the same card-into-view path history uses.
  const openSimilarItem = useCallback(
    (item: LibraryItem) => {
      void bringHistoryCardIntoView(item, filteredItemsRef.current).then((rects) => {
        selectionScrollRef.current = false;
        selectionRectsRef.current = rects;
        setSelectedItem(item);
      });
    },
    [bringHistoryCardIntoView],
  );

  const expandedOverlayActions = useMemo<ExpandedOverlayActions>(
    () => ({
      onClose: () => {
        const pending = pendingHistoryCloseRef.current;
        if (!pending) {
          setSelectedItem(null);
          return;
        }
        pendingHistoryCloseRef.current = null;
        const history = historyRef.current;
        history.index = pending.index;
        selectionScrollRef.current = false;
        selectionRectsRef.current = null;
        setActiveSpaceId(pending.target.spaceId);
        setActiveView(pending.target.view);
        setQuery(pending.target.query);
        setSelectedItem(null);
      },
      onOpenPdf: setPdfViewerItem,
      onOpenReader: openReader,
      onLoadSimilar: loadSimilarLibraryItems,
      onOpenItem: openSimilarItem,
      onShowInFolder: canUseDesktopBackend ? showItemInFolderFromOverlay : undefined,
      onDelete: deleteArchivedLibraryItem,
      onForget: forgetItem,
      onTogglePin: togglePinItem,
      onRetryJob: retryJob,
      onAddTag: addTagToItem,
      onUpdateNote: updateNote,
      onToggleSpace: (item, spaceId) => void handleToggleItemInSpace(item, spaceId),
    }),
    [
      addTagToItem,
      canUseDesktopBackend,
      deleteArchivedLibraryItem,
      forgetItem,
      handleToggleItemInSpace,
      loadSimilarLibraryItems,
      openReader,
      openSimilarItem,
      retryJob,
      showItemInFolderFromOverlay,
      togglePinItem,
      updateNote,
    ],
  );

  // Selection styling stays out of the card render tree so opening the
  // overlay does not re-render (or remount embeds in) the whole grid.
  useEffect(() => {
    const selectedCards = document.querySelectorAll<HTMLElement>(".library-card.is-selected");
    for (const card of selectedCards) card.classList.remove("is-selected");
    if (!selectedItem) return;
    const source = document.querySelector<HTMLElement>(
      `.library-card[data-library-item-id="${CSS.escape(String(selectedItem.id))}"]`,
    );
    source?.classList.add("is-selected");
  }, [selectedItem]);

  // Live mascot: slow drift by default (gentler sway under reduced motion),
  // commuting to the search field while it is focused. Busy shows the
  // notification pastille; errors drop to idle so the sad face can show
  // (drift carries its own fixed face). Error beats busyness beats attention.
  const isMascotBusy =
    canUseDesktopBackend && activeJobCount !== null
      ? activeJobCount > 0
      : items.some((item) => item.processing?.active);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = (event: MediaQueryListEvent) => setPrefersReducedMotion(event.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  useEffect(() => {
    pushMascotParams({
      state: captureError
        ? "idle"
        : isMascotBusy
          ? "notify"
          : prefersReducedMotion
            ? "inkling-sway"
            : "inkling-drift",
      expression: captureError
        ? "triste"
        : isSearchFocused
          ? query
            ? "curieux"
            : "attentif"
          : "neutre",
    });
  }, [isMascotBusy, captureError, isSearchFocused, query, prefersReducedMotion]);

  const sidebarActionErrorAlert = sidebarActionError ? (
    <div
      className={
        isSidebarOpen
          ? "sidebar-action-error"
          : "sidebar-action-error sidebar-action-error-collapsed"
      }
    >
      <p role="alert">{sidebarActionError}</p>
      <button
        type="button"
        className="sidebar-action-error-dismiss"
        aria-label="Dismiss Space error"
        onClick={() => setSidebarActionError(null)}
      >
        <HugeiconsIcon icon={Cancel01Icon} size={14} />
      </button>
    </div>
  ) : null;

  // Dev-only mascot board (vendored bloub engine + inkling skins). Not linked
  // from the UI; open with ?mascot. Placed after all hooks.
  if (
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).has("mascot-alive")
  ) {
    return (
      <Suspense fallback={null}>
        <AliveBoard />
      </Suspense>
    );
  }
  if (typeof window !== "undefined" && new URLSearchParams(window.location.search).has("mascot")) {
    return (
      <Suspense fallback={null}>
        <MascotBoard />
      </Suspense>
    );
  }

  return (
    <MotionConfig reducedMotion="user">
      {/* biome-ignore lint/a11y/noStaticElementInteractions: Drag and drop is an optional capture path; Add, paste, and extension capture remain keyboard-accessible. */}
      <div
        className={`app-shell ${isElectronRuntime() ? "electron-shell" : ""} ${isDragActive ? "drag-active" : ""} ${isSettingsOpen ? "settings-open" : ""}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <ElectronWindowControls />
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
          <div className="brand-lockup">
            <MascotHomeSlot isSearchFocused={isSearchFocused} />
            <span className="brand-name">inkling</span>
            <button
              type="button"
              className="sidebar-close"
              aria-label="Close panel"
              onClick={() => setIsSidebarOpen(false)}
            >
              <HugeiconsIcon icon={SidebarLeftIcon} size={16} />
            </button>
          </div>

          <nav className="primary-nav" aria-label="Main navigation">
            <button
              type="button"
              className={`nav-item ${activeView === "Everything" && !activeSpaceId ? "active" : ""}`}
              onClick={clearToDefaultView}
            >
              <span className="nav-icon">
                <NavDotGridIcon />
              </span>
              <span className="nav-label">Everything</span>
              <span className="nav-count">{items.length.toLocaleString()}</span>
            </button>
            <button
              type="button"
              className={`nav-item ${activeView === "Top of mind" && !activeSpaceId ? "active" : ""}`}
              onClick={() => {
                setActiveSpaceId(null);
                setActiveView("Top of mind");
                setQuery("");
                setSelectedItem(null);
              }}
            >
              <span className="nav-icon">
                <HugeiconsIcon icon={StarIcon} size={15} />
              </span>
              <span className="nav-label">Top of mind</span>
              <span className="nav-count">{pinsCount.toLocaleString()}</span>
            </button>
            <button
              type="button"
              className={`nav-item ${activeView === "Serendipity" && !activeSpaceId ? "active" : ""}`}
              onClick={selectSerendipityView}
            >
              <span className="nav-icon">
                <HugeiconsIcon icon={ShuffleIcon} size={15} />
              </span>
              <span className="nav-label">Serendipity</span>
            </button>
          </nav>

          <div className="sidebar-section">
            <div className="sidebar-heading">
              <span>Spaces</span>
              <button
                type="button"
                className="icon-button small"
                aria-label="Add a Space"
                data-tooltip="Add a Space"
                onClick={() => {
                  setIsCreatingSpace((current) => !current);
                  setNewSpaceName("");
                  setNewSpaceKind("smart");
                }}
              >
                <HugeiconsIcon icon={PlusSignIcon} size={14} />
              </button>
            </div>
            <div className="space-list">
              {spaces.map((space) => (
                <div
                  className={`space-item ${activeSpaceId === space.id ? "selected" : ""}`}
                  key={space.id}
                >
                  <button
                    type="button"
                    className="space-dot"
                    data-tooltip={`Change color (now ${space.color})`}
                    aria-label={`Change color of ${space.name}`}
                    onClick={() => {
                      void handleCycleSpaceColor(space);
                    }}
                  >
                    <span className={`space-dot-mark ${space.color}`} aria-hidden="true">
                      <SpaceMark />
                    </span>
                  </button>
                  {renamingSpaceId === space.id ? (
                    <input
                      ref={spaceRenameInputRef}
                      className="space-rename-input"
                      value={renameDraft}
                      aria-label={`Rename ${space.name}`}
                      maxLength={80}
                      onChange={(event) => setRenameDraft(event.target.value)}
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => {
                        event.stopPropagation();
                        if (event.key === "Enter") void handleRenameSpace(space, renameDraft);
                        else if (event.key === "Escape") setRenamingSpaceId(null);
                      }}
                      // Blur commits, matching Finder/Explorer/VS Code rename fields:
                      // silently discarding typed text loses work, while an
                      // accidental save is one rename away from fixed.
                      onBlur={() => void handleRenameSpace(space, renameDraft)}
                    />
                  ) : (
                    <button
                      type="button"
                      className="space-select"
                      onClick={() => selectSpace(space)}
                      aria-pressed={activeSpaceId === space.id}
                    >
                      <span className="space-name">{space.name}</span>
                      <span className="space-count">
                        {(
                          space.itemCount ??
                          (activeSpaceId === space.id ? filteredItems.length : undefined)
                        )?.toLocaleString()}
                      </span>
                    </button>
                  )}
                  <span className="space-actions">
                    <button
                      type="button"
                      className="space-delete space-tool"
                      aria-label={`Move ${space.name} up`}
                      data-tooltip="Move Space up"
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleMoveSpace(space, -1);
                      }}
                    >
                      <HugeiconsIcon icon={ArrowUp01Icon} size={12} />
                    </button>
                    <button
                      type="button"
                      className="space-delete space-tool"
                      aria-label={`Move ${space.name} down`}
                      data-tooltip="Move Space down"
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleMoveSpace(space, 1);
                      }}
                    >
                      <HugeiconsIcon icon={ArrowDown01Icon} size={12} />
                    </button>
                    <button
                      type="button"
                      className="space-delete space-tool"
                      aria-label={`Rename ${space.name}`}
                      data-tooltip="Rename Space"
                      onClick={(event) => {
                        event.stopPropagation();
                        setRenamingSpaceId(space.id);
                        setRenameDraft(space.name);
                      }}
                    >
                      <HugeiconsIcon icon={Edit01Icon} size={12} />
                    </button>
                    <button
                      type="button"
                      className="space-delete"
                      aria-label={`Delete ${space.name}`}
                      data-tooltip="Delete Space"
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleDeleteSpace(space);
                      }}
                    >
                      <HugeiconsIcon icon={Cancel01Icon} size={12} />
                    </button>
                  </span>
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
                    ref={newSpaceNameInputRef}
                    value={newSpaceName}
                    onChange={(event) => setNewSpaceName(event.target.value)}
                    placeholder={
                      newSpaceKind === "smart" && query.trim()
                        ? `Save “${query.trim()}” as…`
                        : "Name this space"
                    }
                    aria-label="Space name"
                    maxLength={80}
                  />
                  {/* Native radios rather than role="radio" buttons: the group gets
                  arrow-key selection, one tab stop and group semantics from the
                  platform instead of from ARIA we would then have to maintain. */}
                  <fieldset className="space-kind">
                    <legend className="visually-hidden">How this Space fills</legend>
                    {(["smart", "regular"] as const).map((kind) => (
                      <label
                        key={kind}
                        className={`space-kind-option ${newSpaceKind === kind ? "is-active" : ""}`}
                      >
                        <input
                          type="radio"
                          name="space-kind"
                          className="visually-hidden"
                          value={kind}
                          checked={newSpaceKind === kind}
                          aria-describedby="space-kind-hint"
                          onChange={() => setNewSpaceKind(kind)}
                        />
                        {kind === "smart" ? "Smart" : "Regular"}
                      </label>
                    ))}
                  </fieldset>
                  <p className="space-form-hint" id="space-kind-hint">
                    {newSpaceKind === "regular"
                      ? "Holds only the items you file into it. Open an item and pick a Space to add it."
                      : query.trim()
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
                    <button type="submit" className="capture-save">
                      Create Space
                    </button>
                  </div>
                </motion.form>
              )}
            </AnimatePresence>
          </div>

          {isSidebarOpen && sidebarActionErrorAlert}

          <div className="sidebar-footer">
            <AddMenu
              open={isAdding}
              mode={captureMode}
              saving={isCapturing}
              error={isAdding ? captureError : null}
              onOpen={() => openCapture()}
              onClose={closeCaptureModal}
              onModeChange={(mode) => {
                setCaptureMode(mode);
                setCaptureError(null);
              }}
              onSaveNote={(text) => saveFromAddMenu(() => persistText(text, "quick note"))}
              onSaveLink={(url) => saveFromAddMenu(() => persistArticle(url, "quick link"))}
              onSaveQuote={(text, attribution, sourceUrl) =>
                saveFromAddMenu(() => persistQuote(text, attribution, sourceUrl, "quick quote"))
              }
              onPickFile={(file) => void captureFile(file, "file picker")}
              onScreenshot={startScreenshotCapture}
            />
            {availableUpdate && (
              <button
                type="button"
                className="nav-item footer-item update-footer-item"
                aria-live="polite"
                disabled={isInstallingUpdate}
                data-tooltip={`Version ${availableUpdate.version} is ready. Inkling checks for updates when it opens; GitHub sees the app version but no library data. Selecting this downloads and installs the update, then restarts inkling.`}
                onClick={() => void handleInstallUpdate()}
              >
                <HugeiconsIcon icon={isInstallingUpdate ? Loading01Icon : RotateCwIcon} size={15} />
                <span className="nav-label">
                  {isInstallingUpdate
                    ? "Installing update..."
                    : updateInstallFailed
                      ? "Update failed · retry"
                      : "Update available"}
                </span>
              </button>
            )}
            <button
              ref={settingsButtonRef}
              type="button"
              className={`nav-item footer-item ${isSettingsOpen ? "active" : ""}`}
              aria-label="Settings"
              aria-expanded={isSettingsOpen}
              aria-controls="settings-modal"
              data-tooltip="Settings"
              onClick={() => {
                setSelectedItem(null);
                setIsSettingsOpen(true);
              }}
            >
              <HugeiconsIcon icon={Settings01Icon} size={15} />
              <span className="nav-label">Settings</span>
            </button>
          </div>
        </aside>
        <SidebarEdgeTab isOpen={isSidebarOpen} onToggle={() => setIsSidebarOpen((open) => !open)} />

        {/* An open item replaces the library, which stays mounted underneath so
            the item can fly back into its card. */}
        <main className="main-content" ref={libraryFrameRef} inert={selectedItem != null}>
          <section className="library-header"></section>

          <section className="capture-bar" ref={captureBarRef} aria-label="Capture and search">
            {!isSidebarOpen && (
              <button
                type="button"
                className="sidebar-toggle"
                aria-label="Open navigation"
                aria-expanded={false}
                aria-controls="library-navigation"
                onClick={() => setIsSidebarOpen(true)}
              >
                <HugeiconsIcon icon={ViewSidebarLeftIcon} size={17} />
              </button>
            )}
            {!isSidebarOpen && sidebarActionErrorAlert}
            {showBrowseControls && (
              <label
                className={`search-field glass${isSearchFocused ? " is-mascot" : " is-resting"}`}
              >
                <span className="search-rest" aria-hidden="true">
                  <HugeiconsIcon icon={Search01Icon} size={14} />
                  {activeSpace?.name ?? activeView}
                </span>
                <span className="field-mascot" aria-hidden="true">
                  <LiveMascotSearchEyes size={22} className={query ? "is-typing" : undefined} />
                </span>
                <input
                  ref={searchRef}
                  value={query}
                  onFocus={() => setIsSearchFocused(true)}
                  onBlur={() => setIsSearchFocused(false)}
                  onKeyDown={(event) => {
                    if (event.key !== "Escape") return;
                    setQuery("");
                    event.currentTarget.blur();
                  }}
                  onChange={(event) => {
                    setActiveSpaceId(null);
                    setActiveView("Everything");
                    setQuery(event.target.value);
                  }}
                  placeholder="Search your mind"
                  aria-label="Search your mind"
                />
                <kbd>esc to close</kbd>
              </label>
            )}
            {(showFilterRow || showCaptureError) && (
              <div className="capture-status">
                {showFilterRow && (
                  <div className="filter-row">
                    {query.trim() && (
                      <div className="query-chip glass">
                        <span className="query-chip-text">{query.trim()}</span>
                        <button
                          type="button"
                          className="query-chip-clear"
                          aria-label="Clear search"
                          data-tooltip="Clear search"
                          onClick={() => setQuery("")}
                        >
                          <HugeiconsIcon icon={Cancel01Icon} size={13} />
                        </button>
                      </div>
                    )}
                    <div className="result-context">
                      <AnimatedCount className="result-count" value={filteredItems.length} />
                      {` ${filteredItems.length === 1 ? "result" : "results"}`}
                      {query.trim() ? (
                        <button type="button" className="quiet-link" onClick={beginSaveSearch}>
                          <HugeiconsIcon icon={Bookmark01Icon} size={13} /> Save as Space
                        </button>
                      ) : null}
                    </div>
                  </div>
                )}
                {showCaptureError && (
                  <p className="capture-error glass">Couldn’t save this yet: {captureError}</p>
                )}
              </div>
            )}
          </section>

          <div className="view-dock" ref={viewDockRef}>
            {showBrowseControls && appearance.viewToggle === "segmented" && (
              <SegmentedControl
                className="glass"
                name="library-view"
                label="View options"
                value={viewSelectionListMode ? "list" : "grid"}
                onChange={(view) => switchLibraryView(view === "list")}
                options={[
                  { value: "grid", label: "Grid" },
                  { value: "list", label: "List" },
                ]}
              />
            )}
            {showBrowseControls && appearance.viewToggle === "pill" && (
              <fieldset className="view-controls glass">
                <legend className="visually-hidden">View options</legend>
                <motion.span
                  className="view-selection"
                  aria-hidden="true"
                  initial={false}
                  animate={{
                    transform: viewSelectionListMode ? "translateX(28px)" : "translateX(0px)",
                  }}
                  transition={{
                    duration: LIBRARY_VIEW_TRANSITION_MS / 1000,
                    ease: [0.77, 0, 0.175, 1],
                  }}
                />
                <button
                  type="button"
                  className={`view-button ${!listMode ? "selected" : ""}`}
                  onClick={() => switchLibraryView(false)}
                  aria-label="Grid view"
                  aria-pressed={!listMode}
                  data-tooltip="Grid view"
                >
                  <HugeiconsIcon icon={Grid2X2Icon} size={15} />
                </button>
                <button
                  type="button"
                  className={`view-button ${listMode ? "selected" : ""}`}
                  onClick={() => switchLibraryView(true)}
                  aria-label="List view"
                  aria-pressed={listMode}
                  data-tooltip="List view"
                >
                  <HugeiconsIcon icon={ListViewIcon} size={15} />
                </button>
              </fieldset>
            )}
          </div>

          <LiquidGlass
            className="library-stage"
            targetRoots={[captureBarRef, viewDockRef, tooltipLayerRef]}
          >
            <div
              className={`library-scroll${hasPinnedQuery ? " has-pinned-query" : ""}`}
              ref={libraryScrollRef}
            >
              {isSerendipityView ? (
                <section
                  className="serendipity-stage"
                  aria-labelledby="serendipity-title"
                  data-testid="serendipity-view"
                >
                  <div className="serendipity-intro">
                    <div className="serendipity-intro-copy">
                      <p className="serendipity-eyebrow">A slower look through your library</p>
                      <h1 id="serendipity-title">Something worth finding again?</h1>
                      <p>Keep what still feels useful. Forget what you do not need to carry.</p>
                    </div>
                    <p className="serendipity-progress" role="status" aria-live="polite">
                      {serendipityRemainingCount === 1
                        ? "1 older item left"
                        : `${serendipityRemainingCount} older items left`}
                    </p>
                  </div>

                  {serendipityItem ? (
                    <div className="serendipity-browse">
                      <div className="serendipity-art" data-testid="serendipity-item">
                        <AnimatePresence initial={false} mode="wait">
                          <motion.div
                            key={String(serendipityItem.id)}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
                          >
                            <VirtualizedLibraryItem
                              data={serendipityItem}
                              index={0}
                              context={libraryCardContext}
                            />
                          </motion.div>
                        </AnimatePresence>
                      </div>
                      <div className="serendipity-copy">
                        <div className="serendipity-kicker">
                          <span>
                            <KindIcon kind={serendipityItem.kind} />
                            {serendipityItem.kind}
                          </span>
                          <span>{serendipityItem.date}</span>
                        </div>
                        <h2>{serendipityItem.title}</h2>
                        {serendipityItem.description && (
                          <p className="serendipity-description">{serendipityItem.description}</p>
                        )}
                        {serendipityItem.tags.length > 0 && (
                          <ul className="serendipity-tags" aria-label="Tags">
                            {serendipityItem.tags.slice(0, 5).map((tag) => (
                              <li key={tag}>#{tag}</li>
                            ))}
                          </ul>
                        )}
                        <div className="serendipity-actions">
                          <button
                            type="button"
                            className="serendipity-keep"
                            onClick={() => keepSerendipityItem(serendipityItem)}
                            data-testid="serendipity-keep"
                          >
                            <HugeiconsIcon icon={CircleCheckIcon} size={16} /> Keep
                          </button>
                          <button
                            type="button"
                            className="serendipity-forget"
                            onClick={() => void forgetItem(serendipityItem)}
                            data-testid="serendipity-forget"
                          >
                            <HugeiconsIcon icon={Archive01Icon} size={16} /> Forget
                          </button>
                        </div>
                        <button
                          type="button"
                          className="serendipity-details"
                          onClick={() => selectLibraryItem(serendipityItem)}
                        >
                          Open details <HugeiconsIcon icon={ArrowUpRight01Icon} size={13} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="serendipity-complete" data-testid="serendipity-complete">
                      <div className="empty-icon">
                        <HugeiconsIcon icon={Clock01Icon} size={20} />
                      </div>
                      <h2>That is the whole walk.</h2>
                      <p>
                        You have seen every older item still in your library. Save something new, or
                        come back later.
                      </p>
                      <button type="button" className="text-button" onClick={clearToDefaultView}>
                        Back to Everything
                      </button>
                    </div>
                  )}
                </section>
              ) : (
                <>
                  {filteredItems.length > 0 && (
                    <VirtuosoMasonry
                      key={libraryGridKey}
                      className={`library-grid ${listMode ? "list-mode" : ""}`}
                      columnCount={listMode ? 1 : gridColumnCount}
                      data={filteredItems}
                      context={libraryCardContext}
                      ItemContent={VirtualizedLibraryItem}
                      style={{ height: "100%", width: "100%" }}
                    />
                  )}

                  {filteredItems.length === 0 && (
                    <div className="empty-state">
                      <div className="empty-icon">
                        <HugeiconsIcon icon={pinsViewIsEmpty ? PinIcon : Search01Icon} size={20} />
                      </div>
                      {activeSpace?.kind === "regular" ? (
                        <>
                          <h2>{activeSpace.name} is empty.</h2>
                          <p>
                            Open anything in your library and pick {activeSpace.name} to file it in
                            here.
                          </p>
                        </>
                      ) : pinsViewIsEmpty ? (
                        <>
                          <h2>Nothing pinned yet.</h2>
                          <p>Open anything in your library and pin it to keep it within reach.</p>
                        </>
                      ) : (
                        <>
                          <h2>Nothing surfaced yet.</h2>
                          <p>Try another word, or save something new to your mind.</p>
                        </>
                      )}
                      {activeSpace?.kind !== "regular" && !pinsViewIsEmpty && (
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => {
                            setQuery("");
                            clearToDefaultView();
                          }}
                        >
                          Clear search
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
            {showLibraryEdges && <LibraryEdgeFade />}
          </LiquidGlass>
        </main>

        {isFirstRunOpen ? <FirstRunOverlay onFinish={finishFirstRun} /> : null}

        <AnimatePresence>
          {isShortcutsOpen && (
            <motion.div
              key="shortcuts-modal-backdrop"
              className="shortcuts-modal-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) setIsShortcutsOpen(false);
              }}
            >
              <motion.section
                ref={shortcutsModalRef}
                id="shortcuts-modal"
                className="shortcuts-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="shortcuts-modal-title"
                initial={{ opacity: 0, transform: "translateY(8px) scale(0.98)" }}
                animate={{ opacity: 1, transform: "translateY(0) scale(1)" }}
                exit={{ opacity: 0, transform: "translateY(8px) scale(0.98)" }}
                transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
              >
                <header className="shortcuts-modal-header">
                  <div>
                    <h2 id="shortcuts-modal-title">Keyboard shortcuts</h2>
                    <p>Use these when you’re not typing in a field.</p>
                  </div>
                  <button
                    ref={shortcutsCloseRef}
                    type="button"
                    className="icon-button small"
                    onClick={() => setIsShortcutsOpen(false)}
                    aria-label="Close keyboard shortcuts"
                  >
                    <HugeiconsIcon icon={Cancel01Icon} size={16} />
                  </button>
                </header>
                <dl className="shortcut-list">
                  <div>
                    <dt>
                      <kbd>/</kbd>
                    </dt>
                    <dd>Focus search</dd>
                  </div>
                  <div>
                    <dt>
                      <kbd>Ctrl</kbd> or <kbd>⌘</kbd> + <kbd>K</kbd>
                    </dt>
                    <dd>Focus search</dd>
                  </div>
                  <div>
                    <dt>
                      <kbd>N</kbd>
                    </dt>
                    <dd>Start a new note</dd>
                  </div>
                  <div>
                    <dt>
                      <kbd>?</kbd>
                    </dt>
                    <dd>Show keyboard shortcuts</dd>
                  </div>
                  <div>
                    <dt>
                      <kbd>Esc</kbd>
                    </dt>
                    <dd>Close a panel or return to capture options</dd>
                  </div>
                </dl>
              </motion.section>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {isSettingsOpen && (
            <motion.div
              key="settings-modal-backdrop"
              className="settings-modal-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) setIsSettingsOpen(false);
              }}
            >
              <motion.section
                ref={settingsDialogRef}
                id="settings-modal"
                className="settings-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="settings-modal-title"
                tabIndex={-1}
                initial={{ opacity: 0, transform: "translateY(10px) scale(0.98)" }}
                animate={{ opacity: 1, transform: "translateY(0) scale(1)" }}
                exit={{ opacity: 0, transform: "translateY(8px) scale(0.98)" }}
                transition={{ duration: 0.24, ease: [0.23, 1, 0.32, 1] }}
              >
                <aside className="settings-modal-sidebar" aria-label="Settings sections">
                  <header className="settings-sidebar-header">
                    <h2>Settings</h2>
                  </header>
                  <div className="settings-sidebar-content">
                    <button
                      type="button"
                      className={`settings-tab ${settingsTab === "general" || settingsTab === "licenses" ? "active" : ""}`}
                      aria-current={settingsTab === "general" ? "page" : undefined}
                      onClick={() => setSettingsTab("general")}
                    >
                      <HugeiconsIcon icon={Settings01Icon} size={15} />
                      <span>General</span>
                    </button>
                    <button
                      type="button"
                      className={`settings-tab ${settingsTab === "appearance" ? "active" : ""}`}
                      aria-current={settingsTab === "appearance" ? "page" : undefined}
                      onClick={() => setSettingsTab("appearance")}
                    >
                      <HugeiconsIcon icon={PaintBoardIcon} size={15} />
                      <span>Appearance</span>
                    </button>
                    <button
                      type="button"
                      className={`settings-tab ${settingsTab === "data" ? "active" : ""}`}
                      aria-current={settingsTab === "data" ? "page" : undefined}
                      onClick={() => setSettingsTab("data")}
                    >
                      <HugeiconsIcon icon={Database02Icon} size={15} />
                      <span>Library</span>
                    </button>
                    <button
                      type="button"
                      className={`settings-tab ${settingsTab === "archive" ? "active" : ""}`}
                      aria-current={settingsTab === "archive" ? "page" : undefined}
                      onClick={() => setSettingsTab("archive")}
                    >
                      <HugeiconsIcon icon={Archive01Icon} size={15} />
                      <span>Archive</span>
                      <span className="settings-tab-count">{archivedItems.length}</span>
                    </button>
                    <button
                      type="button"
                      className={`settings-tab ${settingsTab === "extension" ? "active" : ""}`}
                      aria-current={settingsTab === "extension" ? "page" : undefined}
                      onClick={() => setSettingsTab("extension")}
                    >
                      <HugeiconsIcon icon={Link01Icon} size={15} />
                      <span>Browser extension</span>
                    </button>
                  </div>
                  <div className="settings-sidebar-footer">
                    {appVersion && <p className="settings-sidebar-version">inkling {appVersion}</p>}
                  </div>
                </aside>

                {settingsTab === "general" ? (
                  <section className="settings-panel" aria-labelledby="general-panel-title">
                    <header className="settings-panel-header">
                      <div className="settings-panel-header-content">
                        <div className="settings-panel-heading">
                          <h2 id="general-panel-title">General</h2>
                        </div>
                        <p className="settings-panel-note">How inkling behaves across the app.</p>
                      </div>
                      <button
                        type="button"
                        className="icon-button settings-close"
                        onClick={() => setIsSettingsOpen(false)}
                        aria-label="Close settings"
                      >
                        <HugeiconsIcon icon={Cancel01Icon} size={14} />
                      </button>
                    </header>

                    <div className="settings-scroll">
                      <div className="settings-data-row">
                        <span className="settings-data-icon" aria-hidden="true">
                          <HugeiconsIcon icon={PlayIcon} size={17} />
                        </span>
                        <div className="settings-data-text">
                          <h3>Welcome tour</h3>
                          <p>
                            Replay the screens from your first launch: saving things, finding them
                            again, and keeping your library on this computer.
                          </p>
                        </div>
                        <button
                          type="button"
                          className="settings-data-button"
                          onClick={() => {
                            setIsSettingsOpen(false);
                            setIsFirstRunOpen(true);
                          }}
                        >
                          Show the welcome again
                        </button>
                      </div>
                      <div className="settings-data-row">
                        <span className="settings-data-icon" aria-hidden="true">
                          <HugeiconsIcon icon={LicenseThirdPartyIcon} size={17} />
                        </span>
                        <div className="settings-data-text">
                          <h3>Open source licenses</h3>
                          <p>The projects inkling is built on, and the terms they come with.</p>
                        </div>
                        <button
                          type="button"
                          className="settings-data-button"
                          onClick={() => setSettingsTab("licenses")}
                        >
                          View licenses
                        </button>
                      </div>
                    </div>
                  </section>
                ) : settingsTab === "licenses" ? (
                  <OpenSourceLicenses
                    onBack={() => setSettingsTab("general")}
                    onClose={() => setIsSettingsOpen(false)}
                  />
                ) : settingsTab === "appearance" ? (
                  <section className="settings-panel" aria-labelledby="appearance-panel-title">
                    <header className="settings-panel-header">
                      <div className="settings-panel-header-content">
                        <div className="settings-panel-heading">
                          <h2 id="appearance-panel-title">Appearance</h2>
                        </div>
                        <p className="settings-panel-note">Try other looks for parts of the app.</p>
                      </div>
                      <button
                        type="button"
                        className="icon-button settings-close"
                        onClick={() => setIsSettingsOpen(false)}
                        aria-label="Close settings"
                      >
                        <HugeiconsIcon icon={Cancel01Icon} size={14} />
                      </button>
                    </header>

                    <div className="settings-scroll">
                      <div className="settings-data-row">
                        <span className="settings-data-icon" aria-hidden="true">
                          <HugeiconsIcon icon={Grid2X2Icon} size={17} />
                        </span>
                        <div className="settings-data-text">
                          <h3>Grid and list toggle</h3>
                          <p>The switch at the bottom of the library.</p>
                        </div>
                        <SegmentedControl
                          className="settings-segmented"
                          name="appearance-view-toggle"
                          label="Grid and list toggle style"
                          value={appearance.viewToggle}
                          onChange={(value) => setAppearanceOption("viewToggle", value)}
                          options={APPEARANCE_OPTIONS.viewToggle}
                        />
                      </div>
                    </div>
                  </section>
                ) : settingsTab === "archive" ? (
                  <section className="settings-panel" aria-labelledby="archive-panel-title">
                    <header className="settings-panel-header">
                      <div className="settings-panel-header-content">
                        <div className="settings-panel-heading">
                          <h2 id="archive-panel-title">Archive</h2>
                        </div>
                        <p className="settings-panel-note">
                          {archivedItems.length === 1
                            ? "1 thing you put away. It waits here,"
                            : `${archivedItems.length} things you put away. They wait here,`}{" "}
                          out of your library, until you bring{" "}
                          {archivedItems.length === 1 ? "it" : "them"} back or let{" "}
                          {archivedItems.length === 1 ? "it" : "them"} go.
                        </p>
                      </div>
                      <div className="settings-panel-tools">
                        <fieldset className="settings-archive-actions">
                          <legend className="visually-hidden">Archive actions</legend>
                          {isArchiveSelectionMode && (
                            <>
                              <span
                                className="settings-selected-count"
                                role="status"
                                aria-live="polite"
                              >
                                {selectedArchivedIds.size} selected
                              </span>
                              <button
                                type="button"
                                className="settings-batch-button settings-batch-restore"
                                disabled={selectedArchivedIds.size === 0}
                                onClick={() => void restoreSelectedArchivedItems()}
                              >
                                Restore
                              </button>
                              <button
                                type="button"
                                className="settings-batch-button settings-batch-delete"
                                disabled={selectedArchivedIds.size === 0}
                                onClick={() => void deleteSelectedArchivedItems()}
                              >
                                Delete
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            className={`settings-select-button ${isArchiveSelectionMode ? "is-active" : ""}`}
                            aria-pressed={isArchiveSelectionMode}
                            aria-label={
                              isArchiveSelectionMode
                                ? "Exit multi-select mode"
                                : "Select archived items"
                            }
                            onClick={toggleArchiveSelectionMode}
                          >
                            <span>{isArchiveSelectionMode ? "Done" : "Select"}</span>
                          </button>
                        </fieldset>
                        <button
                          type="button"
                          className="icon-button settings-close"
                          onClick={() => setIsSettingsOpen(false)}
                          aria-label="Close settings"
                        >
                          <HugeiconsIcon icon={Cancel01Icon} size={14} />
                        </button>
                      </div>
                    </header>

                    <div className="settings-scroll">
                      {archivedItems.length > 0 ? (
                        <div className="settings-archive-grid">
                          {archivedItems.map((item, index) => (
                            <VirtualizedLibraryItem
                              key={String(item.id)}
                              data={item}
                              index={index}
                              context={archivedCardContext}
                            />
                          ))}
                        </div>
                      ) : (
                        <div className="settings-empty-state">
                          <div className="settings-empty-icon">
                            <HugeiconsIcon icon={Archive01Icon} size={19} />
                          </div>
                          <h4>Your archive is empty.</h4>
                          <p>Items you forget from the library will appear here.</p>
                        </div>
                      )}
                    </div>
                  </section>
                ) : settingsTab === "data" ? (
                  <section className="settings-panel" aria-labelledby="data-panel-title">
                    <header className="settings-panel-header">
                      <div className="settings-panel-header-content">
                        <div className="settings-panel-heading">
                          <h2 id="data-panel-title">Your library</h2>
                        </div>
                        <p className="settings-panel-note">
                          It lives in one folder on this computer. Back it up by exporting a copy,
                          or bring an old copy back in.
                        </p>
                      </div>
                      <button
                        type="button"
                        className="icon-button settings-close"
                        onClick={() => setIsSettingsOpen(false)}
                        aria-label="Close settings"
                      >
                        <HugeiconsIcon icon={Cancel01Icon} size={14} />
                      </button>
                    </header>

                    <div className="settings-scroll">
                      <LibraryMakeup
                        items={items}
                        sizeBytes={librarySizeBytes}
                        onShowFolder={
                          canUseLibraryFolderPicker ? showLibraryFolderFromSettings : undefined
                        }
                      />
                      <div className="settings-data-row">
                        <span className="settings-data-icon" aria-hidden="true">
                          <HugeiconsIcon
                            icon={isExportingLibrary ? Loading01Icon : Download04Icon}
                            size={17}
                          />
                        </span>
                        <div className="settings-data-text">
                          <h3>Export a copy</h3>
                          <p>
                            A dated folder with the database, every file, and a manifest. Keep it on
                            another drive.
                          </p>
                          {lastCopy ? (
                            <p className="settings-data-copy">{formatLastCopy(lastCopy)}</p>
                          ) : null}
                          {!canUseLibraryFolderPicker ? (
                            <p className="settings-data-hint">Export runs in the desktop app.</p>
                          ) : null}
                          {lastExport ? (
                            <div className="settings-data-result" role="status" aria-live="polite">
                              <span className="settings-data-summary">
                                {formatExportSummary(lastExport)}
                              </span>
                              <span className="settings-data-path">{lastExport.directory}</span>
                            </div>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          className={`settings-data-button is-primary ${isExportingLibrary ? "is-busy" : ""}`}
                          disabled={
                            !canUseLibraryFolderPicker || isExportingLibrary || isImportingLibrary
                          }
                          onClick={() => void exportLibraryToFolder()}
                        >
                          {isExportingLibrary ? "Exporting…" : "Export…"}
                        </button>
                      </div>
                      <div className="settings-data-row">
                        <span className="settings-data-icon" aria-hidden="true">
                          <HugeiconsIcon
                            icon={isImportingLibrary ? Loading01Icon : Upload04Icon}
                            size={17}
                          />
                        </span>
                        <div className="settings-data-text">
                          <h3>Restore from an export</h3>
                          <p>
                            Adds its items, files and Spaces here. Nothing already in your library
                            gets replaced.
                          </p>
                          {!canUseLibraryFolderPicker ? (
                            <p className="settings-data-hint">Restore runs in the desktop app.</p>
                          ) : null}
                          {lastImport ? (
                            <div className="settings-data-result" role="status" aria-live="polite">
                              <span className="settings-data-summary">
                                {formatImportSummary(lastImport)}
                              </span>
                            </div>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          className={`settings-data-button ${isImportingLibrary ? "is-busy" : ""}`}
                          disabled={
                            !canUseLibraryFolderPicker || isExportingLibrary || isImportingLibrary
                          }
                          onClick={() => void importLibraryFromFolder()}
                        >
                          {isImportingLibrary ? "Restoring…" : "Restore…"}
                        </button>
                      </div>
                    </div>
                  </section>
                ) : (
                  <section className="settings-panel" aria-labelledby="extension-panel-title">
                    <header className="settings-panel-header">
                      <div className="settings-panel-header-content">
                        <div className="settings-panel-heading">
                          <h2 id="extension-panel-title">Browser extension</h2>
                        </div>
                        <p className="settings-panel-note">
                          Save pages without leaving the browser
                        </p>
                      </div>
                      <button
                        type="button"
                        className="icon-button settings-close"
                        onClick={() => setIsSettingsOpen(false)}
                        aria-label="Close settings"
                      >
                        <HugeiconsIcon icon={Cancel01Icon} size={14} />
                      </button>
                    </header>

                    <div className="settings-scroll">
                      <ExtensionPairing />
                    </div>
                  </section>
                )}
              </motion.section>
            </motion.div>
          )}
        </AnimatePresence>

        {selectedItem && (
          <Suspense fallback={null}>
            <ExpandedItemOverlay
              key="expanded-item-overlay"
              item={selectedItem}
              actions={expandedOverlayActions}
              spaces={selectedItemSpaces}
              originRectsRef={selectionRectsRef}
              frameRef={libraryFrameRef}
              historyCloseRequest={historyCloseRequest}
            />
          </Suspense>
        )}
        <AnimatePresence>
          {pdfViewerItem?.fileUrl && (
            <motion.div
              key="pdf-viewer"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
            >
              <Suspense fallback={null}>
                <PdfViewer
                  url={pdfViewerItem.fileUrl}
                  title={pdfViewerItem.title}
                  onClose={() => setPdfViewerItem(null)}
                />
              </Suspense>
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {readingItem?.item.articleHtml && (
            <Suspense key={readingItem.item.id} fallback={null}>
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
                onRequestClose={closeReader}
              />
            </Suspense>
          )}
        </AnimatePresence>
      </div>
      <TooltipLayer ref={tooltipLayerRef} />
      {cardMenu && (
        <ContextMenu
          x={cardMenu.x}
          y={cardMenu.y}
          label={cardMenu.item.title}
          entries={cardMenuEntries}
          returnFocus={cardMenu.card}
          onClose={closeCardMenu}
        />
      )}
      <Toaster
        position="top-right"
        offset={{ top: 48, right: 16 }}
        mobileOffset={{ top: 16, right: 12 }}
        theme="dark"
        richColors={false}
        closeButton
        duration={5000}
        icons={{
          success: <></>,
          error: <></>,
          close: <HugeiconsIcon icon={Cancel01Icon} size={12} color="currentColor" />,
        }}
        containerAriaLabel="Notifications"
      />
    </MotionConfig>
  );
}

export default App;
