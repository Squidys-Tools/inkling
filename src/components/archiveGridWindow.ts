export type ArchiveGridWindow = {
  firstIndex: number;
  endIndex: number;
  paddingTop: number;
  paddingBottom: number;
};

// Same column count CSS `repeat(auto-fill, <tile>)` picks for this width.
export function archiveColumnCount(width: number, tileWidth: number, columnGap: number): number {
  if (!(width > 0)) return 1;
  return Math.max(1, Math.floor((width + columnGap) / (tileWidth + columnGap)));
}

// Rows are fixed height, so the rendered slice is a run of whole rows. Spacers
// hold the scroll height of the unmounted rows above and below it.
export function archiveGridWindow({
  itemCount,
  columns,
  rowHeight,
  rowGap,
  scrollTop,
  viewportHeight,
  overscanRows,
}: {
  itemCount: number;
  columns: number;
  rowHeight: number;
  rowGap: number;
  scrollTop: number;
  viewportHeight: number;
  overscanRows: number;
}): ArchiveGridWindow {
  const rowCount = Math.ceil(itemCount / columns);
  if (rowCount === 0) return { firstIndex: 0, endIndex: 0, paddingTop: 0, paddingBottom: 0 };

  const rowPitch = rowHeight + rowGap;
  const top = Math.max(0, scrollTop);
  const bottom = top + Math.max(0, viewportHeight);
  const firstRow = Math.min(Math.max(Math.floor(top / rowPitch) - overscanRows, 0), rowCount - 1);
  const endRow = Math.min(
    Math.max(Math.floor(bottom / rowPitch) + 1 + overscanRows, firstRow + 1),
    rowCount,
  );

  return {
    firstIndex: firstRow * columns,
    endIndex: Math.min(itemCount, endRow * columns),
    paddingTop: firstRow * rowPitch,
    paddingBottom: (rowCount - endRow) * rowPitch,
  };
}
