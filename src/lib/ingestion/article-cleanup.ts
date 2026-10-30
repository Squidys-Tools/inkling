import { normalizeText } from "./url";

function normalizeHeadingText(value: string | null | undefined): string {
  return normalizeText(value).toLowerCase();
}

// Summary boxes ("At a Glance", TL;DR panels) are usually <aside> elements,
// which readers drop. Ones with a heading plus a list are article content, so
// promote them to <section> before extraction.
export function promoteInfoAsides(document: Document): void {
  for (const aside of document.querySelectorAll("aside")) {
    if (!aside.querySelector("h2, h3, h4") || !aside.querySelector("ul, ol")) continue;
    const section = document.createElement("section");
    while (aside.firstChild) section.appendChild(aside.firstChild);
    for (const attribute of aside.attributes) section.setAttribute(attribute.name, attribute.value);
    aside.replaceWith(section);
  }
}

// The page title and subtitle/deck usually repeat inside the extracted body.
// Drop a leading heading that duplicates the title and turn a heading that
// duplicates the description into a lede paragraph.
function isDuplicateHeading(headingText: string, title: string): boolean {
  if (!headingText || !title) return false;
  if (headingText === title) return true;
  if (headingText.length < 4 || title.length < 4) return false;
  return title.startsWith(headingText) || headingText.startsWith(title);
}

export function cleanArticleHeadings(
  document: Document,
  title: string,
  description: string,
): string {
  const headings = [...document.querySelectorAll("h1, h2, h3")].filter(
    (heading) => !heading.closest("section, aside"),
  );

  let index = 0;
  for (let guard = 0; guard < 2 && index < headings.length; guard += 1) {
    const heading = headings[index];
    if (!isDuplicateHeading(normalizeHeadingText(heading.textContent), normalizeHeadingText(title)))
      break;
    heading.remove();
    index += 1;
  }

  const ledeHeading = headings[index];
  const ledeText = normalizeHeadingText(ledeHeading?.textContent);
  const readsLikeSentence = ledeText.length >= 50 && /[.!?]$/u.test(ledeText);
  if (
    ledeHeading &&
    description &&
    (ledeText === normalizeHeadingText(description) || readsLikeSentence)
  ) {
    const lede = document.createElement("p");
    lede.className = "article-lede";
    lede.textContent = ledeHeading.textContent;
    ledeHeading.replaceWith(lede);
  }

  return document.body?.innerHTML ?? "";
}
