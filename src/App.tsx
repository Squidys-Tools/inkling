import { useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  Archive,
  AlertCircle,
  ArrowUpRight,
  Bookmark,
  Camera,
  CircleHelp,
  Clock3,
  Command,
  ExternalLink,
  FileText,
  Filter,
  Grid2X2,
  Image as ImageIcon,
  Layers3,
  LoaderCircle,
  Link2,
  List,
  Menu,
  MoreHorizontal,
  PanelRight,
  Plus,
  Search,
  RotateCw,
  Settings2,
  Sparkles,
  X,
} from "lucide-react";
import {
  assetUrl,
  createSpace,
  createUrl,
  countActiveJobs,
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
import PdfViewer from "./components/PdfViewer";
import "./App.css";

type ItemKind = "Article" | "Image" | "Note" | "PDF" | "Quote" | "Video" | "File";

type LibraryItem = {
  id: string | number;
  kind: ItemKind;
  title: string;
  description: string;
  source: string;
  date: string;
  tags: string[];
  ocrText?: string;
  image?: string;
  fileUrl?: string;
  accent?: string;
  featured?: boolean;
  favorite?: boolean;
  processing?: ProcessingSummary;
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
    case "pdf":
      return "PDF";
    case "video":
    case "embed":
      return "Video";
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

async function storedItemToLibraryItem(
  item: StoredLibraryItem,
  processing?: ProcessingSummary,
): Promise<LibraryItem> {
  const kind = displayKind(item.kind);
  const metadataTags = item.metadata.tags;
  const tags = Array.isArray(metadataTags)
    ? metadataTags.filter((tag): tag is string => typeof tag === "string")
    : [];

  const image = await assetUrl(item.thumbnailPath ?? (kind === "Image" ? item.localAssetPath : null));
  const fileUrl = kind === "PDF" ? await assetUrl(item.localAssetPath) : undefined;

  return {
    id: item.id,
    kind,
    title: item.title?.trim() || "Untitled note",
    description:
      item.description?.trim() ||
      item.ocrText?.trim().slice(0, 180) ||
      "Saved to your mind.",
    source: item.sourceLabel || item.sourceUrl || "Quick note",
    date: formatItemDate(item.createdAt),
    tags,
    ocrText: item.ocrText,
    image,
    fileUrl,
    favorite: item.favorite,
    processing,
  };
}

const seedItems: LibraryItem[] = [
  {
    id: 1,
    kind: "Article",
    title: "The quiet architecture of attention",
    description:
      "A field note on designing environments that make room for deep work, wandering, and the occasional useful distraction.",
    source: "thecreativeindependent.com",
    date: "Saved today",
    tags: ["attention", "writing"],
    accent: "ink",
    featured: true,
    favorite: true,
  },
  {
    id: 2,
    kind: "Image",
    title: "A room that remembers",
    description: "Warm light, timber, and one very good chair.",
    source: "are.na",
    date: "Yesterday",
    tags: ["interiors", "warm"],
    image:
      "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1000&q=85",
    favorite: true,
  },
  {
    id: 3,
    kind: "Note",
    title: "Things worth making time for",
    description:
      "A short list: morning pages, long walks without a destination, learning the names of trees, sending the postcard.",
    source: "Quick note",
    date: "Monday",
    tags: ["thoughts", "life"],
    accent: "paper-blue",
  },
  {
    id: 4,
    kind: "Image",
    title: "Orange as a signal",
    description: "A color study collected from a passing afternoon.",
    source: "Are.na channel",
    date: "May 18",
    tags: ["color", "reference"],
    image:
      "https://images.unsplash.com/photo-1518005020951-eccb494ad742?auto=format&fit=crop&w=1000&q=85",
  },
  {
    id: 5,
    kind: "PDF",
    title: "Notes on a living archive",
    description: "A small research paper on memory, retrieval, and why indexes become places.",
    source: "Internet Archive",
    date: "May 14",
    tags: ["research", "archive"],
    accent: "paper-green",
  },
  {
    id: 6,
    kind: "Quote",
    title: "“The mind is a place with weather.”",
    description: "— Annie Dillard",
    source: "Pilgrim at Tinker Creek",
    date: "May 08",
    tags: ["writing", "wonder"],
    accent: "paper-yellow",
  },
  {
    id: 7,
    kind: "Image",
    title: "Built for looking slowly",
    description: "A study in quiet proportions and imperfect repetition.",
    source: "mymind library",
    date: "May 02",
    tags: ["objects", "form"],
    image:
      "https://images.unsplash.com/photo-1549490349-8643362247b5?auto=format&fit=crop&w=1000&q=85",
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
    query: { tag: "research" },
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
  pdf: "pdf",
  video: "video",
  embed: "video",
  file: "file",
  quote: "quote",
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
            : Sparkles;
  return <Icon size={13} strokeWidth={1.8} />;
}

function App() {
  const [items, setItems] = useState<LibraryItem[]>(isTauriRuntime() ? [] : seedItems);
  const [spaces, setSpaces] = useState<StoredSpace[]>(isTauriRuntime() ? [] : seedSpaces);
  const [query, setQuery] = useState("");
  const [activeView, setActiveView] = useState("Everything");
  const [activeSpaceId, setActiveSpaceId] = useState<string | null>(null);
  const [isCreatingSpace, setIsCreatingSpace] = useState(false);
  const [newSpaceName, setNewSpaceName] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [captureMode, setCaptureMode] = useState<"note" | "url" | "file">("note");
  const [newTitle, setNewTitle] = useState("");
  const [captureUrl, setCaptureUrl] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedItem, setSelectedItem] = useState<LibraryItem | null>(null);
  const [pdfViewerItem, setPdfViewerItem] = useState<LibraryItem | null>(null);
  const [listMode, setListMode] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const [activeJobCount, setActiveJobCount] = useState(0);
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

    const item: LibraryItem = {
      id: Date.now(),
      kind: "Article",
      title: article.title,
      description: article.description || article.text.slice(0, 180),
      source: new URL(article.canonicalUrl).hostname,
      date: "Just now",
      tags: [],
      image: article.imageUrls[0],
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
      if (event.key === "/" && document.activeElement?.tagName !== "INPUT") {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === "Escape") {
        setSelectedItem(null);
        setIsAdding(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

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
        const [storedItems, activeCount] = await Promise.all([storedItemsPromise, countActiveJobs()]);
        const libraryItems = await Promise.all(storedItems.map(async (item) => {
          const jobs = await getJobStatus(item.id);
          return storedItemToLibraryItem(item, summarizeProcessingJobs(jobs));
        }));
        if (!cancelled) {
          setItems(libraryItems);
          setActiveJobCount(activeCount);
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

    try {
      if (captureMode === "note") {
        if (!newTitle.trim()) return;
        await persistText(newTitle.trim(), "quick note");
      } else if (captureMode === "url") {
        if (!captureUrl.trim()) return;
        await persistArticle(captureUrl.trim(), "quick link");
      } else {
        if (!selectedFile) return;
        await persistFile(selectedFile, "file picker");
      }

      setNewTitle("");
      setCaptureUrl("");
      setSelectedFile(null);
      setIsAdding(false);
    } catch (error) {
      setCaptureError(error instanceof Error ? error.message : String(error));
    }
  }

  function selectCaptureMode(mode: "note" | "url" | "file") {
    setCaptureMode(mode);
    setCaptureError(null);
  }

  function openCapture(mode: "note" | "url" | "file" = "note") {
    selectCaptureMode(mode);
    setIsAdding(true);
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
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">
            <span />
          </div>
          <div>
            <strong>mymind</strong>
            <span>library</span>
          </div>
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
          <div className="sidebar-prompt">
            <span className="prompt-orb"><Sparkles size={14} /></span>
            <span>Save something<br />to your mind.</span>
          </div>
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
          <button className="mobile-menu" aria-label="Open navigation"><Menu size={19} /></button>
          <div className="breadcrumb"><span>Library</span><span className="slash">/</span><strong>{activeView}</strong></div>
          <div className="topbar-actions">
            <button className="icon-button" aria-label="Filter library" title="Filter library"><Filter size={17} /></button>
            <button className="icon-button" aria-label="Open panel" title="Open panel"><PanelRight size={17} /></button>
            <div className="avatar">M</div>
          </div>
        </header>

        <section className="library-header">
          <div>
            <h1>{activeView === "Everything" ? "Everything" : activeView}</h1>
            <p>
              <span className="live-dot" />
              {activeJobCount > 0 ? (
                <span className="job-summary" aria-live="polite"><LoaderCircle size={12} />Processing {activeJobCount} {activeJobCount === 1 ? "thing" : "things"}…</span>
              ) : (
                `${items.length} things saved · Search by whatever you remember.`
              )}
            </p>
          </div>
          <button className="quiet-link" onClick={() => openCapture("note")}><Plus size={15} /> Add a note</button>
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
          <button className="add-button" onClick={() => setIsAdding((current) => !current)}>
            <Plus size={18} />
            <span>Add to your mind</span>
          </button>
          <button className="capture-tool-button" onClick={() => void captureScreenshot()} disabled={isCapturing} title="Capture a screenshot">
            <Camera size={17} />
            <span>{isCapturing ? "Capturing…" : "Screenshot"}</span>
          </button>
        </section>

        {isAdding && (
          <form className="quick-capture" onSubmit={saveCapture}>
            <div className="quick-capture-icon"><Sparkles size={16} /></div>
            <div className="capture-mode-tabs" role="tablist" aria-label="Capture type">
              <button type="button" className={captureMode === "note" ? "selected" : ""} onClick={() => selectCaptureMode("note")}>Note</button>
              <button type="button" className={captureMode === "url" ? "selected" : ""} onClick={() => selectCaptureMode("url")}>Link</button>
              <button type="button" className={captureMode === "file" ? "selected" : ""} onClick={() => selectCaptureMode("file")}>File</button>
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
            <span className="capture-type">{captureMode === "note" ? "Quick note" : captureMode === "url" ? "Defuddle article" : "Local file"}</span>
            <button className="capture-save" type="submit">Save</button>
            <button className="capture-close" type="button" onClick={() => setIsAdding(false)} aria-label="Close capture"><X size={16} /></button>
          </form>
        )}

        {captureError && <p className="capture-error">Couldn’t save this yet: {captureError}</p>}

        <div className="library-toolbar">
          <div className="result-context">
            <span className="result-count">{filteredItems.length}</span> things to remember
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
          <div className="view-controls" aria-label="View options">
            <button className={`view-button ${!listMode ? "selected" : ""}`} onClick={() => setListMode(false)} aria-label="Grid view" title="Grid view"><Grid2X2 size={16} /></button>
            <button className={`view-button ${listMode ? "selected" : ""}`} onClick={() => setListMode(true)} aria-label="List view" title="List view"><List size={16} /></button>
          </div>
        </div>

        <div className={`library-grid ${listMode ? "list-mode" : ""}`}>
          {filteredItems.map((item, index) => (
            <article
              className={`library-card ${item.featured ? "featured-card" : ""} ${item.accent ?? ""}`}
              key={item.id}
              style={{ "--card-index": index } as React.CSSProperties}
              onClick={() => setSelectedItem(item)}
              tabIndex={0}
              onKeyDown={(event) => event.key === "Enter" && setSelectedItem(item)}
            >
              {item.image ? (
                <div className="card-image-wrap">
                  <img src={item.image} alt="" className="card-image" />
                  <button className="card-action" onClick={(event) => event.stopPropagation()} aria-label="More actions"><MoreHorizontal size={17} /></button>
                </div>
              ) : (
                <div className="card-paper-art" aria-hidden="true">
                  {item.kind === "Article" && <><span className="paper-line line-one" /><span className="paper-line line-two" /><span className="paper-seal">m</span></>}
                  {item.kind === "Note" && <><span className="note-scribble">remember<br />the shape<br />of a day</span><span className="note-star">✳</span></>}
                  {item.kind === "PDF" && <><span className="pdf-label">FIELD<br />NOTES</span><span className="pdf-rule" /></>}
                  {item.kind === "Quote" && <><span className="quote-mark">“</span><span className="quote-line" /></>}
                </div>
              )}
              <div className="card-content">
                <div className="card-kicker"><span><KindIcon kind={item.kind} />{item.kind}</span><span>{item.date}</span></div>
                <h2>{item.title}</h2>
                <p>{item.description}</p>
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
                <div className="card-footer"><span className="card-source">{item.source}</span><ArrowUpRight size={15} /></div>
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

        <footer className="main-footer"><span>mymind library</span><span>Save without organizing.</span><span className="footer-shortcut"><Command size={12} /> K to add</span></footer>
      </main>

      {selectedItem && (
        <aside className="item-inspector" aria-label="Selected item">
          <div className="inspector-top"><span>Item details</span><button className="icon-button small" onClick={() => setSelectedItem(null)} aria-label="Close details"><X size={16} /></button></div>
          {selectedItem.image ? <img src={selectedItem.image} alt="" className="inspector-image" /> : <div className={`inspector-art ${selectedItem.accent ?? "ink"}`}><KindIcon kind={selectedItem.kind} /><span>{selectedItem.kind}</span></div>}
          <div className="inspector-copy">
            <div className="card-kicker"><span><KindIcon kind={selectedItem.kind} />{selectedItem.kind}</span><span>{selectedItem.date}</span></div>
            <h2>{selectedItem.title}</h2>
            <p>{selectedItem.description}</p>
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
            <button className="open-source"><ExternalLink size={15} /> Open original</button>
          </div>
        </aside>
      )}

      {pdfViewerItem?.fileUrl && (
        <PdfViewer
          url={pdfViewerItem.fileUrl}
          title={pdfViewerItem.title}
          onClose={() => setPdfViewerItem(null)}
        />
      )}
    </div>
  );
}

export default App;
