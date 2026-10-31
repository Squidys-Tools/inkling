import * as stylex from "@stylexjs/stylex";
import { autoplayEmbedUrl, providerLabel } from "@inkling/ingestion/video-links";
import { color } from "@inkling/ui/tokens.stylex";
import { useState } from "react";
import { TypedArtworkFor } from "../cards/TypedArtwork.tsx";
import type { DescribedItem } from "./model.ts";
import { FRAME_ALLOW, PlayPoster } from "./PlayPoster.tsx";

// A video link loads its player only when the user presses play, so opening
// the item reaches no video site. A local file plays from the library.
export function VideoPlayer({ item }: { item: DescribedItem }) {
  const [playing, setPlaying] = useState(false);
  if (item.video) {
    return playing ? (
      // oxlint-disable-next-line react/iframe-missing-sandbox -- allowlisted players need scripts and their own origin, which a sandbox would void.
      <iframe
        src={autoplayEmbedUrl(item.video.embedUrl)}
        title={item.title}
        allow={FRAME_ALLOW}
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        {...stylex.props(styles.fill, styles.frame)}
      />
    ) : (
      <PlayPoster
        label={`Play video: ${item.title}`}
        provider={providerLabel(item.video.provider)}
        image={item.image}
        onPlay={() => setPlaying(true)}
        style={styles.fill}
      />
    );
  }
  if (item.file)
    return (
      // oxlint-disable-next-line jsx-a11y/media-has-caption -- a file the user saved has no captions to offer.
      <video
        src={item.file}
        poster={item.image}
        controls
        preload="metadata"
        {...stylex.props(styles.fill, styles.video)}
      />
    );
  return <TypedArtworkFor view={item} />;
}

const styles = stylex.create({
  fill: {
    display: "block",
    width: "100%",
    height: "100%",
    borderWidth: 0,
  },
  frame: { backgroundColor: color.app },
  video: { backgroundColor: color.app, objectFit: "contain" },
});
