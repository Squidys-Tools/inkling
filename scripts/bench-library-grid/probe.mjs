// Runs inside the renderer: the runner injects its source text, so it must not
// reference anything outside its own body.
export function installProbe(expectedItems) {
  const cardSelector = ".library-grid .library-card[data-library-item-id]";
  const frame = () => new Promise((done) => requestAnimationFrame(done));
  const viewport = () =>
    document.querySelector('.library-scroll [data-testid="virtuoso-scroller"]') ??
    document.querySelector(".library-scroll");
  const wait = async (predicate, label) => {
    const started = performance.now();
    while (performance.now() - started < 30_000) {
      const value = predicate();
      if (value) return true;
      await frame();
    }
    throw new Error(`Readiness timed out: ${label}`);
  };
  const snapshot = () => {
    const scroller = viewport();
    const bounds = scroller.getBoundingClientRect();
    const cards = [...document.querySelectorAll(cardSelector)];
    const visible = cards.filter((card) => {
      const rect = card.getBoundingClientRect();
      return (
        rect.bottom > bounds.top &&
        rect.top < bounds.bottom &&
        rect.right > bounds.left &&
        rect.left < bounds.right
      );
    });
    return {
      mounted: cards.length,
      visibleCount: visible.length,
      visibleIds: visible.map((card) => card.dataset.libraryItemId),
      scrollTop: scroller.scrollTop,
      scrollHeight: scroller.scrollHeight,
      viewportHeight: scroller.clientHeight,
    };
  };
  const brokenThumbnails = new Set();
  document.addEventListener(
    "error",
    (event) => {
      const target = event.target;
      if (target instanceof HTMLImageElement && target.src.startsWith("app://"))
        brokenThumbnails.add(target.src);
    },
    true,
  );
  let pointerDownMs = null;
  document.addEventListener(
    "pointerdown",
    (event) => {
      if (event.target.closest?.(cardSelector)) pointerDownMs = performance.now();
    },
    true,
  );
  const settle = async () => {
    await document.fonts.ready;
    let previous = "";
    let stable = 0;
    await wait(() => {
      const state = snapshot();
      const signature = JSON.stringify(state);
      const visibleImages = [...document.querySelectorAll(`${cardSelector} img`)].filter(
        (image) => {
          const rect = image.getBoundingClientRect();
          const bounds = viewport().getBoundingClientRect();
          return rect.bottom > bounds.top && rect.top < bounds.bottom;
        },
      );
      if (!state.visibleCount || visibleImages.some((image) => !image.complete)) return false;
      stable = signature === previous ? stable + 1 : 0;
      previous = signature;
      return stable >= 2;
    }, "visible cards and thumbnails settle for two frames");
    for (const image of document.querySelectorAll(`${cardSelector} img`))
      if (image.complete && image.naturalWidth === 0 && image.src.startsWith("app://"))
        brokenThumbnails.add(image.src);
    return snapshot();
  };
  const ready = (async () => {
    await wait(
      () =>
        document.querySelector(cardSelector) &&
        Number(document.querySelector(".result-count")?.textContent) === expectedItems,
      "all seeded items loaded into the grid",
    );
    await settle();
    await frame();
    return { gridReadyMs: performance.now(), ...snapshot() };
  })();
  const interactive = async () => {
    await wait(() => {
      const overlay = document.querySelector(".expanded-overlay");
      return (
        pointerDownMs !== null &&
        overlay &&
        overlay.getBoundingClientRect().width > 0 &&
        Number(getComputedStyle(overlay).opacity) > 0
      );
    }, "a real mouse click opens the overlay");
    await frame();
    await frame();
    const navigationToInteractiveMs = performance.now();
    return {
      navigationToInteractiveMs,
      clickResponseMs: navigationToInteractiveMs - pointerDownMs,
    };
  };
  const scroll = async () => {
    const scroller = viewport();
    scroller.scrollTop = 0;
    const before = await settle();
    if (scroller.scrollHeight - scroller.clientHeight < 12_000)
      throw new Error("Dataset cannot scroll the required 12000px at this window size");
    const visible = new Set();
    const observed = new Set();
    let mountedCardMax = 0;
    const intersections = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRect.height > 0) visible.add(entry.target);
          else visible.delete(entry.target);
        }
      },
      { root: scroller },
    );
    const observeCards = () => {
      const cards = [...document.querySelectorAll(cardSelector)];
      mountedCardMax = Math.max(mountedCardMax, cards.length);
      const mounted = new Set(cards);
      for (const card of observed) {
        if (!mounted.has(card)) {
          observed.delete(card);
          visible.delete(card);
          intersections.unobserve(card);
        }
      }
      for (const card of cards) {
        if (!observed.has(card)) {
          observed.add(card);
          intersections.observe(card);
        }
      }
    };
    const mutation = new MutationObserver(observeCards);
    mutation.observe(document.querySelector(".library-grid"), { childList: true, subtree: true });
    observeCards();
    await frame();
    await frame();
    const intervals = [];
    let emptyViewportFrames = 0;
    let minimumVisibleCount = visible.size;
    const startScroll = scroller.scrollTop;
    const startWall = performance.now();
    let previous = await frame();
    const startRaf = previous;
    for (let step = 0; step < 100; step += 1) {
      scroller.scrollTop = startScroll + (step + 1) * 120;
      const timestamp = await frame();
      intervals.push(timestamp - previous);
      previous = timestamp;
      minimumVisibleCount = Math.min(minimumVisibleCount, visible.size);
      if (!visible.size) emptyViewportFrames += 1;
    }
    const elapsedWallMs = performance.now() - startWall;
    const elapsedRafMs = previous - startRaf;
    const actualScrollDelta = scroller.scrollTop - startScroll;
    mutation.disconnect();
    intersections.disconnect();
    const after = await settle();
    if (emptyViewportFrames || !after.visibleCount)
      throw new Error(`Empty viewport during traversal: ${emptyViewportFrames} frames`);
    if (Math.abs(actualScrollDelta - 12_000) > 1)
      throw new Error(`Actual scroll delta was ${actualScrollDelta}, expected 12000`);
    if (before.visibleIds.join() === after.visibleIds.join())
      throw new Error("Scrolling did not change the visible item IDs");
    const sorted = [...intervals].sort((a, b) => a - b);
    return {
      meanFps: (intervals.length * 1000) / elapsedRafMs,
      medianFrameMs: (sorted[49] + sorted[50]) / 2,
      p95FrameMs: sorted[Math.ceil(sorted.length * 0.95) - 1],
      elapsedWallMs,
      elapsedRafMs,
      intervalsMs: intervals,
      requestedScrollDelta: 12_000,
      actualScrollDelta,
      stepPx: 120,
      steps: 100,
      firstItemIds: before.visibleIds,
      lastItemIds: after.visibleIds,
      mountedCardMax,
      minimumVisibleCount,
      emptyViewportFrames,
      renderedVisibleCountBefore: before.visibleCount,
      renderedVisibleCountAfter: after.visibleCount,
      scrollHeightBefore: before.scrollHeight,
      scrollHeightAfter: after.scrollHeight,
      brokenLocalThumbnails: [...brokenThumbnails],
    };
  };
  window.__gridBench = { ready, interactive, scroll, settle, wait, snapshot };
}
