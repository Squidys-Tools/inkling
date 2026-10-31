import * as stylex from "@stylexjs/stylex";
import { FRAME_ORIGINS } from "@inkling/ingestion/frame-origins";
import { autoplayEmbedUrl } from "@inkling/ingestion/video-links";
import { useState } from "react";
import { FRAME_ALLOW, PlayPoster } from "../item/PlayPoster.tsx";

const providers: Record<keyof typeof FRAME_ORIGINS, string> = {
  youtube: "YouTube",
  vimeo: "Vimeo",
  loom: "Loom",
  spotify: "Spotify",
  soundcloud: "SoundCloud",
  twitch: "Twitch",
  x: "X",
};

/** The provider an allowlisted frame URL plays from. */
function embedProvider(src: string) {
  for (const [key, origin] of Object.entries(FRAME_ORIGINS))
    if (src.startsWith(`${origin}/`))
      return { key, label: providers[key as keyof typeof providers] };
  return null;
}

/**
 * An embedded player in an article. It loads only once the user presses play,
 * so reading a saved article reaches no video site on its own.
 */
export function ArticleEmbed({
  src,
  title,
  style,
}: {
  src: string;
  title?: string;
  style: stylex.StyleXStyles;
}) {
  const [playing, setPlaying] = useState(false);
  const provider = embedProvider(src);
  if (!provider) return null;
  if (!playing)
    return (
      <PlayPoster
        label={`Play ${title ? `“${title}”` : "embed"} from ${provider.label}`}
        provider={provider.label}
        onPlay={() => setPlaying(true)}
        style={style}
      />
    );
  const autoplay = provider.key === "youtube" || provider.key === "vimeo";
  return (
    // oxlint-disable-next-line react/iframe-missing-sandbox -- allowlisted players need scripts and their own origin, which a sandbox would void.
    <iframe
      src={autoplay ? autoplayEmbedUrl(src) : src}
      title={title ?? provider.label}
      allow={FRAME_ALLOW}
      allowFullScreen
      referrerPolicy="strict-origin-when-cross-origin"
      {...stylex.props(style)}
    />
  );
}
