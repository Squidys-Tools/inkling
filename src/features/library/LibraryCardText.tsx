import {
  AlertCircleIcon,
  ArrowUpRight01Icon,
  Loading01Icon,
  PlayIcon,
  RotateCwIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { KindIcon } from "../../components/ItemMedia";
import type { LibraryItem } from "../../lib/types";
import { RETRY_BUTTON } from "../../ui/Button";
import { cx } from "../../ui/cx";
import { cardRects } from "../item-view/overlayMotion";
import type { LibraryCardContext } from "./LibraryCard";
import { quoteAttribution, type CardKind } from "./LibraryCardMedia";

const CARD_ACTION =
  "inline-flex cursor-pointer items-center gap-1 rounded-full border border-border bg-transparent px-[9px] py-1 font-body text-[10px] leading-[normal] font-medium tracking-[0.02em] text-muted transition-[color,border-color,background-color] duration-150 ease-[ease] enabled:hover:border-[#4a4842] enabled:hover:bg-surface enabled:hover:text-ink disabled:cursor-default disabled:opacity-45";

// The kicker, title, description, job status and source row under a card's media.
export function LibraryCardText({
  item,
  kind,
  context,
}: {
  item: LibraryItem;
  kind: CardKind;
  context: LibraryCardContext;
}) {
  const list = context.layout === "list";
  // A grid article is the one grid card that shows its text, over a strip.
  const gridArticle = context.layout === "grid" && kind === "article";
  const showText = list || gridArticle;
  const isQuote = item.kind === "Quote";
  const canOpenReader = Boolean(item.articleHtml || item.hasArticleContent);
  const failedJob = item.processing?.failedJob;
  const textColor = item.featured
    ? "text-muted"
    : kind === "article"
      ? "text-[#7a7268]"
      : kind === "note"
        ? "text-[#9fb1ae]"
        : "text-muted";
  const kickerColor = item.featured
    ? "text-muted"
    : kind === "article"
      ? "text-[#7a7268]"
      : kind === "note"
        ? "text-[#9fb9b7]"
        : kind === "quote"
          ? "text-[#b3ad8d]"
          : "text-muted";

  return (
    <div
      className={cx(
        !showText && "hidden",
        gridArticle
          ? "flex min-h-0 flex-[1_1_auto] flex-col justify-between p-4"
          : "pt-[17px] px-[18px] pb-(--spacing-component)",
        list && "flex min-h-0 flex-col after:order-1 after:flex-[1_0_14px] after:content-['']",
        (isQuote || item.featured) && "bg-surface",
        isQuote && "border-t border-[rgba(255,255,255,0.04)]",
      )}
    >
      <div
        className={cx(
          "flex items-center justify-between gap-3 font-mono text-[10px]/[1.2] tracking-[0.08em] uppercase",
          kickerColor,
          gridArticle && "hidden",
        )}
      >
        <span className="flex items-center gap-1.5">
          <KindIcon kind={item.kind} />
          {item.kind}
        </span>
        <span>{item.date}</span>
      </div>
      <h2
        className={cx(
          gridArticle ? "m-0" : "mx-0 mt-[13px] mb-[7px]",
          isQuote
            ? "font-sans text-[16px]/[1.28] font-normal tracking-[-0.01em]"
            : kind === "article"
              ? "font-body text-[16px]/[1.3] font-semibold tracking-[-0.01em]"
              : cx(
                  "font-sans leading-[1.22] font-semibold",
                  kind === "note"
                    ? "text-[19px] tracking-[-0.025em]"
                    : item.featured
                      ? "text-[22px] tracking-[-0.02em]"
                      : "text-[17px] tracking-[-0.02em]",
                ),
          kind === "article" ? "text-[#1a1714]" : item.featured && "text-ink",
        )}
      >
        {isQuote ? (/^["“]/u.test(item.title.trim()) ? item.title : `“${item.title}”`) : item.title}
      </h2>
      <p
        className={cx(
          "m-0 max-w-[56ch]",
          isQuote
            ? cx("font-mono text-[10px]/[1.45] text-muted", list ? "min-h-[37px]" : "min-h-0")
            : cx("font-sans text-[12px]/[1.52]", textColor, list ? "min-h-0" : "min-h-[37px]"),
          gridArticle && "hidden",
        )}
      >
        {isQuote ? quoteAttribution(item.description) : item.description}
      </p>
      {item.processing?.active && (
        <div
          className={cx(
            "mt-[13px] flex items-center gap-[7px] font-body text-[10px]/[1.35] text-green [&_svg]:animate-[spin_1.2s_linear_infinite] [&>span:nth-child(3)]:ml-auto [&>span:nth-child(3)]:text-muted",
            gridArticle && "hidden",
          )}
          role="status"
        >
          <HugeiconsIcon icon={Loading01Icon} size={13} />
          <span>{item.processing.message ?? "Processing"}</span>
          {item.processing.progressTotal != null && (
            <span>
              {item.processing.progressCurrent}/{item.processing.progressTotal}
            </span>
          )}
        </div>
      )}
      {failedJob && (
        <div
          className={cx(
            "mt-[13px] flex items-start gap-[7px] font-body text-[10px]/[1.35] text-[#d07055] [&_svg]:animate-[spin_1.2s_linear_infinite] [&>span:nth-child(3)]:ml-auto [&>span:nth-child(3)]:text-muted",
            gridArticle && "hidden",
          )}
          role="alert"
        >
          <HugeiconsIcon icon={AlertCircleIcon} size={13} />
          <span>{failedJob.errorMessage ?? "Processing failed"}</span>
          <button
            type="button"
            className={RETRY_BUTTON}
            onClick={(event) => {
              event.stopPropagation();
              void context.onRetryJob(failedJob.id);
            }}
          >
            <HugeiconsIcon icon={RotateCwIcon} size={12} /> Try again
          </button>
        </div>
      )}
      <div
        className={cx(
          "flex items-center justify-between gap-2.5 text-muted",
          gridArticle
            ? "mt-0 pt-0"
            : cx(
                "border-t pt-[11px]",
                list ? "order-2 mt-0" : "mt-[18px]",
                kind === "article" ? "border-[rgba(26,23,20,0.12)]" : "border-border",
              ),
        )}
      >
        <span
          className={cx(
            "overflow-hidden font-mono text-[11px]/[1.2] text-ellipsis whitespace-nowrap",
            kind === "article" && "text-[#7a7268]",
          )}
        >
          {item.readingMinutes ? `${item.source} · ${item.readingMinutes} min` : item.source}
        </span>
        {item.kind === "Article" && (
          <button
            type="button"
            className={CARD_ACTION}
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
            className={CARD_ACTION}
            onClick={(event) => {
              event.stopPropagation();
              const card = event.currentTarget.closest<HTMLElement>(".library-card");
              context.onSelectItem(item, card ? cardRects(card) : undefined);
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
  );
}
