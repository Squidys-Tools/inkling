export type CaptureSpace = { id: string; kind: "smart" | "regular" } | null;

/** The destination is bound before asynchronous work starts; Smart Spaces stay query-driven. */
export async function finishSpaceCapture(
  itemId: string,
  destination: CaptureSpace,
  actions: {
    add: (spaceId: string, itemId: string) => Promise<void>;
    reload: (spaceId: string) => void;
  },
) {
  if (destination?.kind !== "regular") return null;
  try {
    await actions.add(destination.id, itemId);
    actions.reload(destination.id);
    return null;
  } catch {
    return "Saved in Everything, but couldn’t add it to the selected Space. Try filing it again.";
  }
}
