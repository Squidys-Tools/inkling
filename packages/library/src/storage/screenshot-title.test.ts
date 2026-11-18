import { expect, test } from "bun:test";
import { screenshotTitle } from "./screenshot-title.ts";

test.each([
  [
    "Screenshot_2026-11-15-11-48-27-05_eb2ba5d78cfea8663119baf123060d17.jpg",
    "Screenshot - 2026-11-15 11.48.27.jpg",
  ],
  ["Screenshot 2026-11-15 114827.png", "Screenshot - 2026-11-15 11.48.27.png"],
  ["Screenshot_20261115-114827.PNG", "Screenshot - 2026-11-15 11.48.27.png"],
  ["Screenshot 2026-11-15 at 11.48.27.png", "Screenshot - 2026-11-15 11.48.27.png"],
  ["Screen Shot 2026-11-15 at 1.02.03 PM.png", "Screenshot - 2026-11-15 13.02.03.png"],
  ["Screen Shot 2026-11-15 at 12.02.03 AM.png", "Screenshot - 2026-11-15 00.02.03.png"],
  ["Screenshot 2026-11-15.webp", "Screenshot - 2026-11-15.webp"],
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
