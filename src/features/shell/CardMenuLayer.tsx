import type { RefObject } from "react";
import { ContextMenu } from "../../components/ContextMenu/ContextMenu";
import type { useCardMenu } from "../library/useCardMenu";

export function CardMenuLayer({
  ref,
  menu: { cardMenu, cardMenuEntries, closeCardMenu },
}: {
  ref: RefObject<HTMLDivElement | null>;
  menu: ReturnType<typeof useCardMenu>;
}) {
  return (
    <div ref={ref}>
      {cardMenu && (
        <ContextMenu
          key={`${cardMenu.item.id}:${cardMenu.x},${cardMenu.y}`}
          x={cardMenu.x}
          y={cardMenu.y}
          label={cardMenu.item.title}
          entries={cardMenuEntries}
          returnFocus={cardMenu.card}
          container={ref}
          onClose={closeCardMenu}
        />
      )}
    </div>
  );
}
