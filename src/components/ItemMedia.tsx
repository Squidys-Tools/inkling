import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
  AtSignIcon,
  Bookmark01Icon,
  CheckmarkBadge01Icon,
  FileTextIcon,
  HeartIcon,
  Image01Icon,
  Link01Icon,
  Message01Icon,
  PlayIcon,
  RepeatIcon,
  Share08Icon,
  SparklesIcon,
} from "@hugeicons/core-free-icons";
import { markdownToPlainText } from "../lib/notes";
import type { ItemKind, LibraryItem } from "../lib/types";
import pdfPointillismOptionB from "../assets/pdf-pointillism-option-b.png";
import { cx } from "../ui/cx";
import { canvasImageCrossOrigin } from "./LiquidGlass";

export function mediaAspectRatioFor(item: LibraryItem) {
  if (
    item.mediaAspectRatio &&
    Number.isFinite(item.mediaAspectRatio) &&
    item.mediaAspectRatio > 0
  ) {
    return item.mediaAspectRatio;
  }
  if (item.mediaWidth && item.mediaHeight && item.mediaWidth > 0 && item.mediaHeight > 0) {
    return item.mediaWidth / item.mediaHeight;
  }

  // Keep native X posts compact enough to read as a card while leaving the
  // full-height version available in the detail view.
  if (item.social?.provider === "x") return 1.6;

  switch (item.kind) {
    case "Video":
      return 16 / 9;
    case "Article":
      return 16 / 10;
    case "Image":
      return 4 / 3;
    case "PDF":
      return 4 / 3;
    case "Quote":
      return 1.4;
    default:
      return 1.45;
  }
}

const KIND_ICONS: Record<ItemKind, IconSvgElement> = {
  Article: Link01Icon,
  Image: Image01Icon,
  Note: SparklesIcon,
  PDF: FileTextIcon,
  Quote: Bookmark01Icon,
  Video: PlayIcon,
  Post: AtSignIcon,
  File: SparklesIcon,
};

export function KindIcon({ kind }: { kind: ItemKind }) {
  return <HugeiconsIcon icon={KIND_ICONS[kind]} size={13} />;
}

export function pdfPreviewTitle(value: string) {
  return value
    .replace(/\uFFFD/gu, "’")
    .replace(/\.[^.]+$/u, "")
    .replace(/[-_]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

// Every typed card (PDF, note, file) shares one layout: a mono label and ring,
// the title in DM Sans caps, three dots, and a mono footnote. The shader texture
// is the same for all of them; only the copy changes. Compact is the list row.
// Onboarding draws its sample note and PDF cards with it too.
export function TypedArtwork({
  label,
  title,
  footnote,
  compact,
}: {
  label: string;
  title: string;
  footnote?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cx(
        "absolute inset-0 isolate flex flex-col overflow-hidden bg-canvas",
        compact ? "pt-[14px] pr-4 pb-[14px] pl-[18px]" : "px-7 pt-[42px] pb-[30px]",
      )}
    >
      <img
        src={pdfPointillismOptionB}
        alt=""
        className="pointer-events-none absolute inset-0 z-0 size-full object-cover"
      />
      <div className="relative z-2 flex items-center justify-between pr-1">
        <span className="font-mono text-[10px]/[12px] tracking-[0.15em] text-muted">{label}</span>
        <span
          className="size-[22px] flex-none rounded-full border border-muted opacity-85"
          aria-hidden="true"
        />
      </div>
      <span
        className={cx(
          "relative z-2 line-clamp-2 pr-3 font-sans font-semibold tracking-[-0.025em] text-ink uppercase",
          compact ? "mt-[14px] text-[15px]/[116%]" : "mt-9 text-[21px]/[116%]",
        )}
      >
        {title}
      </span>
      <div
        className={cx("relative z-2 flex items-center gap-2", compact ? "mt-2.5" : "mt-[14px]")}
        aria-hidden="true"
      >
        <span className="size-2.5 flex-none rounded-full bg-accent" />
        <span className="size-2.5 flex-none rounded-full bg-yellow-soft" />
        <span className="size-2.5 flex-none rounded-full bg-green" />
      </div>
      {footnote && (
        <span className="relative z-2 mt-auto self-end font-mono text-[10px]/[12px] tracking-[0.08em] text-muted">
          {footnote}
        </span>
      )}
    </div>
  );
}

export function PdfArtwork({ item, compact }: { item: LibraryItem; compact?: boolean }) {
  return (
    <TypedArtwork
      label="PDF"
      title={pdfPreviewTitle(item.title) || "Document"}
      footnote={item.pdfPageCount ? `${item.pdfPageCount} PAGES` : undefined}
      compact={compact}
    />
  );
}

// A file card is the file's name and extension. Other kinds that fall through
// to the typed card (a post or image with no artwork) show their kind instead.
export function FileArtwork({ item, compact }: { item: LibraryItem; compact?: boolean }) {
  const extension = item.kind === "File" ? fileExtensionLabel(item.title) : "";
  return (
    <TypedArtwork
      label={extension || item.kind.toUpperCase()}
      title={pdfPreviewTitle(item.title) || item.kind}
      footnote={item.fileSizeBytes ? formatFileSize(item.fileSizeBytes) : undefined}
      compact={compact}
    />
  );
}

function fileExtensionLabel(name: string) {
  const match = /\.([a-z0-9]{1,5})$/iu.exec(name.trim());
  return match ? match[1].toUpperCase() : "";
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

export function formatDuration(totalSeconds: number) {
  const seconds = Math.floor(totalSeconds);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = String(seconds % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}` : `${minutes}:${rest}`;
}

// `item.description` is already the plain text the backend projected, so it is
// counted as it came. Only a raw note body, which is still Markdown, needs the
// projection first.
function noteWordCount(value: string | undefined) {
  const text = value?.replace(/\s+/gu, " ").trim() ?? "";
  if (!text) return 0;
  return text.split(" ").length;
}

export function NoteArtwork({ item, compact }: { item: LibraryItem; compact?: boolean }) {
  const words = noteWordCount(
    item.noteBody === undefined ? item.description : markdownToPlainText(item.noteBody),
  );
  return (
    <TypedArtwork
      label="NOTE"
      title={item.title?.trim() || "Untitled note"}
      footnote={words > 0 ? `${words} WORDS` : undefined}
      compact={compact}
    />
  );
}

// `className` sizes and places the art; the default is its natural height.
// `post-art` is the item stage's hook for sizing it inside the X embed fallback.
export function PostArtwork({
  post,
  className = "min-h-[185px]",
}: {
  post: NonNullable<LibraryItem["post"]>;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "post-art flex flex-col overflow-hidden bg-[#edf4f5] p-5 text-[#243d42]",
        className,
      )}
      aria-hidden="true"
    >
      <div className="flex items-center gap-[9px]">
        <span className="relative grid size-7 shrink-0 place-items-center overflow-hidden rounded-full bg-[#243d42] font-body text-[15px]/none font-medium text-[#e8f0f2]">
          <span className="relative z-0">j</span>
          {post.avatarUrl && (
            <img
              src={post.avatarUrl}
              crossOrigin={canvasImageCrossOrigin(post.avatarUrl)}
              alt=""
              className="absolute inset-0 z-1 block size-full object-cover"
            />
          )}
        </span>
        <span className="grid min-w-0 grid-cols-[auto_auto] items-center gap-x-1">
          <strong className="text-[12px] font-semibold">{post.displayName}</strong>
          <HugeiconsIcon icon={CheckmarkBadge01Icon} size={13} />
          <small className="col-span-full font-body text-[10px] leading-[normal] text-[#6b8589]">
            {post.handle}
          </small>
        </span>
        <span className="ml-auto font-body text-[17px]/none font-bold tracking-[-0.1em] text-[#243d42]">
          X
        </span>
      </div>
      <p className="mx-0 mt-auto mb-[13px] min-h-0 max-w-[22ch] font-body text-[20px]/[1.2] font-medium tracking-[-0.035em] text-[#243d42]">
        {post.body}
      </p>
      <div className="border-t border-[rgba(36,61,66,0.16)] pt-2.5 font-body text-[10px] leading-[normal] text-[#6b8589]">
        {post.published}
      </div>
      <div className="mt-[13px] flex gap-[17px] text-[#6b8589]">
        <HugeiconsIcon icon={Message01Icon} size={14} />
        <HugeiconsIcon icon={RepeatIcon} size={14} />
        <HugeiconsIcon icon={HeartIcon} size={14} />
        <HugeiconsIcon icon={Share08Icon} size={14} />
      </div>
    </div>
  );
}

// The quote card art; onboarding draws its sample quote with it too.
// `className` places it and makes it a column where the line should sit low.
export function QuoteArtwork({
  text,
  attribution,
  compact,
  className,
}: {
  text: string;
  attribution: string;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div className={cx("overflow-hidden bg-surface", className)} aria-hidden="true">
      <span
        className={cx(
          "flex-none font-[family-name:Georgia,serif] text-[#c4ba8c]",
          compact ? "h-10 text-[56px]/[40px]" : "h-[58px] text-[110px]/[100px]",
        )}
      >
        “
      </span>
      <p
        className={cx(
          "m-0 overflow-hidden font-sans tracking-[-0.02em] wrap-break-word text-[#d0c68f]",
          compact ? "line-clamp-3 text-[15px]/[128%]" : "line-clamp-10 text-[18px]/[128%]",
        )}
      >
        {text}
      </p>
      {attribution && (
        <>
          <span className="mt-auto h-px w-[120px] flex-none self-end bg-[#81764c]" />
          <span className="mt-2.5 max-w-full flex-none self-end overflow-hidden font-mono text-[10px]/[12px] text-ellipsis whitespace-nowrap text-[#b3ad8d] opacity-85">
            {attribution}
          </span>
        </>
      )}
    </div>
  );
}
