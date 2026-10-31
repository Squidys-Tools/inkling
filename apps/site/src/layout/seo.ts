// Vercel names the production domain at build time. Without it, as in local
// builds, share links stay relative and no sitemap is written.
const origin = import.meta.env.VITE_SITE_URL;

/** The tags a page shares itself with: its title, its description and where it lives. */
export function seo({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path: string;
}) {
  return {
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      ...(origin ? [{ property: "og:url", content: `${origin}${path}` }] : []),
    ],
    links: origin ? [{ rel: "canonical", href: `${origin}${path}` }] : [],
  };
}

export const shareImage = `${origin}/og.jpg`;
