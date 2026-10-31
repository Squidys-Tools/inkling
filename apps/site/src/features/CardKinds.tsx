import * as stylex from "@stylexjs/stylex";
import { CardFace } from "../../../renderer/src/cards/CardFace.tsx";
import type { ItemKind } from "../../../renderer/src/library/cardModel.ts";
import { demoViews } from "../home/demoLibrary.ts";
import { type } from "../parts/type.ts";

const kinds: { kind: ItemKind; id?: string; caption: string }[] = [
  {
    kind: "Article",
    id: "preview-article-image",
    caption: "Articles keep a clean copy to read, without the ads and pop-ups.",
  },
  { kind: "Image", caption: "Images and screenshots show as themselves, in their own shape." },
  { kind: "Quote", caption: "Quotes keep who said them and where you found them." },
  { kind: "Note", caption: "Notes are Markdown, with a Focus Mode for longer writing." },
  { kind: "Post", caption: "Posts from X keep their author, date and text." },
  { kind: "Video", caption: "YouTube and Vimeo links play inside inkling." },
  { kind: "PDF", caption: "PDFs open in a page viewer, and scanned pages get read too." },
  { kind: "File", caption: "Anything else is kept as a file, with its name and size." },
];

const ignore = () => {};

export function CardKinds() {
  const shown = kinds.flatMap((entry) => {
    const view = demoViews.find((candidate) =>
      entry.id ? candidate.id === entry.id : candidate.kind === entry.kind,
    );
    return view ? [{ ...entry, view }] : [];
  });
  return (
    <div {...stylex.props(styles.grid)}>
      {shown.map(({ kind, caption, view }, index) => (
        <figure key={kind} {...stylex.props(styles.figure)}>
          <div inert>
            <CardFace
              view={view}
              index={index}
              list={false}
              selected={false}
              processing={undefined}
              onOpen={ignore}
              onRead={ignore}
              onMenu={ignore}
            />
          </div>
          <figcaption {...stylex.props(styles.caption)}>
            <span {...stylex.props(type.subheading)}>{kind}</span>
            <span {...stylex.props(type.small)}>{caption}</span>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

const styles = stylex.create({
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
    gap: "40px 16px",
    alignItems: "start",
  },
  figure: { display: "flex", flexDirection: "column", gap: "8px", margin: 0 },
  caption: { display: "flex", flexDirection: "column", gap: "6px" },
});
