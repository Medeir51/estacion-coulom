import type { PhysConstants } from '../../core/constants';
import type { ChargeSrc } from '../../core/fields';
import { arcPoints } from '../../core/geometry';
import type { Anchor, InventoryItem, LevelConfig } from '../../core/level';
import { particleKind, speedFromVoltage, type SpeciesId } from '../../core/species';
import type { Shot, Wall, WallKind } from '../../core/world';

/** cm → m */
export const cm = (v: number) => v / 100;

export function wall(axCm: number, ayCm: number, bxCm: number, byCm: number, tag: string, kind: WallKind = 'glass'): Wall {
  return { ax: cm(axCm), ay: cm(ayCm), bx: cm(bxCm), by: cm(byCm), tag, kind };
}

export function arcWalls(cxCm: number, cyCm: number, rCm: number, th0: number, th1: number, n: number, tag: string): Wall[] {
  const pts = arcPoints(cm(cxCm), cm(cyCm), cm(rCm), th0, th1, n);
  const out: Wall[] = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    out.push({ ax: pts[i].x, ay: pts[i].y, bx: pts[i + 1].x, by: pts[i + 1].y, tag, kind: 'glass' });
  }
  return out;
}

export function anchor(id: string, xCm: number, yCm: number): Anchor {
  return { id, x: cm(xCm), y: cm(yCm) };
}

/** Cargas colocadas en los anclajes, según el inventario. */
export function placedCharges(anchors: Anchor[], inventory: InventoryItem[], cfg: LevelConfig): ChargeSrc[] {
  const out: ChargeSrc[] = [];
  for (const a of anchors) {
    const itemId = cfg.placements[a.id];
    if (!itemId) continue;
    const it = inventory.find((i) => i.id === itemId);
    if (!it || it.kind !== 'charge') continue;
    out.push({ id: a.id, x: a.x, y: a.y, q: it.value * 1e-9, label: a.id });
  }
  return out;
}

export function shotFromVoltage(
  species: SpeciesId,
  c: PhysConstants,
  xCm: number,
  yCm: number,
  angleDeg: number,
  vacc: number,
  time = 0,
): Shot {
  const kind = particleKind(species, c);
  const v = speedFromVoltage(kind.q, kind.m, vacc);
  return shotWithSpeed(species, c, xCm, yCm, angleDeg, v, time);
}

export function shotWithSpeed(
  species: SpeciesId,
  c: PhysConstants,
  xCm: number,
  yCm: number,
  angleDeg: number,
  v: number,
  time = 0,
): Shot {
  const kind = particleKind(species, c);
  const r = (angleDeg * Math.PI) / 180;
  // Para 0° y 90° se usan direcciones exactas (sin residuos de coseno).
  const ux = angleDeg === 90 ? 0 : Math.cos(r);
  const uy = angleDeg === 0 ? 0 : Math.sin(r);
  return { kind, x: cm(xCm), y: cm(yCm), vx: v * ux, vy: v * uy, time, speed: v };
}

export const CHARGE_INVENTORY = {
  p1: { id: 'p1', kind: 'charge', value: 1, count: 1 } as InventoryItem,
  n1: { id: 'n1', kind: 'charge', value: -1, count: 1 } as InventoryItem,
  p2: { id: 'p2', kind: 'charge', value: 2, count: 1 } as InventoryItem,
};

export function coil(turns: number, count: number): InventoryItem {
  return { id: `c${turns}`, kind: 'coil', value: turns, count };
}
