import { expect, test } from "bun:test";
import { screenshotTitle } from "./screenshot-title.ts";

test.each([
  // Windows Snipping Tool; Win+PrtScn's "Screenshot (12)" has no date (see below).
  ["Screenshot 2026-11-15 114827.png", "Screenshot - 2026-11-15 11.48.27.png"],
  // macOS: 24-hour, 12-hour with the narrow no-break space Sonoma puts before AM/PM, the older
  // "Screen Shot" wording, localized words, and Finder's duplicate suffix.
  ["Screenshot 2026-11-15 at 11.48.27.png", "Screenshot - 2026-11-15 11.48.27.png"],
  ["Screenshot 2026-11-15 at 1.02.03 PM.png", "Screenshot - 2026-11-15 13.02.03.png"],
  ["Screen Shot 2026-11-15 at 12.02.03 AM.png", "Screenshot - 2026-11-15 00.02.03.png"],
  ["Bildschirmfoto 2026-11-15 um 11.48.27.png", "Screenshot - 2026-11-15 11.48.27.png"],
  ["Capture d’écran 2026-11-15 à 11.48.27.png", "Screenshot - 2026-11-15 11.48.27.png"],
  ["Captura de pantalla 2026-11-15 a las 11.48.27.png", "Screenshot - 2026-11-15 11.48.27.png"],
  ["Screenshot 2026-11-15 at 11.48.27 (2).png", "Screenshot - 2026-11-15 11.48.27.png"],
  // Linux: GNOME Shell and gnome-screenshot (old colons), KDE Spectacle, Xfce, Flameshot.
  ["Screenshot From 2026-11-15 11-48-27.png", "Screenshot - 2026-11-15 11.48.27.png"],
  ["Screenshot from 2026-11-15 11:48:27.png", "Screenshot - 2026-11-15 11.48.27.png"],
  ["Screenshot_20261115_114827.png", "Screenshot - 2026-11-15 11.48.27.png"],
  ["Screenshot_2026-11-15_11-48-27.png", "Screenshot - 2026-11-15 11.48.27.png"],
  ["2026-11-15_11-48.png", "Screenshot - 2026-11-15 11.48.png"],
  // A phone's screenshot synced into the folder.
  [
    "Screenshot_2026-11-15-11-48-27-05_eb2ba5d78cfea8663119baf123060d17.jpg",
    "Screenshot - 2026-11-15 11.48.27.jpg",
  ],
  ["Screenshot 2026-11-15.webp", "Screenshot - 2026-11-15.webp"],
  ["Screenshot 2026-11-15 (2).png", "Screenshot - 2026-11-15.png"],
])("%s", (fileName, title) => {
  expect(screenshotTitle(fileName, 0)).toBe(title);
});

test("a name without a date falls back to the local time it was saved", () => {
  const saved = new Date(2026, 10, 17, 9, 5, 7).getTime();
  expect(screenshotTitle("Screenshot (12).png", saved)).toBe(
    "Screenshot - 2026-11-17 09.05.07.png",
  );
  expect(screenshotTitle("image.png", saved)).toBe("Screenshot - 2026-11-17 09.05.07.png");
});
