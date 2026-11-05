export const queries = [
  {
    text: "that poster with the mountain at night",
    src: "/media/ink/develop/matterhorn-night.webp",
    alt: "The Matterhorn at night above a village of lit windows",
    aspect: 480 / 720,
  },
  {
    text: "cherry blossoms, close up",
    src: "/media/ink/develop/cherry-blossoms.webp",
    alt: "Pink cherry blossoms, close up",
    aspect: 480 / 720,
  },
  {
    text: "spider-man in the rain",
    src: "/media/ink/develop/spiderman-rain.webp",
    alt: "Spider-Man crouched in the rain",
    aspect: 480 / 598,
  },
] as const;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const ease = (value: number) => {
  const x = clamp01(value);
  return x * x * (3 - 2 * x);
};
const span = (value: number, from: number, to: number) => clamp01((value - from) / (to - from));

/** One scrubbed moment of the section: which query is showing and how far its image has developed. */
export function frameAt(progress: number) {
  const last = queries.length - 1;
  const index = Math.min(last, Math.floor(Math.max(0, progress)));
  const local = Math.max(0, progress) - index;
  const dissolve = index < last ? ease(span(local, 0.8, 1)) : 0;
  const form = ease(span(local, 0.03, 0.4));
  const bloom = ease(span(local, 0.42, 0.68)) * (1 - span(dissolve, 0, 0.4));
  const typed = span(local, 0, 0.14) * (1 - span(dissolve, 0.45, 0.95));
  return {
    index,
    form,
    bloom,
    dissolve,
    characters: Math.round(typed * queries[index].text.length),
    found: bloom > 0.92,
  };
}

/** Where the image sits in a viewport of the given CSS size, as a center and half extents. */
export function imageRect(width: number, height: number, aspect: number) {
  const phone = width < 640;
  const tall = phone ? Math.min(height * 0.44, (width * 0.66) / aspect) : height * 0.7;
  const halfHeight = tall / 2;
  const halfWidth = halfHeight * aspect;
  const x = phone ? width / 2 : width * 0.64;
  const y = phone ? height * 0.6 : height * 0.56;
  return { x, y, halfWidth, halfHeight };
}
