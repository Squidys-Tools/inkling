/* oxlint-disable inkling/no-css-imports -- The approved marketing design is a frozen CSS cascade, linked as route-head assets for SSR; the native application remains StyleX. */
import extractedStylex from "./site-stylex.css?url";
import download from "./download-button.css?url";
import base from "./styles.css?url";
import refinement from "./refinement.css?url";
import lower from "./lower.css?url";
import amendments from "./amendments.css?url";
import natural from "./natural.css?url";
import scrapbook from "./scrapbook.css?url";
import panels from "./scroll-panels.css?url";
export const siteStylesheet = extractedStylex;
export const landingStylesheets = [
  download,
  base,
  refinement,
  lower,
  amendments,
  natural,
  scrapbook,
  panels,
].map((href) => ({ rel: "stylesheet", href }));
