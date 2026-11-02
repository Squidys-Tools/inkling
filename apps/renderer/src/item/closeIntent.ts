/** One explicit Close/Escape per history entry, before a delayed exit traverses history. */
export function createCloseIntent() {
  let closing: string | null = null;
  return (entry: string) => {
    if (closing === entry) return false;
    closing = entry;
    return true;
  };
}
