/** Mundo de partículas: emisión, paso de Boris, choques, detectores y receptores (secciones 9.4–9.6). */
import { CHARGE_HIT_RADIUS } from './constants';
import { FieldSystem, capacitorPlates, type FieldSources, type PlateSide } from './fields';
import { borisStep } from './integrator';
import {
  pointSegmentDistance,
  rectContains,
  rectSegments as rectSegmentsOf,
  segmentIntersection,
  type Rect,
  type Segment,
} from './geometry';
import type { ParticleKind } from './species';

export type WallKind = 'glass' | 'plate' | 'shield' | 'cup' | 'screen' | 'collector';

export interface Wall extends Segment {
  kind: WallKind;
  /** Etiqueta para las sugerencias (p. ej. «exterior» o «interior»). */
  tag?: string;
  ownerId?: string;
  side?: PlateSide;
}

export interface DetectorDef extends Segment {
  id: string;
}

export interface ReceiverDef extends Rect {
  id: string;
}

export interface Shot {
  kind: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Tiempo de emisión (s) */
  time: number;
  /** Rapidez nominal (m/s), para informes */
  speed: number;
}

export interface Scene {
  world: { w: number; h: number };
  sources: FieldSources;
  walls: Wall[];
  detectors: DetectorDef[];
  receivers: ReceiverDef[];
  shots: Shot[];
}

export interface SimSettings {
  dt: number;
  /** Tiempo máximo de vuelo de cada partícula (s) */
  particleTmax: number;
  /** Duración total del intento (s) */
  totalTmax: number;
  /** Guardar una posición cada n pasos (por defecto 1). */
  recordEvery?: number;
}

export type ParticleStatus = 'pending' | 'flying' | 'captured' | 'crashed' | 'hitCharge' | 'lost' | 'timeout';
export type ExitSide = 'arriba' | 'abajo' | 'izquierda' | 'derecha';

export interface SimParticle {
  index: number;
  kind: ParticleKind;
  shot: Shot;
  spawnStep: number;
  status: ParticleStatus;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Posiciones (x, y) intercaladas */
  path: number[];
  endT: number;
  endX: number;
  endY: number;
  wall: Wall | null;
  receiverId: string | null;
  chargeId: string | null;
  exitSide: ExitSide | null;
  minClearance: number;
  crossings: { id: string; t: number }[];
  /** Polaridad del electroimán al entrar en él por primera vez */
  entryPolarity: number | null;
}

export type SimEventType = 'spawn' | 'cross' | 'capture' | 'crash' | 'hitCharge' | 'lost' | 'timeout';

export interface SimEvent {
  t: number;
  type: SimEventType;
  particle: number;
  id?: string;
  x: number;
  y: number;
}

export interface DetectorState {
  count: number;
  lastTime: number;
  signal: boolean;
}

export function isFinished(s: ParticleStatus): boolean {
  return s !== 'pending' && s !== 'flying';
}

/** Paredes de los capacitores y blindajes de las fuentes, más las paredes de la escena. */
export function allWalls(scene: Scene): Wall[] {
  const walls: Wall[] = [...scene.walls];
  for (const c of scene.sources.capacitors) {
    const p = capacitorPlates(c);
    walls.push({ ...p.superior, kind: 'plate', ownerId: c.id, side: 'superior' });
    walls.push({ ...p.inferior, kind: 'plate', ownerId: c.id, side: 'inferior' });
  }
  for (const s of scene.sources.shields) {
    for (const seg of rectSegmentsOf(s)) walls.push({ ...seg, kind: 'shield', ownerId: s.id });
    const inner = { x0: s.x0 + s.thickness, y0: s.y0 + s.thickness, x1: s.x1 - s.thickness, y1: s.y1 - s.thickness };
    for (const seg of rectSegmentsOf(inner)) walls.push({ ...seg, kind: 'shield', ownerId: s.id });
  }
  return walls;
}

export class ParticleSim {
  readonly scene: Scene;
  readonly settings: SimSettings;
  readonly field: FieldSystem;
  readonly walls: Wall[];
  readonly particles: SimParticle[];
  readonly detectors: Map<string, DetectorState> = new Map();
  readonly events: SimEvent[] = [];
  stepIndex = 0;
  done = false;
  private nextSpawn = 0;
  private wallBox: Float64Array;
  private tmaxSteps: number;
  private totalSteps: number;
  private recordEvery: number;

  constructor(scene: Scene, settings: SimSettings, k: number) {
    this.scene = scene;
    this.settings = settings;
    this.field = new FieldSystem(scene.sources, k);
    this.walls = allWalls(scene);
    this.wallBox = new Float64Array(this.walls.length * 4);
    this.walls.forEach((w, i) => {
      this.wallBox[i * 4] = Math.min(w.ax, w.bx);
      this.wallBox[i * 4 + 1] = Math.max(w.ax, w.bx);
      this.wallBox[i * 4 + 2] = Math.min(w.ay, w.by);
      this.wallBox[i * 4 + 3] = Math.max(w.ay, w.by);
    });
    for (const d of scene.detectors) this.detectors.set(d.id.toLowerCase(), { count: 0, lastTime: -1, signal: false });
    this.tmaxSteps = Math.round(settings.particleTmax / settings.dt);
    this.totalSteps = Math.round(settings.totalTmax / settings.dt);
    this.recordEvery = Math.max(1, settings.recordEvery ?? 1);
    const sorted = [...scene.shots].sort((a, b) => a.time - b.time);
    this.particles = sorted.map((shot, index) => ({
      index,
      kind: shot.kind,
      shot,
      spawnStep: Math.round(shot.time / settings.dt),
      status: 'pending',
      x: shot.x,
      y: shot.y,
      vx: shot.vx,
      vy: shot.vy,
      path: [],
      endT: 0,
      endX: shot.x,
      endY: shot.y,
      wall: null,
      receiverId: null,
      chargeId: null,
      exitSide: null,
      minClearance: Infinity,
      crossings: [],
      entryPolarity: null,
    }));
    if (this.particles.length === 0) this.done = true;
  }

  get t(): number {
    return this.stepIndex * this.settings.dt;
  }

  /** Borra las señales de los detectores (después de cada Ciclo). */
  clearSignals(): void {
    for (const d of this.detectors.values()) d.signal = false;
  }

  flyingCount(): number {
    let n = 0;
    for (const p of this.particles) if (p.status === 'flying') n++;
    return n;
  }

  private end(p: SimParticle, status: ParticleStatus, t: number, x: number, y: number, type: SimEventType, id?: string) {
    p.status = status;
    p.endT = t;
    p.endX = x;
    p.endY = y;
    p.path.push(x, y);
    this.events.push({ t, type, particle: p.index, id, x, y });
  }

  step(): void {
    if (this.done) return;
    const dt = this.settings.dt;
    const k = this.stepIndex;
    const t0 = k * dt;
    while (this.nextSpawn < this.particles.length && this.particles[this.nextSpawn].spawnStep <= k) {
      const p = this.particles[this.nextSpawn++];
      p.status = 'flying';
      p.path.push(p.x, p.y);
      this.events.push({ t: t0, type: 'spawn', particle: p.index, x: p.x, y: p.y });
    }
    const W = this.scene.world.w;
    const H = this.scene.world.h;
    const walls = this.walls;
    const box = this.wallBox;
    const charges = this.scene.sources.charges;
    const ems = this.scene.sources.electromagnets;
    for (const p of this.particles) {
      if (p.status !== 'flying') continue;
      const x0 = p.x;
      const y0 = p.y;
      borisStep(p, p.kind.q, p.kind.m, dt, this.field);
      const x1 = p.x;
      const y1 = p.y;
      // 1. Paredes
      const minX = Math.min(x0, x1);
      const maxX = Math.max(x0, x1);
      const minY = Math.min(y0, y1);
      const maxY = Math.max(y0, y1);
      let bestT = Infinity;
      let bestWall = -1;
      let bx = 0;
      let by = 0;
      for (let i = 0; i < walls.length; i++) {
        if (box[i * 4] > maxX || box[i * 4 + 1] < minX || box[i * 4 + 2] > maxY || box[i * 4 + 3] < minY) continue;
        const w = walls[i];
        const it = segmentIntersection(x0, y0, x1, y1, w.ax, w.ay, w.bx, w.by);
        if (it && it.t < bestT) {
          bestT = it.t;
          bestWall = i;
          bx = it.x;
          by = it.y;
        }
      }
      if (bestWall >= 0) {
        p.x = bx;
        p.y = by;
        p.wall = walls[bestWall];
        this.end(p, 'crashed', t0 + bestT * dt, bx, by, 'crash', walls[bestWall].ownerId);
        continue;
      }
      // 2. Detectores
      for (const d of this.scene.detectors) {
        const it = segmentIntersection(x0, y0, x1, y1, d.ax, d.ay, d.bx, d.by);
        if (it) {
          const tc = t0 + it.t * dt;
          const st = this.detectors.get(d.id.toLowerCase())!;
          st.count++;
          st.lastTime = tc;
          st.signal = true;
          p.crossings.push({ id: d.id, t: tc });
          this.events.push({ t: tc, type: 'cross', particle: p.index, id: d.id, x: it.x, y: it.y });
        }
      }
      // Polaridad al entrar al electroimán (para el informe)
      if (p.entryPolarity === null) {
        for (const em of ems) {
          if (rectContains(em, x1, y1)) {
            p.entryPolarity = em.polarity;
            break;
          }
        }
      }
      const t1 = t0 + dt;
      // 3. Receptores
      let captured = false;
      for (const r of this.scene.receivers) {
        if (rectContains(r, x1, y1)) {
          p.receiverId = r.id;
          this.end(p, 'captured', t1, x1, y1, 'capture', r.id);
          captured = true;
          break;
        }
      }
      if (captured) continue;
      // 4. Cargas puntuales
      let hit = false;
      for (const c of charges) {
        if (Math.hypot(x1 - c.x, y1 - c.y) < CHARGE_HIT_RADIUS) {
          p.chargeId = c.id;
          this.end(p, 'hitCharge', t1, x1, y1, 'hitCharge', c.id);
          hit = true;
          break;
        }
      }
      if (hit) continue;
      // 5. Límites
      if (x1 < 0 || x1 > W || y1 < 0 || y1 > H) {
        let tb = 1;
        let side: ExitSide = 'derecha';
        const consider = (tt: number, s: ExitSide) => {
          if (tt >= 0 && tt <= tb) {
            tb = tt;
            side = s;
          }
        };
        if (x1 > W) consider((W - x0) / (x1 - x0), 'derecha');
        if (x1 < 0) consider((0 - x0) / (x1 - x0), 'izquierda');
        if (y1 > H) consider((H - y0) / (y1 - y0), 'arriba');
        if (y1 < 0) consider((0 - y0) / (y1 - y0), 'abajo');
        const ex = x0 + tb * (x1 - x0);
        const ey = y0 + tb * (y1 - y0);
        p.exitSide = side;
        this.end(p, 'lost', t0 + tb * dt, ex, ey, 'lost');
        continue;
      }
      // 6. Tiempo
      if (k + 1 - p.spawnStep >= this.tmaxSteps) {
        this.end(p, 'timeout', t1, x1, y1, 'timeout');
        continue;
      }
      // 7. Distancia mínima a una pared
      for (let i = 0; i < walls.length; i++) {
        const w = walls[i];
        const d = pointSegmentDistance(x1, y1, w.ax, w.ay, w.bx, w.by);
        if (d < p.minClearance) p.minClearance = d;
      }
      if ((k + 1 - p.spawnStep) % this.recordEvery === 0) p.path.push(x1, y1);
    }
    this.stepIndex = k + 1;
    if (this.nextSpawn >= this.particles.length && !this.particles.some((p) => p.status === 'flying')) {
      this.done = true;
    } else if (this.stepIndex >= this.totalSteps) {
      for (const p of this.particles) {
        if (p.status === 'flying' || p.status === 'pending') this.end(p, 'timeout', this.t, p.x, p.y, 'timeout');
      }
      this.done = true;
    }
  }
}
