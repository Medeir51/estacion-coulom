/** Constantes físicas (sección 9.1). Todo en unidades del SI. */
export type ConstantsMode = 'codata' | 'aula';

export interface PhysConstants {
  mode: ConstantsMode;
  /** Carga elemental (C) */
  e: number;
  /** Masa del electrón (kg) */
  me: number;
  /** Masa del protón (kg) */
  mp: number;
  /** Unidad de masa atómica (kg) */
  u: number;
  /** Permitividad del vacío (F/m) */
  eps0: number;
  /** Constante de Coulomb (N·m²/C²) */
  k: number;
  /** Permeabilidad del vacío (N/A²) */
  mu0: number;
  /** Rapidez de la luz (m/s) */
  c: number;
}

const EPS0_CODATA = 8.8541878188e-12;

export const CODATA: PhysConstants = Object.freeze({
  mode: 'codata',
  e: 1.602176634e-19,
  me: 9.1093837139e-31,
  mp: 1.67262192595e-27,
  u: 1.66053906892e-27,
  eps0: EPS0_CODATA,
  k: 1 / (4 * Math.PI * EPS0_CODATA),
  mu0: 1.25663706127e-6,
  c: 299792458,
});

export const AULA: PhysConstants = Object.freeze({
  mode: 'aula',
  e: 1.6e-19,
  me: 9.11e-31,
  mp: 1.67e-27,
  u: 1.66e-27,
  eps0: 8.85e-12,
  k: 9e9,
  mu0: 4 * Math.PI * 1e-7,
  c: 3e8,
});

export function getConstants(mode: ConstantsMode): PhysConstants {
  return mode === 'aula' ? AULA : CODATA;
}

/** Constantes disponibles en la consola (sección 10.7). */
export function scriptConstants(c: PhysConstants): Record<string, number> {
  return {
    PI: Math.PI,
    K_C: c.k,
    EPSILON0: c.eps0,
    MU0: c.mu0,
    Q_E: c.e,
    M_E: c.me,
    M_P: c.mp,
    UMA: c.u,
  };
}

/** Espiras por metro del electroimán, para la corriente equivalente (sección 9.3.4). */
export const ELECTROMAGNET_TURNS_PER_M = 10000;

/** Radio de choque de una carga puntual (m). */
export const CHARGE_HIT_RADIUS = 0.005;
