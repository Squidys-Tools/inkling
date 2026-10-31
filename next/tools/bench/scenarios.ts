import type { connect } from "../smoke/cdp.ts";

type Page = Awaited<ReturnType<typeof connect>>;
type Point = { x: number; y: number };

/**
 * The `data-bench` attributes the scenarios drive. The UI keeps them on these
 * elements; a scenario whose element is missing is skipped, not failed.
 */
export const benchTargets = {
  grid: "the library grid's scroll container",
  card: "each card in the grid (a click opens the item)",
  "sidebar-toggle": "the button that slides the sidebar in and out",
  "item-close": "the item view's close button (present only while an item is open)",
} as const;
type Target = keyof typeof benchTargets;

const selector = (target: Target) => `[data-bench="${target}"]`;
const pause = (millis: number) => Bun.sleep(millis);

/** Centers of the matching elements that are on screen, in CSS pixels. */
const centers = (page: Page, target: Target) =>
  page.evaluate<Point[]>(`[...document.querySelectorAll('${selector(target)}')]
    .map((element) => element.getBoundingClientRect())
    .filter((box) => box.width > 0 && box.height > 0 && box.bottom > 0 && box.top < innerHeight)
    .map((box) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 }))`);

const mouse = (page: Page, type: string, { x, y }: Point, extra: object = {}) =>
  page.send("Input.dispatchMouseEvent", { type, x, y, ...extra });

async function click(page: Page, point: Point) {
  await mouse(page, "mouseMoved", point);
  await mouse(page, "mousePressed", point, { button: "left", clickCount: 1 });
  await mouse(page, "mouseReleased", point, { button: "left", clickCount: 1 });
}

// A real pointer moves every frame; 16 ms steps keep the hover at display pace.
async function glide(page: Page, from: Point, to: Point, steps = 10) {
  for (let step = 1; step <= steps; step++) {
    const t = step / steps;
    await mouse(page, "mouseMoved", {
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t,
    });
    await pause(16);
  }
}

async function waitFor(page: Page, target: Target, present: boolean, timeoutMillis = 3_000) {
  const deadline = Date.now() + timeoutMillis;
  while (Date.now() < deadline) {
    const found = await page.evaluate<boolean>(
      `Boolean(document.querySelector('${selector(target)}'))`,
    );
    if (found === present) return true;
    await pause(50);
  }
  return false;
}

export type Scenario = {
  name: string;
  needs: Target[];
  /** Returns a reason when the scenario could not do what it measures. */
  run: (page: Page) => Promise<string | void>;
};

export const scenarios: Scenario[] = [
  {
    name: "idle",
    needs: [],
    run: () => pause(2_000),
  },
  {
    name: "scroll the grid",
    needs: ["grid"],
    run: async (page) => {
      const [center] = await centers(page, "grid");
      if (!center) return "the grid is not on screen";
      for (const yDistance of [-6_000, 6_000])
        await page.send("Input.synthesizeScrollGesture", {
          ...center,
          yDistance,
          speed: 2_000,
          gestureSourceType: "mouse",
        });
    },
  },
  {
    name: "hover across cards",
    needs: ["card"],
    run: async (page) => {
      const points = (await centers(page, "card")).slice(0, 24);
      if (points.length < 2) return "fewer than two cards are on screen";
      for (let index = 1; index < points.length; index++)
        await glide(page, points[index - 1], points[index]);
      await glide(page, points.at(-1)!, { x: 2, y: 2 });
    },
  },
  {
    name: "slide the sidebar 4 times",
    needs: ["sidebar-toggle"],
    run: async (page) => {
      for (let slide = 0; slide < 4; slide++) {
        const [toggle] = await centers(page, "sidebar-toggle");
        if (!toggle) return `the sidebar toggle went off screen after ${slide} slides`;
        await click(page, toggle);
        await pause(700);
      }
    },
  },
  {
    name: "open and close an item 3 times",
    needs: ["card", "item-close"],
    run: async (page) => {
      for (let round = 0; round < 3; round++) {
        const [card] = await centers(page, "card");
        if (!card) return "no card is on screen";
        await click(page, card);
        if (!(await waitFor(page, "item-close", true)))
          return `clicking a card did not show ${selector("item-close")}`;
        await pause(600);
        const [close] = await centers(page, "item-close");
        if (!close) return `${selector("item-close")} is not on screen`;
        await click(page, close);
        if (!(await waitFor(page, "item-close", false))) return "the item view did not close";
        await pause(600);
      }
    },
  },
];

/** Targets a scenario needs before it starts; `item-close` only appears once it runs. */
export const missingTargets = (page: Page, scenario: Scenario) =>
  page.evaluate<string[]>(
    `${JSON.stringify(scenario.needs.filter((target) => target !== "item-close"))}
      .filter((target) => !document.querySelector('[data-bench="' + target + '"]'))`,
  );
