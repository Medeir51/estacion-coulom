/** Paso de Boris (sección 9.4), con el orden exacto de operaciones de la especificación. */
export interface Kinematic {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface FieldSampler {
  /** Escribe el campo eléctrico en out (V/m). */
  E(x: number, y: number, out: { x: number; y: number }): void;
  /** B_z (T). */
  B(x: number, y: number): number;
}

const scratch = { x: 0, y: 0 };

export function borisStep(p: Kinematic, q: number, m: number, dt: number, field: FieldSampler): void {
  field.E(p.x, p.y, scratch);
  const Ex = scratch.x;
  const Ey = scratch.y;
  const Bz = field.B(p.x, p.y);
  const h = ((q / m) * dt) / 2;
  const vmx = p.vx + h * Ex;
  const vmy = p.vy + h * Ey;
  const t = h * Bz;
  const s = (2 * t) / (1 + t * t);
  const vpx = vmx + vmy * t;
  const vpy = vmy - vmx * t;
  const vqx = vmx + vpy * s;
  const vqy = vmy - vpx * s;
  p.vx = vqx + h * Ex;
  p.vy = vqy + h * Ey;
  p.x = p.x + p.vx * dt;
  p.y = p.y + p.vy * dt;
}
