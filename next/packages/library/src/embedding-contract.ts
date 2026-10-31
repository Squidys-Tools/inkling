export const TEXT_MODEL = "nomic-embed-text-v1.5";
export const TEXT_DIMENSION = 768;

// The suffix marks vectors made with sharp's resize. Older image vectors carry another
// name, so search skips them and startup queues them to be embedded again.
export const IMAGE_MODEL = "nomic-embed-vision-v1.5-sharp";
export const IMAGE_DIMENSION = 768;
