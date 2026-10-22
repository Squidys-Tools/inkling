import { Bookmark01Icon, Cancel01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ReactNode, RefObject } from "react";
import { AnimatedCount } from "../../components/AnimatedCount";
import { LiveMascotSearchEyes } from "../../components/mascot/mascotStore";
import { Button } from "../../ui/Button";
import { SearchField } from "../../ui/SearchField";
import { Surface } from "../../ui/Surface";

export function CaptureBar({
  ref,
  leading,
  showSearch,
  searchRef,
  view,
  query,
  isSearchFocused,
  onSearchFocusChange,
  onQueryChange,
  onClearQuery,
  showFilterRow,
  resultCount,
  onSaveSearch,
  captureError,
}: {
  ref: RefObject<HTMLElement | null>;
  leading: ReactNode;
  showSearch: boolean;
  searchRef: RefObject<HTMLInputElement | null>;
  view: string;
  query: string;
  isSearchFocused: boolean;
  onSearchFocusChange: (focused: boolean) => void;
  onQueryChange: (query: string) => void;
  onClearQuery: () => void;
  showFilterRow: boolean;
  resultCount: number;
  onSaveSearch: () => void;
  captureError: string | null;
}) {
  const trimmedQuery = query.trim();
  return (
    // The bar passes pointer events through its empty space to the grid below.
    <section
      className="capture-bar relative z-2 flex h-[52px] flex-none items-center gap-2 pointer-events-none [&>*]:pointer-events-auto"
      ref={ref}
      aria-label="Capture and search"
    >
      {leading}
      {showSearch && (
        <SearchField
          ref={searchRef}
          expanded={isSearchFocused}
          rest={
            <>
              <HugeiconsIcon icon={Search01Icon} size={14} />
              {view}
            </>
          }
          adornment={
            <LiveMascotSearchEyes
              size={22}
              className={query ? "animate-mascot-bob motion-reduce:animate-none" : undefined}
            />
          }
          hint="esc to close"
          value={query}
          onFocus={() => onSearchFocusChange(true)}
          onBlur={() => onSearchFocusChange(false)}
          onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            onClearQuery();
            event.currentTarget.blur();
          }}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search your mind"
          aria-label="Search your mind"
        />
      )}
      {(showFilterRow || captureError) && (
        <div className="absolute inset-x-0 top-full flex flex-col pointer-events-none!">
          {showFilterRow && (
            <div className="flex h-11 items-center justify-between gap-3 pb-1.5">
              {trimmedQuery && (
                <Surface
                  liquid
                  className="flex min-w-0 flex-[0_1_auto] items-center gap-[7px] h-[30px] pr-2 pl-2.5 rounded-[999px] pointer-events-auto"
                >
                  <span className="min-w-0 overflow-hidden font-body text-[13px]/4 font-medium text-ellipsis whitespace-nowrap text-ink">
                    {trimmedQuery}
                  </span>
                  <Button
                    className="grid size-4 flex-none place-items-center rounded-[999px] text-muted cursor-pointer hover:text-ink"
                    aria-label="Clear search"
                    data-tooltip="Clear search"
                    onClick={onClearQuery}
                  >
                    <HugeiconsIcon icon={Cancel01Icon} size={13} />
                  </Button>
                </Surface>
              )}
              <div className="flex flex-none items-center gap-3 font-mono text-[12px]/4 whitespace-nowrap text-muted">
                <AnimatedCount className="result-count" value={resultCount} />
                {` ${resultCount === 1 ? "result" : "results"}`}
                {trimmedQuery ? (
                  <Button
                    className="flex items-center gap-1.5 font-body text-[12px] text-accent cursor-pointer pointer-events-auto hover:text-[#f08a5a]"
                    onClick={onSaveSearch}
                  >
                    <HugeiconsIcon icon={Bookmark01Icon} size={13} /> Save as Space
                  </Button>
                ) : null}
              </div>
            </div>
          )}
          {captureError && (
            <Surface
              liquid
              render={<p />}
              className="mt-2 mb-0 mx-0 self-start rounded-[999px] px-3 py-1.5 text-[12px] whitespace-nowrap text-[#d07055] pointer-events-auto"
            >
              Couldn’t save this yet: {captureError}
            </Surface>
          )}
        </div>
      )}
    </section>
  );
}
