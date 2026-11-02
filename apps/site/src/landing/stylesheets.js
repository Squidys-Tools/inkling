/* oxlint-disable inkling/no-css-imports -- The marketing cascade is linked as a route-head asset for SSR; the native application remains StyleX. */
import extractedStylex from "./site-stylex.css?url";
import landing from "./landing.css?url";

export const siteStylesheet = extractedStylex;
export const landingStylesheets = [{ rel: "stylesheet", href: landing }];
