import { expect, test } from "bun:test";
import { parseHTML } from "linkedom";
import { act, useLayoutEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { markResultCard, ResultMotion } from "./ResultMotion";

type Box = { left: number; top: number; width: number; height: number };

function setup(reduced = false) {
  const { window: dom } = parseHTML("<html><body><div id='root'></div></body></html>");
  const positions = new Map<string, Box>();
  const frames: FrameRequestCallback[] = [];
  const keyframes: { id: string; frames: Keyframe[] }[] = [];
  const observers: { disconnected: boolean }[] = [];
  const counts = { rects: 0 };
  const area = { left: 0, top: 0, width: 1000, height: 800 };
  const element = dom.Element.prototype as unknown as Record<string, unknown>;
  const cardId = (el: Element) =>
    (el.matches(".library-card") ? el : el.querySelector(".library-card"))?.getAttribute(
      "data-library-item-id",
    );
  element.getBoundingClientRect = function (this: Element) {
    counts.rects++;
    if (this.classList.contains("library-scroll")) return area;
    const id = cardId(this);
    return (id && positions.get(id)) || { left: 0, top: 0, width: 0, height: 0 };
  };
  element.animate = function (this: Element, animation: Keyframe[]) {
    keyframes.push({ id: this.getAttribute("data-library-item-id") ?? "ghost", frames: animation });
    return { cancel() {} };
  };
  for (const prop of ["offsetWidth", "offsetHeight"])
    Object.defineProperty(dom.HTMLElement.prototype, prop, {
      configurable: true,
      get(this: Element) {
        const box = positions.get(cardId(this) ?? "");
        return prop === "offsetWidth" ? box?.width : box?.height;
      },
    });
  class StubObserver {
    disconnected = false;
    constructor() {
      observers.push(this);
    }
    observe() {}
    disconnect() {
      this.disconnected = true;
    }
  }
  const previous = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({
    window: dom,
    document: dom.document,
    HTMLElement: dom.HTMLElement,
    CustomEvent: dom.CustomEvent,
    MutationObserver: StubObserver,
    ResizeObserver: StubObserver,
    getComputedStyle: () => ({ opacity: "1" }),
    matchMedia: () => ({ matches: reduced }),
    requestAnimationFrame: (frame: FrameRequestCallback) => frames.push(frame),
    cancelAnimationFrame: () => {},
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const root = createRoot(dom.document.getElementById("root")!);
  return {
    dom,
    root,
    positions,
    keyframes,
    observers,
    counts,
    flushFrames: () =>
      act(async () => {
        for (const frame of frames.splice(0)) frame(0);
      }),
    restore: () => {
      for (const [key, descriptor] of previous)
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
    },
  };
}

function Card({ id, revision, text }: { id: string; revision: string; text: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => markResultCard(ref.current!, revision), [revision]);
  return (
    <div ref={ref} data-result-card="">
      <div className="library-card" data-library-item-id={id}>
        {text}
      </div>
    </div>
  );
}

function Grid({
  ids,
  text,
  listMode = false,
}: {
  ids: string[];
  text: string;
  listMode?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const revision = JSON.stringify(ids);
  return (
    <ResultMotion rootRef={rootRef} revision={revision} ids={ids} listMode={listMode}>
      <div className="library-scroll" ref={rootRef}>
        <div className="library-grid" key={`${listMode}:${revision}`}>
          {ids.map((id) => (
            <Card key={id} id={id} revision={revision} text={id === "a" ? text : id} />
          ))}
        </div>
      </div>
    </ResultMotion>
  );
}

const box = (left: number): Box => ({ left, top: 0, width: 280, height: 200 });

test("removed cards leave as fresh inert copies while survivors glide from where they were painted", async () => {
  const env = setup();
  try {
    env.positions.set("a", box(0));
    env.positions.set("b", box(300));
    env.positions.set("c", box(600));
    await act(async () => env.root.render(<Grid ids={["a", "b", "c"]} text="first" />));
    await act(async () => env.root.render(<Grid ids={["a", "b", "c"]} text="edited" />));
    await env.flushFrames();
    expect(env.keyframes).toEqual([]);

    await act(async () => env.root.render(<Grid ids={["b", "d"]} text="edited" />));
    env.positions.clear();
    env.positions.set("b", box(0));
    env.positions.set("d", box(300));
    await env.flushFrames();

    const layer = env.dom.document.querySelector("[aria-hidden='true']")!;
    expect(layer.textContent).toBe("editedc");
    expect(layer.querySelector("[data-library-item-id]")).toBeNull();
    const byId = (id: string) => env.keyframes.find((entry) => entry.id === id)!.frames;
    expect(byId("b")[0]?.transform).toBe("translate(300px,0px) scale(1,1)");
    expect(String(byId("d")[0]?.transform)).toContain("translateY(8px)");
    expect(env.keyframes.filter(({ id }) => id === "ghost")).toHaveLength(2);
  } finally {
    await act(async () => env.root.unmount());
    env.restore();
  }
});

test("an idle or scrolling library reads no layout, and leaving stops watching the grid", async () => {
  const env = setup();
  try {
    env.positions.set("a", box(0));
    await act(async () => env.root.render(<Grid ids={["a"]} text="first" />));
    await env.flushFrames();
    const scroll = env.dom.document.querySelector(".library-scroll")!;
    const before = env.counts.rects;
    for (let i = 0; i < 20; i++) scroll.dispatchEvent(new env.dom.Event("scroll"));
    await env.flushFrames();
    expect(env.counts.rects).toBe(before);
    expect(env.observers).toHaveLength(0);

    await act(async () => env.root.render(<Grid ids={["a", "b"]} text="first" />));
    expect(env.observers.some((observer) => !observer.disconnected)).toBe(true);
    await act(async () => env.root.unmount());
    expect(env.observers.every((observer) => observer.disconnected)).toBe(true);
    expect(env.dom.document.querySelector("[aria-hidden='true']")).toBeNull();
  } finally {
    env.restore();
  }
});

test("reduced motion and view-mode switches skip the card motion", async () => {
  for (const { reduced, listMode } of [
    { reduced: true, listMode: false },
    { reduced: false, listMode: true },
  ]) {
    const env = setup(reduced);
    try {
      env.positions.set("a", box(0));
      env.positions.set("b", box(300));
      await act(async () => env.root.render(<Grid ids={["a", "b"]} text="first" />));
      await act(async () => env.root.render(<Grid ids={["b"]} text="first" listMode={listMode} />));
      await env.flushFrames();
      expect(env.keyframes).toEqual([]);
      expect(env.dom.document.querySelector("[aria-hidden='true']")).toBeNull();
    } finally {
      await act(async () => env.root.unmount());
      env.restore();
    }
  }
});
