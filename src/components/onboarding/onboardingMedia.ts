import alps from "../../assets/onboarding/alps.webp";
import blossom from "../../assets/onboarding/blossom.webp";
import coast from "../../assets/onboarding/coast.webp";
import corner from "../../assets/onboarding/corner.webp";
import fuji from "../../assets/onboarding/fuji.webp";
import lanterns from "../../assets/onboarding/lanterns.webp";
import redRocks from "../../assets/onboarding/red-rocks.webp";
import shore from "../../assets/onboarding/shore.webp";
import tower from "../../assets/onboarding/tower.webp";
import valley from "../../assets/onboarding/valley.webp";

/**
 * The welcome screens' pictures: small webp thumbnails cut from the demo seed,
 * bundled with the app because the demo seed itself never ships.
 */
export const onboardingPhotos = {
  alps,
  blossom,
  coast,
  corner,
  fuji,
  lanterns,
  redRocks,
  shore,
  tower,
  valley,
};

/** Decode every picture up front, so no later screen pops its images in. */
export function preloadOnboardingPhotos() {
  for (const src of Object.values(onboardingPhotos)) {
    const image = new Image();
    image.src = src;
    void image.decode().catch(() => null);
  }
}
