type Carried = Pick<DataTransfer, "types" | "files" | "getData" | "setData" | "dropEffect">;

const carried = (event: Event) =>
  "dataTransfer" in event ? (event.dataTransfer as Carried | null) : null;

// Stamped on every drag that starts in this window, and read back when it lands.
const ownDrag = "application/x-inkling-drag";

/**
 * Dropping a file anywhere must never navigate the window to it, so every drag is taken here,
 * and only the library accepts what is dropped. A drag that began inside the window (a link,
 * an image, selected text) is the app's own content, never a capture.
 */
export function watchDrops(
  target: EventTarget,
  libraryShown: boolean,
  hint: (dragging: boolean) => void,
  save: { files: (files: File[]) => void; text: (text: string) => void },
) {
  let depth = 0;
  const accepts = (data: Carried | null): data is Carried =>
    libraryShown && data !== null && !data.types.includes(ownDrag);

  const onDragStart = (event: Event) => carried(event)?.setData(ownDrag, "1");
  const onDragEnter = (event: Event) => {
    event.preventDefault();
    depth += 1;
    const data = carried(event);
    if (accepts(data) && (data.types.includes("Files") || data.types.includes("text/uri-list")))
      hint(true);
  };
  const onDragOver = (event: Event) => {
    event.preventDefault();
    const data = carried(event);
    if (data) data.dropEffect = accepts(data) ? "copy" : "none";
  };
  const onDragLeave = () => {
    depth = Math.max(0, depth - 1);
    if (depth === 0) hint(false);
  };
  const onDrop = (event: Event) => {
    event.preventDefault();
    depth = 0;
    hint(false);
    const data = carried(event);
    if (!accepts(data)) return;
    const files = [...data.files];
    if (files.length > 0) {
      save.files(files);
      return;
    }
    const dropped = (data.getData("text/uri-list") || data.getData("text/plain"))
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .find((line) => line && !line.startsWith("#"));
    if (dropped) save.text(dropped);
  };

  const listeners = [
    ["dragstart", onDragStart],
    ["dragenter", onDragEnter],
    ["dragover", onDragOver],
    ["dragleave", onDragLeave],
    ["drop", onDrop],
  ] as const;
  for (const [type, listener] of listeners) target.addEventListener(type, listener);
  return () => {
    for (const [type, listener] of listeners) target.removeEventListener(type, listener);
  };
}
