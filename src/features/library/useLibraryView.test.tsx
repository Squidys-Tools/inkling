import { expect, test } from "bun:test";
import { gsap } from "gsap";
import { parseHTML } from "linkedom";
import { act, useLayoutEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { useLibraryView } from "./useLibraryView";

test("view switches fade rows in place, retain grid scale and bypass animation for reduced motion", async () => {
  const { window: dom } = parseHTML("<html><body><div id='root'></div></body></html>");
  const previous = new Map<string, PropertyDescriptor | undefined>();
  const frames: FrameRequestCallback[] = [];
  let reduced = false;
  // The linkedom window proxies globalThis, so matchMedia joins the globals
  // that are saved and restored; otherwise the stub leaks into later test files.
  for (const [key, value] of Object.entries({
    window: dom,
    document: dom.document,
    HTMLElement: dom.HTMLElement,
    matchMedia: () => ({ matches: reduced }),
    requestAnimationFrame: (frame: FrameRequestCallback) => frames.push(frame),
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const original = { to: gsap.to, fromTo: gsap.fromTo, set: gsap.set };
  const fades: gsap.TweenVars[] = [];
  const entrances: { from: gsap.TweenVars; to: gsap.TweenVars }[] = [];
  const tween = (vars: gsap.TweenVars) =>
    ({ kill: () => vars.onInterrupt?.() }) as unknown as gsap.core.Tween;
  gsap.to = ((_targets: gsap.TweenTarget, vars: gsap.TweenVars) => {
    fades.push(vars);
    return tween(vars);
  }) as typeof gsap.to;
  gsap.fromTo = ((_targets: gsap.TweenTarget, from: gsap.TweenVars, to: gsap.TweenVars) => {
    entrances.push({ from, to });
    return tween(to);
  }) as typeof gsap.fromTo;
  gsap.set = (() => tween({})) as typeof gsap.set;
  let controller!: ReturnType<typeof useLibraryView>;
  function Probe() {
    const ref = useRef<HTMLDivElement>(null);
    const view = useLibraryView(ref);
    useLayoutEffect(() => {
      controller = view;
    }, [view]);
    return (
      <div ref={ref}>
        <div key={String(view.listMode)} className="library-grid">
          <article className="library-card" />
        </div>
      </div>
    );
  }
  const root = createRoot(document.getElementById("root")!);
  const flushFrames = async () => {
    for (let i = 0; i < 2; i++)
      await act(async () => {
        for (const frame of frames.splice(0)) frame(performance.now());
      });
  };
  try {
    await act(async () => root.render(<Probe />));
    await act(async () => controller.switchLibraryView(true));
    expect(fades).toHaveLength(1);
    await act(async () => fades[0].onComplete?.());
    await flushFrames();
    expect(controller.listMode).toBe(true);
    expect(entrances).toHaveLength(1);
    expect(entrances[0].from).toEqual({ opacity: 0 });
    await act(async () => controller.switchLibraryView(false));
    await act(async () => fades[1].onComplete?.());
    await flushFrames();
    expect(controller.listMode).toBe(false);
    expect(entrances[1].from).toEqual({ opacity: 0, scale: 0.96 });
    await act(async () => entrances[1].to.onComplete?.());
    expect(document.querySelector(".library-grid")?.hasAttribute("data-entering")).toBe(false);
    reduced = true;
    await act(async () => controller.switchLibraryView(true));
    expect(controller.listMode).toBe(true);
    expect(fades).toHaveLength(2);
    expect(entrances).toHaveLength(2);
  } finally {
    await act(async () => root.unmount());
    Object.assign(gsap, original);
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
