export type Point = readonly [number, number];
export type Quad = readonly [Point, Point, Point, Point];

/**
 * The CSS matrix3d that maps a width × height box, origin at its top-left, onto
 * a quad given clockwise from the top-left corner.
 */
export function quadMatrix(width: number, height: number, quad: Quad) {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = quad;
  const dx1 = x1 - x2;
  const dx2 = x3 - x2;
  const dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2;
  const dy2 = y3 - y2;
  const dy3 = y0 - y1 + y2 - y3;
  const det = dx1 * dy2 - dx2 * dy1;
  const g = (dx3 * dy2 - dx2 * dy3) / det;
  const h = (dx1 * dy3 - dx3 * dy1) / det;
  const a = x1 - x0 + g * x1;
  const b = x3 - x0 + h * x3;
  const d = y1 - y0 + g * y1;
  const e = y3 - y0 + h * y3;
  const m = [a / width, d / width, 0, g / width, b / height, e / height, 0, h / height];
  return `matrix3d(${m.join(",")},0,0,1,0,${x0},${y0},0,1)`;
}

/** Where matrix3d sends a point of the box, for checking the matrix. */
export function project(matrix: string, x: number, y: number): Point {
  const m = matrix.slice(9, -1).split(",").map(Number);
  const w = m[3]! * x + m[7]! * y + m[15]!;
  return [(m[0]! * x + m[4]! * y + m[12]!) / w, (m[1]! * x + m[5]! * y + m[13]!) / w];
}

export const mix = (from: number, to: number, amount: number) => from + (to - from) * amount;

export function mixQuad(from: Quad, to: Quad, amount: number): Quad {
  const point = (index: number): Point => [
    mix(from[index]![0], to[index]![0], amount),
    mix(from[index]![1], to[index]![1], amount),
  ];
  return [point(0), point(1), point(2), point(3)];
}
