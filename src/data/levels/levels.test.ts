import { describe, expect, it } from 'vitest';
import { AULA, CODATA, type PhysConstants } from '../../core/constants';
import { AttemptRun, runAttempt, setupForLevel } from '../../core/attempt';
import { evaluateRun } from '../../core/evaluation';
import { defaultConfig, type LevelConfig, type LevelDef, type ParticleLevel } from '../../core/level';
import { ParticleSim } from '../../core/world';
import { LEVELS, getLevel } from './index';
import { ionOrder } from './lab2';

function cfgOf(level: LevelDef, partial: Partial<LevelConfig>): LevelConfig {
  const base = defaultConfig(level);
  return {
    placements: { ...partial.placements },
    controls: { ...base.controls, ...partial.controls },
    script: partial.script ?? '',
  };
}

function attempt(id: string, partial: Partial<LevelConfig>, seed = 12345, c: PhysConstants = CODATA) {
  const level = getLevel(id as never);
  const cfg = cfgOf(level, partial);
  const run = runAttempt(level, cfg, seed, c);
  const ev = evaluateRun(level, cfg, run);
  return { level, cfg, run, ev };
}

const near = (actualM: number, expectedCm: number, tolCm = 0.05) =>
  expect(Math.abs(actualM * 100 - expectedCm)).toBeLessThanOrEqual(tolCm);

describe('Esquema de los niveles', () => {
  it('cada nivel tiene los campos obligatorios y coordenadas dentro del mundo', () => {
    expect(LEVELS).toHaveLength(9);
    for (const l of LEVELS) {
      expect(l.id).toMatch(/^[123]-[123]$/);
      expect(l.reference).toBeDefined();
      if (l.kind === 'particles') {
        const scene = l.buildScene(defaultConfig(l), CODATA, 1);
        const inWorld = (x: number, y: number) => x >= 0 && x <= l.world.w && y >= 0 && y <= l.world.h;
        for (const a of l.anchors) expect(inWorld(a.x, a.y)).toBe(true);
        for (const w of scene.walls) expect(inWorld(w.ax, w.ay) && inWorld(w.bx, w.by)).toBe(true);
        for (const r of scene.receivers) expect(inWorld(r.x0, r.y0) && inWorld(r.x1, r.y1)).toBe(true);
        expect(inWorld(l.emitter.x, l.emitter.y)).toBe(true);
        for (let i = 0; i < l.anchors.length; i++)
          for (let j = i + 1; j < l.anchors.length; j++)
            expect(Math.hypot(l.anchors[i].x - l.anchors[j].x, l.anchors[i].y - l.anchors[j].y)).toBeGreaterThan(0.02);
      } else {
        expect(l.slots).toBeGreaterThan(0);
      }
    }
  });
});

describe('22.3 Integrador en niveles', () => {
  it('I5: 1-2 con 45 V, altura en x = 37,5 cm', () => {
    const level = getLevel('1-2') as ParticleLevel;
    const cfg = cfgOf(level, { controls: { voltage: 45, positivePlate: 'superior' } });
    const scene = level.buildScene(cfg, CODATA, 1);
    scene.receivers = [];
    scene.walls = [];
    const sim = new ParticleSim(scene, { dt: level.dt, particleTmax: level.particleTmax, totalTmax: level.totalTmax }, CODATA.k);
    const p = sim.particles[0];
    let prev = { x: p.x, y: p.y };
    let y = NaN;
    while (!sim.done) {
      sim.step();
      if (p.x >= 0.375) {
        y = prev.y + ((0.375 - prev.x) / (p.x - prev.x)) * (p.y - prev.y);
        break;
      }
      prev = { x: p.x, y: p.y };
    }
    near(y, 14.379, 0.002);
  });
  it('I6: 1-3 con dt = 2e-11 y 5e-12', () => {
    const level = getLevel('1-3') as ParticleLevel;
    const cfg = cfgOf(level, { placements: { A2: 'p1', A4: 'n1' } });
    for (const [dt, tExp] of [
      [2e-11, 38.84],
      [5e-12, 38.825],
    ]) {
      const sim = new ParticleSim(level.buildScene(cfg, CODATA, 1), { dt, particleTmax: 2e-7, totalTmax: 2e-7 }, CODATA.k);
      while (!sim.done) sim.step();
      expect(sim.particles[0].status).toBe('captured');
      expect(Math.abs(sim.particles[0].endT * 1e9 - tExp) / tExp).toBeLessThan(0.002);
    }
  });
});

describe('22.5 Laboratorio 1', () => {
  it('N1: +1 nC en A1', () => {
    const { ev, run } = attempt('1-1', { placements: { A1: 'p1' } });
    expect(ev.result).toBe('success');
    expect(Math.abs(run.sim!.particles[0].endT * 1e9 - 32.2)).toBeLessThan(0.1);
  });
  it('N2: −1 nC en A2', () => {
    const { ev, run } = attempt('1-1', { placements: { A2: 'n1' } });
    expect(ev.result).toBe('success');
    expect(Math.abs(run.sim!.particles[0].endT * 1e9 - 37.4)).toBeLessThan(0.1);
  });
  it('N3: configuraciones que fallan', () => {
    const cases: [Record<string, string>, number, number][] = [
      [{}, 40, 8],
      [{ A2: 'p1' }, 33.0, 0],
      [{ A1: 'n1' }, 32.7, 0],
      [{ A1: 'p1', A2: 'n1' }, 27.0, 25.0],
    ];
    for (const [placements, x, y] of cases) {
      const { ev, run } = attempt('1-1', { placements });
      expect(ev.cause).toBe('F-FUERA');
      near(run.sim!.particles[0].endX, x);
      near(run.sim!.particles[0].endY, y);
    }
  });
  it('N4–N6: 1-2 voltajes', () => {
    for (const V of [45, 41, 49]) expect(attempt('1-2', { controls: { voltage: V, positivePlate: 'superior' } }).ev.result).toBe('success');
    for (const V of [40.5, 49.7]) expect(attempt('1-2', { controls: { voltage: V, positivePlate: 'superior' } }).ev.result).toBe('failure');
  });
  it('N7: causas de 1-2', () => {
    const a = attempt('1-2', { controls: { voltage: 0, positivePlate: 'superior' } });
    expect(a.ev.cause).toBe('F-PANTALLA');
    near(a.run.sim!.particles[0].endX, 38.5);
    near(a.run.sim!.particles[0].endY, 8.0);
    const b = attempt('1-2', { controls: { voltage: 55, positivePlate: 'superior' } });
    expect(b.ev.cause).toBe('F-PLACA');
    near(b.run.sim!.particles[0].endX, 16.9);
    near(b.run.sim!.particles[0].endY, 9.5);
    const c = attempt('1-2', { controls: { voltage: 45, positivePlate: 'inferior' } });
    expect(c.ev.cause).toBe('F-PANTALLA');
    near(c.run.sim!.particles[0].endY, 1.4);
  });
  const solutions: [Record<string, string>, number][] = [
    [{ A2: 'p1', A4: 'n1' }, 1.7],
    [{ A2: 'p2', A4: 'n1' }, 0.8],
    [{ A1: 'p1', A2: 'p1', A4: 'n1' }, 2.7],
    [{ A1: 'p1', A2: 'p2', A5: 'n1' }, 1.3],
    [{ A1: 'n1', A2: 'p2', A4: 'n1' }, 8.2],
    [{ A2: 'p2', A3: 'p1', A5: 'n1', A6: 'p1' }, 6.6],
  ];
  it('N8: las 6 soluciones de 1-3', () => {
    for (const [placements, mm] of solutions) {
      const { ev } = attempt('1-3', { placements });
      expect(ev.result).toBe('success');
      expect(Math.abs(ev.metrics.minClearanceMm - mm)).toBeLessThanOrEqual(0.1);
    }
  });
  it('N9: 1-3 configuraciones que fallan', () => {
    const cases: [Record<string, string>, number, number][] = [
      [{}, 26.2, 6.0],
      [{ A2: 'p1' }, 28.9, 7.8],
      [{ A4: 'n1' }, 26.8, 6.3],
      [{ A1: 'p2' }, 31.3, 10.6],
    ];
    for (const [placements, x, y] of cases) {
      const { ev, run } = attempt('1-3', { placements });
      expect(ev.cause).toBe('F-PARED');
      expect(run.sim!.particles[0].wall?.tag).toBe('exterior');
      near(run.sim!.particles[0].endX, x);
      near(run.sim!.particles[0].endY, y);
    }
  });
  it('N10: fuerza bruta de las 1129 colocaciones (lenta)', () => {
    const level = getLevel('1-3');
    const anchors = level.anchors.map((a) => a.id);
    const items = ['', 'p1', 'n1', 'p2'];
    const limits: Record<string, number> = { p1: 2, n1: 2, p2: 1 };
    let total = 0;
    let wins = 0;
    const rec = (i: number, placements: Record<string, string>, used: Record<string, number>) => {
      if (i === anchors.length) {
        total++;
        const run = runAttempt(level, cfgOf(level, { placements }), 1, CODATA);
        if (evaluateRun(level, cfgOf(level, { placements }), run).result === 'success') wins++;
        return;
      }
      for (const it of items) {
        if (it && (used[it] ?? 0) >= limits[it]) continue;
        const p = { ...placements };
        const u = { ...used };
        if (it) {
          p[anchors[i]] = it;
          u[it] = (u[it] ?? 0) + 1;
        }
        rec(i + 1, p, u);
      }
    };
    rec(0, {}, {});
    expect(total).toBe(1129);
    expect(wins).toBe(6);
  });
  it('N11: referencias del Laboratorio 1 en modo aula', () => {
    expect(attempt('1-1', { placements: { A1: 'p1' } }, 1, AULA).ev.result).toBe('success');
    expect(attempt('1-2', { controls: { voltage: 45, positivePlate: 'superior' } }, 1, AULA).ev.result).toBe('success');
    expect(attempt('1-3', { placements: { A2: 'p1', A4: 'n1' } }, 1, AULA).ev.result).toBe('success');
  });
});

describe('22.5 Laboratorio 2', () => {
  it('N12–N13: 2-1 rangos de B', () => {
    for (const b of [43.1, 41.9, 44.4]) expect(attempt('2-1', { controls: { bmag: b, bSense: 'out' } }).ev.result).toBe('success');
    for (const b of [41.5, 44.7]) expect(attempt('2-1', { controls: { bmag: b, bSense: 'out' } }).ev.result).toBe('failure');
  });
  it('N14: 2-1 fallos', () => {
    const a = attempt('2-1', { controls: { bmag: 43.1, bSense: 'in' } });
    expect(a.ev.cause).toBe('F-FUERA');
    expect(a.run.sim!.particles[0].exitSide).toBe('izquierda');
    near(a.run.sim!.particles[0].endX, 0);
    near(a.run.sim!.particles[0].endY, 24.1);
    const b = attempt('2-1', { controls: { bmag: 0, bSense: 'out' } });
    expect(b.run.sim!.particles[0].exitSide).toBe('arriba');
    near(b.run.sim!.particles[0].endX, 10);
    near(b.run.sim!.particles[0].endY, 40);
  });
  it('N15–N17: 2-2 selector', () => {
    const ok = attempt('2-2', { controls: { voltage: 1000, positivePlate: 'inferior' } });
    expect(ok.ev.result).toBe('success');
    expect(ok.ev.metrics.protonsArrived).toBe(1);
    for (const V of [980, 1020]) expect(attempt('2-2', { controls: { voltage: V, positivePlate: 'inferior' } }).ev.result).toBe('success');
    for (const V of [970, 1030]) expect(attempt('2-2', { controls: { voltage: V, positivePlate: 'inferior' } }).ev.result).toBe('failure');
    for (const controls of [
      { voltage: 1000, positivePlate: 'superior' },
      { voltage: 0, positivePlate: 'inferior' },
    ]) {
      const r = attempt('2-2', { controls });
      expect(r.run.sim!.particles.every((p) => p.status === 'crashed')).toBe(true);
    }
  });
  it('N18: guion de referencia de 2-2', () => {
    const level = getLevel('2-2');
    const r = attempt('2-2', { controls: { voltage: 0, positivePlate: 'superior' }, script: level.reference.script });
    expect(r.ev.result).toBe('success');
    expect(r.run.scriptActions.voltage).toBeCloseTo(1000, 9);
    expect(r.ev.challenge.usedSetVoltage).toBe(true);
  });
  it('N19: orden de los iones con la semilla 12345', () => {
    expect(ionOrder(12345).map((s) => (s === 'ne20' ? 20 : 22))).toEqual([22, 20, 22, 20, 20, 22, 22, 20, 20, 22]);
  });
  const ref23 = () => getLevel('2-3').reference.script;
  it('N20: guion de referencia con 200 mT', () => {
    for (const seed of [12345, 2026]) {
      const r = attempt('2-3', { controls: { bmag: 200 }, script: ref23() }, seed);
      expect(r.ev.metrics.correctIons).toBe(10);
      expect(r.run.output[0].text).toBe('Umbral de tiempo de vuelo: 2.0854e-6 s');
    }
  });
  it('N21: rangos de |B| con el guion de referencia', () => {
    for (const b of [197, 203]) expect(attempt('2-3', { controls: { bmag: b }, script: ref23() }).ev.metrics.correctIons).toBe(10);
    for (const b of [195, 205]) expect(attempt('2-3', { controls: { bmag: b }, script: ref23() }).ev.metrics.correctIons).toBe(0);
  });
  it('N22: sin guion / polaridad −1 fija / condición invertida', () => {
    expect(attempt('2-3', { controls: { bmag: 200 } }).ev.metrics.correctIons).toBe(5);
    const fixedNeg = 'Inicio\n    polaridad("EM1", -1)\nFinInicio';
    expect(attempt('2-3', { controls: { bmag: 200 }, script: fixedNeg }).ev.metrics.correctIons).toBe(5);
    const inverted = ref23().replace('Si vuelo > umbral Entonces', 'Si vuelo < umbral Entonces');
    expect(attempt('2-3', { controls: { bmag: 200 }, script: inverted }).ev.metrics.correctIons).toBe(0);
  });
  it('N23: referencias del Laboratorio 2 en modo aula', () => {
    expect(attempt('2-1', { controls: { bmag: 43.1, bSense: 'out' } }, 1, AULA).ev.result).toBe('success');
    expect(attempt('2-2', { controls: { voltage: 1000, positivePlate: 'inferior' } }, 1, AULA).ev.result).toBe('success');
    expect(attempt('2-3', { controls: { bmag: 200 }, script: ref23() }, 12345, AULA).ev.metrics.correctIons).toBe(10);
  });
});

describe('22.5 Laboratorio 3', () => {
  it('N24: 3-1', () => {
    const cases: [Record<string, string>, number, string][] = [
      [{ S1: 'c50', S2: 'c20', S3: 'c10' }, 150.8, 'success'],
      [{ S1: 'c50', S2: 'c20' }, 131.95, 'F-LAMPARA-BAJA'],
      [{ S1: 'c50', S2: 'c20', S3: 'c10', S4: 'c10' }, 169.65, 'F-LAMPARA-ALTA'],
      [{ S1: 'c100' }, 188.5, 'F-LAMPARA-ALTA'],
    ];
    for (const [placements, e0, res] of cases) {
      const { ev } = attempt('3-1', { placements });
      expect(Math.abs(ev.metrics.e0 - e0)).toBeLessThan(0.01);
      expect(res === 'success' ? ev.result : ev.cause).toBe(res);
    }
  });
  it('N25–N26: 3-2', () => {
    const ok: [Record<string, string>, number][] = [
      [{ S1: 'c100' }, 119.96],
      [{ S1: 'c50', S2: 'c50' }, 119.96],
      [{ S1: 'c100', S2: 'c5' }, 125.96],
    ];
    for (const [placements, v] of ok) {
      const { ev } = attempt('3-2', { placements, controls: { gear: '3' } });
      expect(ev.result).toBe('success');
      expect(Math.abs(ev.metrics.vrms - v)).toBeLessThan(0.01);
    }
    const low = attempt('3-2', { placements: { S1: 'c50', S2: 'c20' }, controls: { gear: '3' } });
    expect(low.ev.cause).toBe('F-VOLTAJE');
    expect(Math.abs(low.ev.metrics.vrms - 83.97)).toBeLessThan(0.01);
    expect(low.ev.suggestion).toContain('valor eficaz');
    expect(attempt('3-2', { placements: { S1: 'c50', S2: 'c20', S3: 'c5' }, controls: { gear: '4' } }).ev.cause).toBe('F-FRECUENCIA');
    expect(attempt('3-2', { placements: { S1: 'c100', S2: 'c50' }, controls: { gear: '2' } }).ev.cause).toBe('F-FRECUENCIA');
  });
  const all5 = { S1: 'c100', S2: 'c50', S3: 'c20', S4: 'c10', S5: 'c5' };
  const ref33 = () => getLevel('3-3').reference.script;
  it('N27: guion de referencia con 185 espiras', () => {
    const { ev } = attempt('3-3', { placements: all5, script: ref33() });
    expect(ev.result).toBe('success');
    expect(ev.metrics.inRange).toBe(420);
    expect(Math.abs(ev.metrics.minV - 119.36)).toBeLessThan(0.01);
    expect(Math.abs(ev.metrics.maxV - 120.29)).toBeLessThan(0.01);
  });
  it('N28: otras semillas', () => {
    for (const seed of [1, 2, 3, 99, 2026]) {
      expect(attempt('3-3', { placements: all5, script: ref33() }, seed).ev.metrics.inRangePct).toBe(100);
    }
  });
  it('N29: solo 100 espiras', () => {
    const { ev } = attempt('3-3', { placements: { S1: 'c100' }, script: ref33() });
    expect(ev.cause).toBe('F-CALIDAD');
    expect(ev.metrics.inRange).toBe(386);
  });
  it('N30: sin guion', () => {
    const a = attempt('3-3', { placements: { S1: 'c100' } });
    expect(a.ev.cause).toBe('F-SOBRECARGA');
    expect(a.ev.metrics.overloadCycle).toBe(59);
    expect(Math.abs(a.ev.metrics.overloadV - 133.3)).toBeLessThan(0.05);
    const b = attempt('3-3', { placements: all5 });
    expect(b.ev.metrics.overloadCycle).toBe(0);
    expect(Math.abs(b.ev.metrics.overloadV - 221.9)).toBeLessThan(0.05);
  });
  it('N31: guion que usa 120 V como pico', () => {
    const src = ref33().replace('objetivo * raiz(2)', 'objetivo');
    const { ev } = attempt('3-3', { placements: all5, script: src });
    expect(ev.cause).toBe('F-CALIDAD');
    expect(ev.metrics.inRange).toBe(0);
  });
  it('N32: guion por realimentación', () => {
    const src = `Inicio
    n <- 100
    ultimo <- -1
    fijarEspiras(n)
FinInicio
Ciclo
    Si numeroCiclo() > ultimo Entonces
        ultimo <- numeroCiclo()
        n <- n * 120 / voltajeRMS()
        fijarEspiras(n)
    FinSi
FinCiclo`;
    const { ev } = attempt('3-3', { placements: all5, script: src });
    expect(ev.result).toBe('success');
    expect(Math.abs(ev.metrics.inRangePct - 98.3)).toBeLessThan(0.05);
  });
});

describe('22.7 R4: determinismo', () => {
  it('misma configuración y semilla, mismo resultado', () => {
    const level = getLevel('2-3');
    const cfg = cfgOf(level, { controls: { bmag: 200 }, script: level.reference.script });
    const a = runAttempt(level, cfg, 777, CODATA);
    const b = runAttempt(level, cfg, 777, CODATA);
    expect(a.sim!.particles.map((p) => [p.endX, p.endY, p.endT])).toEqual(b.sim!.particles.map((p) => [p.endX, p.endY, p.endT]));
  });
  it('GEN7: fijarEspiras(300) con 185 espiras', () => {
    const level = getLevel('3-3');
    const cfg = cfgOf(level, {
      placements: { S1: 'c100', S2: 'c50', S3: 'c20', S4: 'c10', S5: 'c5' },
      script: 'Ciclo\n    fijarEspiras(300)\nFinCiclo',
    });
    const run = new AttemptRun({
      setup: setupForLevel(level, cfg, 1, CODATA),
      script: cfg.script,
      devices: level.devices,
      levelConstants: level.levelConstants,
      constants: CODATA,
    });
    run.advance(100);
    expect(run.gen!.nActive).toBe(185);
    expect(run.output.filter((o) => o.kind === 'warn')).toHaveLength(1);
  });
});
