import * as stylex from "@stylexjs/stylex";
import { color } from "@inkling/ui/tokens.stylex";
import { createFileRoute } from "@tanstack/react-router";
import { seedItems } from "../../../renderer/src/library/preview/site/seed-data.ts";
import { page } from "../layout/page.ts";
import { seo } from "../layout/seo.ts";
import { action, type } from "../parts/type.ts";

export const Route = createFileRoute("/credits")({
  head: () =>
    seo({
      title: "Image credits · inkling",
      description: "Who took the photos in inkling's demo library and on this site.",
      path: "/credits",
    }),
  component: Credits,
});

const photos = seedItems.flatMap(({ title, credit }) => (credit ? [{ title, ...credit }] : []));

function Credits() {
  return (
    <main {...stylex.props(page.column, styles.main)}>
      <h1 {...stylex.props(type.display)}>Image credits</h1>
      <p {...stylex.props(type.lede, styles.measure)}>
        The photos in the demo library, among them the jellyfish and the bear on the home page, come
        from Unsplash, under the{" "}
        <a href="https://unsplash.com/license" {...stylex.props(action.inline)}>
          Unsplash License
        </a>
        .
      </p>
      <dl {...stylex.props(styles.list)}>
        {photos.map(({ title, author, url }) => (
          <div key={url} {...stylex.props(styles.row)}>
            <dt {...stylex.props(type.body)}>{title}</dt>
            <dd {...stylex.props(styles.author)}>
              <a href={url} {...stylex.props(action.inline)}>
                {author}
              </a>
            </dd>
          </div>
        ))}
      </dl>
    </main>
  );
}

const styles = stylex.create({
  main: { display: "flex", flexDirection: "column", gap: "32px", paddingTop: "72px" },
  measure: { maxWidth: "760px" },
  list: { display: "flex", flexDirection: "column", maxWidth: "760px", margin: 0 },
  row: {
    display: "grid",
    gridTemplateColumns: { default: "1fr auto", "@media (max-width: 560px)": "1fr" },
    gap: "4px 16px",
    paddingBlock: "14px",
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: color.border,
  },
  author: { margin: 0, color: color.inkSoft, fontSize: "17px" },
});
