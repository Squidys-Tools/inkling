import * as stylex from "@stylexjs/stylex";
import { color, radius } from "@inkling/ui/tokens.stylex";
import { createFileRoute } from "@tanstack/react-router";
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

// The Lorem Picsum photos the landing page and the demo library show. Their
// sources are in demo-provenance/manifest.json.
const photos = [
  {
    title: "A black dog, taking a break",
    alt: "A curious black Labrador looking up from a wooden deck.",
    src: "/demo/assets/animal-237-p3afxhlQ.jpg",
    author: "André Spieker",
    source: "https://unsplash.com/photos/8wTPqxlnKM4",
  },
  {
    title: "A jellyfish in deep blue",
    alt: "An orange jellyfish moving through blue water.",
    src: "/demo/assets/animal-1069-BfMrk0EX.jpg",
    author: "Marat Gilyadzinov",
    source: "https://unsplash.com/photos/wpTWYBll4_w",
  },
  {
    title: "The blanket belongs to the pug",
    alt: "A small pug wrapped up on a woodland walk.",
    src: "/demo/assets/animal-1025-BwRTE-B8.jpg",
    author: "Matthew Wiebe",
    source: "https://unsplash.com/photos/U5rMrSI7Pn4",
  },
  {
    title: "Lion, up close",
    alt: "A lion looking straight at the camera.",
    src: "/demo/assets/animal-1074-CnHrkRSc.jpg",
    author: "Samuel Scrimshaw",
    source: "https://unsplash.com/photos/sseiVD2XsOk",
  },
  {
    title: "A bear by the water",
    alt: "A brown bear on rocky ground, snowy trees behind it.",
    src: "/demo/assets/animal-1020-CF3jCN2d.jpg",
    author: "Adam Willoughby-Knox",
    source: "https://unsplash.com/photos/_snqARKTgoc",
  },
  {
    title: "A slow afternoon",
    alt: "Walruses resting together on a quiet beach.",
    src: "/demo/assets/animal-1084-GIOoak4V.jpg",
    author: "Jay Ruzesky",
    source: "https://unsplash.com/photos/h13Y8vyIXNU",
  },
];

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
