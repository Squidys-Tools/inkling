import book from "../../assets/onboarding/book.webp";
import car from "../../assets/onboarding/car.webp";
import delphinium from "../../assets/onboarding/delphinium.webp";
import deskPlant from "../../assets/onboarding/desk-plant.webp";
import field from "../../assets/onboarding/field.webp";
import monstera from "../../assets/onboarding/monstera.webp";
import pottery from "../../assets/onboarding/pottery.webp";
import record from "../../assets/onboarding/record.webp";
import redRocks from "../../assets/onboarding/red-rocks.webp";
import sea from "../../assets/onboarding/sea.webp";
import sprig from "../../assets/onboarding/sprig.webp";
import stairs from "../../assets/onboarding/stairs.webp";
import vases from "../../assets/onboarding/vases.webp";

/**
 * The welcome screens' pictures: small webp thumbnails of the photos on the
 * Paper onboarding boards, bundled with the app.
 */
export const onboardingPhotos = {
  book,
  car,
  delphinium,
  deskPlant,
  field,
  monstera,
  pottery,
  record,
  redRocks,
  sea,
  sprig,
  stairs,
  vases,
};

/** Decode every picture up front, so no later screen pops its images in. */
export function preloadOnboardingPhotos() {
  for (const src of Object.values(onboardingPhotos)) {
    const image = new Image();
    image.src = src;
    void image.decode().catch(() => null);
  }
}
