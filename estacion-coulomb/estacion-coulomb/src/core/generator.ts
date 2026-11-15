/** Generador de corriente alterna: Ley de Faraday, valor eficaz por ciclo y picos de B (secciones 9.7 y 9.8). */
import { mulberry32, shuffle } from './rng';

export const TAU = 0.15;
export const SAMPLES_PER_CYCLE = 250;

export interface ProfileEvent {
  type: 'peak' | 'dip';
  start: number;
  duration: number;
  amplitude: number;
}

export function generateProfile(seed: number): ProfileEvent[] {
  const rnd = mulberry32(seed);
  const types = shuffle<'peak' | 'dip'>(['peak', 'peak', 'peak', 'dip'], rnd);
  let t = 0.6 + 0.4 * rnd();
  return types.map((type) => {
    const duration = 0.4 + 0.3 * rnd();
    const amplitude = type === 'peak' ? 0.25 + 0.1 * rnd() : -(0.1 + 0.05 * rnd());
    const ev: ProfileEvent = { type, start: t, duration, amplitude };
    t = t + duration + 0.3 + 0.3 * rnd();
    return ev;
  });
}

/** Ventana suave w(t) de un evento y su derivada. */
export function eventWindow(ev: ProfileEvent, t: number): { w: number; dw: number } {
  const s = ev.start;
  const d = ev.duration;
  if (t < s || t > s + d) return { w: 0, dw: 0 };
  if (t < s + TAU) {
    const a = (Math.PI * (t - s)) / TAU;
    return { w: 0.5 * (1 - Math.cos(a)), dw: (Math.PI / (2 * TAU)) * Math.sin(a) };
  }
  if (t <= s + d - TAU) return { w: 1, dw: 0 };
  const a = (Math.PI * (s + d - t)) / TAU;
  return { w: 0.5 * (1 - Math.cos(a)), dw: -(Math.PI / (2 * TAU)) * Math.sin(a) };
}

export type BProfile =
  | { kind: 'constant'; B0: number }
  | { kind: 'peaks'; B0: number; events: ProfileEvent[] }
  | { kind: 'sine'; B0: number; a: number; fB: number };

export function profileAt(p: BProfile, t: number): { B: number; dB: number } {
  switch (p.kind) {
    case 'constant':
      return { B: p.B0, dB: 0 };
    case 'peaks': {
      let sw = 0;
      let sdw = 0;
      for (const ev of p.events) {
        const { w, dw } = eventWindow(ev, t);
        sw += ev.amplitude * w;
        sdw += ev.amplitude * dw;
      }
      return { B: p.B0 * (1 + sw), dB: p.B0 * sdw };
    }
    case 'sine': {
      const ph = 2 * Math.PI * p.fB * t;
      return { B: p.B0 * (1 + p.a * Math.sin(ph)), dB: p.B0 * p.a * 2 * Math.PI * p.fB * Math.cos(ph) };
    }
  }
}

/** ε(t) = n·A·[B·ω·sin(ωt) − B′·cos(ωt)] */
export function emfAt(n: number, area: number, omega: number, B: number, dB: number, t: number): number {
  return n * area * (B * omega * Math.sin(omega * t) - dB * Math.cos(omega * t));
}

/** ε₀ = N·B·A·ω */
export function peakEmf(n: number, B: number, area: number, f: number): number {
  return n * B * area * 2 * Math.PI * f;
}

export interface GeneratorConfig {
  profile: BProfile;
  area: number;
  f: number;
  nTotal: number;
  /** Resistencia de la carga (Ω) */
  R: number;
  /** Voltaje eficaz de disparo de la protección (V) */
  tripV: number | null;
  /** Duración (s) */
  duration: number;
}

export interface CycleRecord {
  index: number;
  rms: number;
  /** Tiempo al final del ciclo (s) */
  tEnd: number;
  /** B al final del ciclo (T) */
  B: number;
  /** Espiras activas al final del ciclo */
  n: number;
}

export class GeneratorSim {
  readonly cfg: GeneratorConfig;
  readonly omega: number;
  readonly totalSamples: number;
  sampleIndex = 0;
  nActive: number;
  cycles: CycleRecord[] = [];
  /** Últimas 2 vueltas de fem (para el osciloscopio) */
  readonly emfRing = new Float64Array(SAMPLES_PER_CYCLE * 2);
  lastEmf = 0;
  tripped: { cycle: number; t: number; V: number } | null = null;
  done = false;
  private sumSq = 0;

  constructor(cfg: GeneratorConfig) {
    this.cfg = cfg;
    this.omega = 2 * Math.PI * cfg.f;
    this.totalSamples = Math.round(SAMPLES_PER_CYCLE * cfg.f * cfg.duration);
    this.nActive = cfg.nTotal;
  }

  get dtSample(): number {
    return 1 / (SAMPLES_PER_CYCLE * this.cfg.f);
  }

  /** Tiempo de la próxima muestra (s). */
  get t(): number {
    return this.sampleIndex / (SAMPLES_PER_CYCLE * this.cfg.f);
  }

  fieldNow(): { B: number; dB: number } {
    return profileAt(this.cfg.profile, this.t);
  }

  lastRms(): number {
    return this.cycles.length ? this.cycles[this.cycles.length - 1].rms : 0;
  }

  lastCycleIndex(): number {
    return this.cycles.length - 1;
  }

  stepSample(): void {
    if (this.done) return;
    const i = this.sampleIndex;
    const t = this.t;
    const { B, dB } = profileAt(this.cfg.profile, t);
    const e = emfAt(this.nActive, this.cfg.area, this.omega, B, dB, t);
    this.lastEmf = e;
    this.emfRing[i % this.emfRing.length] = e;
    this.sumSq += e * e;
    this.sampleIndex = i + 1;
    if ((i + 1) % SAMPLES_PER_CYCLE === 0) {
      const rms = Math.sqrt(this.sumSq / SAMPLES_PER_CYCLE);
      this.sumSq = 0;
      const rec: CycleRecord = { index: this.cycles.length, rms, tEnd: this.t, B, n: this.nActive };
      this.cycles.push(rec);
      if (this.cfg.tripV !== null && rms > this.cfg.tripV) {
        this.tripped = { cycle: rec.index, t: rec.tEnd, V: rms };
        this.done = true;
        return;
      }
    }
    if (this.sampleIndex >= this.totalSamples) this.done = true;
  }
}
