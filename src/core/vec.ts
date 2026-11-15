/** Operaciones con vectores 2D. */
export interface Vec {
  x: number;
  y: number;
}

export const vec = (x: number, y: number): Vec => ({ x, y });
export const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec, s: number): Vec => ({ x: a.x * s, y: a.y * s });
export const dot = (a: Vec, b: Vec): number => a.x * b.x + a.y * b.y;
export const cross = (a: Vec, b: Vec): number => a.x * b.y - a.y * b.x;
export const len = (a: Vec): number => Math.hypot(a.x, a.y);
export const dist = (a: Vec, b: Vec): number => Math.hypot(a.x - b.x, a.y - b.y);
export const fromAngleDeg = (deg: number, magnitude = 1): Vec => {
  const r = (deg * Math.PI) / 180;
  return { x: Math.cos(r) * magnitude, y: Math.sin(r) * magnitude };
};
/** Ángulo en grados desde +x, en sentido antihorario, entre 0 y 360. */
export const angleDeg = (a: Vec): number => {
  const d = (Math.atan2(a.y, a.x) * 180) / Math.PI;
  return d < 0 ? d + 360 : d;
};
