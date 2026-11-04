import * as stylex from "@stylexjs/stylex";
import { color, radius } from "@inkling/ui/tokens.stylex";
import { createFileRoute } from "@tanstack/react-router";
import { seedItems } from "../../../renderer/src/library/preview/site/seed-data.ts";
import { page } from "../layout/page.ts";
import { seo } from "../layout/seo.ts";
import { action, type } from "../parts/type.ts";

export const Route = createFileRoute("/credits")({
  head: () =>
    seo({
      title: "Image credits · inkling",
      description:
        "The photographs on the inkling site and in its demo library, and the photographers who took them.",
      path: "/credits",
    }),
  component: Credits,
});

const unsplashLicense = "https://unsplash.com/license";

const files = import.meta.glob<string>("../../../renderer/src/library/preview/site/*.jpg", {
  eager: true,
  query: "?url",
  import: "default",
});

// The demo library's photos, which the landing page also shows, with the credit each carries.
const photos = seedItems.flatMap(({ title, description, file, credit }) =>
  file && credit
    ? [
        {
          title,
          alt: description ?? "",
          src: files[`../../../renderer/src/library/preview/site/${file}`],
          author: credit.author,
          source: credit.url,
        },
      ]
    : [],
);

function Credits() {
  return (
    <main {...stylex.props(page.column, styles.main)}>
      <h1 {...stylex.props(type.display, styles.title)}>Image credits</h1>
      <p {...stylex.props(type.lede)}>
        The photographs below appear on the landing page and in the demo library. They are from
        Unsplash, used under the{" "}
        <a href={unsplashLicense} {...stylex.props(action.inline)}>
          Unsplash License
        </a>
        . Thank you to the people who took them.
      </p>

      <section {...stylex.props(styles.section)}>
        <h2 {...stylex.props(type.heading)}>Photographs</h2>
        <ul {...stylex.props(styles.photos)}>
          {photos.map((photo) => (
            <li key={photo.source} {...stylex.props(styles.photo)}>
              <img
                src={photo.src}
                alt={photo.alt}
                width="720"
                height="960"
                loading="lazy"
                {...stylex.props(styles.thumbnail)}
              />
              <div {...stylex.props(styles.credit)}>
                <h3 {...stylex.props(type.subheading)}>{photo.title}</h3>
                <p {...stylex.props(type.body)}>
                  Photo by{" "}
                  <a href={photo.source} {...stylex.props(action.inline)}>
                    {photo.author}
                  </a>
                  , Unsplash License.
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section {...stylex.props(styles.section)}>
        <h2 {...stylex.props(type.heading)}>Pictures of the app</h2>
        <p {...stylex.props(type.body)}>
          Pictures of the library and of notes are real inkling screens, filled with sample items
          made for them rather than anyone&apos;s personal library.
        </p>
      </section>
    </main>
  );
}

const styles = stylex.create({
  main: { display: "flex", flexDirection: "column", gap: "32px", paddingTop: "72px" },
  title: { maxWidth: "13ch" },
  section: {
    display: "flex",
    flexDirection: "column",
    gap: "18px",
    marginTop: "56px",
    maxWidth: "760px",
  },
  photos: { display: "flex", flexDirection: "column", margin: 0, padding: 0, listStyle: "none" },
  photo: {
    display: "grid",
    gridTemplateColumns: { default: "84px 1fr", "@media (max-width: 560px)": "64px 1fr" },
    alignItems: "center",
    gap: "20px",
    paddingBlock: "16px",
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: color.border,
  },
  thumbnail: {
    display: "block",
    width: "100%",
    height: "auto",
    aspectRatio: "3 / 4",
    objectFit: "cover",
    borderRadius: radius.control,
    backgroundColor: color.raised,
  },
  credit: { display: "flex", flexDirection: "column", gap: "6px", minWidth: 0 },
});
