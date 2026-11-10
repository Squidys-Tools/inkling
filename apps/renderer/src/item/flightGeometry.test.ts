import { expect, test } from "bun:test";
import {
  clipInset,
  contains,
  cornerRadii,
  coverSize,
  fadeBetween,
  flightBeats,
  flightDuration,
  flightMedia,
  mediaPose,
  panelOffset,
  reverseFrames,
  settledMedia,
  stageRegion,
  usableOrigin,
} from "./flightGeometry.ts";

const viewport = { left: 100, top: 50, width: 1000, height: 700 };

test("the frame's clip grows from the card to the region the panel leaves", () => {
  const card = { left: 300, top: 150, width: 250, height: 140 };
  expect(clipInset(card, viewport, 20)).toBe("inset(100px 550px 460px 200px round 20px)");
  const beside = { left: 780, top: 50, width: 320, height: 700 };
  const under = { left: 100, top: 400, width: 1000, height: 350 };
  expect(clipInset(stageRegion(viewport, beside, false), viewport, 0)).toBe(
    "inset(0px 320px 0px 0px round 0px)",
  );
  expect(clipInset(stageRegion(viewport, under, true), viewport, 0)).toBe(
    "inset(0px 0px 350px 0px round 0px)",
  );
  expect(panelOffset(beside, false)).toBe("translateX(320px)");
  expect(panelOffset(under, true)).toBe("translateY(350px)");
  expect(flightDuration).toBe(510);
});

test("fades hold outside their beats of eased progress", () => {
  expect(fadeBetween(flightBeats.stage)).toEqual([
    { opacity: 0, offset: 0 },
    { opacity: 0, offset: 0.15 },
    { opacity: 1, offset: 0.75 },
    { opacity: 1, offset: 1 },
  ]);
  expect(fadeBetween(flightBeats.frame)[2]).toEqual({ opacity: 1, offset: 0.25 });
  // Closing fades the frame out over the last quarter instead of the first.
  expect(reverseFrames(fadeBetween(flightBeats.frame))).toEqual([
    { opacity: 1, offset: 0 },
    { opacity: 1, offset: 0.75 },
    { opacity: 0, offset: 1 },
    { opacity: 0, offset: 1 },
  ]);
  expect(reverseFrames([{ opacity: 0 }, { opacity: 1 }])).toEqual([{ opacity: 1 }, { opacity: 0 }]);
});

test("the image clone covers both boxes at one uniform scale, cropped to each", () => {
  const view = { left: 0, top: 0, width: 480, height: 300 };
  const settled = { left: 44, top: 60, width: 240, height: 180 };
  const size = coverSize({ width: 480, height: 360 }, settled);
  expect(size).toEqual({ width: 240, height: 180 });
  const cardImage = { left: 168, top: 16, width: 140, height: 90 };
  const radii = cornerRadii(cardImage, { left: 168, top: 16, width: 140, height: 120 }, 7);
  expect(radii).toEqual([7, 7, 0, 0]);
  expect(cornerRadii(cardImage, cardImage, 7)).toEqual([7, 7, 7, 7]);
  expect(mediaPose(size, cardImage, view, radii)).toEqual({
    transform: "translate(168px, 8.5px) scale(0.5833)",
    clipPath: "inset(12.86px 0px round 12px 12px 0px 0px)",
  });
  expect(mediaPose(size, settled, view, [4, 4, 4, 4])).toEqual({
    transform: "translate(44px, 60px) scale(1)",
    clipPath: "inset(0px 0px round 4px 4px 4px 4px)",
  });
  // A poster box wider than the image crops top and bottom, and the view's offset is removed.
  const wide = coverSize({ width: 400, height: 300 }, { left: 0, top: 0, width: 720, height: 360 });
  expect(wide).toEqual({ width: 720, height: 540 });
  expect(mediaPose(wide, { left: 150, top: 100, width: 720, height: 360 }, viewport, [12])).toEqual(
    { transform: "translate(50px, -40px) scale(1)", clipPath: "inset(90px 0px round 12px)" },
  );
});

test("the settled image is predicted the way the stage lays it out", () => {
  const stage = { left: 40, top: 60, width: 800, height: 500 };
  expect(settledMedia("fit", { width: 400, height: 300 }, stage)).toEqual({
    left: 240,
    top: 160,
    width: 400,
    height: 300,
  });
  expect(settledMedia("fit", { width: 2000, height: 1000 }, stage)).toEqual({
    left: 40,
    top: 110,
    width: 800,
    height: 400,
  });
  expect(settledMedia("poster", { width: 2000, height: 1000 }, stage)).toEqual({
    left: 80,
    top: 60,
    width: 720,
    height: 500,
  });
  expect(contains(stage, { left: 240, top: 160, width: 400, height: 300 })).toBe(true);
  expect(contains(stage, { left: -200, top: 160, width: 1600, height: 300 })).toBe(false);
});

test("only kinds whose stage shows the card's own image lift it", () => {
  const card = { kind: "Image", image: "app://a.webp", isXPost: false, isVideoLink: false };
  expect(flightMedia(card)).toBe("fit");
  expect(flightMedia({ ...card, kind: "Article" })).toBe("fit");
  expect(flightMedia({ ...card, kind: "Note" })).toBe("fit");
  expect(flightMedia({ ...card, kind: "File" })).toBe("fit");
  expect(flightMedia({ ...card, kind: "Video", isVideoLink: true })).toBe("poster");
  expect(flightMedia({ ...card, kind: "Video" })).toBe(null);
  expect(flightMedia({ ...card, kind: "PDF" })).toBe(null);
  expect(flightMedia({ ...card, kind: "Quote" })).toBe(null);
  expect(flightMedia({ ...card, kind: "Post", isXPost: true })).toBe(null);
  expect(flightMedia({ ...card, image: undefined })).toBe(null);
});

test("offscreen, mostly covered and unmeasured cards fade instead of flying", () => {
  expect(usableOrigin({ left: 200, top: 100, width: 200, height: 200 }, viewport)).toBe(true);
  expect(usableOrigin({ left: 50, top: 100, width: 200, height: 200 }, viewport)).toBe(true);
  expect(usableOrigin({ left: 49, top: 100, width: 200, height: 200 }, viewport)).toBe(false);
  expect(usableOrigin({ left: 200, top: -20, width: 200, height: 200 }, viewport)).toBe(false);
  expect(usableOrigin({ left: 200, top: 100, width: 0, height: 200 }, viewport)).toBe(false);
});
