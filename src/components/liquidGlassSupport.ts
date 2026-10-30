import { canvasAllowsDomInput } from "./canvasInput";

declare global {
  interface HTMLCanvasElement {
    /** HTML-in-Canvas: fires a `paint` event in the next rendering update. */
    requestPaint(): void;
  }
}

type LiquidDom = typeof import("@liquid-dom/core");
export type LiquidGpu = { lib: LiquidDom; device: GPUDevice; format: GPUTextureFormat };

let support: Promise<LiquidGpu | null> | undefined;

// One device for every surface, so pipelines compile once.
export function liquidGlassSupport() {
  support ??= (async () => {
    if (!("layoutSubtree" in HTMLCanvasElement.prototype) || !navigator.gpu) return null;
    // Painting support alone is not input support. Keep the live DOM/CSS glass
    // when the experimental canvas would swallow card clicks and context menus.
    if (!canvasAllowsDomInput(document)) return null;
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
