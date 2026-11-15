/** Fuentes de campo: cargas, capacitores, regiones B, electroimanes y blindajes (sección 9.3). */
import type { FieldSampler } from './integrator';
import { rectContains, rectStrictlyContains, type Rect, type Segment } from './geometry';

export interface ChargeSrc {
  id: string;
  x: number;
  y: number;
  /** Carga (C) */
  q: number;
  label?: string;
}

export type PlateSide = 'superior' | 'inferior';

export interface CapacitorSrc {
  id: string;
  cx: number;
  cy: number;
  /** Largo de las placas (m) */
  L: number;
  /** Separación (m) */
  d: number;
  /** Ángulo φ (grados) */
  angle: number;
  /** Voltaje V ≥ 0 */
  V: number;
  /** Placa positiva: «superior» es la del lado +n̂ */
  positive: PlateSide;
}

export interface BRegionSrc extends Rect {
  id: string;
  /** B_z (T); > 0 sale de la pantalla (⊙) */
  Bz: number;
}

export interface ElectromagnetSrc extends Rect {
  id: string;
  /** |B| (T) */
  Bmag: number;
  /** +1 o −1 */
  polarity: number;
}

export interface ShieldSrc extends Rect {
  id: string;
  /** Grosor de la pared (m) */
  thickness: number;
}

export interface FieldSources {
  charges: ChargeSrc[];
  capacitors: CapacitorSrc[];
  magnets: BRegionSrc[];
  electromagnets: ElectromagnetSrc[];
  shields: ShieldSrc[];
}

export function emptySources(): FieldSources {
  return { charges: [], capacitors: [], magnets: [], electromagnets: [], shields: [] };
}

export function capacitorAxes(c: CapacitorSrc): { ux: number; uy: number; nx: number; ny: number } {
  const r = (c.angle * Math.PI) / 180;
  const ux = Math.cos(r);
  const uy = Math.sin(r);
  return { ux, uy, nx: -uy, ny: ux };
}

/** V_n: +V si la placa en +n̂ es la positiva. */
export function capacitorVn(c: CapacitorSrc): number {
  return c.positive === 'superior' ? c.V : -c.V;
}

/** Las dos placas como segmentos (superior = lado +n̂). */
export function capacitorPlates(c: CapacitorSrc): { superior: Segment; inferior: Segment } {
  const { ux, uy, nx, ny } = capacitorAxes(c);
  const h = c.L / 2;
  const off = c.d / 2;
  const mk = (sgn: number): Segment => {
    const px = c.cx + sgn * off * nx;
    const py = c.cy + sgn * off * ny;
    return { ax: px - h * ux, ay: py - h * uy, bx: px + h * ux, by: py + h * uy };
  };
  return { superior: mk(1), inferior: mk(-1) };
}

export function shieldInner(s: ShieldSrc): Rect {
  return { x0: s.x0 + s.thickness, y0: s.y0 + s.thickness, x1: s.x1 - s.thickness, y1: s.y1 - s.thickness };
}

/** Campo eléctrico de un capacitor ideal en un punto. */
export function capacitorField(c: CapacitorSrc, x: number, y: number, out: { x: number; y: number }): void {
  const { ux, uy, nx, ny } = capacitorAxes(c);
  const rx = x - c.cx;
  const ry = y - c.cy;
  const a = rx * ux + ry * uy;
  const b = rx * nx + ry * ny;
  if (Math.abs(a) <= c.L / 2 && Math.abs(b) < c.d / 2) {
    const m = -capacitorVn(c) / c.d;
    out.x = m * nx;
    out.y = m * ny;
  } else {
    out.x = 0;
    out.y = 0;
  }
}

/**
 * Sistema de campos compilado para evaluaciones rápidas. Los valores de los capacitores y
 * la polaridad de los electroimanes se pueden cambiar durante la simulación (consola).
 */
export class FieldSystem implements FieldSampler {
  readonly sources: FieldSources;
  readonly k: number;
  private inner: Rect[];
  /** Para cada blindaje, qué cargas están fuera de su hueco. */
  private chargeOutside: boolean[][];
  private capOutside: boolean[][];
  private tmp = { x: 0, y: 0 };

  constructor(sources: FieldSources, k: number) {
    this.sources = sources;
    this.k = k;
    this.inner = sources.shields.map(shieldInner);
    this.chargeOutside = this.inner.map((r) => sources.charges.map((c) => !rectStrictlyContains(r, c.x, c.y)));
    this.capOutside = this.inner.map((r) => sources.capacitors.map((c) => !rectStrictlyContains(r, c.cx, c.cy)));
  }

  /** Índice del blindaje cuyo hueco contiene el punto, o −1. */
  private shieldAt(x: number, y: number): number {
    for (let i = 0; i < this.inner.length; i++) {
      if (rectStrictlyContains(this.inner[i], x, y)) return i;
    }
    return -1;
  }

  E(x: number, y: number, out: { x: number; y: number }): void {
    let ex = 0;
    let ey = 0;
    const sh = this.inner.length ? this.shieldAt(x, y) : -1;
    const charges = this.sources.charges;
    for (let i = 0; i < charges.length; i++) {
      if (sh >= 0 && this.chargeOutside[sh][i]) continue;
      const c = charges[i];
      const dx = x - c.x;
      const dy = y - c.y;
      const r2 = dx * dx + dy * dy;
      if (r2 === 0) continue;
      const r3 = r2 * Math.sqrt(r2);
      const f = (this.k * c.q) / r3;
      ex += f * dx;
      ey += f * dy;
    }
    const caps = this.sources.capacitors;
    for (let i = 0; i < caps.length; i++) {
      if (sh >= 0 && this.capOutside[sh][i]) continue;
      capacitorField(caps[i], x, y, this.tmp);
      ex += this.tmp.x;
      ey += this.tmp.y;
    }
    out.x = ex;
    out.y = ey;
  }

  /** Potencial debido a las cargas puntuales (V, respecto al infinito). */
  V(x: number, y: number): number {
    let v = 0;
    const sh = this.inner.length ? this.shieldAt(x, y) : -1;
    const charges = this.sources.charges;
    for (let i = 0; i < charges.length; i++) {
      if (sh >= 0 && this.chargeOutside[sh][i]) continue;
      const c = charges[i];
      const r = Math.hypot(x - c.x, y - c.y);
      if (r === 0) continue;
      v += (this.k * c.q) / r;
    }
    return v;
  }

  B(x: number, y: number): number {
    let b = 0;
    const mags = this.sources.magnets;
    for (let i = 0; i < mags.length; i++) {
      if (rectContains(mags[i], x, y)) b += mags[i].Bz;
    }
    const ems = this.sources.electromagnets;
    for (let i = 0; i < ems.length; i++) {
      if (rectContains(ems[i], x, y)) b += ems[i].polarity * ems[i].Bmag;
    }
    return b;
  }

  /** ¿El punto está dentro de algún blindaje (para cortar líneas de campo)? */
  insideShieldWall(x: number, y: number): boolean {
    for (const s of this.sources.shields) {
      if (rectContains(s, x, y) && !rectStrictlyContains(shieldInner(s), x, y)) return true;
    }
    return false;
  }

  setPolarity(id: string, p: number): boolean {
    const em = this.sources.electromagnets.find((e) => e.id.toLowerCase() === id.toLowerCase());
    if (!em) return false;
    em.polarity = p;
    return true;
  }

  findCapacitor(id: string): CapacitorSrc | undefined {
    return this.sources.capacitors.find((c) => c.id.toLowerCase() === id.toLowerCase());
  }

  findElectromagnet(id: string): ElectromagnetSrc | undefined {
    return this.sources.electromagnets.find((e) => e.id.toLowerCase() === id.toLowerCase());
  }
}

/** Corriente equivalente de un electroimán: I = |B| / (μ₀·n). */
export function electromagnetCurrent(Bmag: number, mu0: number, turnsPerM: number): number {
  return Bmag / (mu0 * turnsPerM);
}
