import type { Vec } from './vec';

export interface Segment {
  ax: number;
  ay: number;
  bx: number;
  by: number;
}

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface Intersection {
  /** fracción sobre p0p1 */
  t: number;
  /** fracción sobre ab */
  s: number;
  x: number;
  y: number;
}

/** Intersección de p0p1 con ab, incluidos los extremos (sección 9.5). */
export function segmentIntersection(
  p0x: number,
  p0y: number,
  p1x: number,
  p1y: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): Intersection | null {
  const d1x = p1x - p0x;
  const d1y = p1y - p0y;
  const d2x = bx - ax;
  const d2y = by - ay;
  const den = d1x * d2y - d1y * d2x;
  if (den === 0) return null;
  const ex = ax - p0x;
  const ey = ay - p0y;
  const t = (ex * d2y - ey * d2x) / den;
  const s = (ex * d1y - ey * d1x) / den;
  if (t < 0 || t > 1 || s < 0 || s > 1) return null;
  return { t, s, x: p0x + t * d1x, y: p0y + t * d1y };
}

export function pointSegmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let u = l2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / l2;
  if (u < 0) u = 0;
  else if (u > 1) u = 1;
  return Math.hypot(px - (ax + u * dx), py - (ay + u * dy));
}

/** Puntos de un arco: c + R·(cos θᵢ, sin θᵢ), con θ en grados, i = 0…n. */
export function arcPoints(cx: number, cy: number, r: number, th0Deg: number, th1Deg: number, n: number): Vec[] {
  const pts: Vec[] = [];
  const t0 = (th0Deg * Math.PI) / 180;
  const t1 = (th1Deg * Math.PI) / 180;
  for (let i = 0; i <= n; i++) {
    const th = t0 + ((t1 - t0) * i) / n;
    pts.push({ x: cx + r * Math.cos(th), y: cy + r * Math.sin(th) });
  }
  return pts;
}

export function polylineSegments(pts: Vec[]): Segment[] {
  const segs: Segment[] = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    segs.push({ ax: pts[i].x, ay: pts[i].y, bx: pts[i + 1].x, by: pts[i + 1].y });
  }
  return segs;
}

/** Bordes incluidos. */
export function rectContains(r: Rect, x: number, y: number): boolean {
  return x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
}

export function rectStrictlyContains(r: Rect, x: number, y: number): boolean {
  return x > r.x0 && x < r.x1 && y > r.y0 && y < r.y1;
}

export function rectSegments(r: Rect): Segment[] {
  return [
    { ax: r.x0, ay: r.y0, bx: r.x1, by: r.y0 },
    { ax: r.x1, ay: r.y0, bx: r.x1, by: r.y1 },
    { ax: r.x1, ay: r.y1, bx: r.x0, by: r.y1 },
    { ax: r.x0, ay: r.y1, bx: r.x0, by: r.y0 },
  ];
}

export function normRect(r: Rect): Rect {
  return {
    x0: Math.min(r.x0, r.x1),
    y0: Math.min(r.y0, r.y1),
    x1: Math.max(r.x0, r.x1),
    y1: Math.max(r.y0, r.y1),
  };
}
