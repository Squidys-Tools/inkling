import * as stylex from "@stylexjs/stylex";
import { type ReactNode, useState } from "react";

const STAGE = { width: 960, height: 540 };
type Crop = { x: number; y: number; width: number; height: number };

/**
 * Shows part of a welcome-screen demo, which is drawn on the onboarding's
 * 960x540 stage, scaled to the width it gets. The demo mounts the first time
 * it scrolls into view, so it plays when seen and its photos load only then.
 */
export function Stage({ crop, children }: { crop: Crop; children: ReactNode }) {
  const [scale, setScale] = useState<number | null>(null);

  const measure = (box: HTMLDivElement | null) => {
    if (!box) return;
    let seen = false;
    const resize = new ResizeObserver(([entry]) => {
      if (entry) setScale(Math.min(1.25, entry.contentRect.width / crop.width));
    });
    const reveal = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting || seen) return;
        seen = true;
        resize.observe(box);
        reveal.disconnect();
      },
      { threshold: 0.35 },
    );
    reveal.observe(box);
    return () => {
      reveal.disconnect();
      resize.disconnect();
    };
  };

  return (
    <div ref={measure} {...stylex.props(styles.box(crop.width / crop.height))}>
      {scale !== null && <div {...stylex.props(styles.stage(crop, scale))}>{children}</div>}
    </div>
  );
}

const styles = stylex.create({
  box: (ratio: number) => ({ position: "relative", width: "100%", aspectRatio: ratio }),
  stage: (crop: Crop, scale: number) => ({
    position: "absolute",
    top: 0,
    left: 0,
    width: STAGE.width,
    height: STAGE.height,
    transformOrigin: "0 0",
    transform: `scale(${scale}) translate(${-crop.x}px, ${-crop.y}px)`,
  }),
});
