// Every screen is drawn on a 960x540 stage that keeps a fixed share of the
// space it gets: 1:1 at 1280x720, smaller below that, larger above it up to a
// cap (about 1080p), past which more room only adds margin.
const FIT_WIDTH = 1280;
const FIT_HEIGHT = 720;
const MAX_SCALE = 1.35;

export function stageScale(width: number, height: number) {
  return Math.min(MAX_SCALE, width / FIT_WIDTH, height / FIT_HEIGHT);
}
