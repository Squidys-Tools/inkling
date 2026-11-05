import { formats, fullscreenVertex, link, seeded, texture } from "./gl.ts";
import { DOMAIN, ORIGIN } from "./sim.ts";

const CARD_COUNT = 180;
const FLOOR = -0.9;
const SURFACE = 0.64;

// A card lives in the sim's frame: u across the slice, y up, depth along the slice normal.
const common = `
float cardSeed(float id) { return fract(sin(id * 12.9898 + 4.1) * 43758.5453); }
mat3 cardBasis(vec2 angle, float seed) {
  float z = seed * 6.2831;
  mat3 roll = mat3(cos(z), sin(z), 0.0, -sin(z), cos(z), 0.0, 0.0, 0.0, 1.0);
  mat3 pitch = mat3(1.0, 0.0, 0.0, 0.0, cos(angle.x), sin(angle.x), 0.0, -sin(angle.x), cos(angle.x));
  mat3 yaw = mat3(cos(angle.y), 0.0, -sin(angle.y), 0.0, 1.0, 0.0, sin(angle.y), 0.0, cos(angle.y));
  return yaw * pitch * roll;
}
`;

const update = `#version 300 es
precision highp float;
uniform sampler2D uA;
uniform sampler2D uB;
uniform sampler2D uC;
uniform sampler2D uVelocity;
uniform vec2 uTexel;
uniform float uH;
uniform float uDt;
uniform float uTime;
layout(location = 0) out vec4 outA;
layout(location = 1) out vec4 outB;
layout(location = 2) out vec4 outC;
${common}
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  ivec2 at = ivec2(gl_FragCoord.xy);
  vec4 a = texelFetch(uA, at, 0);
  vec4 b = texelFetch(uB, at, 0);
  vec4 c = texelFetch(uC, at, 0);
  float id = float(at.x);
  float seed = cardSeed(id);

  vec2 uv = (a.xy - vec2(${ORIGIN[0]}, ${ORIGIN[1]})) / vec2(${DOMAIN[0]}, ${DOMAIN[1]});
  vec2 flow = texture(uVelocity, uv).xy;
  float l = texture(uVelocity, uv - vec2(uTexel.x, 0.0)).y;
  float r = texture(uVelocity, uv + vec2(uTexel.x, 0.0)).y;
  float bo = texture(uVelocity, uv - vec2(0.0, uTexel.y)).x;
  float t = texture(uVelocity, uv + vec2(0.0, uTexel.y)).x;
  float swirl = (r - l - t + bo) * 0.5 / uH;

  vec3 n = cardBasis(c.xy, seed)[2];
  // Flat cards drift and glide sideways; edge-on cards slice down faster.
  float sink = 0.028 + 0.05 * (1.0 - abs(n.y));
  vec3 want = vec3(flow * vec2(0.6, 0.25) + vec2(n.x * n.y * 0.16, -sink), 0.03 * sin(uTime * 0.31 + seed * 40.0));
  float life = a.w;
  if (life >= 0.0) {
    b.xyz += (want - b.xyz) * (1.0 - exp(-uDt * 2.2));
    a.xyz += b.xyz * uDt;
    vec2 spin = (vec2(fract(seed * 7.31), fract(seed * 3.77)) - 0.5) * vec2(2.6, 1.8);
    c.zw += (spin + swirl * vec2(0.9, 0.4) - c.zw) * (1.0 - exp(-uDt * 1.6));
    c.xy = mod(c.xy + c.zw * uDt, 6.2831853);
    life += uDt;
    if (a.y < ${FLOOR}) life = -0.001;
  } else {
    b.xyz = vec3(0.0);
    c.zw *= 0.0;
    life -= uDt;
    if (life < -1.0) {
      float r1 = hash(vec2(seed * 91.0, uTime));
      float r2 = hash(vec2(seed * 17.0, uTime + 3.1));
      float r3 = hash(vec2(seed * 53.0, uTime + 7.7));
      a.xyz = vec3((r1 * 2.0 - 1.0) * 1.15, ${SURFACE} - r2 * 0.1, r3 * 0.7 - 0.2);
      c.xy = vec2(r2, r3) * 6.2831;
      life = 0.0;
    }
  }
  a.z = clamp(a.z, -0.5, 0.5);
  float reach = 1.26 - abs(a.z);
  a.x = clamp(a.x, -reach, reach);
  a.y = clamp(a.y, ${FLOOR - 0.01}, ${SURFACE});
  outA = vec4(a.xyz, life);
  outB = b;
  outC = c;
}
`;

const drawVertex = `#version 300 es
precision highp float;
uniform sampler2D uA;
uniform sampler2D uB;
uniform sampler2D uC;
uniform mat3 uRotation;
uniform vec3 uAxis;
uniform vec3 uNormal;
uniform vec3 uEye;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uForward;
uniform vec2 uResolution;
uniform float uScale;
uniform float uLead;
out vec2 vCorner;
out float vShade;
out float vDistance;
${common}
const float STRETCH = 1.12;
const vec3 KEY = normalize(vec3(0.55, 0.85, 0.45));
const vec2 CORNERS[6] = vec2[6](vec2(-1, -1), vec2(1, -1), vec2(1, 1), vec2(-1, -1), vec2(1, 1), vec2(-1, 1));
vec3 toWorld(vec3 frame) {
  vec3 local = frame.x * uAxis + vec3(0.0, frame.y, 0.0) + frame.z * uNormal;
  return uRotation * (local * vec3(1.0, STRETCH, 1.0));
}
void main() {
  ivec2 at = ivec2(gl_InstanceID, 0);
  vec4 a = texelFetch(uA, at, 0);
  vec4 b = texelFetch(uB, at, 0);
  vec4 c = texelFetch(uC, at, 0);
  float seed = cardSeed(float(gl_InstanceID));
  float life = a.w;
  float grow = life >= 0.0 ? smoothstep(0.0, 1.4, life) : 1.0 - smoothstep(0.0, 1.0, -life);
  vec2 corner = CORNERS[gl_VertexID];
  vec2 size = vec2(0.06, 0.043) * (0.7 + 0.6 * fract(seed * 13.7)) * grow;
  mat3 basis = cardBasis(c.xy + c.zw * uLead, seed);
  vec3 world = toWorld(a.xyz + b.xyz * uLead + basis * vec3(corner * size, 0.0));
  vec3 normal = normalize(toWorld(basis[2]));
  vShade = 0.6 + 0.42 * abs(dot(normal, KEY));
  vec3 d = world - uEye;
  float z = dot(d, uForward);
  vec2 screen = vec2(dot(d, uRight), dot(d, uUp)) / z * 5.0 * uScale;
  gl_Position = vec4(screen * 2.0 / uResolution, (z - 18.0) / 3.0, 1.0);
  vDistance = length(d) - 16.0;
  vCorner = corner;
}
`;

const drawFragment = `#version 300 es
precision highp float;
in vec2 vCorner;
in float vShade;
in float vDistance;
out vec4 outColor;
void main() {
  vec2 edge = (1.0 - abs(vCorner)) / max(fwidth(vCorner), vec2(1e-4));
  float cover = clamp(min(edge.x, edge.y), 0.0, 1.0);
  if (cover < 0.02) discard;
  outColor = vec4(vShade, cover, vDistance, 1.0);
}
`;

type Slot = { framebuffer: WebGLFramebuffer; textures: WebGLTexture[] };

export type View = {
  rotation: Float32Array;
  axis: readonly [number, number, number];
  normal: readonly [number, number, number];
  eye: readonly number[];
  right: readonly number[];
  up: readonly number[];
  forward: readonly number[];
  width: number;
  height: number;
  scale: number;
  lead: number;
};

export function createCards(gl: WebGL2RenderingContext) {
  const stepper = link(gl, fullscreenVertex, update);
  const painter = link(gl, drawVertex, drawFragment);
  if (!stepper || !painter) return null;
  const exact = formats(gl).exact;

  const random = seeded(23);
  const initial = [
    new Float32Array(CARD_COUNT * 4),
    new Float32Array(CARD_COUNT * 4),
    new Float32Array(CARD_COUNT * 4),
  ] as const;
  for (let i = 0; i < CARD_COUNT; i++) {
    const depth = random() * 0.7 - 0.2;
    const reach = 1.2 - Math.abs(depth);
    initial[0].set(
      [(random() * 2 - 1) * reach, -0.85 + random() * 1.45, depth, 2 + random() * 8],
      i * 4,
    );
    initial[2].set([random() * Math.PI * 2, random() * Math.PI * 2, 0, 0], i * 4);
  }

  const slot = (seed: boolean): Slot => {
    const textures = initial.map((data) => texture(gl, CARD_COUNT, 1, exact, seed ? data : null));
    const framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    textures.forEach((handle, index) =>
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0 + index,
        gl.TEXTURE_2D,
        handle,
        0,
      ),
    );
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2]);
    return { framebuffer, textures };
  };
  const slots = [slot(true), slot(false)];
  const current = () => slots[0]!;

  const buffer = { width: 0, height: 0 };
  const cardTexture = gl.createTexture();
  const depth = gl.createRenderbuffer();
  const cardFramebuffer = gl.createFramebuffer();
  const empty = gl.createVertexArray();

  const bindState = (unit: number, program: typeof stepper) => {
    ["uA", "uB", "uC"].forEach((name, index) => {
      gl.activeTexture(gl.TEXTURE0 + unit + index);
      gl.bindTexture(gl.TEXTURE_2D, current().textures[index]!);
      gl.uniform1i(program.uniform(name), unit + index);
    });
  };

  const step = (
    velocity: WebGLTexture,
    texel: readonly [number, number],
    h: number,
    dt: number,
    time: number,
  ) => {
    stepper.use();
    bindState(1, stepper);
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, velocity);
    gl.uniform1i(stepper.uniform("uVelocity"), 4);
    gl.uniform2f(stepper.uniform("uTexel"), ...texel);
    gl.uniform1f(stepper.uniform("uH"), h);
    gl.uniform1f(stepper.uniform("uDt"), dt);
    gl.uniform1f(stepper.uniform("uTime"), time);
    gl.bindFramebuffer(gl.FRAMEBUFFER, slots[1]!.framebuffer);
    gl.viewport(0, 0, CARD_COUNT, 1);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    slots.reverse();
  };

  const fit = (width: number, height: number) => {
    if (buffer.width === width && buffer.height === height) return;
    buffer.width = width;
    buffer.height = height;
    gl.bindTexture(gl.TEXTURE_2D, cardTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, width, height, 0, gl.RGBA, gl.HALF_FLOAT, null);
    gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, width, height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, cardFramebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, cardTexture, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
  };

  // Cards go to their own buffer (shade, coverage, distance) so the glass pass can slot them between ink layers.
  const draw = (view: View) => {
    fit(view.width, view.height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, cardFramebuffer);
    gl.viewport(0, 0, view.width, view.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clearDepth(1);
    gl.enable(gl.DEPTH_TEST);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    painter.use();
    bindState(1, painter);
    gl.uniformMatrix3fv(painter.uniform("uRotation"), false, view.rotation);
    gl.uniform3f(painter.uniform("uAxis"), ...view.axis);
    gl.uniform3f(painter.uniform("uNormal"), ...view.normal);
    gl.uniform3fv(painter.uniform("uEye"), view.eye);
    gl.uniform3fv(painter.uniform("uRight"), view.right);
    gl.uniform3fv(painter.uniform("uUp"), view.up);
    gl.uniform3fv(painter.uniform("uForward"), view.forward);
    gl.uniform2f(painter.uniform("uResolution"), view.width, view.height);
    gl.uniform1f(painter.uniform("uScale"), view.scale);
    gl.uniform1f(painter.uniform("uLead"), view.lead);
    gl.bindVertexArray(empty);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, CARD_COUNT);
    gl.bindVertexArray(null);
    gl.disable(gl.DEPTH_TEST);
  };

  return {
    step,
    draw,
    texture: () => cardTexture,
    dispose: () => {
      for (const { framebuffer, textures } of slots) {
        gl.deleteFramebuffer(framebuffer);
        for (const handle of textures) gl.deleteTexture(handle);
      }
      gl.deleteTexture(cardTexture);
      gl.deleteRenderbuffer(depth);
      gl.deleteFramebuffer(cardFramebuffer);
      gl.deleteVertexArray(empty);
      gl.deleteProgram(stepper.handle);
      gl.deleteProgram(painter.handle);
    },
  };
}
