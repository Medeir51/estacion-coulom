/** Cámara de Pruebas: modelo de escena, validación, paso automático y enlaces (sección 15). */
import type { PhysConstants } from './constants';
import { emptySources, type FieldSources, type PlateSide } from './fields';
import { generateProfile, type BProfile, type GeneratorConfig } from './generator';
import { mulberry32 } from './rng';
import { particleKind, speedFromVoltage, type SpeciesId } from './species';
import type { Scene, Shot, SimSettings, Wall } from './world';

export type SbItem =
  | { kind: 'charge'; id: string; x: number; y: number; q: number }
  | { kind: 'capacitor'; id: string; cx: number; cy: number; L: number; d: number; angle: number; V: number; positive: PlateSide }
  | { kind: 'magnet'; id: string; x0: number; y0: number; x1: number; y1: number; bmag: number; sense: 'out' | 'in' }
  | { kind: 'electromagnet'; id: string; x0: number; y0: number; x1: number; y1: number; bmag: number; polarity: 1 | -1 }
  | { kind: 'wall'; id: string; points: { x: number; y: number }[] }
  | { kind: 'shield'; id: string; x0: number; y0: number; x1: number; y1: number; thickness: number }
  | {
      kind: 'emitter';
      id: string;
      x: number;
      y: number;
      angle: number;
      species: SpeciesId;
      speedMode: 'vacc' | 'speed';
      vacc: number;
      speed: number;
      count: number;
      interval: number;
      spread: number;
      chargeE: number;
      massU: number;
    }
  | { kind: 'detector'; id: string; ax: number; ay: number; bx: number; by: number }
  | { kind: 'receiver'; id: string; x0: number; y0: number; x1: number; y1: number };

export type SbKind = SbItem['kind'];

export interface BenchConfig {
  B0: number;
  area: number;
  f: number;
  turns: number;
  R: number;
  tripV: number | null;
  profile: 'constant' | 'peaks' | 'sine';
  a: number;
  fB: number;
  duration: number;
}

export interface SandboxScene {
  app: 'estacion-coulomb';
  kind: 'scene';
  schemaVersion: 1;
  world: { w: number; h: number };
  items: SbItem[];
  script: string;
  benchScript: string;
  bench: BenchConfig;
  /** s simulados por s real; null = automático */
  timeScale: number | null;
  /** periodo de control (s); null = 100·dt */
  controlPeriod: number | null;
}

export const LIMITS: Record<string, number> = {
  charge: 30,
  capacitor: 10,
  bregion: 10,
  wall: 20,
  wallVertices: 64,
  shield: 5,
  emitter: 10,
  particles: 200,
  detector: 10,
  receiver: 10,
};

export const WORLD_SIZES = [
  { w: 0.4, h: 0.25 },
  { w: 0.6, h: 0.4 },
  { w: 1.0, h: 0.6 },
];

export function defaultBench(): BenchConfig {
  return { B0: 0.3, area: 0.015, f: 60, turns: 100, R: 14.4, tripV: null, profile: 'constant', a: 0.2, fB: 0.5, duration: 2 };
}

export function emptySandbox(): SandboxScene {
  return {
    app: 'estacion-coulomb',
    kind: 'scene',
    schemaVersion: 1,
    world: { ...WORLD_SIZES[0] },
    items: [],
    script: '',
    benchScript: '',
    bench: defaultBench(),
    timeScale: null,
    controlPeriod: null,
  };
}

export function limitKey(kind: SbKind): string {
  return kind === 'magnet' || kind === 'electromagnet' ? 'bregion' : kind;
}

export function countOf(scene: SandboxScene, kind: SbKind): number {
  const key = limitKey(kind);
  return scene.items.filter((i) => limitKey(i.kind) === key).length;
}

const PREFIX: Record<SbKind, string> = {
  charge: 'Q',
  capacitor: 'C',
  magnet: 'M',
  electromagnet: 'EM',
  wall: 'P',
  shield: 'B',
  emitter: 'E',
  detector: 'D',
  receiver: 'R',
};

export function nextId(scene: SandboxScene, kind: SbKind): string {
  const p = PREFIX[kind];
  for (let i = 1; ; i++) {
    const id = `${p}${i}`;
    if (!scene.items.some((x) => x.id.toLowerCase() === id.toLowerCase())) return id;
  }
}

export function newItem(scene: SandboxScene, kind: SbKind, x: number, y: number): SbItem {
  const id = nextId(scene, kind);
  switch (kind) {
    case 'charge':
      return { kind, id, x, y, q: 1 };
    case 'capacitor':
      return { kind, id, cx: x, cy: y, L: 0.1, d: 0.03, angle: 0, V: 50, positive: 'superior' };
    case 'magnet':
      return { kind, id, x0: x - 0.05, y0: y - 0.05, x1: x + 0.05, y1: y + 0.05, bmag: 50, sense: 'out' };
    case 'electromagnet':
      return { kind, id, x0: x - 0.05, y0: y - 0.05, x1: x + 0.05, y1: y + 0.05, bmag: 100, polarity: 1 };
    case 'wall':
      return { kind, id, points: [{ x: x - 0.05, y }, { x: x + 0.05, y }] };
    case 'shield':
      return { kind, id, x0: x - 0.05, y0: y - 0.04, x1: x + 0.05, y1: y + 0.04, thickness: 0.003 };
    case 'emitter':
      return {
        kind,
        id,
        x,
        y,
        angle: 0,
        species: 'electron',
        speedMode: 'vacc',
        vacc: 300,
        speed: 1e7,
        count: 1,
        interval: 1,
        spread: 0,
        chargeE: 1,
        massU: 1,
      };
    case 'detector':
      return { kind, id, ax: x, ay: y - 0.01, bx: x, by: y + 0.01 };
    case 'receiver':
      return { kind, id, x0: x - 0.01, y0: y - 0.01, x1: x + 0.01, y1: y + 0.01 };
  }
}

const num = (v: unknown, lo: number, hi: number, def: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def;
const str = (v: unknown, def: string) => (typeof v === 'string' && v.length <= 24 ? v : def);

/** Valida y normaliza una escena (de archivo o enlace). Devuelve null si no es válida. */
export function validateScene(data: unknown): SandboxScene | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Partial<SandboxScene>;
  if (d.app !== 'estacion-coulomb' || d.kind !== 'scene' || d.schemaVersion !== 1) return null;
  if (!d.world || !Array.isArray(d.items)) return null;
  const world = { w: num(d.world.w, 0.05, 2, 0.4), h: num(d.world.h, 0.05, 2, 0.25) };
  const out = emptySandbox();
  out.world = world;
  const W = world.w;
  const H = world.h;
  for (const raw of d.items.slice(0, 200)) {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    const id = str(r.id, '');
    if (!id) return null;
    const x = (k: string) => num(r[k], -W, 2 * W, 0);
    const y = (k: string) => num(r[k], -H, 2 * H, 0);
    let item: SbItem;
    switch (r.kind) {
      case 'charge':
        item = { kind: 'charge', id, x: x('x'), y: y('y'), q: num(r.q, -10, 10, 1) };
        break;
      case 'capacitor':
        item = {
          kind: 'capacitor',
          id,
          cx: x('cx'),
          cy: y('cy'),
          L: num(r.L, 0.005, 2, 0.1),
          d: num(r.d, 0.002, 1, 0.03),
          angle: num(r.angle, -360, 360, 0),
          V: num(r.V, 0, 1e5, 0),
          positive: r.positive === 'inferior' ? 'inferior' : 'superior',
        };
        break;
      case 'magnet':
        item = { kind: 'magnet', id, x0: x('x0'), y0: y('y0'), x1: x('x1'), y1: y('y1'), bmag: num(r.bmag, 0, 2000, 0), sense: r.sense === 'in' ? 'in' : 'out' };
        break;
      case 'electromagnet':
        item = {
          kind: 'electromagnet',
          id,
          x0: x('x0'),
          y0: y('y0'),
          x1: x('x1'),
          y1: y('y1'),
          bmag: num(r.bmag, 0, 2000, 0),
          polarity: r.polarity === -1 ? -1 : 1,
        };
        break;
      case 'wall': {
        if (!Array.isArray(r.points)) return null;
        const pts = (r.points as unknown[]).slice(0, LIMITS.wallVertices).map((p) => {
          const q = (p ?? {}) as Record<string, unknown>;
          return { x: num(q.x, -W, 2 * W, 0), y: num(q.y, -H, 2 * H, 0) };
        });
        if (pts.length < 2) return null;
        item = { kind: 'wall', id, points: pts };
        break;
      }
      case 'shield':
        item = { kind: 'shield', id, x0: x('x0'), y0: y('y0'), x1: x('x1'), y1: y('y1'), thickness: num(r.thickness, 0.001, 0.02, 0.003) };
        break;
      case 'emitter': {
        const sp = ['electron', 'proton', 'deuteron', 'alpha', 'ne20', 'ne22', 'custom'].includes(r.species as string)
          ? (r.species as SpeciesId)
          : 'electron';
        item = {
          kind: 'emitter',
          id,
          x: x('x'),
          y: y('y'),
          angle: num(r.angle, -360, 360, 0),
          species: sp,
          speedMode: r.speedMode === 'speed' ? 'speed' : 'vacc',
          vacc: num(r.vacc, 0, 1e6, 300),
          speed: num(r.speed, 0, 3e8, 1e6),
          count: Math.round(num(r.count, 1, 50, 1)),
          interval: num(r.interval, 0, 1e6, 1),
          spread: num(r.spread, 0, 20, 0),
          chargeE: Math.round(num(r.chargeE, -10, 10, 1)) || 1,
          massU: num(r.massU, 0.00054858, 300, 1),
        };
        break;
      }
      case 'detector':
        item = { kind: 'detector', id, ax: x('ax'), ay: y('ay'), bx: x('bx'), by: y('by') };
        break;
      case 'receiver':
        item = { kind: 'receiver', id, x0: x('x0'), y0: y('y0'), x1: x('x1'), y1: y('y1') };
        break;
      default:
        return null;
    }
    out.items.push(item);
  }
  out.script = typeof d.script === 'string' ? d.script.slice(0, 8000) : '';
  out.benchScript = typeof d.benchScript === 'string' ? d.benchScript.slice(0, 8000) : '';
  const b = (d.bench ?? {}) as Partial<BenchConfig>;
  const def = defaultBench();
  out.bench = {
    B0: num(b.B0, 0, 1, def.B0),
    area: num(b.area, 0.001, 0.1, def.area),
    f: num(b.f, 1, 120, def.f),
    turns: Math.round(num(b.turns, 1, 1000, def.turns)),
    R: num(b.R, 1, 1000, def.R),
    tripV: b.tripV === null || b.tripV === undefined ? null : num(b.tripV, 0, 1e5, 132),
    profile: b.profile === 'peaks' || b.profile === 'sine' ? b.profile : 'constant',
    a: num(b.a, 0, 1, def.a),
    fB: num(b.fB, 0.01, 10, def.fB),
    duration: num(b.duration, 0.1, 20, def.duration),
  };
  out.timeScale = d.timeScale === null || d.timeScale === undefined ? null : num(d.timeScale, 1e-15, 10, 1e-8);
  out.controlPeriod = d.controlPeriod === null || d.controlPeriod === undefined ? null : num(d.controlPeriod, 1e-12, 1, 1e-7);
  return out;
}

function rect(i: { x0: number; y0: number; x1: number; y1: number }) {
  return { x0: Math.min(i.x0, i.x1), y0: Math.min(i.y0, i.y1), x1: Math.max(i.x0, i.x1), y1: Math.max(i.y0, i.y1) };
}

export function emitterKind(e: Extract<SbItem, { kind: 'emitter' }>, c: PhysConstants) {
  return particleKind(e.species, c, { chargeE: e.chargeE, mass: e.massU * c.u });
}

export function emitterSpeed(e: Extract<SbItem, { kind: 'emitter' }>, c: PhysConstants): number {
  const k = emitterKind(e, c);
  return e.speedMode === 'speed' ? e.speed : speedFromVoltage(k.q, k.m, e.vacc);
}

export function sandboxSources(s: SandboxScene): FieldSources {
  const src = emptySources();
  for (const i of s.items) {
    if (i.kind === 'charge') src.charges.push({ id: i.id, x: i.x, y: i.y, q: i.q * 1e-9, label: i.id });
    else if (i.kind === 'capacitor')
      src.capacitors.push({ id: i.id, cx: i.cx, cy: i.cy, L: i.L, d: i.d, angle: i.angle, V: i.V, positive: i.positive });
    else if (i.kind === 'magnet') src.magnets.push({ id: i.id, ...rect(i), Bz: ((i.sense === 'in' ? -1 : 1) * i.bmag) / 1000 });
    else if (i.kind === 'electromagnet') src.electromagnets.push({ id: i.id, ...rect(i), Bmag: i.bmag / 1000, polarity: i.polarity });
    else if (i.kind === 'shield') src.shields.push({ id: i.id, ...rect(i), thickness: i.thickness });
  }
  return src;
}

/** Escena física y ajustes de la simulación, con paso automático (sección 15.2). */
export function buildSandbox(s: SandboxScene, c: PhysConstants, seed: number): { scene: Scene; settings: SimSettings; timeScale: number; controlPeriod: number } {
  const sources = sandboxSources(s);
  const walls: Wall[] = [];
  for (const i of s.items) {
    if (i.kind !== 'wall') continue;
    for (let k = 0; k + 1 < i.points.length; k++) {
      walls.push({ ax: i.points[k].x, ay: i.points[k].y, bx: i.points[k + 1].x, by: i.points[k + 1].y, kind: 'glass', tag: 'glass', ownerId: i.id });
    }
  }
  const rnd = mulberry32(seed);
  const shots: Shot[] = [];
  let vmax = 0;
  let vmin = Infinity;
  let wcmax = 0;
  const Bmax = Math.max(
    0,
    ...sources.magnets.map((m) => Math.abs(m.Bz)),
    ...sources.electromagnets.map((m) => m.Bmag),
  );
  const Vsum = sources.capacitors.reduce((a, cap) => a + cap.V, 0);
  for (const i of s.items) {
    if (i.kind !== 'emitter') continue;
    const k = emitterKind(i, c);
    const v0 = emitterSpeed(i, c);
    const r = (i.angle * Math.PI) / 180;
    for (let n = 0; n < i.count && shots.length < LIMITS.particles; n++) {
      const v = v0 * (1 + ((rnd() * 2 - 1) * i.spread) / 100);
      shots.push({ kind: k, x: i.x, y: i.y, vx: v * Math.cos(r), vy: v * Math.sin(r), time: n * i.interval * 1e-6, speed: v });
    }
    const vEst = Math.sqrt(v0 * v0 * (1 + i.spread / 100) ** 2 + (2 * Math.abs(k.q) * Vsum) / k.m);
    vmax = Math.max(vmax, vEst);
    if (v0 > 0) vmin = Math.min(vmin, v0);
    wcmax = Math.max(wcmax, (Math.abs(k.q) * Bmax) / k.m);
  }
  if (!Number.isFinite(vmin)) vmin = vmax || 1e6;
  let dt = vmax > 0 ? 0.0002 / vmax : 1e-9;
  if (wcmax > 0) dt = Math.min(dt, (0.01 * 2 * Math.PI) / wcmax);
  const cross = Math.hypot(s.world.w, s.world.h) / Math.max(vmin, 1);
  const particleTmax = Math.min(20 * cross, 2e6 * dt);
  const lastShot = shots.reduce((m, x) => Math.max(m, x.time), 0);
  const totalTmax = Math.min(lastShot + particleTmax, 4e6 * dt);
  const timeScale = s.timeScale ?? s.world.w / vmin / 4;
  const scene: Scene = {
    world: s.world,
    sources,
    walls,
    detectors: s.items.filter((i): i is Extract<SbItem, { kind: 'detector' }> => i.kind === 'detector').map((d) => ({ id: d.id, ax: d.ax, ay: d.ay, bx: d.bx, by: d.by })),
    receivers: s.items.filter((i): i is Extract<SbItem, { kind: 'receiver' }> => i.kind === 'receiver').map((r) => ({ id: r.id, ...rect(r) })),
    shots,
  };
  const recordEvery = Math.max(1, Math.ceil(totalTmax / dt / 20000));
  return { scene, settings: { dt, particleTmax, totalTmax, recordEvery }, timeScale, controlPeriod: s.controlPeriod ?? 100 * dt };
}

export function benchConfig(b: BenchConfig, seed: number): GeneratorConfig {
  const profile: BProfile =
    b.profile === 'peaks'
      ? { kind: 'peaks', B0: b.B0, events: generateProfile(seed) }
      : b.profile === 'sine'
        ? { kind: 'sine', B0: b.B0, a: b.a, fB: b.fB }
        : { kind: 'constant', B0: b.B0 };
  return { profile, area: b.area, f: b.f, nTotal: b.turns, R: b.R, tripV: b.tripV, duration: b.duration };
}

/** Escena en JSON compacto codificado en base64url. */
export function encodeScene(s: SandboxScene): string {
  const json = JSON.stringify(s);
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeScene(code: string): SandboxScene | null {
  try {
    const b64 = code.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
    return validateScene(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    return null;
  }
}

export const SHARE_LIMIT = 8 * 1024;
