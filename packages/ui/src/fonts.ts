import dmMono from "@fontsource/dm-mono/files/dm-mono-latin-400-normal.woff2?url";
import dmMonoMedium from "@fontsource/dm-mono/files/dm-mono-latin-500-normal.woff2?url";
import baskerville from "@fontsource/libre-baskerville/files/libre-baskerville-latin-400-normal.woff2?url";
import baskervilleItalic from "@fontsource/libre-baskerville/files/libre-baskerville-latin-400-italic.woff2?url";
import dmSans from "@fontsource-variable/dm-sans/files/dm-sans-latin-wght-normal.woff2?url";

// Registered through the FontFace API rather than @font-face rules, so the app
// ships no stylesheet of its own. Body text uses the system face and needs none.
const faces: [family: string, url: string, descriptors: FontFaceDescriptors][] = [
  ["DM Sans Variable", dmSans, { weight: "100 1000" }],
  ["DM Mono", dmMono, { weight: "400" }],
  ["DM Mono", dmMonoMedium, { weight: "500" }],
  ["Libre Baskerville", baskerville, { weight: "400" }],
  ["Libre Baskerville", baskervilleItalic, { weight: "400", style: "italic" }],
];

export function registerFonts() {
  for (const [family, url, descriptors] of faces) {
    const face = new FontFace(family, `url(${url}) format("woff2")`, {
      display: "swap",
      ...descriptors,
    });
    document.fonts.add(face);
    // Load now so the first card that uses a face does not wait for it.
    void face.load().catch(() => {});
  }
}
