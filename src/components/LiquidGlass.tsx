import type {
  Container,
  Scene,
  Glass,
  Html,
  WebGpuDomContentSource,
  WebGpuGlassContentSource,
  WebGpuGlassCore,
} from "@liquid-dom/core";
import {
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { type GlassShape, glassBands, glassShape, type ShapeBox } from "./liquidGlassShape";

// The backdrop renders inside a `<canvas layoutsubtree>`, and liquid-dom draws
// refracting glass under each `.glass` element in `targetRoots`. Without WebGPU or
// Chromium's HTML-in-Canvas API (web preview, old GPU, lost device), the backdrop
// stays plain DOM and the CSS glass remains.

declare global {
  interface HTMLCanvasElement {
    /** HTML-in-Canvas: fires a `paint` event in the next rendering update. */
    requestPaint(): void;
  }
}

// HTML-in-Canvas paints opaque cross-origin images blank, so remote card images
// load with CORS. The desktop shell (the only app:// page) adds the CORS header
// to image responses; anywhere else most hosts send none and the image would fail.
export function canvasImageCrossOrigin(src: string | undefined) {
  return location.protocol === "app:" && src?.startsWith("https:") ? "anonymous" : undefined;
}

type LiquidDom = typeof import("@liquid-dom/core");
type LiquidGpu = { lib: LiquidDom; device: GPUDevice; format: GPUTextureFormat };

let support: Promise<LiquidGpu | null> | undefined;

// One device for every surface, so pipelines compile once.
function liquidGlassSupport() {
  support ??= (async () => {
    if (!("layoutSubtree" in HTMLCanvasElement.prototype) || !navigator.gpu) return null;
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return null;
    const [device, lib] = await Promise.all([adapter.requestDevice(), import("@liquid-dom/core")]);
    if (!(await canCopyElements(device))) {
      device.destroy();
      return null;
    }
    void device.lost.then(() => {
      support = Promise.resolve(null);
    });
    return { lib, device, format: navigator.gpu.getPreferredCanvasFormat() };
  })().catch(() => null);
  return support;
}

// The element copy is experimental and has already changed shape once (the
// liquid-dom patch in patches/). Prove it copies a real element before any
// content moves into a canvas, or the library would render blank.
async function canCopyElements(device: GPUDevice) {
  const canvas = document.createElement("canvas");
  canvas.setAttribute("layoutsubtree", "");
  canvas.style.cssText =
    "position:fixed;top:0;left:0;width:1px;height:1px;z-index:-1;pointer-events:none";
  canvas.append(document.createElement("div"));
  const format = navigator.gpu.getPreferredCanvasFormat();
  // The copy requires the canvas to hold a WebGPU context.
  canvas.getContext("webgpu")?.configure({ device, format });
  const texture = device.createTexture({
    size: { width: 1, height: 1 },
    format,
    usage:
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.RENDER_ATTACHMENT,
  });
  try {
    document.body.append(canvas);
    return await new Promise<boolean>((resolve) => {
      canvas.addEventListener(
        "paint",
        () => {
          try {
            const queue = device.queue as GPUQueue & {
              copyElementImageToTexture(
                source: { source: Element },
                destination: {
                  destination: { texture: GPUTexture };
                  width: number;
                  height: number;
                },
              ): void;
            };
            queue.copyElementImageToTexture(
              { source: canvas.firstElementChild as Element },
              { destination: { texture }, width: 1, height: 1 },
            );
            resolve(true);
          } catch {
            resolve(false);
          }
        },
        { once: true },
      );
      canvas.requestPaint();
      setTimeout(() => resolve(false), 1000);
    });
  } finally {
    canvas.remove();
    texture.destroy();
  }
}

// Tuned against the CSS `.glass`: the same dark tint and soft drop shadow, plus
// the refracting bezel and edge light CSS cannot draw.
const LOOK = {
  blur: 14,
  spacing: 0,
  bezelWidth: 12,
  thickness: 48,
  displacementBlur: 4,
  tint: { r: 0.047, g: 0.043, b: 0.039, a: 0.6 },
  specularOpacity: 0.32,
  shadowColor: { r: 0, g: 0, b: 0, a: 0.5 },
  shadowOffsetY: 8,
  shadowBlur: 24,
} satisfies Partial<Container>;

// Transitions and keyframes on the targets move them without resizing them,
// so shapes follow by polling rects for a little longer than the longest one.
const SETTLE_MS = 600;

class LiquidSurface {
  private readonly scene: Scene;
  private readonly backdrop: Html;
  private readonly container: Container;
  private readonly source: WebGpuDomContentSource;
  private readonly bandSource: WebGpuGlassContentSource;
  private readonly core: WebGpuGlassCore;
  private readonly context: GPUCanvasContext;
  private readonly glasses = new Map<HTMLElement, Glass>();
  private bandTexture: GPUTexture | null = null;
  private bandTop = 0;
  private dpr = 1;

  constructor(
    private readonly gpu: LiquidGpu,
    private readonly canvas: HTMLCanvasElement,
    content: HTMLElement,
    private readonly onFirstFrame: () => void,
    shadow: boolean,
  ) {
    const { lib, device, format } = gpu;
    const context = canvas.getContext("webgpu");
    if (!context) throw new Error("No WebGPU canvas context");
    context.configure({
      device,
      format,
      alphaMode: "opaque",
      // The content and the glass band are copied in (see draw).
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_DST,
    });
    this.context = context;

    const scene = new lib.Scene();
    this.scene = scene;
    this.backdrop = scene.add(new lib.Html({ element: content, width: 1, height: 1, zIndex: -1 }));
    this.container = scene.add(
      new lib.Container({
        ...LOOK,
        shadowColor: shadow ? LOOK.shadowColor : { r: 0, g: 0, b: 0, a: 0 },
      }),
    );
    // The source listens for paint first and copies the changed DOM; the
    // listener below then draws with the fresh texture in the same frame.
    this.source = new lib.WebGpuDomContentSource({
      targetCanvas: canvas,
      getCurrentDpr: () => this.dpr,
      scene,
    });
    this.source.setDevice(device, format);
    const source = this.source;
    // The backdrop as seen from the band: the same texture, sampled bandTop
    // device rows lower.
    this.bandSource = {
      get atlasTexture() {
        return source.atlasTexture;
      },
      get contentEntriesBindingResource() {
        return source.contentEntriesBindingResource;
      },
      getGlassContentRange: (glass) => source.getGlassContentRange(glass),
      getSceneHtmlEntry: (html) => {
        const entry = source.getSceneHtmlEntry(html);
        const inverse = entry?.inverseTransform;
        if (!entry || !inverse) return entry;
        return {
          ...entry,
          inverseTransform: {
            ...inverse,
            e: inverse.e + inverse.c * this.bandTop,
            f: inverse.f + inverse.d * this.bandTop,
          },
        };
      },
    };
    this.core = new lib.WebGpuGlassCore({ device, format });
    canvas.addEventListener("paint", this.draw);
    // Mount the backdrop host now so it lays out and paints this frame.
    this.source.sync();
  }

  resize(width: number, height: number, deviceWidth: number, deviceHeight: number) {
    this.dpr = width > 0 ? deviceWidth / width : 1;
    this.canvas.width = Math.max(1, deviceWidth);
    this.canvas.height = Math.max(1, deviceHeight);
    this.backdrop.width = Math.max(1, width);
    this.backdrop.height = Math.max(1, height);
    this.canvas.requestPaint();
  }

  setShapes(shapes: Map<HTMLElement, GlassShape>) {
    let changed = false;
    for (const [element, glass] of this.glasses) {
      if (shapes.has(element)) continue;
      glass.remove();
      this.glasses.delete(element);
      changed = true;
    }
    for (const [element, shape] of shapes) {
      let glass = this.glasses.get(element);
      if (!glass) {
        glass = this.container.add(new this.gpu.lib.Glass({ cornerSmoothing: 0 }));
        this.glasses.set(element, glass);
      }
      if (
        glass.x !== shape.x ||
        glass.y !== shape.y ||
        glass.width !== shape.width ||
        glass.height !== shape.height ||
        glass.cornerRadius !== shape.radius
      ) {
        glass.x = shape.x;
        glass.y = shape.y;
        glass.width = shape.width;
        glass.height = shape.height;
        glass.cornerRadius = shape.radius;
        changed = true;
      }
    }
    if (changed) this.canvas.requestPaint();
  }

  destroy() {
    this.canvas.removeEventListener("paint", this.draw);
    this.source.destroy();
    this.core.destroy();
    this.bandTexture?.destroy();
    this.context.unconfigure();
  }

  private bandTarget(width: number, height: number) {
    if (this.bandTexture?.width !== width || this.bandTexture.height !== height) {
      this.bandTexture?.destroy();
      this.bandTexture = this.gpu.device.createTexture({
        size: { width, height },
        format: this.gpu.format,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
      });
    }
    return this.bandTexture;
  }

  // Draws only on paint events: when the backdrop DOM changes (scroll, hover,
  // new cards) or after requestPaint. Nothing redraws while the page is idle.
  // Glass sits in bands of rows (the toolbar, the view dock), so liquid-dom
  // renders just those and the rest of the frame is a copy of the content texture.
  private readonly draw = () => {
    const { width, height } = this.canvas;
    const bands = glassBands(this.glasses.values(), this.dpr, height);
    this.source.sync();
    const output = this.context.getCurrentTexture();
    const content = this.source.getSceneHtmlEntry(this.backdrop);
    if (bands.length === 1 && bands[0].height === height) {
      this.renderBand(0, width, height, output);
    } else {
      const encoder = this.gpu.device.createCommandEncoder();
      if (content?.texture && content.copiedDeviceWidth > 0) {
        encoder.copyTextureToTexture(
          { texture: content.texture },
          { texture: output },
          {
            width: Math.min(content.copiedDeviceWidth, width),
            height: Math.min(content.copiedDeviceHeight, height),
          },
        );
      }
      this.gpu.device.queue.submit([encoder.finish()]);
      // Each band renders and copies before the next reuses the band texture;
      // the queue keeps them in order.
      for (const band of bands) {
        const target = this.bandTarget(width, band.height);
        this.renderBand(band.top, width, band.height, target);
        const copy = this.gpu.device.createCommandEncoder();
        copy.copyTextureToTexture(
          { texture: target },
          { texture: output, origin: { x: 0, y: band.top } },
          { width, height: band.height },
        );
        this.gpu.device.queue.submit([copy.finish()]);
      }
    }
    if (content?.copiedDeviceWidth) this.onFirstFrame();
  };

  // Layers carry transforms baked when they are listed, so each band hands
  // liquid-dom the scene and gets the glass shifted by its own offset.
  private renderBand(top: number, width: number, height: number, outputTexture: GPUTexture) {
    this.bandTop = top;
    this.container.y = -top / this.dpr;
    this.core.render({
      scene: this.scene,
      width,
      height,
      dpr: this.dpr,
      outputTexture,
      contentSource: this.bandSource,
    });
  }
}

function boxOf(element: HTMLElement, origin: DOMRect): ShapeBox | null {
  const style = getComputedStyle(element);
  if (style.visibility === "hidden" || Number(style.opacity) === 0) return null;
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;
  return {
    x: rect.left - origin.left,
    y: rect.top - origin.top,
    width: rect.width,
    height: rect.height,
    radii: [
      Number.parseFloat(style.borderTopLeftRadius),
      Number.parseFloat(style.borderTopRightRadius),
      Number.parseFloat(style.borderBottomRightRadius),
      Number.parseFloat(style.borderBottomLeftRadius),
    ],
  };
}

// Moving the content in or out of the canvas resets every scroller inside it,
// which would throw the library back to its top, so their offsets carry over.
function keepingScroll<T>(content: HTMLElement, move: () => T) {
  const scrolled = [...content.querySelectorAll<HTMLElement>("*")]
    .filter((element) => element.scrollTop || element.scrollLeft)
    .map((element) => [element, element.scrollTop, element.scrollLeft] as const);
  const result = move();
  for (const [element, top, left] of scrolled) {
    element.scrollTop = top;
    element.scrollLeft = left;
  }
  return result;
}

function glassTargets(roots: RefObject<HTMLElement | null>[]) {
  const targets: HTMLElement[] = [];
  for (const { current: root } of roots) {
    if (!root) continue;
    if (root.classList.contains("glass")) targets.push(root);
    targets.push(...root.querySelectorAll<HTMLElement>(".glass"));
  }
  return targets;
}

/**
 * Renders `children` as the backdrop of liquid glass drawn under every `.glass`
 * element in `targetRoots`. `shadow` is off for a lens that clips to its own
 * glass, where the CSS shadow on the target stays.
 */
export function LiquidGlass({
  className,
  targetRoots,
  shadow = true,
  children,
}: {
  className?: string;
  targetRoots: RefObject<HTMLElement | null>[];
  shadow?: boolean;
  children: ReactNode;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Portal target. It sits in the wrapper until the canvas is ready, then moves
  // into the canvas, so switching modes never remounts the children.
  const [content] = useState(() => {
    const element = document.createElement("div");
    element.className = "liquid-glass-content absolute inset-0";
    return element;
  });
  const [gpu, setGpu] = useState<LiquidGpu | null>(null);
  const rootsRef = useRef(targetRoots);
  rootsRef.current = targetRoots;

  useLayoutEffect(() => {
    wrapRef.current?.append(content);
    let live = true;
    void liquidGlassSupport().then((found) => {
      if (live && found) setGpu(found);
    });
    return () => {
      live = false;
      content.remove();
    };
  }, [content]);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!gpu || !wrap || !canvas) return;
    let live = true;
    let shown = false;
    const marked = new Set<HTMLElement>();
    // The content lays out at the wrapper's size. The canvas can be larger (see
    // LibraryStage), so the content no longer fills its parent.
    const sizeContent = (width: number, height: number) => {
      content.style.width = `${width}px`;
      content.style.height = `${height}px`;
    };
    sizeContent(wrap.clientWidth, wrap.clientHeight);
    const surface = keepingScroll(
      content,
      () =>
        new LiquidSurface(
          gpu,
          canvas,
          content,
          () => {
            if (shown) return;
            shown = true;
            // The first frame is up, so the CSS glass can step aside.
            for (const element of marked) element.dataset.liquid = "";
          },
          shadow,
        ),
    );

    const syncShapes = () => {
      const origin = canvas.getBoundingClientRect();
      const shapes = new Map<HTMLElement, GlassShape>();
      for (const element of glassTargets(rootsRef.current)) {
        const box = boxOf(element, origin);
        const shape = box && glassShape(box, origin.width, origin.height);
        if (!shape) {
          if (marked.delete(element)) delete element.dataset.liquid;
          continue;
        }
        shapes.set(element, shape);
        if (!marked.has(element)) {
          marked.add(element);
          if (shown) element.dataset.liquid = "";
        }
      }
      for (const element of marked) {
        if (shapes.has(element)) continue;
        marked.delete(element);
        delete element.dataset.liquid;
      }
      surface.setShapes(shapes);
    };

    let frame = 0;
    let settleUntil = 0;
    const tick = () => {
      frame = 0;
      syncShapes();
      if (performance.now() < settleUntil) frame = requestAnimationFrame(tick);
    };
    const scheduleSync = () => {
      if (!frame) frame = requestAnimationFrame(tick);
    };
    const settle = () => {
      settleUntil = performance.now() + SETTLE_MS;
      scheduleSync();
    };

    const sizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const box = entry.contentBoxSize[0];
        if (!box) continue;
        if (entry.target === wrap) sizeContent(box.inlineSize, box.blockSize);
        if (entry.target !== canvas) continue;
        const device = entry.devicePixelContentBoxSize?.[0];
        surface.resize(
          box.inlineSize,
          box.blockSize,
          Math.round(device?.inlineSize ?? box.inlineSize * devicePixelRatio),
          Math.round(device?.blockSize ?? box.blockSize * devicePixelRatio),
        );
      }
      // Layout is fresh here and the canvas paints after this callback, so the
      // shapes keep up with a resizing stage (the sidebar sliding) frame by frame.
      syncShapes();
    });
    sizeObserver.observe(canvas);
    sizeObserver.observe(wrap);
    const mutationObserver = new MutationObserver(() => {
      for (const element of glassTargets(rootsRef.current)) sizeObserver.observe(element);
      scheduleSync();
    });
    const roots = rootsRef.current.flatMap(({ current }) => (current ? [current] : []));
    for (const root of roots) {
      mutationObserver.observe(root, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["class", "style"],
      });
      root.addEventListener("transitionrun", settle);
      root.addEventListener("animationstart", settle);
    }
    for (const element of glassTargets(rootsRef.current)) sizeObserver.observe(element);
    window.addEventListener("resize", settle);

    void gpu.device.lost.then(() => {
      if (live) setGpu(null);
    });

    return () => {
      live = false;
      cancelAnimationFrame(frame);
      sizeObserver.disconnect();
      mutationObserver.disconnect();
      for (const root of roots) {
        root.removeEventListener("transitionrun", settle);
        root.removeEventListener("animationstart", settle);
      }
      window.removeEventListener("resize", settle);
      for (const element of marked) delete element.dataset.liquid;
      surface.destroy();
      // Back to plain DOM in the wrapper.
      content.style.width = "";
      content.style.height = "";
      keepingScroll(content, () => wrap.append(content));
    };
  }, [gpu, content, shadow]);

  return (
    <div ref={wrapRef} className={className}>
      {gpu && (
        <canvas
          ref={canvasRef}
          className="liquid-glass-canvas absolute top-0 left-0 block size-full"
        />
      )}
      {createPortal(children, content)}
    </div>
  );
}
