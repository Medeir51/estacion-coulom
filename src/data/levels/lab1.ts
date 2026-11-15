import { es } from '../../i18n/es';
/** Laboratorio 1 · Electrostática (sección 12). */
import { emptySources, type PlateSide } from '../../core/fields';
import { controlNumber, controlString, type ParticleLevel } from '../../core/level';
import type { Wall } from '../../core/world';
import { CHARGE_INVENTORY, anchor, arcWalls, cm, placedCharges, shotFromVoltage, wall } from './helpers';

const COMMON = {
  lab: 1 as const,
  kind: 'particles' as const,
  world: { w: 0.4, h: 0.25 },
  dt: 2e-11,
  particleTmax: 2e-7,
  totalTmax: 2e-7,
  scaleLabel: es.ui.scales.ns10,
  timeScale: 1e-8,
  controlPeriod: null,
  scriptMode: 'none' as const,
  devices: [],
  targets: { electron: 'R1' },
};

const VACC = 300;

const anchors11 = [anchor('A1', 20, 13), anchor('A2', 20, 3)];
const inv11 = [
  { ...CHARGE_INVENTORY.p1, count: 1 },
  { ...CHARGE_INVENTORY.n1, count: 1 },
];

export const level11: ParticleLevel = {
  ...COMMON,
  id: '1-1',
  emitter: { x: cm(3), y: cm(8), angle: 0 },
  anchors: anchors11,
  inventory: inv11,
  knobs: [],
  selectors: [],
  reference: { placements: { A1: 'p1' }, controls: {}, script: '' },
  altReference: { placements: { A2: 'n1' }, controls: {}, script: '' },
  buildScene(cfg, c) {
    const sources = emptySources();
    sources.charges = placedCharges(anchors11, inv11, cfg);
    return {
      world: this.world,
      sources,
      walls: [],
      detectors: [],
      receivers: [{ id: 'R1', x0: cm(36.5), y0: cm(16.5), x1: cm(39), y1: cm(20.5) }],
      shots: [shotFromVoltage('electron', c, 3, 8, 0, VACC)],
    };
  },
};

export const level12: ParticleLevel = {
  ...COMMON,
  id: '1-2',
  emitter: { x: cm(3), y: cm(8), angle: 0 },
  anchors: [],
  inventory: [],
  knobs: [{ id: 'voltage', unit: 'V', min: 0, max: 100, step: 0.5, default: 0 }],
  selectors: [{ id: 'positivePlate', options: ['superior', 'inferior'], default: 'superior' }],
  reference: { placements: {}, controls: { voltage: 45, positivePlate: 'superior' }, script: '' },
  buildScene(cfg, c) {
    const sources = emptySources();
    sources.capacitors = [
      {
        id: 'C1',
        cx: cm(12),
        cy: cm(8),
        L: cm(10),
        d: cm(3),
        angle: 0,
        V: controlNumber(cfg, 'voltage'),
        positive: controlString(cfg, 'positivePlate', 'superior') as PlateSide,
      },
    ];
    return {
      world: this.world,
      sources,
      walls: [wall(38.5, 0, 38.5, 25, 'screen', 'screen')],
      detectors: [],
      receivers: [{ id: 'R1', x0: cm(37.5), y0: cm(14), x1: cm(38.5), y1: cm(15) }],
      shots: [shotFromVoltage('electron', c, 3, 8, 0, VACC)],
    };
  },
};

const anchors13 = [
  anchor('A1', 20, 18),
  anchor('A2', 25, 13),
  anchor('A3', 12, 11),
  anchor('A4', 30, 5),
  anchor('A5', 37, 12),
  anchor('A6', 12, 1),
];
const inv13 = [
  { ...CHARGE_INVENTORY.p1, count: 2 },
  { ...CHARGE_INVENTORY.n1, count: 2 },
  { ...CHARGE_INVENTORY.p2, count: 1 },
];

export function tubeWalls13(): Wall[] {
  return [
    wall(2, 4.5, 20, 4.5, 'exterior'),
    wall(2, 7.5, 20, 7.5, 'interior'),
    wall(2, 4.5, 2, 7.5, 'cap'),
    ...arcWalls(20, 18, 10.5, -90, 0, 48, 'interior'),
    ...arcWalls(20, 18, 13.5, -90, 0, 48, 'exterior'),
    wall(30.5, 18, 30.5, 24.5, 'interior'),
    wall(33.5, 18, 33.5, 24.5, 'exterior'),
    wall(30.5, 24.5, 33.5, 24.5, 'cap'),
  ];
}

export const level13: ParticleLevel = {
  ...COMMON,
  id: '1-3',
  emitter: { x: cm(3), y: cm(6), angle: 0 },
  anchors: anchors13,
  inventory: inv13,
  knobs: [],
  selectors: [],
  reference: { placements: { A2: 'p1', A4: 'n1' }, controls: {}, script: '' },
  buildScene(cfg, c) {
    const sources = emptySources();
    sources.charges = placedCharges(anchors13, inv13, cfg);
    return {
      world: this.world,
      sources,
      walls: tubeWalls13(),
      detectors: [],
      receivers: [{ id: 'R1', x0: cm(30.5), y0: cm(22.5), x1: cm(33.5), y1: cm(24) }],
      shots: [shotFromVoltage('electron', c, 3, 6, 0, VACC)],
    };
  },
};

export const LAB1 = [level11, level12, level13];
