import * as stylex from "@stylexjs/stylex";
import { color, font, siteColor } from "@inkling/ui/tokens.stylex";
import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { Footer } from "../layout/Footer.tsx";
import { Header } from "../layout/Header.tsx";
import { NotFound } from "../layout/NotFound.tsx";
import { shareImage } from "../layout/seo.ts";
import { registerFonts } from "@inkling/ui";
import dmSans from "@fontsource-variable/dm-sans/files/dm-sans-latin-wght-normal.woff2?url";
import { type ReactNode, useEffect } from "react";

// StyleX writes one stylesheet: a virtual module in dev, stylex.css beside the client bundle in a build.
const stylesheet = import.meta.env.DEV ? "/virtual:stylex.css" : "/assets/stylex.css";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
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
      { rel: "icon", href: "/icon.png" },
      { rel: "apple-touch-icon", href: "/icon.png" },
    ],
  }),
  shellComponent: Shell,
  component: Layout,
  notFoundComponent: NotFound,
});

function Layout() {
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
  return (
    <html lang="en" {...stylex.props(styles.html)}>
      <head>
        <HeadContent />
      </head>
      <body {...stylex.props(styles.body)}>
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
});
