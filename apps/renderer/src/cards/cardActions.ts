import type { ContextMenuItem } from "@inkling/contracts/desktop";
import type { useNavigate } from "@tanstack/react-router";
import { desktop } from "../desktop.ts";
import { hostname } from "../library/assets.ts";
import type { CardView } from "../library/cardModel.ts";
import { libraryClient } from "../library/connection.ts";
import { errorMessage } from "../library/errors.ts";
import { selectCard } from "../library/selection.ts";
import { setInSpace, spacesStore } from "../library/spaces.ts";
import { showWrittenCard } from "../library/writes.ts";
import { showContextMenu } from "../menu/contextMenu.tsx";
import { dismissActionError, reportActionError } from "./actionError.ts";

type Navigate = ReturnType<typeof useNavigate>;

export function openItem(view: CardView, navigate: Navigate) {
  selectCard(view.id);
  void navigate({ to: "/item/$id", params: { id: view.id } });
}

export function openReader(view: CardView, navigate: Navigate) {
  selectCard(view.id);
  void navigate({ to: "/item/$id/read", params: { id: view.id } });
}

async function run(failure: string, action: () => Promise<unknown>) {
  try {
    await action();
    dismissActionError();
  } catch (error) {
    reportActionError(`${failure}: ${errorMessage(error)}`);
  }
}

export const setArchived = (id: string, archived: boolean) =>
  run(archived ? "Couldn’t archive this" : "Couldn’t restore this", async () =>
    showWrittenCard(await (await libraryClient()).setArchived({ id, archived })),
  );

/** Deleting is the one action that cannot be undone, so it always asks first. */
export async function deleteForever(view: CardView) {
  const options = {
    message: `Delete “${view.title}” for good?`,
    detail: "It leaves every Space, and its files are removed from the library.",
    confirmLabel: "Delete",
    destructive: true,
  };
  const confirmed = desktop
    ? await desktop.confirm(options)
    : window.confirm(`${options.message}\n\n${options.detail}`);
  if (confirmed)
    await run("Couldn’t delete this", async () =>
      (await libraryClient()).deleteItem({ id: view.id }),
    );
}

/** The card's context menu, with the same actions as the old in-app one plus Space filing. */
export async function openCardMenu(
  view: CardView,
  at: { x: number; y: number },
  navigate: Navigate,
) {
  const items: ContextMenuItem[] = [];
  const actions = new Map<string, () => unknown>();
  const add = (id: string, label: string, action: () => unknown, destructive = false) => {
    items.push({ type: "item", id, label, destructive });
    actions.set(id, action);
  };
  const separate = () => {
    if (items.length > 0 && items.at(-1)?.type !== "separator") items.push({ type: "separator" });
  };

  if (view.archived) {
    add("restore", "Restore to library", () => setArchived(view.id, false));
    separate();
    add("delete", "Delete permanently", () => deleteForever(view), true);
  } else {
    add("open", "Open", () => openItem(view, navigate));
    if (view.hasArticleContent) add("read", "Read", () => openReader(view, navigate));
    if (view.webUrl) {
      const url = view.webUrl;
      add("original", `Open ${hostname(url) ?? "original"}`, () =>
        desktop ? desktop.openExternal(url) : window.open(url, "_blank", "noopener,noreferrer"),
      );
      add("copy", "Copy link", () =>
        navigator.clipboard
          .writeText(url)
          .catch(() => reportActionError("Couldn’t copy the link.")),
      );
    }
    if (desktop) {
      const bridge = desktop;
      add("folder", "Show in folder", () => bridge.showItemInFolder(view.id));
    }
    const regular = spacesStore.get().spaces.filter((space) => space.kind === "regular");
    if (regular.length > 0) {
      const filed = new Set(
        await libraryClient()
          .then((client) => client.itemSpaces({ itemId: view.id }))
          .catch(() => [] as readonly string[]),
      );
      separate();
      for (const space of regular) {
        const isFiled = filed.has(space.id);
        add(
          `space:${space.id}`,
          isFiled ? `Remove from ${space.name}` : `Add to ${space.name}`,
          () => setInSpace(space.id, view.id, !isFiled),
        );
      }
    }
    separate();
    add("archive", "Archive", () => setArchived(view.id, true));
  }

  const chosen = await showContextMenu(items, at);
  const action = chosen ? actions.get(chosen) : undefined;
  if (action) await action();
}
