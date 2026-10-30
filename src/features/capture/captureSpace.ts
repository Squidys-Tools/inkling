export type CaptureSpace = { id: string; kind: "smart" | "regular" } | null;

// Bind capture to its starting destination. Smart Spaces stay query-driven.
export async function finishSpaceCapture(
  itemId: string,
  destination: CaptureSpace,
  actions: {
    addRegular: (spaceId: string, itemId: string) => Promise<void>;
    currentSpaceId: () => string | null;
    append: () => void;
    reload: () => void;
  },
) {
  if (destination?.kind === "regular") {
    try {
      await actions.addRegular(destination.id, itemId);
    } catch (cause) {
      actions.reload();
      throw Object.assign(
        new Error(
          "Saved in Everything, but couldn’t add it to the selected Space. Try filing it again.",
        ),
        { cause },
      );
    }
  }
  if (destination || actions.currentSpaceId() !== null) actions.reload();
  else actions.append();
}
