import type {
  Container,
  Scene,
  Glass,
  Html,
  WebGpuDomContentSource,
  WebGpuGlassContentSource,
  WebGpuGlassCore,
} from "@liquid-dom/core";
import type { LiquidGpu } from "./liquidGlassSupport";
import { type GlassShape, glassBands } from "./liquidGlassShape";

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

export class LiquidSurface {
  private readonly scene: Scene;
  private readonly backdrop: Html;
  private readonly container: Container;
  private readonly source: WebGpuDomContentSource;
  private readonly bandSource: WebGpuGlassContentSource;
  private readonly core: WebGpuGlassCore;
  private readonly context: GPUCanvasContext;
  private readonly glasses = new Map<HTMLElement, Glass>();
  private bandTexture: GPUTexture | null = null;
  private bandLeft = 0;
  private bandTop = 0;
  private dpr = 1;
  private scrolling = false;

  constructor(
    private readonly gpu: LiquidGpu,
    private readonly canvas: HTMLCanvasElement,
    content: HTMLElement,
    private readonly fallbackParent: HTMLElement,
    private readonly onFrameReady: () => void,
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
            e: inverse.e + inverse.a * this.bandLeft + inverse.c * this.bandTop,
            f: inverse.f + inverse.b * this.bandLeft + inverse.d * this.bandTop,
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

  // Copying the whole stage to a texture is too slow per scroll frame, so the
  // host rides out the gesture in the fallback parent (native render and input)
  // and returns to the canvas once scrolling settles.
  setScrolling(scrolling: boolean) {
    if (scrolling === this.scrolling) return;
    this.scrolling = scrolling;
    const host = this.backdrop.host;
    if (scrolling) {
      this.canvas.hidden = true;
      this.fallbackParent.append(host);
    } else {
      this.canvas.append(host);
      this.canvas.hidden = false;
      this.canvas.requestPaint();
    }
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

  // Draws only on paint events (DOM changes or requestPaint); idle frames cost
  // nothing. liquid-dom renders only the band rects holding glass; the rest of
  // the frame is a copy of the content texture.
  private readonly draw = () => {
    // While scrolling the host renders natively in the fallback parent; a sync
    // here would pull it back into the canvas.
    if (this.scrolling) return;
    const { width, height } = this.canvas;
    const bands = glassBands(this.glasses.values(), this.dpr, width, height);
    this.source.sync();
    const output = this.context.getCurrentTexture();
    const content = this.source.getSceneHtmlEntry(this.backdrop);
    if (bands.length === 1 && bands[0].height === height && bands[0].width === width) {
      this.renderBand(0, 0, width, height, output);
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
      // a copy recorded into one encoder would read the last band's render.
      for (const band of bands) {
        const target = this.bandTarget(band.width, band.height);
        this.renderBand(band.left, band.top, band.width, band.height, target);
        const copy = this.gpu.device.createCommandEncoder();
        copy.copyTextureToTexture(
          { texture: target },
          { texture: output, origin: { x: band.left, y: band.top } },
          { width: band.width, height: band.height },
        );
        this.gpu.device.queue.submit([copy.finish()]);
      }
    }
    // The browser hit-tests the canvas's children only where they are drawn.
    // The host (the direct canvas child) lands 1:1 at the origin, and
    // preserveHitTestOrder keeps the UI chrome above it in the hit order.
    this.canvas.updateElementGeometry(this.backdrop.host, {
      canvasTransform: new DOMMatrix(),
      preserveHitTestOrder: true,
    });
    if (content?.copiedDeviceWidth) this.onFrameReady();
  };

  // Layers carry transforms baked when they are listed, so each band hands
  // liquid-dom the scene and gets the glass shifted by its own offset.
  private renderBand(
    left: number,
    top: number,
    width: number,
    height: number,
    outputTexture: GPUTexture,
  ) {
    this.bandLeft = left;
    this.bandTop = top;
    this.container.x = -left / this.dpr;
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
