import newsreader from "@fontsource/newsreader/files/newsreader-latin-400-normal.woff2?url";
import laptopAvif from "./media/laptop.webp?w=400;570&format=avif&quality=62&as=srcset";
import laptopWebp from "./media/laptop.webp?w=400;570&format=webp&quality=80&as=srcset";
import libraryAvif from "./media/library.jpg?w=1080&format=avif&quality=52&as=url";
import libraryWebp from "./media/library.jpg?w=1080&format=webp&quality=70&as=url";
import smallAvif from "./media/library.jpg?w=720&format=avif&quality=50&as=url";
import smallWebp from "./media/library.jpg?w=720&format=webp&quality=68&as=url";
import texture from "../../../renderer/src/cards/assets/typed-texture.png?format=webp&quality=80&as=url";
import mark from "./media/mark.png";
import blurred from "./media/meadow-blur.webp";
import meadowAvif from "./media/meadow.jpg?w=960;1376&format=avif&quality=55&as=srcset";
import meadowWebp from "./media/meadow.jpg?w=960;1376&format=webp&quality=72&as=srcset";
import tallAvif from "./media/meadow-tall.jpg?w=432&format=avif&quality=55&as=srcset";
import tallWebp from "./media/meadow-tall.jpg?w=432&format=webp&quality=72&as=srcset";

// Every image is encoded at build by vite-imagetools (sharp). A picture's fallback
// <img> is an empty pixel, so a screen size that hides it downloads nothing.
export const nothing = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";

const sheet = (avif: string, webp: string) =>
  `image-set(url("${avif}") type("image/avif"), url("${webp}") type("image/webp"))`;

export const media = {
  newsreader,
  mark,
  blurred,
  meadow: { avif: meadowAvif, webp: meadowWebp },
  tall: { avif: tallAvif, webp: tallWebp },
  laptop: { avif: laptopAvif, webp: laptopWebp },
  library: sheet(libraryAvif, libraryWebp),
  // The phone shows the grid at half the width, so it takes the smaller sheet.
  smallLibrary: sheet(smallAvif, smallWebp),
  texture,
};
