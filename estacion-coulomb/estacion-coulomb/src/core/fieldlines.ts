/** Trazado de líneas de campo eléctrico (sección 9.10). */
import { capacitorAxes, capacitorVn, type FieldSystem } from './fields';

export interface FieldLine {
  /** Puntos (x, y) intercalados, en el sentido del campo */
  points: number[];
}

const START_R = 0.006;
const STEP = 0.002;
const MAX_STEPS = 750;
const MARGIN = 0.02;

export interface TraceOptions {
  /** Factor para reducir el número de líneas por carga (rendimiento) */
  densityFactor?: number;
}

export function linesPerCharge(qC: number, factor = 1): number {
  const n = Math.min(24, Math.max(8, Math.round((8 * Math.abs(qC)) / 1e-9)));
  return factor >= 1 ? n : Math.max(4, Math.round(n * factor));
}

export function traceFieldLines(field: FieldSystem, world: { w: number; h: number }, opts: TraceOptions = {}): FieldLine[] {
  const factor = opts.densityFactor ?? 1;
  const charges = field.sources.charges.filter((c) => c.q !== 0);
  const positives = charges.filter((c) => c.q > 0);
  const negatives = charges.filter((c) => c.q < 0);
  const lines: FieldLine[] = [];
  const fromPositive = positives.length > 0;
  const seeds = fromPositive ? positives : negatives;
  const targets = fromPositive ? negatives : positives;
  const dir = fromPositive ? 1 : -1;
  const e = { x: 0, y: 0 };
  const dirAt = (x: number, y: number): [number, number, number] => {
    field.E(x, y, e);
    const m = Math.hypot(e.x, e.y);
    if (m === 0) return [0, 0, 0];
    return [(dir * e.x) / m, (dir * e.y) / m, m];
  };
  for (const c of seeds) {
    const n = linesPerCharge(c.q, factor);
    for (let i = 0; i < n; i++) {
      const th = (2 * Math.PI * i) / n;
      let x = c.x + START_R * Math.cos(th);
      let y = c.y + START_R * Math.sin(th);
      const pts = [x, y];
      const [, , m0] = dirAt(x, y);
      if (m0 === 0) continue;
      for (let s = 0; s < MAX_STEPS; s++) {
        const [k1x, k1y, m1] = dirAt(x, y);
        if (m1 < 1e-6 * m0 || m1 === 0) break;
        const [k2x, k2y] = dirAt(x + (STEP / 2) * k1x, y + (STEP / 2) * k1y);
        const [k3x, k3y] = dirAt(x + (STEP / 2) * k2x, y + (STEP / 2) * k2y);
        const [k4x, k4y] = dirAt(x + STEP * k3x, y + STEP * k3y);
        x += (STEP / 6) * (k1x + 2 * k2x + 2 * k3x + k4x);
        y += (STEP / 6) * (k1y + 2 * k2y + 2 * k3y + k4y);
        pts.push(x, y);
        if (targets.some((t) => Math.hypot(x - t.x, y - t.y) < START_R)) break;
        if (x < -MARGIN || x > world.w + MARGIN || y < -MARGIN || y > world.h + MARGIN) break;
        if (field.insideShieldWall(x, y)) break;
      }
      if (!fromPositive) {
        // Las líneas se trazaron contra el campo: se invierten para que sigan su sentido.
        const rev: number[] = [];
        for (let j = pts.length - 2; j >= 0; j -= 2) rev.push(pts[j], pts[j + 1]);
        lines.push({ points: rev });
      } else {
        lines.push({ points: pts });
      }
    }
  }
  for (const cap of field.sources.capacitors) {
    if (cap.V === 0) continue;
    const { ux, uy, nx, ny } = capacitorAxes(cap);
    const vn = capacitorVn(cap);
    const sgn = vn > 0 ? 1 : -1; // la placa positiva está en +n̂ si vn > 0
    for (const frac of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      const a = (frac - 0.5) * cap.L;
      const px = cap.cx + a * ux;
      const py = cap.cy + a * uy;
      const h = cap.d / 2;
      lines.push({
        points: [px + sgn * h * nx, py + sgn * h * ny, px - sgn * h * nx, py - sgn * h * ny],
      });
    }
  }
  return lines;
}
