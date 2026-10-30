// Bun's ambient GPU interfaces omit the DOM canvas overload and runtime usage constants.
// Complete those declarations for both tsc and tsc-rs; no runtime shim is installed.
interface HTMLCanvasElement {
  getContext(contextId: "webgpu"): GPUCanvasContext | null;
}

declare const GPUTextureUsage: {
  readonly COPY_SRC: 1;
  readonly COPY_DST: 2;
  readonly TEXTURE_BINDING: 4;
  readonly STORAGE_BINDING: 8;
  readonly RENDER_ATTACHMENT: 16;
};
