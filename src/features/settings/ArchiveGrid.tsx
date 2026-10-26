import { useLayoutEffect, useRef, useState, type ComponentType, type UIEvent } from "react";
import { archiveColumnCount, archiveGridWindow } from "./archiveGridWindow";
import { SETTINGS_SCROLL } from "./SettingsPanel";

// Mirrors the archive tile in LibraryCard.tsx: a 132px media box plus a 42px
// caption (174px), with 12px of slot padding under it, so each row is 186px and
// rows are 22px apart. A change there needs the same change here, or the
// spacers drift from the rendered rows.
const TILE_WIDTH = 179;
const COLUMN_GAP = 14;
const ROW_HEIGHT = 186;
const ROW_GAP = 22;
// Keyboard focus only reaches mounted cards, so this is how far Tab can travel
// past the visible rows.
const OVERSCAN_ROWS = 3;

type ArchiveGridProps<Data extends { id: string | number }, Context> = {
  data: Data[];
  context: Context;
  ItemContent: ComponentType<{ data: Data; index: number; context: Context }>;
};

// Mounts only the rows near the scroll position. The grid stays a CSS grid, so
// tiles keep their size, the row-major DOM and tab order, and the spacing.
export function ArchiveGrid<Data extends { id: string | number }, Context>({
  data,
  context,
  ItemContent,
}: ArchiveGridProps<Data, Context>) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [scrollTop, setScrollTop] = useState(0);

  // Measured before paint so the first frame is not a single column.
  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    const grid = gridRef.current;
    if (!scroller || !grid) return;
    // The grid has no horizontal padding, so its clientWidth is the content width
    // the columns fill.
    const measure = () => setViewport({ width: grid.clientWidth, height: scroller.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, []);

  const columns = archiveColumnCount(viewport.width, TILE_WIDTH, COLUMN_GAP);
  const windowed = archiveGridWindow({
    itemCount: data.length,
    columns,
    rowHeight: ROW_HEIGHT,
    rowGap: ROW_GAP,
    scrollTop,
    viewportHeight: viewport.height,
    overscanRows: OVERSCAN_ROWS,
  });

  return (
    <div
      className={SETTINGS_SCROLL}
      ref={scrollRef}
      onScroll={(event: UIEvent<HTMLDivElement>) => setScrollTop(event.currentTarget.scrollTop)}
    >
      <div
        className="grid justify-start gap-x-3.5 gap-y-[22px]"
        ref={gridRef}
        style={{
          gridTemplateColumns: `repeat(${columns}, ${TILE_WIDTH}px)`,
          paddingTop: windowed.paddingTop,
          paddingBottom: windowed.paddingBottom,
        }}
      >
        {data.slice(windowed.firstIndex, windowed.endIndex).map((item, offset) => (
          <ItemContent
            key={String(item.id)}
            data={item}
            index={windowed.firstIndex + offset}
            context={context}
          />
        ))}
      </div>
    </div>
  );
}
