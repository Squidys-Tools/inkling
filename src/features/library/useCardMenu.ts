import {
  Archive01Icon,
  BookOpen01Icon,
  Copy01Icon,
  Folder01Icon,
  LinkSquare02Icon,
  RotateLeft01Icon,
} from "@hugeicons/core-free-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { ContextMenuEntry } from "../../components/ContextMenu/ContextMenu";
import { listItemSpaceExclusions, type StoredSpace } from "../../lib/libraryApi";
import type { LibraryItem } from "../../lib/types";
import { hostnameForUrl } from "../hostname";
import { revealItemInFolder } from "../item-view/useItemDetails";

type CardMenuOptions = {
  canUseDesktopBackend: boolean;
  openReader: (item: LibraryItem) => Promise<void>;
  forgetItem: (item: LibraryItem) => Promise<void>;
  activeSpace: StoredSpace | null;
  spaces: StoredSpace[];
  localSpaceExclusions: Map<string, Set<string>>;
  changeSpaceItem: (space: StoredSpace, itemId: string, restore: boolean) => Promise<void>;
};

export function useCardMenu({
  canUseDesktopBackend,
  openReader,
  forgetItem,
  activeSpace,
  spaces,
  localSpaceExclusions,
  changeSpaceItem,
}: CardMenuOptions) {
  const [cardMenu, setCardMenu] = useState<{
    item: LibraryItem;
    card: HTMLElement;
    x: number;
    y: number;
  } | null>(null);
  const [exclusions, setExclusions] = useState<{ itemId: string; ids: string[] } | null>(null);
  const closeCardMenu = useCallback(() => setCardMenu(null), []);
  const openCardMenu = useCallback(
    (
      item: LibraryItem,
      event: React.MouseEvent<HTMLElement> | React.KeyboardEvent<HTMLElement>,
    ) => {
      event.preventDefault();
      const card = event.currentTarget;
      // Keyboard menus have no pointer coordinates, so anchor to the card instead.
      const pointer = "clientX" in event ? { x: event.clientX, y: event.clientY } : null;
      const fromKeyboard = !pointer || (pointer.x === 0 && pointer.y === 0);
      const rect = card.getBoundingClientRect();
      setCardMenu({
        item,
        card,
        x: fromKeyboard ? rect.left + 16 : pointer.x,
        y: fromKeyboard ? rect.top + 16 : pointer.y,
      });
    },
    [],
  );
  useEffect(() => {
    if (!cardMenu || !canUseDesktopBackend) return;
    let cancelled = false;
    const itemId = String(cardMenu.item.id);
    void listItemSpaceExclusions(itemId).then(
      (ids) => {
        if (!cancelled) setExclusions({ itemId, ids });
      },
      () => {
        if (!cancelled) toast.error("Couldn’t load this item’s Space options.");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [cardMenu, canUseDesktopBackend]);
  const cardMenuEntries = useMemo<ContextMenuEntry[]>(() => {
    if (!cardMenu) return [];
    const { item } = cardMenu;
    const itemId = String(item.id);
    const sourceUrl = item.sourceUrl?.match(/^https?:\/\//u) ? item.sourceUrl : undefined;
    const entries: ContextMenuEntry[] = [];
    if (item.articleHtml || item.hasArticleContent)
      entries.push({ label: "Read", icon: BookOpen01Icon, onSelect: () => void openReader(item) });
    if (sourceUrl) {
      entries.push(
        {
          label: `Open ${hostnameForUrl(sourceUrl) ?? "original"}`,
          icon: LinkSquare02Icon,
          onSelect: () => window.open(sourceUrl, "_blank", "noopener,noreferrer"),
        },
        {
          label: "Copy link",
          icon: Copy01Icon,
          onSelect: () =>
            void navigator.clipboard.writeText(sourceUrl).then(
              () => toast("Link copied", { className: "library-toast", duration: 2000 }),
              () => toast.error("Could not copy the link", { closeButton: true }),
            ),
        },
      );
    }
    const restore = async (space: StoredSpace) => {
      try {
        await changeSpaceItem(space, itemId, true);
        toast(
          space.kind === "smart"
            ? `Allowed in “${space.name}” when it matches.`
            : `Added to “${space.name}”.`,
        );
      } catch {
        toast.error("Couldn’t restore this item to the Space.");
      }
    };
    if (activeSpace) {
      const space = activeSpace;
      entries.push({
        label: `Remove from ${space.name}`,
        icon: Folder01Icon,
        onSelect: () => {
          void (async () => {
            try {
              await changeSpaceItem(space, itemId, false);
              toast(`Removed from “${space.name}”. Kept in Everything.`, {
                action: { label: "Undo", onClick: () => void restore(space) },
                duration: 6000,
              });
            } catch {
              toast.error("Couldn’t remove this item from the Space.");
            }
          })();
        },
      });
    }
    const excludedIds = canUseDesktopBackend
      ? exclusions?.itemId === itemId
        ? exclusions.ids
        : []
      : [...localSpaceExclusions].filter(([, ids]) => ids.has(itemId)).map(([id]) => id);
    for (const space of spaces.filter((space) => excludedIds.includes(space.id))) {
      entries.push({
        label: `Allow in ${space.name}`,
        icon: RotateLeft01Icon,
        onSelect: () => void restore(space),
      });
    }
    if (canUseDesktopBackend)
      entries.push({
        label: "Show in folder",
        icon: Folder01Icon,
        onSelect: () => revealItemInFolder(item),
      });
    entries.push({ label: "Archive", icon: Archive01Icon, onSelect: () => void forgetItem(item) });
    return entries;
  }, [
    canUseDesktopBackend,
    cardMenu,
    forgetItem,
    openReader,
    activeSpace,
    spaces,
    exclusions,
    localSpaceExclusions,
    changeSpaceItem,
  ]);
  return { cardMenu, closeCardMenu, openCardMenu, cardMenuEntries };
}
