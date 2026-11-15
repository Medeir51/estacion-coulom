import type { PhysConstants } from './constants';

export type SpeciesId = 'electron' | 'proton' | 'deuteron' | 'alpha' | 'ne20' | 'ne22' | 'custom';

export interface SpeciesInfo {
  id: SpeciesId;
  /** carga en múltiplos de e */
  chargeE: number;
  color: string;
  mass: (c: PhysConstants) => number;
}

export const DEUTERON_MASS = 3.3435837768e-27;
export const ALPHA_MASS = 6.644657345e-27;
export const NE20_U = 19.99244018;
export const NE22_U = 21.99138511;

export const SPECIES: Record<Exclude<SpeciesId, 'custom'>, SpeciesInfo> = {
  electron: { id: 'electron', chargeE: -1, color: '#9FD0FF', mass: (c) => c.me },
  proton: { id: 'proton', chargeE: 1, color: '#FF9F6E', mass: (c) => c.mp },
  deuteron: { id: 'deuteron', chargeE: 1, color: '#FFB0A0', mass: () => DEUTERON_MASS },
  alpha: { id: 'alpha', chargeE: 2, color: '#FFE08A', mass: () => ALPHA_MASS },
  ne20: { id: 'ne20', chargeE: 1, color: '#FFD166', mass: (c) => NE20_U * c.u - c.me },
  ne22: { id: 'ne22', chargeE: 1, color: '#EF8CFF', mass: (c) => NE22_U * c.u - c.me },
};

export const CUSTOM_COLOR = '#B8F2C9';

export interface ParticleKind {
  species: SpeciesId;
  /** Carga (C) */
  q: number;
  /** Masa (kg) */
  m: number;
}

/** Partícula de una especie, o personalizada (carga en e y masa en kg). */
export function particleKind(
  species: SpeciesId,
  c: PhysConstants,
  custom?: { chargeE: number; mass: number },
): ParticleKind {
  if (species === 'custom') {
    const ce = custom?.chargeE ?? 1;
    return { species, q: ce * c.e, m: custom?.mass ?? c.mp };
  }
  const s = SPECIES[species];
  return { species, q: s.chargeE * c.e, m: s.mass(c) };
}

export function speciesColor(species: SpeciesId): string {
  return species === 'custom' ? CUSTOM_COLOR : SPECIES[species].color;
}

/** Rapidez tras acelerar desde el reposo con V_acc: v = √(2|q|V/m). */
export function speedFromVoltage(q: number, m: number, vacc: number): number {
  return Math.sqrt((2 * Math.abs(q) * vacc) / m);
}
