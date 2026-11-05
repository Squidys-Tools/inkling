export type Vec3 = [number, number, number];

export function perspective(fovY: number, aspect: number, near: number, far: number) {
  const f = 1 / Math.tan(fovY / 2);
  const range = 1 / (near - far);
  return new Float32Array([
    f / aspect,
    0,
    0,
    0,
    0,
    f,
    0,
    0,
    0,
    0,
    (far + near) * range,
    -1,
    0,
    0,
    2 * far * near * range,
    0,
  ]);
}

export function lookAt(eye: Vec3, target: Vec3) {
  let zx = eye[0] - target[0];
  let zy = eye[1] - target[1];
  let zz = eye[2] - target[2];
  const zl = Math.hypot(zx, zy, zz);
  zx /= zl;
  zy /= zl;
  zz /= zl;
  let xx = zz;
  let xy = 0;
  let xz = -zx;
  const xl = Math.hypot(xx, xy, xz);
  xx /= xl;
  xy /= xl;
  xz /= xl;
  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;
  return new Float32Array([
    xx,
    yx,
    zx,
    0,
    xy,
    yy,
    zy,
    0,
    xz,
    yz,
    zz,
    0,
    -(xx * eye[0] + xy * eye[1] + xz * eye[2]),
    -(yx * eye[0] + yy * eye[1] + yz * eye[2]),
    -(zx * eye[0] + zy * eye[1] + zz * eye[2]),
    1,
  ]);
}

export function placement(position: Vec3, pitch: number, yaw: number, roll: number) {
  const [cx, sx] = [Math.cos(pitch), Math.sin(pitch)];
  const [cy, sy] = [Math.cos(yaw), Math.sin(yaw)];
  const [cz, sz] = [Math.cos(roll), Math.sin(roll)];
  return new Float32Array([
    cy * cz + sy * sx * sz,
    cx * sz,
    -sy * cz + cy * sx * sz,
    0,
    -cy * sz + sy * sx * cz,
    cx * cz,
    sy * sz + cy * sx * cz,
    0,
    sy * cx,
    -sx,
    cy * cx,
    0,
    position[0],
    position[1],
    position[2],
    1,
  ]);
}

export function viewDepth(view: Float32Array, point: Vec3) {
  return -(view[2] * point[0] + view[6] * point[1] + view[10] * point[2] + view[14]);
}

export function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
