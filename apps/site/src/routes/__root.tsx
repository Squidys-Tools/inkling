import * as stylex from "@stylexjs/stylex";
import { color, font, landingColor, siteColor } from "@inkling/ui/tokens.stylex";
import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
  useRouterState,
} from "@tanstack/react-router";
import { Footer } from "../layout/Footer.tsx";
import { Header } from "../layout/Header.tsx";
import { NotFound } from "../layout/NotFound.tsx";
import { shareImage } from "../layout/seo.ts";
import { landing, media } from "../landing/landing.stylex.ts";
import { registerFonts } from "@inkling/ui";
import dmSans from "@fontsource-variable/dm-sans/files/dm-sans-latin-wght-normal.woff2?url";
import { type ReactNode, Suspense, useEffect } from "react";

// StyleX writes one stylesheet: a virtual module in dev, stylex.css beside the client bundle in a build.
const stylesheet = import.meta.env.DEV ? "/virtual:stylex.css" : "/assets/stylex.css";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "inkling" },
      { name: "theme-color", content: siteColor.browserChrome },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "inkling" },
      { property: "og:image", content: shareImage },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: stylesheet },
      // The same URL registerFonts loads, so headings do not wait for hydration to fetch their face.
      { rel: "preload", href: dmSans, as: "font", type: "font/woff2", crossOrigin: "anonymous" },
      { rel: "icon", href: "/media/inkling-mark.png" },
      { rel: "apple-touch-icon", href: "/icon.png" },
    ],
  }),
  shellComponent: Shell,
  component: Layout,
  notFoundComponent: () => (
    // The router wraps a route's component, like 404.html's, in Suspense but not the
    // not-found page; the same boundary here lets 404.html hydrate at any unknown path.
    <Suspense>
      <NotFound />
    </Suspense>
  ),
});

function useIsLanding() {
  return useRouterState({ select: (state) => state.location.pathname === "/" });
}

// Pages that draw their own header and footer.
const bare = new Set(["/plains"]);

function Layout() {
  const ownChrome = useRouterState({
    select: (state) => bare.has(state.location.pathname.replace(/(?<=.)\/$/u, "")),
  });
  if (useIsLanding() || ownChrome) return <Outlet />;
  return (
    <>
      <Header />
      <Outlet />
      <Footer />
    </>
  );
}

function Shell({ children }: { children: ReactNode }) {
  useEffect(registerFonts, []);
  const isLanding = useIsLanding();
  return (
    <html lang="en" {...stylex.props(styles.html, isLanding && styles.landingHtml)}>
      <head>
        <HeadContent />
      </head>
      <body {...stylex.props(styles.body, isLanding && styles.landingBody)}>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

const styles = stylex.create({
  html: {
    colorScheme: "dark",
    backgroundColor: color.window,
    color: color.ink,
    fontFamily: font.body,
    fontSynthesis: "none",
    textRendering: "optimizeLegibility",
    WebkitFontSmoothing: "antialiased",
  },
  body: { margin: 0 },
  landingHtml: {
    backgroundColor: landingColor.paper,
    color: landingColor.ink,
    scrollBehavior: { default: "smooth", [media.reduced]: "auto" },
    scrollPaddingTop: "24px",
  },
  landingBody: { fontFamily: landing.font, fontSize: landing.body, lineHeight: 1.5 },
});
