/// <reference lib="dom" />
import { paintGooAlpha } from "../../apps/renderer/src/shell/gooCpu.ts";
import { gooHeight } from "../../apps/renderer/src/shell/gooField.ts";
import { paintGooGl } from "../../apps/renderer/src/shell/gooGl.ts";

// CI runners have only software WebGL, which the app refuses on purpose; this page accepts it
// so the shaders still run, and counts the contexts so a run that never used WebGL fails.
const contexts: WebGL2RenderingContext[] = [];
const getContext = HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.getContext = function (
  this: HTMLCanvasElement,
  kind: string,
  options?: WebGLContextAttributes,
) {
  const attributes = { ...options, failIfMajorPerformanceCaveat: false };
  const context = (getContext as (kind: string, options?: unknown) => RenderingContext | null).call(
    this,
    kind,
    kind === "webgl2" ? attributes : options,
  );
  if (kind === "webgl2" && context) contexts.push(context as WebGL2RenderingContext);
  return context;
} as typeof getContext;

const canvas2d = (width: number, height: number) => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas.getContext("2d")!;
};

type Result = { name: string; usedGl: boolean; worst: number; detail: string };

const alphaSum = (data: Uint8ClampedArray | Uint8Array) => {
  let sum = 0;
  for (let index = 3; index < data.length; index += 4) sum += data[index]!;
  return sum;
};

// Tells a shader that drew nothing apart from a copy into the 2D canvas that lost the frame.
function describe(width: number, got: Uint8ClampedArray, want: Uint8ClampedArray) {
  const gl = contexts[0];
  if (!gl) return "no context";
  const drawn = new Uint8Array(width * gooHeight * 4);
  gl.readPixels(0, 0, width, gooHeight, gl.RGBA, gl.UNSIGNED_BYTE, drawn);
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  const renderer = info
    ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL)
    : gl.getParameter(gl.RENDERER);
  return `renderer=${renderer} error=${gl.getError()} gl=${alphaSum(drawn)} copied=${alphaSum(got)} cpu=${alphaSum(want)}`;
}

function gooCase(width: number, front: number, seconds: number): Result {
  const context = canvas2d(width, gooHeight);
  const ink = [229, 221, 210] as const;
  const usedGl = paintGooGl(context, width, seconds, front, ink);
  const got = context.getImageData(0, 0, width, gooHeight).data;
  const want = new Uint8ClampedArray(width * gooHeight * 4);
  paintGooAlpha(want, width, seconds, front);
  let worst = 0;
  for (let index = 3; index < got.length; index += 4) {
    worst = Math.max(worst, Math.abs(got[index]! - want[index]!));
    // Below half alpha the 2D canvas's unpremultiply rounding swamps a colour error.
    if (want[index]! < 128) continue;
    for (let channel = 0; channel < 3; channel++) {
      worst = Math.max(worst, Math.abs(got[index - 3 + channel]! - ink[channel]!));
    }
  }
  const detail = worst > 2 ? describe(width, got, want) : "";
  return { name: `goo ${width}px at ${front}`, usedGl, worst, detail };
}

const results: Result[] = [];
for (const width of [224, 52]) {
  for (const share of [0, 0.3, 0.62, 1]) results.push(gooCase(width, share * width, 4000.37));
}
document.title = JSON.stringify({ contexts: contexts.length, results });
