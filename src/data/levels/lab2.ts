import { es } from '../../i18n/es';
/** Laboratorio 2 · Fuerza de Lorentz (sección 13). */
import { emptySources, type PlateSide } from '../../core/fields';
import { controlNumber, controlString, type ParticleLevel } from '../../core/level';
import { mulberry32, shuffle } from '../../core/rng';
import type { SpeciesId } from '../../core/species';
import type { Wall } from '../../core/world';
import { cm, shotFromVoltage, shotWithSpeed, wall } from './helpers';

export const level21: ParticleLevel = {
  id: '2-1',
  lab: 2,
  kind: 'particles',
  world: { w: 0.6, h: 0.4 },
  dt: 2e-9,
  particleTmax: 5e-6,
  totalTmax: 5e-6,
  scaleLabel: es.ui.scales.us025,
  timeScale: 2.5e-7,
  controlPeriod: null,
  scriptMode: 'none',
  devices: [],
  targets: { proton: 'C1' },
  emitter: { x: cm(10), y: cm(2), angle: 90 },
  anchors: [],
  inventory: [],
  knobs: [{ id: 'bmag', unit: 'mT', min: 0, max: 100, step: 0.1, default: 0 }],
  selectors: [{ id: 'bSense', options: ['out', 'in'], default: 'out' }],
  reference: { placements: {}, controls: { bmag: 43.1, bSense: 'out' }, script: '' },
  buildScene(cfg, c) {
    const sources = emptySources();
    const sign = controlString(cfg, 'bSense', 'out') === 'in' ? -1 : 1;
    sources.magnets = [{ id: 'M1', x0: 0, y0: cm(10), x1: cm(60), y1: cm(40), Bz: (sign * controlNumber(cfg, 'bmag')) / 1000 }];
    return {
      world: this.world,
      sources,
      walls: [
        wall(0, 10, 9.5, 10, 'collector', 'collector'),
        wall(10.5, 10, 39, 10, 'collector', 'collector'),
        wall(41, 10, 60, 10, 'collector', 'collector'),
        wall(39, 7, 39, 10, 'cup', 'cup'),
        wall(41, 7, 41, 10, 'cup', 'cup'),
        wall(39, 7, 41, 7, 'cup', 'cup'),
      ],
      detectors: [],
      receivers: [{ id: 'C1', x0: cm(39), y0: cm(7), x1: cm(41), y1: cm(9.99) }],
      shots: [shotFromVoltage('proton', c, 10, 2, 90, 2000)],
    };
  },
};

export const SELECTOR_SPEEDS = [3e5, 4e5, 5e5, 6e5, 7e5];
export const SELECTOR_TARGET = 5e5;

export const REF_SCRIPT_22 = `Inicio
    // Selector de velocidades: pasa recto la partícula con v = E / B
    v <- 5e5          // rapidez que necesita el inyector (m/s)
    B <- 0.10         // campo magnético del selector (T)
    d <- 0.02         // separación entre placas (m)
    fijarVoltaje("C1", v * B * d)
    placaPositiva("C1", "inferior")
FinInicio
`;

export const level22: ParticleLevel = {
  id: '2-2',
  lab: 2,
  kind: 'particles',
  world: { w: 0.6, h: 0.3 },
  dt: 1e-9,
  particleTmax: 5e-6,
  totalTmax: 4 * 1.5e-6 + 5e-6,
  scaleLabel: es.ui.scales.us1,
  timeScale: 1e-6,
  controlPeriod: 1e-7,
  scriptMode: 'inicio',
  devices: ['selector'],
  targets: { proton: 'R1' },
  emitter: { x: cm(2), y: cm(15), angle: 0 },
  anchors: [],
  inventory: [],
  knobs: [{ id: 'voltage', unit: 'V', min: 0, max: 2000, step: 1, default: 0 }],
  selectors: [{ id: 'positivePlate', options: ['superior', 'inferior'], default: 'superior' }],
  reference: { placements: {}, controls: { voltage: 0, positivePlate: 'superior' }, script: REF_SCRIPT_22 },
  altReference: { placements: {}, controls: { voltage: 1000, positivePlate: 'inferior' }, script: '' },
  buildScene(cfg, c, seed) {
    const sources = emptySources();
    sources.capacitors = [
      {
        id: 'C1',
        cx: cm(20),
        cy: cm(15),
        L: cm(15),
        d: cm(2),
        angle: 0,
        V: controlNumber(cfg, 'voltage'),
        positive: controlString(cfg, 'positivePlate', 'superior') as PlateSide,
      },
    ];
    sources.magnets = [{ id: 'M1', x0: cm(12.5), y0: cm(14), x1: cm(27.5), y1: cm(16), Bz: 0.1 }];
    const speeds = shuffle(SELECTOR_SPEEDS, mulberry32(seed));
    return {
      world: this.world,
      sources,
      walls: [
        wall(35, 0, 35, 14.7, 'exitWall'),
        wall(35, 15.3, 35, 30, 'exitWall'),
        wall(56, 0, 56, 30, 'backWall'),
      ],
      detectors: [],
      receivers: [{ id: 'R1', x0: cm(50), y0: cm(14), x1: cm(52), y1: cm(16) }],
      shots: speeds.map((v, i) => shotWithSpeed('proton', c, 2, 15, 0, v, i * 1.5e-6)),
    };
  },
};

export const REF_SCRIPT_23 = `Inicio
    V <- 1000                         // voltaje de aceleración (V)
    d <- 0.20                         // distancia entre D1 y D2 (m)
    m20 <- 19.99244018 * UMA - M_E    // masa del ion 20Ne+ (kg)
    m22 <- 21.99138511 * UMA - M_E    // masa del ion 22Ne+ (kg)
    t20 <- d / raiz(2 * Q_E * V / m20)
    t22 <- d / raiz(2 * Q_E * V / m22)
    umbral <- (t20 + t22) / 2
    Escribir "Umbral de tiempo de vuelo: ", umbral, " s"
FinInicio

Ciclo
    Si detector("D2") Entonces
        vuelo <- tiempoCruce("D2") - tiempoCruce("D1")
        Si vuelo > umbral Entonces
            polaridad("EM1", 1)       // 22Ne+ (más lento): campo saliendo, curva hacia abajo
        SiNo
            polaridad("EM1", -1)      // 20Ne+ (más rápido): campo entrando, curva hacia arriba
        FinSi
    FinSi
FinCiclo
`;

/** Orden base de los iones antes de barajar. */
export const ION_BASE: SpeciesId[] = ['ne20', 'ne20', 'ne20', 'ne20', 'ne20', 'ne22', 'ne22', 'ne22', 'ne22', 'ne22'];

export function ionOrder(seed: number): SpeciesId[] {
  return shuffle(ION_BASE, mulberry32(seed));
}

const OPENINGS = {
  entrance: [24.7, 25.3],
  C20: [44.957, 45.757],
  C22: [3.25, 4.05],
};

export function magnetWalls23(): Wall[] {
  const w: Wall[] = [
    wall(40, 0, 40, OPENINGS.C22[0], 'magnetWall'),
    wall(40, OPENINGS.C22[1], 40, OPENINGS.entrance[0], 'magnetWall'),
    wall(40, OPENINGS.entrance[1], 40, OPENINGS.C20[0], 'magnetWall'),
    wall(40, OPENINGS.C20[1], 40, 50, 'magnetWall'),
  ];
  for (const [ya, yb] of [OPENINGS.C20, OPENINGS.C22]) {
    w.push(wall(37, ya, 40, ya, 'cup', 'cup'), wall(37, yb, 40, yb, 'cup', 'cup'), wall(37, ya, 37, yb, 'cup', 'cup'));
  }
  return w;
}

export const level23: ParticleLevel = {
  id: '2-3',
  lab: 2,
  kind: 'particles',
  world: { w: 0.6, h: 0.5 },
  dt: 2e-9,
  particleTmax: 110e-6,
  totalTmax: 110e-6,
  scaleLabel: es.ui.scales.us5,
  timeScale: 5e-6,
  controlPeriod: 1e-8,
  scriptMode: 'full',
  devices: ['isotopes'],
  targets: { ne20: 'C20', ne22: 'C22' },
  emitter: { x: cm(2), y: cm(25), angle: 0 },
  anchors: [],
  inventory: [],
  knobs: [{ id: 'bmag', unit: 'mT', min: 0, max: 500, step: 1, default: 0 }],
  selectors: [],
  reference: { placements: {}, controls: { bmag: 200 }, script: REF_SCRIPT_23 },
  buildScene(cfg, c, seed) {
    const sources = emptySources();
    sources.electromagnets = [
      { id: 'EM1', x0: cm(40), y0: 0, x1: cm(60), y1: cm(50), Bmag: controlNumber(cfg, 'bmag') / 1000, polarity: 1 },
    ];
    return {
      world: this.world,
      sources,
      walls: magnetWalls23(),
      detectors: [
        { id: 'D1', ax: cm(10), ay: cm(24), bx: cm(10), by: cm(26) },
        { id: 'D2', ax: cm(30), ay: cm(24), bx: cm(30), by: cm(26) },
      ],
      receivers: [
        { id: 'C20', x0: cm(37.05), y0: cm(OPENINGS.C20[0]), x1: cm(39.99), y1: cm(OPENINGS.C20[1]) },
        { id: 'C22', x0: cm(37.05), y0: cm(OPENINGS.C22[0]), x1: cm(39.99), y1: cm(OPENINGS.C22[1]) },
      ],
      shots: ionOrder(seed).map((sp, i) => shotFromVoltage(sp, c, 2, 25, 0, 1000, i * 10e-6)),
    };
  },
};

export const LAB2 = [level21, level22, level23];
