import { compositeFragment, flowFragment, quadVertex } from "./shaders.ts";

const imageAspect = 1376 / 768;

function compile(gl: WebGL2RenderingContext, fragment: string) {
  const program = gl.createProgram();
  for (const [kind, source] of [
    [gl.VERTEX_SHADER, quadVertex],
    [gl.FRAGMENT_SHADER, fragment],
  ] as const) {
    const shader = gl.createShader(kind);
    if (!shader) throw new Error("shader allocation failed");
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
      throw new Error(gl.getShaderInfoLog(shader) ?? "shader failed");
    gl.attachShader(program, shader);
  }
  gl.bindAttribLocation(program, 0, "aPosition");
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS))
    throw new Error(gl.getProgramInfoLog(program) ?? "link failed");
  const uniforms = new Map<string, WebGLUniformLocation | null>();
  const at = (name: string) => {
    if (!uniforms.has(name)) uniforms.set(name, gl.getUniformLocation(program, name));
    return uniforms.get(name) ?? null;
  };
  return { program, at };
}

function upload(gl: WebGL2RenderingContext, image: TexImageSource, mipmaps: boolean) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  if (mipmaps) gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(
    gl.TEXTURE_2D,
    gl.TEXTURE_MIN_FILTER,
    mipmaps ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR,
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return texture;
}

const ease = (x: number) => x * x * (3 - 2 * x);

/** The part of the moodboard plate on screen, as image uv: x, y of the top left, then width, height. */
function framing(aspect: number, progress: number) {
  const settle = ease(Math.min(1, progress / 0.5));
  if (aspect < 1) {
    const width = 0.5 / (1.12 - 0.12 * settle);
    const height = (width * imageAspect) / aspect;
    return [0.505 - width / 2, 0.49 - height * (0.36 - 0.04 * settle), width, height] as const;
  }
  const zoom = 1.2 - 0.2 * settle;
  let width = 1;
  let height = imageAspect / aspect;
  if (height > 1) {
    width = 1 / height;
    height = 1;
  }
  width /= zoom;
  height /= zoom;
  const cx = 0.52 - 0.02 * settle;
  const cy = 0.34 + 0.16 * settle;
  const x = Math.min(1 - width, Math.max(0, cx - width / 2));
  const y = Math.min(1 - height, Math.max(0, cy - height / 2));
  return [x, y, width, height] as const;
}

/** Source pixels per CSS pixel at rest, so the canvas never renders finer than the plate. */
export function plateDensity(cssWidth: number, cssHeight: number) {
  const [, , width] = framing(cssWidth / cssHeight, 1);
  return (width * 1376) / cssWidth;
}

export type Plates = { still: TexImageSource; clean: TexImageSource; mask: TexImageSource };
export type Frame = { progress: number; time: number; hit: number; pour: number; flow: boolean };

export function createScene(canvas: HTMLCanvasElement, plates: Plates) {
  const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, depth: false });
  if (!gl) throw new Error("webgl2 unavailable");

  const flowProgram = compile(gl, flowFragment);
  const composite = compile(gl, compositeFragment);

  const quad = gl.createVertexArray();
  gl.bindVertexArray(quad);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const still = upload(gl, plates.still, true);
  const clean = upload(gl, plates.clean, true);
  const mask = upload(gl, plates.mask, false);

  const flow = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, flow);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const flowBuffer = gl.createFramebuffer();

  let width = 0;
  let height = 0;
  let flowWidth = 0;
  let flowHeight = 0;
  let aspect = 1;
  let flowReady = false;

  function resize(cssWidth: number, cssHeight: number, ratio: number, flowRatio: number) {
    if (!gl) return;
    aspect = cssWidth / Math.max(1, cssHeight);
    const w = Math.max(1, Math.round(cssWidth * ratio));
    const h = Math.max(1, Math.round(cssHeight * ratio));
    if (w !== width || h !== height) {
      width = w;
      height = h;
      canvas.width = w;
      canvas.height = h;
    }
    const fw = Math.max(1, Math.round(cssWidth * flowRatio));
    const fh = Math.max(1, Math.round(cssHeight * flowRatio));
    if (fw !== flowWidth || fh !== flowHeight) {
      flowWidth = fw;
      flowHeight = fh;
      gl.bindTexture(gl.TEXTURE_2D, flow);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, fw, fh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, flowBuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, flow, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      flowReady = false;
    }
  }

  function render({ progress, time, hit, pour, flow: step }: Frame) {
    if (!gl || width === 0) return;
    const view = framing(aspect, progress);
    gl.bindVertexArray(quad);

    if (step || !flowReady) {
      flowReady = true;
      gl.bindFramebuffer(gl.FRAMEBUFFER, flowBuffer);
      gl.viewport(0, 0, flowWidth, flowHeight);
      gl.useProgram(flowProgram.program);
      gl.uniform2f(flowProgram.at("uResolution"), flowWidth, flowHeight);
      gl.uniform4f(flowProgram.at("uFrame"), ...view);
      gl.uniform1f(flowProgram.at("uTime"), time);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
    gl.useProgram(composite.program);
    for (const [unit, texture, name] of [
      [0, still, "uStill"],
      [1, clean, "uClean"],
      [2, mask, "uMask"],
      [3, flow, "uFlow"],
    ] as const) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(composite.at(name), unit);
    }
    gl.uniform2f(composite.at("uResolution"), width, height);
    gl.uniform4f(composite.at("uFrame"), ...view);
    gl.uniform1f(composite.at("uTime"), time);
    gl.uniform1f(composite.at("uPour"), pour);
    gl.uniform1f(composite.at("uHit"), hit);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function dispose() {
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  }

  return { resize, render, dispose };
}
