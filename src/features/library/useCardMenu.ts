import {
  Archive01Icon,
  BookOpen01Icon,
  Copy01Icon,
  Folder01Icon,
  LinkSquare02Icon,
} from "@hugeicons/core-free-icons";
import { useCallback, useMemo, useState } from "react";
import { toast } from "notch-toast";
import type { ContextMenuEntry } from "../../components/ContextMenu/ContextMenu";
import type { LibraryItem } from "../../lib/types";
import { showItemInFolderFromOverlay } from "../item-view/useItemDetails";

type CardMenuOptions = {
  canUseDesktopBackend: boolean;
  openReader: (item: LibraryItem) => Promise<void>;
  forgetItem: (item: LibraryItem) => Promise<void>;
};

export function useCardMenu({ canUseDesktopBackend, openReader, forgetItem }: CardMenuOptions) {
  const [cardMenu, setCardMenu] = useState<{
    item: LibraryItem;
    card: HTMLElement;
    x: number;
    y: number;
  } | null>(null);
  const closeCardMenu = useCallback(() => setCardMenu(null), []);
  const openCardMenu = useCallback((item: LibraryItem, event: React.MouseEvent<HTMLElement>) => {
    event.preventDefault();
    const card = event.currentTarget;
    // The keyboard menu key reports no pointer, so anchor to the card instead.
    const fromKeyboard = event.clientX === 0 && event.clientY === 0;
    const rect = card.getBoundingClientRect();
    setCardMenu({
      item,
      card,
      x: fromKeyboard ? rect.left + 16 : event.clientX,
      y: fromKeyboard ? rect.top + 16 : event.clientY,
    });
  }, []);
  const cardMenuEntries = useMemo<ContextMenuEntry[]>(() => {
    if (!cardMenu) return [];
    const { item } = cardMenu;
    // Only web links: seeded and file items carry local paths here.
    const sourceUrl = item.sourceUrl?.match(/^https?:\/\//u) ? item.sourceUrl : undefined;
    const entries: ContextMenuEntry[] = [];
    if (item.articleHtml || item.hasArticleContent) {
      entries.push({ label: "Read", icon: BookOpen01Icon, onSelect: () => void openReader(item) });
    }
    if (sourceUrl) {
      let host = "original";
      try {
        host = new URL(sourceUrl).hostname.replace(/^www\./u, "");
      } catch {}
      entries.push(
        {
          label: `Open ${host}`,
          icon: LinkSquare02Icon,
          onSelect: () => window.open(sourceUrl, "_blank", "noopener,noreferrer"),
        },
        {
          label: "Copy link",
          icon: Copy01Icon,
          onSelect: () =>
            void navigator.clipboard.writeText(sourceUrl).then(
              () => toast("Link copied", { duration: 2000 }),
              () => toast.error("Could not copy the link", { duration: 5000 }),
            ),
        },
      );
    }
    if (canUseDesktopBackend) {
      entries.push({
        label: "Show in folder",
        icon: Folder01Icon,
        onSelect: () => showItemInFolderFromOverlay(item),
      });
    }
    entries.push({
      label: "Archive",
      icon: Archive01Icon,
      onSelect: () => void forgetItem(item),
    });
    return entries;
  }, [canUseDesktopBackend, cardMenu, forgetItem, openReader]);

  return { cardMenu, closeCardMenu, openCardMenu, cardMenuEntries };
}
