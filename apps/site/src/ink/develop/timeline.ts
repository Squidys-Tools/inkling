export const query = {
  text: "that poster with the mountain at night",
  alt: "The Matterhorn at night above a village of lit windows, developing out of black ink",
};

export const media = {
  still: "/media/ink/develop/still.webp",
  mask: "/media/ink/develop/mask.webp",
};

// The still is the moodboard frame, 1376x768. The CSS in Develop.tsx places the fallback image with the same numbers.
export const frame = { width: 1376, height: 768 };
const phoneBlob = { x: 925, width: 670, share: 0.66, at: 0.62 };
const centerY = { wide: 0.56, phone: 0.52 };

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const ease = (value: number) => {
  const x = clamp01(value);
  return x * x * (3 - 2 * x);
};
const span = (value: number, from: number, to: number) => clamp01((value - from) / (to - from));

/** One scrubbed moment of the section, for progress from 0 to 1. */
export function frameAt(progress: number) {
  const form = 0.32 + 0.68 * ease(span(progress, 0, 0.45));
  const bloom = ease(span(progress, 0.4, 0.82));
  return {
    form,
    front: -0.2 + 1.32 * form,
    bloom,
    characters: Math.round(span(progress, 0, 0.14) * query.text.length),
    found: bloom > 0.92,
  };
}

/** Where the frame sits in a stage of the given CSS size: its top-left corner and CSS pixels per frame pixel. */
export function frameRect(width: number, height: number, phone: boolean) {
  const scale = phone ? (width * phoneBlob.share) / phoneBlob.width : width / frame.width;
  const x = phone ? width * phoneBlob.at - phoneBlob.x * scale : 0;
  const y = height * (phone ? centerY.phone : centerY.wide) - (frame.height / 2) * scale;
  return { x, y, scale };
}
