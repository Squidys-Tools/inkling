import { expect, test } from "bun:test";
import {
  beatTiming,
  clipInset,
  contains,
  cornerRadii,
  coverSize,
  flightBeats,
  flightDuration,
  flightMedia,
  mediaFrames,
  mediaPose,
  panelOffset,
  scrollToShow,
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
  // regression: #397. A measured DOMRect keeps its fields on its prototype, so a spread drops them.
  const measured = Object.create(viewport) as typeof viewport;
  expect(stageRegion(measured, beside, false)).toEqual({ ...viewport, width: 680 });
  expect(stageRegion(measured, under, true)).toEqual({ ...viewport, height: 350 });
  expect(panelOffset(beside, false)).toBe("translateX(320px)");
  expect(panelOffset(under, true)).toBe("translateY(350px)");
});

test("each layer runs on its own beat of one clock", () => {
  expect(beatTiming(flightBeats.open.panel, flightDuration.open)).toEqual({
    delay: 93,
    duration: 527,
    easing: "cubic-bezier(0.05, 0.7, 0.1, 1)",
    fill: "both",
  });
  expect(beatTiming(flightBeats.close.details, flightDuration.close)).toEqual({
    delay: 0,
    duration: 105,
    easing: "linear",
    fill: "both",
  });
  // No beat outlasts the clock, and in each direction one ends with it, so the flight lands then.
  for (const beats of [flightBeats.open, flightBeats.close]) {
    const ends = Object.values(beats).map(([start, end]) => {
      expect(start).toBeLessThanOrEqual(end);
      return end;
    });
    expect(Math.max(...ends)).toBe(1);
  }
  // The stage's content appears before the clone starts to fade off it, never after.
  expect(flightBeats.open.reveal[1]).toBeLessThanOrEqual(flightBeats.open.handoff[0]);
  expect(flightBeats.close.handoff[1]).toBeLessThanOrEqual(flightBeats.close.media[0]);
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
  // Mid-flight the corners are posed for that step's scale: 5.5px on screen, between 7 and 4.
  const frames = mediaFrames(
    size,
    { box: cardImage, radii },
    { box: settled, radii: [4, 4, 4, 4] },
    view,
    2,
  );
  expect(frames).toHaveLength(3);
  expect(frames[0]).toEqual(mediaPose(size, cardImage, view, radii));
  expect(frames[1]).toEqual({
    transform: "translate(106px, 34.25px) scale(0.7917)",
    clipPath: "inset(4.74px 0px round 6.95px 6.95px 2.53px 2.53px)",
  });
  expect(frames[2]).toEqual(mediaPose(size, settled, view, [4, 4, 4, 4]));
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

test("a card flies when any part of it is on screen; offscreen and unmeasured cards fade", () => {
  expect(usableOrigin({ left: 200, top: 100, width: 200, height: 200 }, viewport)).toBe(true);
  // Cut off by the bottom of the grid, with a fifth of it showing.
  expect(usableOrigin({ left: 200, top: 710, width: 200, height: 200 }, viewport)).toBe(true);
  expect(usableOrigin({ left: 200, top: -20, width: 200, height: 200 }, viewport)).toBe(true);
  expect(usableOrigin({ left: 200, top: 750, width: 200, height: 200 }, viewport)).toBe(false);
  expect(usableOrigin({ left: -100, top: 100, width: 200, height: 200 }, viewport)).toBe(false);
  expect(usableOrigin({ left: 200, top: 100, width: 0, height: 200 }, viewport)).toBe(false);
  // A cut-off card is first scrolled whole into view with a margin; one already whole stays put.
  expect(scrollToShow({ left: 200, top: 100, width: 200, height: 200 }, viewport, 24)).toBe(0);
  expect(scrollToShow({ left: 200, top: 710, width: 200, height: 200 }, viewport, 24)).toBe(184);
  expect(scrollToShow({ left: 200, top: 60, width: 200, height: 200 }, viewport, 24)).toBe(-14);
  // Taller than the view: its top comes to the margin and the rest stays cut off.
  expect(scrollToShow({ left: 200, top: 400, width: 200, height: 900 }, viewport, 24)).toBe(326);
});
