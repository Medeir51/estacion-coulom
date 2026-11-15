/** Tipos de los datos de los niveles (secciones 12 a 14). */
import type { PhysConstants } from './constants';
import type { Scene } from './world';
import type { DeviceGroup } from '../script/devices';

export const LEVEL_IDS = ['1-1', '1-2', '1-3', '2-1', '2-2', '2-3', '3-1', '3-2', '3-3'] as const;
export type LevelId = (typeof LEVEL_IDS)[number];

export function isLevelId(s: string): s is LevelId {
  return (LEVEL_IDS as readonly string[]).includes(s);
}

export interface Anchor {
  id: string;
  x: number;
  y: number;
}

export interface InventoryItem {
  id: string;
  kind: 'charge' | 'coil';
  /** nC para cargas; espiras para bobinas */
  value: number;
  count: number;
}

export interface KnobDef {
  id: string;
  unit: 'V' | 'mT';
  min: number;
  max: number;
  step: number;
  default: number;
}

export interface SelectorDef {
  id: 'positivePlate' | 'bSense' | 'gear';
  options: string[];
  default: string;
  locked?: boolean;
}

export interface LevelConfig {
  /** anclaje o ranura → id del elemento del inventario */
  placements: Record<string, string>;
  controls: Record<string, number | string>;
  script: string;
}

export type ScriptMode = 'none' | 'inicio' | 'full';

interface BaseLevel {
  id: LevelId;
  lab: 1 | 2 | 3;
  scriptMode: ScriptMode;
  devices: DeviceGroup[];
  levelConstants?: Record<string, number>;
  anchors: Anchor[];
  inventory: InventoryItem[];
  knobs: KnobDef[];
  selectors: SelectorDef[];
  /** Configuración de referencia (modo docente) */
  reference: LevelConfig;
  /** Otra solución válida, si la hay */
  altReference?: LevelConfig;
  /** Texto de la escala de reproducción */
  scaleLabel: string;
  /** Segundos simulados por segundo real (×1) */
  timeScale: number;
  /** Periodo de control de la consola (s) */
  controlPeriod: number | null;
}

export interface ParticleLevel extends BaseLevel {
  kind: 'particles';
  world: { w: number; h: number };
  dt: number;
  particleTmax: number;
  totalTmax: number;
  emitter: { x: number; y: number; angle: number };
  /** Receptor objetivo de cada especie, o el único receptor */
  targets: Record<string, string>;
  buildScene(cfg: LevelConfig, c: PhysConstants, seed: number): Scene;
}

export interface GeneratorLevel extends BaseLevel {
  kind: 'generator';
  slots: number;
  B0: number;
  area: number;
  /** Frecuencia base del eje (Hz) */
  baseF: number;
  profile: 'constant' | 'peaks';
  duration: number;
  tripV: number | null;
  /** Resistencia de la carga (Ω) */
  R: number;
  load: 'lamp' | 'servers';
  servers: number;
}

export type LevelDef = ParticleLevel | GeneratorLevel;

export function defaultConfig(level: LevelDef): LevelConfig {
  const controls: Record<string, number | string> = {};
  for (const k of level.knobs) controls[k.id] = k.default;
  for (const s of level.selectors) controls[s.id] = s.default;
  return { placements: {}, controls, script: '' };
}

export function controlNumber(cfg: LevelConfig, id: string, fallback = 0): number {
  const v = cfg.controls[id];
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

export function controlString(cfg: LevelConfig, id: string, fallback: string): string {
  const v = cfg.controls[id];
  return typeof v === 'string' ? v : fallback;
}

/** Cuántas unidades de cada elemento del inventario están colocadas. */
export function usedCounts(cfg: LevelConfig): Record<string, number> {
  const used: Record<string, number> = {};
  for (const item of Object.values(cfg.placements)) used[item] = (used[item] ?? 0) + 1;
  return used;
}

/** Espiras totales de los módulos colocados en el rotor. */
export function totalTurns(level: LevelDef, cfg: LevelConfig): number {
  let n = 0;
  for (const itemId of Object.values(cfg.placements)) {
    const it = level.inventory.find((i) => i.id === itemId);
    if (it && it.kind === 'coil') n += it.value;
  }
  return n;
}

export function generatorFrequency(level: GeneratorLevel, cfg: LevelConfig): number {
  const gearSel = level.selectors.find((s) => s.id === 'gear');
  if (!gearSel) return level.baseF;
  const g = Number(String(cfg.controls.gear ?? gearSel.default).replace('x', ''));
  return level.baseF * (Number.isFinite(g) && g > 0 ? g : 1);
}
