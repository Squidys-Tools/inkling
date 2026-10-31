import * as stylex from "@stylexjs/stylex";
import { useNavigate } from "@tanstack/react-router";
import { useCard } from "../library/cards.ts";
import { type CardView, cardView } from "../library/cardModel.ts";
import { useProcessing } from "../library/jobs.ts";
import { useLabelClock } from "../library/labelClock.ts";
import { useIsSelected } from "../library/selection.ts";
import { menuPoint } from "../menu/contextMenu.tsx";
import { ArchiveTile } from "./ArchiveTile.tsx";
import { openCardMenu, openItem, openReader } from "./cardActions.ts";
import { CardFace } from "./CardFace.tsx";
import type { CardLayout } from "./CardMedia.tsx";

export type GridContext = { layout: CardLayout };

/** One cell of the masonry grid. It reads its card by id, so a change re-renders this cell only. */
export function GridCell({
  data: id,
  index,
  context,
}: {
  data: string;
  index: number;
  context: GridContext;
}) {
  const card = useCard(id);
  const clock = useLabelClock();
  if (!card) return <div {...stylex.props(styles.gone)} />;
  const view = cardView(card, clock);
  return context.layout === "archive" ? (
    <ArchiveTile view={view} index={index} />
  ) : (
    <LibraryCard view={view} index={index} list={context.layout === "list"} />
  );
}

function LibraryCard({ view, index, list }: { view: CardView; index: number; list: boolean }) {
  const navigate = useNavigate();
  const selected = useIsSelected(view.id);
  const processing = useProcessing(view.id);
  return (
    <CardFace
      view={view}
      index={index}
      list={list}
      selected={selected}
      processing={processing}
      onOpen={() => openItem(view, navigate)}
      onRead={() => openReader(view, navigate)}
      onMenu={(event) => {
        event.preventDefault();
        void openCardMenu(view, menuPoint(event), navigate);
      }}
    />
  );
}

const styles = stylex.create({
  gone: { height: "1px" },
});
