import * as stylex from "@stylexjs/stylex";
import { useEffect, useRef } from "react";
import { color } from "@inkling/ui/tokens.stylex";
import { animate, drawSmallRing } from "../cards/cardFx.ts";

const size = 16;

/** The card's ring of blobs at sidebar size, in the row's own ink, for both themes. */
export function IndexingRing({ label }: { label: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const pixels = size * 2;
    canvas.width = pixels;
    canvas.height = pixels;
    const image = context.createImageData(pixels, pixels);
    return animate((now) => {
      drawSmallRing(context, image, now, getComputedStyle(canvas).color);
    }).stop;
  }, []);
  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={label}
      title={label}
      {...stylex.props(styles.ring)}
    />
  );
}

const styles = stylex.create({
  ring: { display: "block", width: `${size}px`, height: `${size}px`, color: color.muted },
});
