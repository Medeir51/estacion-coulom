import type { LevelDef, LevelId } from '../../core/level';
import { LAB1 } from './lab1';
import { LAB2 } from './lab2';
import { LAB3 } from './lab3';

export const LEVELS: LevelDef[] = [...LAB1, ...LAB2, ...LAB3];

export function getLevel(id: LevelId): LevelDef {
  const l = LEVELS.find((x) => x.id === id);
  if (!l) throw new Error(`Nivel desconocido: ${id}`);
  return l;
}

export function nextLevelId(id: LevelId): LevelId | null {
  const i = LEVELS.findIndex((l) => l.id === id);
  return i >= 0 && i + 1 < LEVELS.length ? LEVELS[i + 1].id : null;
}
