import type { ContextMenuItem } from "@inkling/contracts/desktop";
import type { useNavigate } from "@tanstack/react-router";
import { desktop } from "../desktop.ts";
import { prepareItemOpen } from "../item/itemFlight.ts";
import { hostname } from "../library/assets.ts";
import type { CardView } from "../library/cardModel.ts";
import { libraryClient } from "../library/connection.ts";
import { loadScope, shownScope } from "../library/cards.ts";
import { retryJob } from "../library/jobs.ts";
import { errorMessage } from "../library/errors.ts";
import { setInSpace, spacesStore } from "../library/spaces.ts";
import { showWrittenCard } from "../library/writes.ts";
import { showContextMenu } from "../menu/contextMenu.tsx";
import { dismissActionError, reportActionError } from "./actionError.ts";
import { notify } from "../notifications/toasts.ts";

type Navigate = ReturnType<typeof useNavigate>;

export function retryProcessing(jobId: string) {
  retryJob(jobId).then(
    (retried) => {
      if (!retried) reportActionError("That processing job is no longer available to retry.");
    },
    (error: unknown) => reportActionError(`Couldn’t try again: ${errorMessage(error)}`),
  );
}

export function openItem(view: CardView, navigate: Navigate) {
  prepareItemOpen(view.id);
  void navigate({ to: "/item/$id", params: { id: view.id } });
}

export function openReader(view: CardView, navigate: Navigate) {
  void navigate({ to: "/item/$id/read", params: { id: view.id } });
}

async function run(failure: string, action: () => Promise<unknown>) {
  try {
    await action();
    dismissActionError();
    return true;
  } catch (error) {
    reportActionError(`${failure}: ${errorMessage(error)}`);
    return false;
  }
}

export const setArchived = (id: string, archived: boolean) =>
  run(archived ? "Couldn’t archive this" : "Couldn’t restore this", async () => {
    showWrittenCard(await (await libraryClient()).setArchived({ id, archived }));
    notify(archived ? "Archived" : "Restored to library", {
      id: `archive:${id}`,
      action: {
        label: "Undo",
        run: async () => {
          showWrittenCard(await (await libraryClient()).setArchived({ id, archived: !archived }));
        },
      },
    });
  });

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
    await run("Couldn’t delete this", async () => {
      await (await libraryClient()).deleteItem({ id: view.id });
      notify("Deleted permanently");
    });
}

export async function openCardMenu(
  view: CardView,
  at: { x: number; y: number },
  navigate: Navigate,
) {
  const scope = shownScope.get();
  const current =
    scope._tag === "Space" && spacesStore.get().spaces.find((s) => s.id === scope.spaceId);
  const changeSpace = async (spaceId: string, filed: boolean) => {
    if (await setInSpace(spaceId, view.id, filed)) {
      const shown = shownScope.get();
      if (shown._tag === "Space" && shown.spaceId === spaceId) void loadScope(shown);
    }
  };
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
        navigator.clipboard.writeText(url).then(
          () => notify("Link copied", { id: "copy-link" }),
          () => reportActionError("Couldn’t copy the link."),
        ),
      );
    }
    if (desktop) {
      const bridge = desktop;
      if (view.kind === "Image")
        add("copy-image", "Copy image", () =>
          run("Couldn’t copy the image", async () => {
            await bridge.copyItemImage(view.id);
            notify("Image copied", { id: "copy-image" });
          }),
        );
      if (view.hasLocalFile)
        add("folder", "Show in folder", () =>
          run("Couldn’t show this file", () => bridge.showItemInFolder(view.id)),
        );
    }
    if (current) {
      separate();
      add("remove-here", `Remove from ${current.name}`, () => changeSpace(current.id, false));
    }
    const regular = spacesStore.get().spaces.filter((space) => space.kind === "regular");
    if (spacesStore.get().spaces.length > 0) {
      let filed: Set<string>, excluded: Set<string>;
      try {
        const client = await libraryClient();
        const sets = await Promise.all([
          client.itemSpaces({ itemId: view.id }),
          client.itemSpaceExclusions({ itemId: view.id }),
        ]);
        filed = new Set(sets[0]);
        excluded = new Set(sets[1]);
      } catch {
        reportActionError("Couldn’t load this item’s Space options.");
        return;
      }
      for (const space of spacesStore
        .get()
        .spaces.filter((s) => s.kind === "smart" && excluded.has(s.id)))
        add(`allow:${space.id}`, `Allow in ${space.name}`, () => changeSpace(space.id, true));
      separate();
      for (const space of regular) {
        const isFiled = filed.has(space.id);
        add(
          `space:${space.id}`,
          isFiled ? `Remove from ${space.name}` : `Add to ${space.name}`,
          () => changeSpace(space.id, !isFiled),
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
