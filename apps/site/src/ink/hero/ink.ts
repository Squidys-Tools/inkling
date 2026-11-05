import * as shaders from "./shaders.ts";

type Program = { program: WebGLProgram; uniforms: Map<string, WebGLUniformLocation | null> };

const water = [0.937, 0.933, 0.91] as const;
const ink = [0.04, 0.04, 0.035] as const;
const veil = [0.065, 0.07, 0.08] as const;

// Output scales the governor steps through; the flow field always runs at 0.4 of the output.
const levels = [1, 0.85, 0.7, 0.55] as const;
const flowScale = 0.4;
const slowFrame = 20;
const sampleCount = 30;
const warmup = 45;

type PlateBox = { left: number; top: number; width: number; height: number };

export type Ink = {
  frame: (seconds: number) => void;
  resize: (width: number, height: number, ratio: number, plate: PlateBox) => void;
  stir: (x: number, y: number, dx: number, dy: number, radius: number) => void;
  dispose: () => void;
};

export function createInk(canvas: HTMLCanvasElement, image: HTMLImageElement): Ink | null {
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
    powerPreference: "default",
  });
  if (!gl) return null;

  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type);
    if (!shader) throw new Error("shader");
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
      throw new Error(gl.getShaderInfoLog(shader) ?? "shader");
    return shader;
  };
  const link = (vertex: WebGLShader, source: string): Program => {
    const program = gl.createProgram();
    const fragment = compile(gl.FRAGMENT_SHADER, source);
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.bindAttribLocation(program, 0, "position");
    gl.linkProgram(program);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw new Error(gl.getProgramInfoLog(program) ?? "program");
    const uniforms = new Map<string, WebGLUniformLocation | null>();
    const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number;
    for (let i = 0; i < count; i++) {
      const info = gl.getActiveUniform(program, i);
      if (info) uniforms.set(info.name, gl.getUniformLocation(program, info.name));
    }
    return { program, uniforms };
  };

  let flowProgram: Program;
  let displayProgram: Program;
  try {
    const vertex = compile(gl.VERTEX_SHADER, shaders.vertex);
    flowProgram = link(vertex, shaders.flow);
    displayProgram = link(vertex, shaders.display);
    gl.deleteShader(vertex);
  } catch {
    return null;
  }

  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const plate = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, plate);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, image);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const field = gl.createTexture();
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, field);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fieldBuffer = gl.createFramebuffer();
  let fieldSize = [1, 1];

  const stirs = new Float32Array(shaders.stirCount * 4);
  const pushes = new Float32Array(shaders.stirCount * 2);
  let nextStir = 0;

  const view = { width: 1, height: 1, ratio: 1, level: 0, plate: [0, 0, 1, 1] };
  let flowDue = true;
  let tick = 0;
  let last = -1;
  let clock = 0;
  const samples: number[] = [];

  const allocate = () => {
    const scale = view.ratio * levels[view.level]!;
    canvas.width = Math.max(1, Math.round(view.width * scale));
    canvas.height = Math.max(1, Math.round(view.height * scale));
    fieldSize = [
      Math.max(16, Math.round(canvas.width * flowScale)),
      Math.max(16, Math.round(canvas.height * flowScale)),
    ];
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, field);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA8,
      fieldSize[0]!,
      fieldSize[1]!,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, fieldBuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, field, 0);
    flowDue = true;
  };

  const uniform = (program: Program, name: string) => program.uniforms.get(name) ?? null;
  const aspect = () => view.width / Math.max(1, view.height);

  const renderFlow = () => {
    gl.useProgram(flowProgram.program);
    gl.uniform1f(uniform(flowProgram, "aspect"), aspect());
    gl.uniform1f(uniform(flowProgram, "time"), clock);
    gl.uniform4fv(uniform(flowProgram, "stirs[0]"), stirs);
    gl.uniform2fv(uniform(flowProgram, "pushes[0]"), pushes);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fieldBuffer);
    gl.viewport(0, 0, fieldSize[0]!, fieldSize[1]!);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };

  const renderDisplay = () => {
    gl.useProgram(displayProgram.program);
    gl.uniform1i(uniform(displayProgram, "plate"), 0);
    gl.uniform1i(uniform(displayProgram, "flowField"), 1);
    gl.uniform4fv(uniform(displayProgram, "plateRect"), view.plate);
    gl.uniform1f(uniform(displayProgram, "aspect"), aspect());
    gl.uniform1f(uniform(displayProgram, "time"), clock);
    gl.uniform3fv(uniform(displayProgram, "water"), water);
    gl.uniform3fv(uniform(displayProgram, "ink"), ink);
    gl.uniform3fv(uniform(displayProgram, "veil"), veil);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };

  const govern = (elapsed: number) => {
    if (tick < warmup) return;
    samples.push(elapsed);
    if (samples.length < sampleCount) return;
    const average = samples.reduce((sum, value) => sum + value, 0) / samples.length;
    samples.length = 0;
    if (average > slowFrame && view.level < levels.length - 1) {
      view.level += 1;
      allocate();
    }
  };

  return {
    resize(width, height, ratio, box) {
      view.width = Math.max(1, width);
      view.height = Math.max(1, height);
      view.ratio = ratio;
      view.plate = [
        box.left / view.width,
        1 - (box.top + box.height) / view.height,
        box.width / view.width,
        box.height / view.height,
      ];
      allocate();
    },
    frame(seconds) {
      const elapsed = last < 0 ? 16 : (seconds - last) * 1000;
      last = seconds;
      clock += Math.min(1 / 20, elapsed / 1000);
      // A hidden tab or a long pause skews the average; only real frame gaps count.
      if (elapsed < 250) govern(elapsed);
      for (let i = 0; i < shaders.stirCount; i++) {
        const k = i * 4 + 3;
        if (stirs[k]! > 0) stirs[k] = stirs[k]! > 6 ? 0 : stirs[k]! + elapsed / 1000;
      }
      tick += 1;
      if (flowDue || tick % 2 === 0) {
        renderFlow();
        flowDue = false;
      }
      renderDisplay();
    },
    stir(x, y, dx, dy, radius) {
      const slot = nextStir;
      nextStir = (nextStir + 1) % shaders.stirCount;
      stirs.set([x, y, radius, 0.001], slot * 4);
      pushes.set([dx, dy], slot * 2);
      flowDue = true;
    },
    dispose() {
      gl.deleteProgram(flowProgram.program);
      gl.deleteProgram(displayProgram.program);
      gl.deleteTexture(plate);
      gl.deleteTexture(field);
      gl.deleteFramebuffer(fieldBuffer);
      gl.deleteBuffer(quad);
    },
  };
}
