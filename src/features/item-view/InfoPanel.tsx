import {
  AlertCircleIcon,
  BookOpen01Icon,
  FileTextIcon,
  Loading01Icon,
  PlusSignIcon,
  RotateCwIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useLayoutEffect, useRef, useState } from "react";
import type { LibraryItem } from "../../lib/types";
import type { ReaderOrigin } from "../../ReaderView";
import { RETRY_BUTTON } from "../../ui/Button";
import { cx } from "../../ui/cx";
import { SpaceMark } from "../../ui/SpaceMark";
import { ItemTitle } from "./ItemTitle";
import { SearchDetails } from "./SearchDetails";
import type { ItemViewActions, ItemViewSpace } from "./ItemView";

const PROCESSING =
  "mt-[13px] flex gap-[7px] font-body text-[10px]/[1.35] [&_span:last-of-type]:ml-auto [&_span:last-of-type]:text-muted [&>svg]:animate-[spin_1.2s_linear_infinite]";
export const NOTE_BOX =
  "m-0 min-h-[72px] rounded-[10px] border border-border bg-surface px-3 py-[11px] text-[13px]/5 text-ink-soft";
const ACTION_BUTTON =
  "inline-flex h-8 cursor-pointer items-center gap-[7px] rounded-button border border-border bg-surface px-3 text-[12px] text-ink-soft enabled:hover:border-[#3a3531] enabled:hover:text-ink disabled:cursor-default disabled:opacity-50";

export function hostnameForUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./u, "");
  } catch {
    return null;
  }
}

function clickOrigin(event: React.MouseEvent<HTMLElement>): ReaderOrigin {
  const rect = event.currentTarget.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function TagList({
  item,
  memberSpaces,
  onAddTag,
}: {
  item: LibraryItem;
  memberSpaces: ItemViewSpace[];
  onAddTag?: ItemViewActions["onAddTag"];
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [draft, setDraft] = useState("");
  useLayoutEffect(() => {
    if (isAdding) inputRef.current?.focus();
  }, [isAdding]);

  function submit() {
    const clean = draft.trim().replace(/^#+/u, "").toLowerCase();
    if (clean && !item.tags.some((tag) => tag.toLowerCase() === clean)) {
      void onAddTag?.(item, clean);
    }
    setDraft("");
    setIsAdding(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      {memberSpaces.map((space) => (
        <span
          key={space.id}
          className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-full bg-surface-raised pr-2.5 pl-[9px] text-[13px]/4 text-ink"
        >
          <SpaceMark small color={space.color} className="flex-none" />
          {space.name}
        </span>
      ))}
      {item.tags.map((tag) => (
        <span key={tag} className="text-[13px]/4 text-[#a8a096]">
          #{tag}
        </span>
      ))}
      {isAdding ? (
        <input
          ref={inputRef}
          className="w-[110px] rounded-[6px] border border-border bg-canvas px-2 py-1 font-body text-[10px] text-ink outline-none focus:border-accent"
          value={draft}
          placeholder="tag name"
          aria-label="New tag name"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submit();
            } else if (event.key === "Escape") {
              setDraft("");
              setIsAdding(false);
            }
          }}
          onBlur={submit}
        />
      ) : (
        <button
          type="button"
          className="grid size-6 cursor-pointer place-items-center rounded-full border border-dashed border-[#3a3531] bg-transparent text-muted hover:border-[#5a5750] hover:text-ink"
          onClick={() => setIsAdding(true)}
          aria-label="Add a tag"
        >
          <HugeiconsIcon icon={PlusSignIcon} size={11} />
        </button>
      )}
    </div>
  );
}

function DetailRow({ label, children, mono }: { label: string; children: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-[13px] text-muted">{label}</dt>
      <dd
        className={cx(
          "m-0 text-right text-ink-soft wrap-anywhere",
          mono ? "font-mono text-[12px]" : "text-[13px]",
        )}
      >
        {children}
      </dd>
    </div>
  );
}

export function InfoPanel({
  item,
  actions,
  memberSpaces,
  onEditNote,
}: {
  item: LibraryItem;
  actions: ItemViewActions;
  memberSpaces: ItemViewSpace[];
  onEditNote: () => void;
}) {
  const sourceHost = hostnameForUrl(item.sourceUrl);
  const savedDate = item.date.replace(/^saved\s+/iu, "");
  const size =
    item.mediaWidth && item.mediaHeight ? `${item.mediaWidth} × ${item.mediaHeight}` : null;
  const canOpenPdf = item.kind === "PDF" && Boolean(item.fileUrl);
  const canRead = item.kind === "Article" && Boolean(item.articleHtml || item.hasArticleContent);
  const failedJob = item.processing?.failedJob;

  return (
    <>
      {item.kind === "Quote" ? (
        <>
          <blockquote className="mx-0 mt-component mb-2 font-quote text-[22px]/[1.35] italic text-ink">
            “{item.title}”
          </blockquote>
          {item.description && (
            <p className="mx-0 mt-0 mb-2 font-body text-[12px]/[1.5] text-muted">
              — {item.description.replace(/^—\s*/u, "")}
            </p>
          )}
        </>
      ) : (
        <>
          <ItemTitle item={item} />
          {item.kind !== "Note" && item.description && (
            <p className={NOTE_BOX}>{item.description}</p>
          )}
        </>
      )}

      {item.processing?.active && (
        <div className={cx(PROCESSING, "items-center text-green")} role="status">
          <HugeiconsIcon icon={Loading01Icon} size={14} />
          <span>{item.processing.message ?? "Processing"}</span>
          {item.processing.progressTotal != null && (
            <span>
              {item.processing.progressCurrent}/{item.processing.progressTotal}
            </span>
          )}
        </div>
      )}
      {failedJob && (
        <div className={cx(PROCESSING, "items-start text-[#d07055]")} role="alert">
          <HugeiconsIcon icon={AlertCircleIcon} size={14} />
          <span>{failedJob.errorMessage ?? "Processing failed"}</span>
          <button
            type="button"
            className={RETRY_BUTTON}
            onClick={() => void actions.onRetryJob(failedJob.id)}
          >
            <HugeiconsIcon icon={RotateCwIcon} size={12} /> Try again
          </button>
        </div>
      )}

      <TagList key={item.id} item={item} memberSpaces={memberSpaces} onAddTag={actions.onAddTag} />
      <SearchDetails key={`search:${item.id}`} id={String(item.id)} />

      <section>
        <h3 className="mx-0 mt-0 mb-[9px] text-[11px]/[14px] font-medium tracking-[0.08em] text-muted uppercase">
          Details
        </h3>
        <dl className="m-0 flex flex-col gap-[9px] leading-4">
          <DetailRow label="Saved">{savedDate}</DetailRow>
          {(sourceHost || item.source) && (
            <DetailRow label="From">{sourceHost ?? item.source}</DetailRow>
          )}
          {size && (
            <DetailRow label="Size" mono>
              {size}
            </DetailRow>
          )}
        </dl>
      </section>

      {(item.kind === "Note" || canOpenPdf || canRead) && (
        <div className="flex flex-wrap gap-2">
          {item.kind === "Note" && (
            <button type="button" className={ACTION_BUTTON} onClick={onEditNote}>
              Edit note
            </button>
          )}
          {canOpenPdf && (
            <button type="button" className={ACTION_BUTTON} onClick={() => actions.onOpenPdf(item)}>
              <HugeiconsIcon icon={FileTextIcon} size={14} /> Open PDF
            </button>
          )}
          {canRead && (
            <button
              type="button"
              className={ACTION_BUTTON}
              onClick={(event) => actions.onOpenReader(item, clickOrigin(event))}
            >
              <HugeiconsIcon icon={BookOpen01Icon} size={14} /> Read
            </button>
          )}
        </div>
      )}
    </>
  );
}
