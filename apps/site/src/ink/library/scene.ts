import type { Saved } from "./items.ts";
import {
  lookAt,
  multiply,
  perspective,
  placement,
  project,
  seeded,
  type Vec3,
  viewDepth,
} from "./math.ts";
import { compile } from "./program.ts";
import {
  backgroundFragment,
  cardFragment,
  cardVertex,
  causticFragment,
  guideFragment,
  inkFragment,
  quadVertex,
  wispVertex,
} from "./shaders.ts";
import { createSmoke, type Path } from "./smoke.ts";
import { drawWriting, writingAspect } from "./writing.ts";

const focus = 3.4;
const aperture = 0.022;
const near = 0.7;
const span = 10.5;
const travel = 30;
const cloudCount = 46;
const strandSegments = 72;
const causticSize = 256;

type Spot = { ndc: [number, number]; depth: number };

const heroSpots: Spot[] = [
  { ndc: [-0.01, 0.02], depth: focus },
  { ndc: [-0.115, 0.045], depth: focus + 0.2 },
  { ndc: [0.11, 0.03], depth: focus + 0.26 },
];

const satelliteSpots: Spot[] = [
  { ndc: [0.58, 0.3], depth: focus + 1.2 },
  { ndc: [0.8, -0.1], depth: focus + 0.6 },
  { ndc: [0.34, -0.42], depth: focus + 1.8 },
  { ndc: [-0.52, 0.34], depth: focus + 1.4 },
  { ndc: [-0.74, -0.14], depth: focus + 0.7 },
];

type Card = {
  item: number;
  half: [number, number];
  border: number;
  writing: boolean;
  spot: Spot | null;
  cloud: [number, number, number];
  tilt: Vec3;
  phase: Vec3;
  position: Vec3;
  depth: number;
  model: Float32Array;
};

type Texture = {
  texture: WebGLTexture;
  texelsPerUnit: number;
  loaded: boolean;
  loadedAt: number;
};

type Wisp = { from: number; to: number; bendFrom: Vec3; bendTo: Vec3; seed: number };

export type Frame = {
  time: number;
  progress: number;
  pointer: [number, number];
  still: boolean;
};

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

function circleOfConfusion(depth: number) {
  const off = 1 - focus / depth;
  return aperture * Math.abs(off) * (off < 0 ? 1 : 0.57);
}

export function createScene(
  canvas: HTMLCanvasElement,
  items: Saved[],
  onReady: () => void,
  mobile: boolean,
) {
  const gl = canvas.getContext("webgl2", {
    antialias: true,
    premultipliedAlpha: true,
    alpha: false,
  });
  if (!gl) return null;

  const background = compile(gl, quadVertex, backgroundFragment);
  const caustic = compile(gl, quadVertex, causticFragment);
  const card = compile(gl, cardVertex, cardFragment);
  const wisp = compile(gl, wispVertex, guideFragment);
  const ink = compile(gl, quadVertex, inkFragment);

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

  const smoke = createSmoke(gl, quad, mobile, seeded(29));

  const causticTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, causticTexture);
  gl.texStorage2D(gl.TEXTURE_2D, Math.log2(causticSize) + 1, gl.RGBA8, causticSize, causticSize);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  const causticTarget = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, causticTarget);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, causticTexture, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  const textures: Texture[] = items.map(() => {
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
      new Uint8Array([240, 238, 232, 0]),
    );
    return { texture, texelsPerUnit: 1, loaded: false, loadedAt: -1 };
  });

  const random = seeded(11);
  const aspectOf = (index: number) => {
    const item = items[index];
    return item.kind === "photo" ? item.aspect : writingAspect[item.kind];
  };
  const makeCard = (
    item: number,
    height: number,
    spot: Spot | null,
    cloud: [number, number, number],
  ): Card => {
    const kind = items[item].kind;
    return {
      item,
      half: [(height * aspectOf(item)) / 2, height / 2],
      border: kind === "photo" ? height * 0.045 : 0,
      writing: kind !== "photo",
      spot,
      cloud,
      tilt: [(random() - 0.5) * 0.5, (random() - 0.5) * 0.8, (random() - 0.5) * 0.35],
      phase: [random() * 6.28, random() * 6.28, random() * 6.28],
      position: [0, 0, 0],
      depth: 0,
      model: new Float32Array(16),
    };
  };

  const indexOf = (kind: Saved["kind"]) => items.findIndex((item) => item.kind === kind);
  const photos = items.flatMap((item, index) => (item.kind === "photo" ? [index] : []));
  const note = indexOf("note");
  const quote = indexOf("quote");
  const article = indexOf("article");
  const heroItems = [note, quote, photos[photos.length - 1]];
  const cards: Card[] = heroItems.map((item, index) => {
    const each = makeCard(item, index === 0 ? 0.66 : 0.6, heroSpots[index], [0, 0, 0]);
    each.tilt = [0.02 * index, (index - 1) * -0.18, [0.015, -0.05, 0.04][index]];
    return each;
  });
  const satelliteItems = [photos[3], article, photos[8], photos[12], photos[5]];
  satelliteItems.forEach((item, index) => {
    cards.push(makeCard(item, 0.5 * (0.9 + random() * 0.2), satelliteSpots[index], [0, 0, 0]));
  });

  const pool = [...photos, ...photos, ...photos, quote, article, quote];
  for (let i = 0; i < cloudCount; i++) {
    const item = pool[(i * 7) % pool.length];
    let sx = 0;
    let sy = 0;
    let depth = 0;
    const height = (items[item].kind === "photo" ? 0.5 : 0.46) * (0.75 + random() * 0.5);
    for (let attempt = 0; attempt < 24; attempt++) {
      sx = (random() * 2 - 1) * 1.3;
      sy = (random() * 2 - 1) * 1.2;
      depth = near + ((i + random()) / cloudCount) * span;
      const reach = (1.25 + 0.58 * depth) / depth;
      const size = (height * 0.55) / (depth * 0.42);
      const x = Math.abs(sx * reach) - size * 0.8;
      const y = Math.abs(sy * reach) - size;
      const clearOfHero = depth > focus + 2.5 || x > 0.3 || y > 0.34;
      const edgeOnly = depth > 2.4 || x > 0.55 || sy < -0.4;
      const inFrame = Math.abs(sx * reach) < 1.1 && Math.abs(sy * reach) < 1.1;
      if (clearOfHero && edgeOnly && inFrame) break;
    }
    cards.push(makeCard(item, height, null, [sx, sy, depth - near]));
  }

  const wisps: Wisp[] = [];
  const link = (from: number, to: number, count: number) => {
    for (let i = 0; i < count; i++) {
      wisps.push({
        from,
        to,
        bendFrom: [(random() - 0.5) * 0.9, (random() - 0.2) * 0.8, -random() * 0.8],
        bendTo: [(random() - 0.5) * 1.1, (random() - 0.5) * 0.9, random() * 0.6],
        seed: random(),
      });
    }
  };
  link(0, 3, 1);
  link(2, 4, 2);
  link(2, 5, 1);
  link(1, 6, 1);
  link(1, 7, 2);
  link(3, 4, 1);

  let disposed = false;
  let pending = items.length;
  const settle = () => {
    pending -= 1;
    if (pending === 0 && !disposed) onReady();
  };
  const heightOf = (item: number) => {
    const sizes = cards.filter((each) => each.item === item).map((each) => each.half[1] * 2);
    return sizes.length ? Math.min(...sizes) : 0.5;
  };
  items.forEach((item, index) => {
    const target = textures[index];
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
          target.texelsPerUnit = writing.height / heightOf(index);
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
        target.texelsPerUnit = image.naturalHeight / (heightOf(index) * 0.91);
        target.loaded = true;
      })
      .catch(() => {})
      .finally(settle);
  });

  let cssWidth = Math.max(1, canvas.clientWidth);
  let cssHeight = Math.max(1, canvas.clientHeight);
  const observer = new ResizeObserver(([entry]) => {
    cssWidth = Math.max(1, entry.contentRect.width);
    cssHeight = Math.max(1, entry.contentRect.height);
  });
  observer.observe(canvas);

  let quality = 1;
  let width = 1;
  let height = 1;
  const resize = () => {
    const ratio = Math.min(window.devicePixelRatio || 1, mobile ? 1 : 1.5) * quality;
    width = Math.max(1, Math.round(cssWidth * ratio));
    height = Math.max(1, Math.round(cssHeight * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  };

  let frames = 0;
  const bakeCaustic = (time: number) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, causticTarget);
    gl.viewport(0, 0, causticSize, causticSize);
    gl.useProgram(caustic.program);
    gl.uniform1f(caustic.at("uTime"), time * 0.35);
    gl.bindVertexArray(quad);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, causticTexture);
    gl.generateMipmap(gl.TEXTURE_2D);
  };

  const ends = (each: Wisp): [Vec3, Vec3, Vec3, Vec3] => {
    const from = cards[each.from];
    const to = cards[each.to];
    const a = from.position;
    const b = to.position;
    const side = Math.sign(b[0] - a[0]) || 1;
    const start: Vec3 = [a[0] + side * from.half[0] * 0.7, a[1] - from.half[1] * 0.25, a[2]];
    const end: Vec3 = [b[0] - side * to.half[0] * 0.6, b[1] + to.half[1] * 0.15, b[2]];
    return [
      start,
      [
        start[0] + each.bendFrom[0] * side,
        start[1] + each.bendFrom[1],
        start[2] + each.bendFrom[2],
      ],
      [end[0] + each.bendTo[0] * side, end[1] + each.bendTo[1], end[2] + each.bendTo[2]],
      end,
    ];
  };

  let stirFrom: [number, number] | null = null;

  const render = ({ time, progress, pointer, still }: Frame) => {
    resize();
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    if (still || frames % 2 === 0) bakeCaustic(time);
    frames += 1;

    const aspect = width / height;
    const fov = aspect < 1 ? 1.05 : 0.82;
    const tanY = Math.tan(fov / 2);
    const tanX = tanY * Math.max(aspect, 0.62);
    const forward = progress * travel;
    const cameraZ = -forward;
    const eye: Vec3 = [pointer[0] * 0.28, pointer[1] * 0.18, cameraZ];
    const view = lookAt(eye, [pointer[0] * 0.06, pointer[1] * 0.04, cameraZ - 6]);
    const projection = perspective(fov, aspect, 0.05, 60);

    const sway = still ? 0 : 1;
    for (const each of cards) {
      const [px, py, pz] = each.phase;
      let base: Vec3;
      if (each.spot) {
        const { ndc, depth } = each.spot;
        base = [ndc[0] * depth * tanX, ndc[1] * depth * tanY, -depth];
      } else {
        const [sx, sy, offset] = each.cloud;
        const depth = near + ((((offset - forward) % span) + span) % span);
        const reach = 1.25 + 0.58 * depth;
        base = [sx * reach * tanX, sy * reach * tanY, cameraZ - depth];
      }
      const hero = each.spot !== null && heroSpots.includes(each.spot);
      const drift = (hero ? 0.5 : each.spot ? 0.9 : 1.3) * sway;
      const deep = hero ? 0.25 : 1;
      const t = time;
      const bob = Math.sin(t * 0.42 + py) * 0.055 + Math.sin(t * 0.19 + px) * 0.065;
      each.position = [
        base[0] + (Math.sin(t * 0.17 + px) * 0.1 + Math.sin(t * 0.071 + pz) * 0.06) * drift,
        base[1] + (bob + Math.sin(t * 0.06 + pz) * 0.04 + Math.sin(t * 0.11) * 0.03) * drift,
        base[2] + (Math.sin(t * 0.13 + pz) * 0.17 + Math.sin(t * 0.31 + px) * 0.04) * drift * deep,
      ];
      each.model = placement(
        each.position,
        each.tilt[0] +
          (Math.sin(t * 0.42 + py + 0.9) * 0.1 + Math.sin(t * 0.1 + py) * 0.06) * drift,
        each.tilt[1] + (Math.sin(t * 0.16 + px) * 0.18 + Math.sin(t * 0.37 + pz) * 0.05) * drift,
        each.tilt[2] + (Math.sin(t * 0.23 + pz) * 0.07 + Math.sin(t * 0.09 + px) * 0.04) * drift,
      );
      each.depth = viewDepth(view, each.position);
    }
    for (const each of textures) {
      if (each.loaded && each.loadedAt < 0) each.loadedAt = time;
    }

    const shown = wisps.filter(
      (each) => Math.min(cards[each.from].depth, cards[each.to].depth) >= 0.4,
    );
    const viewProjection = multiply(projection, view);
    const paths: Path[] = shown.map((each) =>
      ends(each).flatMap((point) => project(viewProjection, point)),
    );
    const here: [number, number] = [pointer[0] * 0.5 + 0.5, pointer[1] * 0.5 + 0.5];
    const push: [number, number] = stirFrom
      ? [(here[0] - stirFrom[0]) * 6, (here[1] - stirFrom[1]) * 6]
      : [0, 0];
    stirFrom = here;

    smoke.fit(aspect);
    smoke.advance(time, still, paths, { pointer: here, push }, (guideWidth, guideHeight) => {
      gl.useProgram(wisp.program);
      gl.bindVertexArray(strand);
      gl.uniformMatrix4fv(wisp.at("uView"), false, view);
      gl.uniformMatrix4fv(wisp.at("uProjection"), false, projection);
      gl.uniform2f(wisp.at("uResolution"), guideWidth, guideHeight);
      gl.uniform1f(wisp.at("uTime"), time);
      gl.uniform1f(wisp.at("uFocus"), focus);
      gl.uniform1f(wisp.at("uAperture"), aperture);
      gl.uniform1f(wisp.at("uSpan"), 2 * tanY);
      gl.uniform1f(wisp.at("uWidth"), 0.12);
      gl.uniform1f(wisp.at("uStrength"), still ? 1.3 : 1);
      for (const each of shown) {
        const [start, bendFrom, bendTo, end] = ends(each);
        gl.uniform3f(wisp.at("uFrom"), ...start);
        gl.uniform3f(wisp.at("uBendFrom"), ...bendFrom);
        gl.uniform3f(wisp.at("uBendTo"), ...bendTo);
        gl.uniform3f(wisp.at("uTo"), ...end);
        gl.uniform1f(wisp.at("uSeed"), each.seed);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, (strandSegments + 1) * 2);
      }
    });

    gl.viewport(0, 0, width, height);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, causticTexture);
    gl.activeTexture(gl.TEXTURE0);

    gl.useProgram(background.program);
    gl.uniform2f(background.at("uResolution"), width, height);
    gl.uniform1f(background.at("uTime"), time);
    gl.uniform1f(background.at("uTravel"), forward * 0.012);
    gl.uniform2f(background.at("uPointer"), pointer[0], pointer[1]);
    gl.uniform1i(background.at("uCaustic"), 1);
    gl.bindVertexArray(quad);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    const drawables: { depth: number; draw: () => void }[] = [];
    for (const each of cards) {
      if (each.depth < 0.25 || each.depth > near + span + 1) continue;
      drawables.push({ depth: each.depth, draw: () => drawCard(each) });
    }
    if (shown.length) drawables.push({ depth: focus + 0.45, draw: () => drawInk() });
    drawables.sort((x, y) => y.depth - x.depth);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(card.program);
    gl.uniformMatrix4fv(card.at("uView"), false, view);
    gl.uniformMatrix4fv(card.at("uProjection"), false, projection);
    gl.uniform2f(card.at("uResolution"), width, height);
    gl.uniform1f(card.at("uTime"), time);
    gl.uniform1i(card.at("uImage"), 0);
    gl.uniform1i(card.at("uCaustic"), 1);

    let active: WebGLProgram | null = null;
    const bind = (program: WebGLProgram, vao: WebGLVertexArrayObject) => {
      if (active === program) return;
      active = program;
      gl.useProgram(program);
      gl.bindVertexArray(vao);
    };

    const heroScale = aspect < 1 ? 1.3 : 1;
    const drawCard = (each: Card) => {
      bind(card.program, quad);
      const grow = each.spot && heroSpots.includes(each.spot) ? heroScale : 1;
      const texture = textures[each.item];
      const blur = circleOfConfusion(each.depth) * each.depth * tanY;
      const ready = still
        ? Number(texture.loaded)
        : texture.loaded
          ? Math.min(1, (time - texture.loadedAt) / 1.2)
          : 0;
      const nearFade = Math.min(1, Math.max(0, (each.depth - 0.35) / 0.6));
      const farFade = each.spot ? 1 : Math.min(1, Math.max(0, (near + span - each.depth) / 2.5));
      gl.bindTexture(gl.TEXTURE_2D, texture.texture);
      gl.uniformMatrix4fv(card.at("uModel"), false, each.model);
      gl.uniform2f(card.at("uHalf"), each.half[0] * grow, each.half[1] * grow);
      gl.uniform1f(card.at("uMargin"), blur * 1.3 + 0.01);
      gl.uniform1f(card.at("uBlur"), blur);
      gl.uniform1f(card.at("uBorder"), each.border);
      gl.uniform1f(card.at("uWriting"), each.writing ? 1 : 0);
      gl.uniform1f(card.at("uTexelsPerUnit"), texture.texelsPerUnit);
      gl.uniform1f(card.at("uReady"), ready);
      gl.uniform1f(card.at("uFade"), nearFade * farFade);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };

    const drawInk = () => {
      const layer = smoke.view(still);
      if (!layer) return;
      bind(ink.program, quad);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, layer.now);
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, layer.before);
      gl.activeTexture(gl.TEXTURE0);
      gl.uniform1i(ink.at("uDye"), 2);
      gl.uniform1i(ink.at("uDyePrev"), 3);
      gl.uniform1f(ink.at("uBlend"), layer.blend);
      gl.uniform2f(ink.at("uDyeTexel"), layer.texelX, layer.texelY);
      gl.uniform2f(ink.at("uResolution"), width, height);
      gl.uniform1f(ink.at("uTime"), time);
      gl.uniform1f(ink.at("uFog"), 0.16);
      const xs = paths.flatMap((path) => [path[0], path[2], path[4], path[6]]);
      const ys = paths.flatMap((path) => [path[1], path[3], path[5], path[7]]);
      const margin = 0.18;
      const left = Math.max(0, Math.floor((Math.min(...xs) - margin) * width));
      const bottom = Math.max(0, Math.floor((Math.min(...ys) - margin * aspect) * height));
      const right = Math.min(width, Math.ceil((Math.max(...xs) + margin) * width));
      const top = Math.min(height, Math.ceil((Math.max(...ys) + margin * aspect) * height));
      if (right <= left || top <= bottom) return;
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(left, bottom, right - left, top - bottom);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.disable(gl.SCISSOR_TEST);
    };

    for (const each of drawables) each.draw();
  };

  // The governor sheds sim resolution first, then canvas resolution.
  const lower = () => {
    if (smoke.lower()) return true;
    if (quality <= 0.5) return false;
    quality = Math.max(0.5, quality * 0.8);
    return true;
  };

  const dispose = () => {
    disposed = true;
    observer.disconnect();
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  };

  return { render, lower, dispose };
}
