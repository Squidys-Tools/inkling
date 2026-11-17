import * as stylex from "@stylexjs/stylex";
import { useNavigate } from "@tanstack/react-router";
import { desktop } from "../desktop.ts";
import { reportActionError } from "./actionError.ts";
import { useCard } from "../library/cards.ts";
import { type CardView, cardView } from "../library/cardModel.ts";
import { useProcessing } from "../library/jobs.ts";
import { useLabelClock } from "../library/labelClock.ts";
import { menuPoint } from "../menu/contextMenu.tsx";
import { ArchivedControls } from "./ArchivedControls.tsx";
import { openCardMenu, openItem, openReader, retryProcessing } from "./cardActions.ts";
import { CardFace } from "./CardFace.tsx";

/** One cell of the masonry grid. It reads its card by id, so a change re-renders this cell only. */
export function GridCell({ id, index }: { id: string; index: number }) {
  const card = useCard(id);
  const clock = useLabelClock();
  if (!card) return <div {...stylex.props(styles.gone)} />;
  const view = cardView(card, clock);
  return <LibraryCard view={view} index={index} />;
}

function LibraryCard({ view, index }: { view: CardView; index: number }) {
  const navigate = useNavigate();
  const processing = useProcessing(view.id);
  return (
    <CardFace
      view={view}
      index={index}
      processing={processing}
      dimmed={view.archived}
      onOpen={() => openItem(view, navigate)}
      onRead={() => openReader(view, navigate)}
      onMenu={(event) => {
        event.preventDefault();
        void openCardMenu(view, menuPoint(event), navigate);
      }}
      onRetry={retryProcessing}
      onDragStart={
        desktop
          ? (event) => {
              event.preventDefault();
              void desktop
                ?.startItemDrag(view.id)
                .catch(() => reportActionError("Couldn’t drag this item out."));
            }
          : undefined
      }
    >
      {view.archived && <ArchivedControls view={view} />}
    </CardFace>
  );
}

const styles = stylex.create({
  gone: { height: "1px" },
});
