import type { Saved } from "./items.ts";
import { lookAt, perspective, placement, seeded, type Vec3, viewDepth } from "./math.ts";
import {
  backgroundFragment,
  cardFragment,
  cardVertex,
  quadVertex,
  wispFragment,
  wispVertex,
} from "./shaders.ts";
import { drawWriting, writingAspect } from "./writing.ts";

const spacing = 1.15;
const firstDepth = 3.1;
const focus = 3.1;
const strandSegments = 96;

type Card = {
  half: [number, number];
  border: number;
  writing: boolean;
  base: Vec3;
  tilt: Vec3;
  phase: Vec3;
  texture: WebGLTexture;
  texelsPerUnit: number;
  ready: number;
  loaded: boolean;
  loadedAt: number;
  position: Vec3;
  model: Float32Array;
};

type Wisp = { from: number; to: number; bendFrom: Vec3; bendTo: Vec3; seed: number };

export type Frame = {
  time: number;
  progress: number;
  pointer: [number, number];
  still: boolean;
};

function compile(gl: WebGL2RenderingContext, vertex: string, fragment: string) {
  const program = gl.createProgram();
  for (const [type, source] of [
    [gl.VERTEX_SHADER, vertex],
    [gl.FRAGMENT_SHADER, fragment],
  ] as const) {
    const shader = gl.createShader(type);
    if (!shader) throw new Error("shader");
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
      throw new Error(gl.getShaderInfoLog(shader) ?? "shader");
    gl.attachShader(program, shader);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS))
    throw new Error(gl.getProgramInfoLog(program) ?? "program");
  const uniforms = new Map<string, WebGLUniformLocation | null>();
  const at = (name: string) => {
    if (!uniforms.has(name)) uniforms.set(name, gl.getUniformLocation(program, name));
    return uniforms.get(name) ?? null;
  };
  return { program, at };
}

function upload(gl: WebGL2RenderingContext, texture: WebGLTexture, source: TexImageSource) {
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}

function travelFor(count: number) {
  return (count - 1) * spacing + 1.2;
}

export function createScene(canvas: HTMLCanvasElement, items: Saved[], onReady: () => void) {
  const gl = canvas.getContext("webgl2", {
    antialias: true,
    premultipliedAlpha: true,
    alpha: false,
  });
  if (!gl) return null;

  const background = compile(gl, quadVertex, backgroundFragment);
  const card = compile(gl, cardVertex, cardFragment);
  const wisp = compile(gl, wispVertex, wispFragment);

  const quad = gl.createVertexArray();
  gl.bindVertexArray(quad);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const strand = gl.createVertexArray();
  gl.bindVertexArray(strand);
  const strandData = new Float32Array((strandSegments + 1) * 4);
  for (let i = 0; i <= strandSegments; i++) {
    strandData.set([i / strandSegments, -1, i / strandSegments, 1], i * 4);
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, strandData, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  const random = seeded(7);
  const cards: Card[] = items.map((item, index) => {
    const aspect = item.kind === "photo" ? item.aspect : writingAspect[item.kind];
    const height = (item.kind === "photo" ? 0.5 : 0.44) * (0.85 + random() * 0.3);
    const angle = index * 2.39996 + random() * 0.6;
    const radius = 0.5 + random() * 0.75;
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([240, 238, 232, 255]),
    );
    return {
      half: [height * aspect, height],
      border: item.kind === "photo" ? 0.028 : 0,
      writing: item.kind !== "photo",
      base: [
        Math.cos(angle) * radius * 1.45,
        Math.sin(angle) * radius * 0.62,
        -(firstDepth + index * spacing + (random() - 0.5) * 0.5),
      ],
      tilt: [(random() - 0.5) * 0.4, (random() - 0.5) * 0.7, (random() - 0.5) * 0.3],
      phase: [random() * 6.28, random() * 6.28, random() * 6.28],
      texture,
      texelsPerUnit: 1,
      ready: 0,
      loaded: false,
      loadedAt: -1,
      position: [0, 0, 0],
      model: new Float32Array(16),
    };
  });

  const wisps: Wisp[] = [];
  for (let i = 0; i < cards.length - 1; i++) {
    if (random() < 0.3) continue;
    const reach = i + 1 + (random() < 0.35 ? 1 : 0);
    const to = Math.min(reach, cards.length - 1);
    for (let strandIndex = 0; strandIndex < 2; strandIndex++) {
      wisps.push({
        from: i,
        to,
        bendFrom: [(random() - 0.5) * 1.6, (random() - 0.3) * 1.1, -random() * 0.6],
        bendTo: [(random() - 0.5) * 1.6, (random() - 0.5) * 1.1, random() * 0.6],
        seed: random(),
      });
    }
  }

  let disposed = false;
  let pending = items.length;
  const settle = () => {
    pending -= 1;
    if (pending === 0 && !disposed) onReady();
  };
  items.forEach((item, index) => {
    const target = cards[index];
    if (item.kind !== "photo") {
      void Promise.all([
        document.fonts.load('500 40px "Red Hat"'),
        document.fonts.load('700 40px "Red Hat"'),
      ])
        .catch(() => {})
        .then(() => {
          if (disposed) return;
          const writing = drawWriting(item);
          upload(gl, target.texture, writing);
          target.texelsPerUnit = writing.height / (2 * target.half[1]);
          target.loaded = true;
          settle();
        });
      return;
    }
    const image = new Image();
    image.decoding = "async";
    image.src = item.src;
    image
      .decode()
      .then(() => {
        if (disposed) return;
        upload(gl, target.texture, image);
        target.texelsPerUnit = image.naturalHeight / (2 * (target.half[1] - target.border));
        target.loaded = true;
      })
      .catch(() => {})
      .finally(settle);
  });

  let width = 1;
  let height = 1;
  const resize = () => {
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    width = Math.max(1, Math.round(canvas.clientWidth * ratio));
    height = Math.max(1, Math.round(canvas.clientHeight * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  };

  const travel = travelFor(items.length);

  const render = ({ time, progress, pointer, still }: Frame) => {
    resize();
    gl.viewport(0, 0, width, height);
    const aspect = width / height;
    const spread = Math.min(1, aspect / 1.5);
    const lean = aspect > 1.2 ? 0.35 : 0;
    const cameraZ = -progress * travel;
    const eye: Vec3 = [pointer[0] * 0.32, pointer[1] * 0.2, cameraZ];
    const view = lookAt(eye, [pointer[0] * 0.08, pointer[1] * 0.05, cameraZ - 6]);
    const projection = perspective(aspect < 1 ? 1.1 : 0.8, aspect, 0.05, 60);

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.useProgram(background.program);
    gl.uniform2f(background.at("uResolution"), width, height);
    gl.uniform1f(background.at("uTime"), time);
    gl.uniform1f(background.at("uTravel"), progress * travel * 0.12);
    gl.uniform2f(background.at("uPointer"), pointer[0], pointer[1]);
    gl.bindVertexArray(quad);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    for (const each of cards) {
      const [px, py, pz] = each.phase;
      each.position = [
        (each.base[0] + lean) * spread + Math.sin(time * 0.13 + px) * 0.09,
        each.base[1] + Math.sin(time * 0.11 + py) * 0.07 + Math.sin(time * 0.05 + pz) * 0.04,
        each.base[2] + Math.sin(time * 0.09 + pz) * 0.12,
      ];
      each.model = placement(
        each.position,
        each.tilt[0] + Math.sin(time * 0.1 + py) * 0.07,
        each.tilt[1] + Math.sin(time * 0.08 + px) * 0.1,
        each.tilt[2] + Math.sin(time * 0.07 + pz) * 0.05,
      );
      if (each.loaded && each.loadedAt < 0) each.loadedAt = time;
      each.ready = still
        ? Number(each.loaded)
        : each.loaded
          ? Math.min(1, (time - each.loadedAt) / 1.2)
          : 0;
    }

    const drawables: { depth: number; draw: () => void }[] = [];
    for (const each of cards) {
      const depth = viewDepth(view, each.position);
      if (depth < 0.2 || depth > 27) continue;
      drawables.push({ depth, draw: () => drawCard(each) });
    }
    for (const each of wisps) {
      const a = cards[each.from].position;
      const b = cards[each.to].position;
      const middle: Vec3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
      const depth = viewDepth(view, middle);
      if (depth < 0.3 || depth > 25) continue;
      drawables.push({ depth, draw: () => drawWisp(each) });
    }
    drawables.sort((x, y) => y.depth - x.depth);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(card.program);
    gl.uniformMatrix4fv(card.at("uView"), false, view);
    gl.uniformMatrix4fv(card.at("uProjection"), false, projection);
    gl.uniform2f(card.at("uResolution"), width, height);
    gl.uniform1f(card.at("uTime"), time);
    gl.uniform1f(card.at("uFocus"), focus);
    gl.uniform1i(card.at("uImage"), 0);
    gl.useProgram(wisp.program);
    gl.uniformMatrix4fv(wisp.at("uView"), false, view);
    gl.uniformMatrix4fv(wisp.at("uProjection"), false, projection);
    gl.uniform2f(wisp.at("uResolution"), width, height);
    gl.uniform1f(wisp.at("uTime"), time);
    gl.uniform1f(wisp.at("uFocus"), focus);
    gl.uniform1f(wisp.at("uWidth"), Math.max(1.1, height / 640));

    let active: WebGLProgram | null = null;
    const bind = (program: WebGLProgram, vao: WebGLVertexArrayObject) => {
      if (active === program) return;
      active = program;
      gl.useProgram(program);
      gl.bindVertexArray(vao);
    };

    const drawCard = (each: Card) => {
      bind(card.program, quad);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, each.texture);
      gl.uniformMatrix4fv(card.at("uModel"), false, each.model);
      gl.uniform2f(card.at("uHalf"), each.half[0], each.half[1]);
      gl.uniform1f(card.at("uMargin"), 0.2);
      gl.uniform1f(card.at("uBorder"), each.border);
      gl.uniform1f(card.at("uWriting"), each.writing ? 1 : 0);
      gl.uniform1f(card.at("uTexelsPerUnit"), each.texelsPerUnit);
      gl.uniform1f(card.at("uReady"), each.ready);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };

    const drawWisp = (each: Wisp) => {
      bind(wisp.program, strand);
      const from = cards[each.from];
      const to = cards[each.to];
      const a = from.position;
      const b = to.position;
      const side = Math.sign(b[0] - a[0]) || 1;
      const start: Vec3 = [a[0] + side * from.half[0] * 0.8, a[1] - from.half[1] * 0.3, a[2]];
      const end: Vec3 = [b[0] - side * to.half[0] * 0.8, b[1] + to.half[1] * 0.2, b[2]];
      gl.uniform3f(wisp.at("uFrom"), ...start);
      gl.uniform3f(wisp.at("uTo"), ...end);
      gl.uniform3f(
        wisp.at("uBendFrom"),
        start[0] + each.bendFrom[0],
        start[1] + each.bendFrom[1],
        start[2] + each.bendFrom[2],
      );
      gl.uniform3f(
        wisp.at("uBendTo"),
        end[0] + each.bendTo[0],
        end[1] + each.bendTo[1],
        end[2] + each.bendTo[2],
      );
      gl.uniform1f(wisp.at("uSeed"), each.seed);
      gl.uniform1f(wisp.at("uStrength"), 0.85);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, (strandSegments + 1) * 2);
    };

    for (const each of drawables) each.draw();
  };

  const dispose = () => {
    disposed = true;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  };

  return { render, dispose };
}
