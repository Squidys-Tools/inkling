import { paintWithGl } from "./glPaint.ts";
import { eachBlob, gooHeight, maxBlobCount } from "./gooField.ts";

const sources = new Map<number, string>();

function fragmentSource(maxBlobs: number) {
  let source = sources.get(maxBlobs);
  if (source === undefined) {
    source = `#version 300 es
#define MAX_BLOBS ${maxBlobs}
precision highp float;
uniform vec3 uBlobs[MAX_BLOBS];
uniform int uCount;
uniform vec3 uInk;
out vec4 outColor;
void main() {
  float x = gl_FragCoord.x;
  float y = gl_FragCoord.y;
  float field = 0.0;
  for (int i = 0; i < uCount; i++) {
    vec3 blob = uBlobs[i];
    float dx = x - blob.x;
    float dy = y - blob.y;
    field += (blob.z * blob.z) / (dx * dx + dy * dy + 1e-4);
  }
  float alpha = smoothstep(0.9, 1.3, field);
  outColor = vec4(uInk, alpha);
}
`;
    sources.set(maxBlobs, source);
  }
  return source;
}

let blobData = new Float32Array(0);

/** One frame of the bar on the GPU, copied into `target`; false when the CPU painter must run. */
export function paintGooGl(
  target: CanvasRenderingContext2D,
  width: number,
  seconds: number,
  front: number,
  ink: readonly [number, number, number],
): boolean {
  const maxBlobs = maxBlobCount(width);
  if (blobData.length < maxBlobs * 3) blobData = new Float32Array(maxBlobs * 3);
  let count = 0;
  eachBlob(seconds, front, width, (x, y, r) => {
    blobData[count * 3] = x;
    blobData[count * 3 + 1] = y;
    blobData[count * 3 + 2] = r;
    count += 1;
  });
  return paintWithGl(target, fragmentSource(maxBlobs), width, gooHeight, (gl, uniform) => {
    // An empty upload is an INVALID_VALUE for uniform3fv, so skip it at zero blobs.
    if (count > 0) gl.uniform3fv(uniform("uBlobs"), blobData.subarray(0, count * 3));
    gl.uniform1i(uniform("uCount"), count);
    gl.uniform3f(uniform("uInk"), ink[0] / 255, ink[1] / 255, ink[2] / 255);
  });
}
