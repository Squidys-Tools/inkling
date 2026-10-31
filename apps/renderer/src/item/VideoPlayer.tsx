import * as stylex from "@stylexjs/stylex";
import { autoplayEmbedUrl, providerLabel } from "@inkling/ingestion/video-links";
import { Glass } from "@inkling/ui";
import { color, motion, radius, space } from "@inkling/ui/tokens.stylex";
import { useState } from "react";
import { TypedArtworkFor } from "../cards/TypedArtwork.tsx";
import type { DescribedItem } from "./model.ts";
import { FRAME_ALLOW, PlayPoster } from "./PlayPoster.tsx";
import { SizeStepper } from "./SizeStepper.tsx";

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
  return <TypedArtworkFor view={item} />;
}

const SIZES = [50, 75, 100, 125, 150];

/**
 * A video file from the library, at its own shape on the stage (no letterbox
 * frame around it), with the same size control as a photo.
 */
export function LocalVideo({ item, file }: { item: DescribedItem; file: string }) {
  const [step, setStep] = useState(SIZES.indexOf(100));
  const size = SIZES[step] ?? 100;
  return (
    <div {...stylex.props(styles.stage)}>
      <div {...stylex.props(styles.area)}>
        {/* oxlint-disable-next-line jsx-a11y/media-has-caption -- a file the user saved has no captions to offer. */}
        <video
          src={file}
          poster={item.image}
          controls
          preload="metadata"
          {...stylex.props(styles.local, styles.scale(size / 100))}
        />
      </div>
      <Glass style={styles.pill}>
        <SizeStepper
          label="Video size"
          percent={size}
          canShrink={step > 0}
          canGrow={step < SIZES.length - 1}
          onShrink={() => setStep((current) => Math.max(0, current - 1))}
          onGrow={() => setStep((current) => Math.min(SIZES.length - 1, current + 1))}
        />
      </Glass>
    </div>
  );
}

const styles = stylex.create({
  stage: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: space.s3,
    width: "100%",
    height: "100%",
    paddingBottom: space.s4,
  },
  area: {
    flexGrow: 1,
    minHeight: 0,
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  local: {
    display: "block",
    maxWidth: "100%",
    maxHeight: "100%",
    borderRadius: "4px",
    boxShadow: `0 24px 60px ${color.shadow}`,
    transitionProperty: "transform",
    transitionDuration: motion.layout,
    transitionTimingFunction: motion.standard,
  },
  scale: (value: number) => ({ transform: `scale(${value})` }),
  pill: { flexShrink: 0, padding: space.s1, borderRadius: radius.round },
  fill: {
    display: "block",
    width: "100%",
    height: "100%",
    borderWidth: 0,
  },
  frame: { backgroundColor: color.app },
});
