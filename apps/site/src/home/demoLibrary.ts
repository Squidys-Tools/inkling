import type { LibraryCard } from "@inkling/contracts";
import { toCardView } from "../../../renderer/src/library/cardModel.ts";
import { seedCards } from "../../../renderer/src/library/preview/seed.ts";

const postDate = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

// The prerendered HTML has to match what every visitor's browser renders, so a
// post's date is fixed to English and UTC instead of the visitor's locale. Web
// pictures, such as a YouTube poster, are left out: the site loads nothing from
// other hosts.
function siteView(card: LibraryCard) {
  const view = toCardView(card);
  const social = card.metadata.social;
  const published =
    social && typeof social === "object" && "publishedDate" in social
      ? social.publishedDate
      : undefined;
  return {
    ...view,
    image: view.image && /^https?:/u.test(view.image) ? undefined : view.image,
    post:
      view.post && typeof published === "string"
        ? { ...view.post, published: postDate.format(new Date(published)) }
        : view.post,
  };
}

export const demoViews = seedCards.map(siteView);
