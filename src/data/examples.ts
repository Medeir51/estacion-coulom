/** Escenas de ejemplo de la Cámara de Pruebas (sección 15.2). */
import { emptySandbox, type SandboxScene } from '../core/sandbox';

export type ExampleId = 'dipole' | 'faraday' | 'spectrometer' | 'orbit' | 'crt';

export const EXAMPLE_IDS: ExampleId[] = ['dipole', 'faraday', 'spectrometer', 'orbit', 'crt'];

export function example(id: ExampleId): { scene: SandboxScene; pin?: { x: number; y: number }; viewer?: boolean } {
  const s = emptySandbox();
  switch (id) {
    case 'dipole':
      s.items = [
        { kind: 'charge', id: 'Q1', x: 0.15, y: 0.125, q: 1 },
        { kind: 'charge', id: 'Q2', x: 0.25, y: 0.125, q: -1 },
      ];
      return { scene: s, viewer: true };
    case 'faraday':
      s.items = [
        { kind: 'charge', id: 'Q1', x: 0.08, y: 0.125, q: 2 },
        { kind: 'shield', id: 'B1', x0: 0.2, y0: 0.07, x1: 0.32, y1: 0.18, thickness: 0.003 },
      ];
      return { scene: s, pin: { x: 0.26, y: 0.125 }, viewer: true };
    case 'spectrometer':
      s.world = { w: 0.6, h: 0.4 };
      s.items = [
        { kind: 'magnet', id: 'M1', x0: 0, y0: 0.1, x1: 0.6, y1: 0.4, bmag: 100, sense: 'out' },
        ...(['proton', 'deuteron', 'alpha'] as const).map((sp, i) => ({
          kind: 'emitter' as const,
          id: `E${i + 1}`,
          x: 0.05,
          y: 0.02,
          angle: 90,
          species: sp,
          speedMode: 'vacc' as const,
          vacc: 1000,
          speed: 0,
          count: 1,
          interval: 1,
          spread: 0,
          chargeE: 1,
          massU: 1,
        })),
        { kind: 'wall', id: 'P1', points: [{ x: 0.06, y: 0.1 }, { x: 0.6, y: 0.1 }] },
      ];
      return { scene: s };
    case 'orbit':
      s.world = { w: 0.6, h: 0.4 };
      s.items = [
        { kind: 'magnet', id: 'M1', x0: 0.05, y0: 0.05, x1: 0.55, y1: 0.35, bmag: 20, sense: 'out' },
        {
          kind: 'emitter',
          id: 'E1',
          x: 0.3,
          y: 0.1,
          angle: 0,
          species: 'proton',
          speedMode: 'speed',
          vacc: 0,
          speed: 1e5,
          count: 1,
          interval: 1,
          spread: 0,
          chargeE: 1,
          massU: 1,
        },
      ];
      return { scene: s };
    case 'crt':
      s.items = [
        {
          kind: 'emitter',
          id: 'E1',
          x: 0.03,
          y: 0.125,
          angle: 0,
          species: 'electron',
          speedMode: 'vacc',
          vacc: 300,
          speed: 0,
          count: 1,
          interval: 1,
          spread: 0,
          chargeE: 1,
          massU: 1,
        },
        { kind: 'capacitor', id: 'C1', cx: 0.1, cy: 0.125, L: 0.06, d: 0.03, angle: 0, V: 40, positive: 'superior' },
        { kind: 'capacitor', id: 'C2', cx: 0.2, cy: 0.14, L: 0.06, d: 0.04, angle: 0, V: 30, positive: 'inferior' },
        { kind: 'wall', id: 'P1', points: [{ x: 0.36, y: 0.01 }, { x: 0.36, y: 0.24 }] },
      ];
      return { scene: s };
  }
}
