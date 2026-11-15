import { es } from '../../i18n/es';
/** Laboratorio 3 · Inducción y código (sección 14). */
import type { GeneratorLevel } from '../../core/level';
import { coil } from './helpers';

const COMMON = {
  lab: 3 as const,
  kind: 'generator' as const,
  anchors: [],
  knobs: [],
  scaleLabel: es.ui.scales.realtime,
  timeScale: 1,
};

export const level31: GeneratorLevel = {
  ...COMMON,
  id: '3-1',
  slots: 4,
  B0: 0.25,
  area: 0.02,
  baseF: 60,
  profile: 'constant',
  duration: 2,
  tripV: null,
  R: 14.4,
  load: 'lamp',
  servers: 0,
  controlPeriod: null,
  scriptMode: 'none',
  devices: [],
  inventory: [coil(10, 2), coil(20, 1), coil(50, 1), coil(100, 1)],
  selectors: [],
  reference: { placements: { S1: 'c50', S2: 'c20', S3: 'c10' }, controls: {}, script: '' },
};

export const level32: GeneratorLevel = {
  ...COMMON,
  id: '3-2',
  slots: 5,
  B0: 0.3,
  area: 0.015,
  baseF: 20,
  profile: 'constant',
  duration: 2,
  tripV: null,
  R: 4.8,
  load: 'servers',
  servers: 3,
  controlPeriod: null,
  scriptMode: 'none',
  devices: [],
  inventory: [coil(5, 1), coil(10, 1), coil(20, 1), coil(50, 2), coil(100, 1)],
  selectors: [{ id: 'gear', options: ['1', '2', '3', '4'], default: '1' }],
  reference: { placements: { S1: 'c100' }, controls: { gear: '3' }, script: '' },
};

export const REF_SCRIPT_33 = `Inicio
    objetivo <- 120     // voltaje eficaz que necesitan los servidores (V)
FinInicio

Ciclo
    // Ley de Faraday: V_rms = n · B · A · ω / √2  →  n = V_rms · √2 / (B · A · ω)
    n <- redondear(objetivo * raiz(2) / (campo() * AREA * OMEGA))
    fijarEspiras(n)
FinCiclo
`;

export const level33: GeneratorLevel = {
  ...COMMON,
  id: '3-3',
  slots: 5,
  B0: 0.3,
  area: 0.015,
  baseF: 20,
  profile: 'peaks',
  duration: 7,
  tripV: 132,
  R: 4.8,
  load: 'servers',
  servers: 3,
  controlPeriod: 1e-3,
  scriptMode: 'full',
  devices: ['generator'],
  levelConstants: { AREA: 0.015, FRECUENCIA: 60, OMEGA: 2 * Math.PI * 60 },
  inventory: [coil(100, 1), coil(50, 1), coil(20, 1), coil(10, 1), coil(5, 1)],
  selectors: [{ id: 'gear', options: ['3'], default: '3', locked: true }],
  reference: {
    placements: { S1: 'c100', S2: 'c50', S3: 'c20', S4: 'c10', S5: 'c5' },
    controls: { gear: '3' },
    script: REF_SCRIPT_33,
  },
};

export const LAB3 = [level31, level32, level33];
