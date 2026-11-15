import { describe, expect, it } from 'vitest';
import { CODATA } from './constants';
import { AttemptRun } from './attempt';
import { buildSandbox, decodeScene, emptySandbox, encodeScene, newItem, validateScene } from './sandbox';
import { EXAMPLE_IDS, example } from '../data/examples';
import { FieldSystem } from './fields';

describe('Cámara de Pruebas', () => {
  it('codifica y decodifica una escena por enlace', () => {
    const s = example('crt').scene;
    const back = decodeScene(encodeScene(s));
    expect(back).not.toBeNull();
    expect(back!.items).toHaveLength(s.items.length);
    expect(decodeScene('no-es-base64!!')).toBeNull();
  });
  it('rechaza archivos que no son escenas', () => {
    expect(validateScene({ foo: 1 })).toBeNull();
    expect(validateScene(null)).toBeNull();
    expect(validateScene({ ...emptySandbox(), items: [{ kind: 'nave', id: 'X' }] })).toBeNull();
  });
  it('los cinco ejemplos se cargan y se simulan sin errores', () => {
    for (const id of EXAMPLE_IDS) {
      const ex = example(id);
      expect(validateScene(JSON.parse(JSON.stringify(ex.scene)))).not.toBeNull();
      const b = buildSandbox(ex.scene, CODATA, 1);
      const run = new AttemptRun({
        setup: { kind: 'particles', scene: b.scene, settings: b.settings, controlPeriod: b.controlPeriod },
        script: '',
        devices: ['selector', 'isotopes'],
        constants: CODATA,
      });
      run.runToEnd();
      expect(run.finished).toBe(true);
    }
  });
  it('jaula de Faraday: E = 0 dentro del blindaje', () => {
    const ex = example('faraday');
    const f = new FieldSystem(buildSandbox(ex.scene, CODATA, 1).scene.sources, CODATA.k);
    const e = { x: 0, y: 0 };
    f.E(ex.pin!.x, ex.pin!.y, e);
    expect(Math.hypot(e.x, e.y)).toBe(0);
  });
  it('paso automático: 0,2 mm por paso para la partícula más rápida', () => {
    const s = emptySandbox();
    s.items.push(newItem(s, 'emitter', 0.05, 0.1));
    const b = buildSandbox(s, CODATA, 1);
    const v = b.scene.shots[0].speed;
    expect(b.settings.dt * v).toBeCloseTo(0.0002, 9);
  });
});
