import { pdfPreviewTitle } from "../../components/ItemMedia";
import type { LibraryItem } from "../../lib/types";
import { cx } from "../../ui/cx";

export function itemViewTitle(item: LibraryItem) {
  return item.kind === "PDF" ? pdfPreviewTitle(item.title) || item.title : item.title;
}

export function ItemTitle({ item, compact }: { item: LibraryItem; compact?: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      <h2
        className={cx(
          "m-0 font-body font-semibold text-ink wrap-anywhere",
          compact
            ? "text-[20px]/[26px] tracking-[-0.015em]"
            : "text-[26px]/[30px] tracking-[-0.025em]",
        )}
      >
        {itemViewTitle(item)}
      </h2>
      {item.palette && item.palette.length > 0 && (
        <div className="flex gap-1.5" aria-hidden="true">
          {item.palette.map((color) => (
            <span
              key={color}
              className="size-[22px] flex-none rounded-[6px] shadow-[inset_0_0_0_1px_rgba(229,221,210,0.14)]"
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
