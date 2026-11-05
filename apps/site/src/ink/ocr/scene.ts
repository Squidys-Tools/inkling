import type { WordBox } from "./receipt.ts";
import { compositeFragment, paperFragment, paperVertex, quadVertex } from "./shaders.ts";

type Mat4 = Float32Array;

function perspective(fov: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1 / Math.tan(fov / 2);
  const out = new Float32Array(16);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) / (near - far);
  out[11] = -1;
  out[14] = (2 * far * near) / (near - far);
  return out;
}

function multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Float32Array(16);
  for (let col = 0; col < 4; col++)
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[k * 4 + row] * b[col * 4 + k];
      out[col * 4 + row] = sum;
    }
  return out;
}

function rotation(x: number, y: number, z: number): Mat4 {
  const [cx, sx, cy, sy, cz, sz] = [
    Math.cos(x),
    Math.sin(x),
    Math.cos(y),
    Math.sin(y),
    Math.cos(z),
    Math.sin(z),
  ];
  const rx = new Float32Array([1, 0, 0, 0, 0, cx, sx, 0, 0, -sx, cx, 0, 0, 0, 0, 1]);
  const ry = new Float32Array([cy, 0, -sy, 0, 0, 1, 0, 0, sy, 0, cy, 0, 0, 0, 0, 1]);
  const rz = new Float32Array([cz, sz, 0, 0, -sz, cz, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  return multiply(rz, multiply(ry, rx));
}

function translation(x: number, y: number, z: number): Mat4 {
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]);
}

function upperLeft(m: Mat4) {
  return new Float32Array([m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]]);
}

function compile(gl: WebGL2RenderingContext, vertex: string, fragment: string) {
  const program = gl.createProgram();
  for (const [kind, source] of [
    [gl.VERTEX_SHADER, vertex],
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

function target(gl: WebGL2RenderingContext) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return texture;
}

const columns = 72;
const rows = 108;
const paperSize = [0.95, 1.425] as const;

function sheet() {
  const uv = new Float32Array((columns + 1) * (rows + 1) * 2);
  for (let y = 0, i = 0; y <= rows; y++)
    for (let x = 0; x <= columns; x++, i += 2) {
      uv[i] = x / columns;
      uv[i + 1] = y / rows;
    }
  const index = new Uint32Array(columns * rows * 6);
  for (let y = 0, i = 0; y < rows; y++)
    for (let x = 0; x < columns; x++, i += 6) {
      const a = y * (columns + 1) + x;
      const b = a + columns + 1;
      index.set([a, b, a + 1, a + 1, b, b + 1], i);
    }
  return { uv, index };
}

/** Where the scroll and the clock put the scene: 0 is the receipt entering, 1 is it settled deep. */
export type Frame = { progress: number; time: number; hit: number };

export function createScene(canvas: HTMLCanvasElement, receipt: HTMLCanvasElement, word: WordBox) {
  const gl = canvas.getContext("webgl2", { antialias: false, alpha: false });
  if (!gl) throw new Error("webgl2 unavailable");

  const paper = compile(gl, paperVertex, paperFragment);
  const composite = compile(gl, quadVertex, compositeFragment);

  const { uv, index } = sheet();
  const paperVao = gl.createVertexArray();
  gl.bindVertexArray(paperVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, uv, gl.STATIC_DRAW);
  const aUv = gl.getAttribLocation(paper.program, "aUv");
  gl.enableVertexAttribArray(aUv);
  gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, index, gl.STATIC_DRAW);

  const quadVao = gl.createVertexArray();
  gl.bindVertexArray(quadVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const aPosition = gl.getAttribLocation(composite.program, "aPosition");
  gl.enableVertexAttribArray(aPosition);
  gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  const receiptTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, receiptTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, receipt);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const scene = target(gl);
  const mask = target(gl);
  const depth = gl.createRenderbuffer();
  const framebuffer = gl.createFramebuffer();
  let width = 0;
  let height = 0;

  function resize(cssWidth: number, cssHeight: number, ratio: number) {
    const w = Math.max(1, Math.round(cssWidth * ratio));
    const h = Math.max(1, Math.round(cssHeight * ratio));
    if (!gl || (w === width && h === height)) return;
    width = w;
    height = h;
    canvas.width = w;
    canvas.height = h;
    for (const texture of [scene, mask]) {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.generateMipmap(gl.TEXTURE_2D);
    }
    gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, scene, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, mask, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  function render({ progress, time, hit }: Frame) {
    if (!gl || width === 0) return;
    const aspect = width / height;
    const fit = Math.min(1, aspect / 0.72);
    const projection = perspective(0.62, aspect, 0.1, 20);
    const sink = 1 - Math.pow(1 - progress, 1.6);
    const y = 0.98 - 1.12 * sink + 0.03 * Math.sin(time * 0.5);
    const z = -2.85 / fit - 0.25 * sink;
    const sway = Math.sin(time * 0.31) * 0.05;
    const shift = aspect > 1.2 ? Math.min(0.5, (aspect - 1.2) * 0.45) * -z * 0.32 : 0;
    const model = multiply(
      translation(shift + 0.04 * Math.sin(time * 0.23), y, z),
      rotation(-0.42 + 0.22 * sink + sway, 0.22 - 0.12 * sink + sway * 0.6, -0.16 + 0.07 * sink),
    );
    const clip = multiply(projection, model);
    const cx = clip[12] / clip[15];
    const cy = clip[13] / clip[15];

    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.viewport(0, 0, width, height);
    gl.clearBufferfv(gl.COLOR, 0, [0, 0, 0, 0]);
    gl.clearBufferfv(gl.COLOR, 1, [0, 0, 0, 0]);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.useProgram(paper.program);
    gl.uniformMatrix4fv(paper.at("uProjection"), false, projection);
    gl.uniformMatrix4fv(paper.at("uModelView"), false, model);
    gl.uniformMatrix3fv(paper.at("uNormalMatrix"), false, upperLeft(model));
    gl.uniform2f(paper.at("uSize"), paperSize[0], paperSize[1]);
    gl.uniform1f(paper.at("uTime"), time);
    gl.uniform1f(paper.at("uHit"), hit);
    gl.uniform1f(paper.at("uFog"), 0.04 + 0.16 * sink);
    gl.uniform4f(paper.at("uWord"), word.x, word.y, word.width, word.height);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, receiptTexture);
    gl.uniform1i(paper.at("uReceipt"), 0);
    gl.bindVertexArray(paperVao);
    gl.drawElements(gl.TRIANGLES, index.length, gl.UNSIGNED_INT, 0);
    gl.disable(gl.DEPTH_TEST);

    for (const texture of [scene, mask]) {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.generateMipmap(gl.TEXTURE_2D);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
    gl.useProgram(composite.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, scene);
    gl.uniform1i(composite.at("uScene"), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, mask);
    gl.uniform1i(composite.at("uMask"), 1);
    gl.uniform2f(composite.at("uResolution"), width, height);
    gl.uniform2f(composite.at("uCenter"), cx * 0.5 + 0.5, cy * 0.5 + 0.5);
    gl.uniform1f(composite.at("uTime"), time);
    gl.uniform1f(composite.at("uHit"), hit);
    gl.uniform1f(composite.at("uInk"), 1 - 0.62 * progress);
    gl.uniform1f(composite.at("uSurface"), 0.9 + 0.12 * sink);
    gl.bindVertexArray(quadVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  function dispose() {
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  }

  return { resize, render, dispose };
}
