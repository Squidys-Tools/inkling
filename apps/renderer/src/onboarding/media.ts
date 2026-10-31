import book from "./photos/book.webp";
import car from "./photos/car.webp";
import delphinium from "./photos/delphinium.webp";
import deskPlant from "./photos/desk-plant.webp";
import monstera from "./photos/monstera.webp";
import pottery from "./photos/pottery.webp";
import record from "./photos/record.webp";
import redRocks from "./photos/red-rocks.webp";
import sea from "./photos/sea.webp";
import sprig from "./photos/sprig.webp";
import stairs from "./photos/stairs.webp";
import vases from "./photos/vases.webp";

/** Small webp thumbnails of the photos on the Paper onboarding boards, bundled with the app. */
export const onboardingPhotos = {
  book,
  car,
  delphinium,
  deskPlant,
  monstera,
  pottery,
  record,
  redRocks,
  sea,
  sprig,
  stairs,
  vases,
};

/** Decodes every picture up front, so no later screen pops its images in. */
export function preloadOnboardingPhotos() {
  for (const src of Object.values(onboardingPhotos)) {
    const image = new Image();
    image.src = src;
    void image.decode().catch(() => null);
  }
}
