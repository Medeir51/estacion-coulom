import { describe, expect, it } from 'vitest';
import { AttemptRun, checkScript, isBlankScript, runAttempt, setupForLevel } from './attempt';
import { AULA, CODATA, getConstants, scriptConstants } from './constants';
import { evaluateRun } from './evaluation';
import { traceFieldLines } from './fieldlines';
import { FieldSystem, emptySources } from './fields';
import { formatCm, formatFixed, formatNumber, formatPoint, formatQuantity } from './format';
import { GeneratorSim, profileAt } from './generator';
import { normRect, polylineSegments, rectSegments, rectStrictlyContains } from './geometry';
import { controlNumber, controlString, defaultConfig, isLevelId } from './level';
import { newSeed } from './rng';
import { particleKind, speciesColor } from './species';
import { add, angleDeg, cross, dist, dot, fromAngleDeg, len, scale, sub, vec } from './vec';
import { getLevel, nextLevelId } from '../data/levels';

describe('Utilidades', () => {
  it('vectores', () => {
    const a = vec(3, 4);
    expect(len(a)).toBe(5);
    expect(add(a, vec(1, 1))).toEqual({ x: 4, y: 5 });
    expect(sub(a, vec(1, 1))).toEqual({ x: 2, y: 3 });
    expect(scale(a, 2)).toEqual({ x: 6, y: 8 });
    expect(dot(a, vec(1, 0))).toBe(3);
    expect(cross(vec(1, 0), vec(0, 1))).toBe(1);
    expect(dist(a, vec(0, 0))).toBe(5);
    expect(fromAngleDeg(90, 2).y).toBeCloseTo(2, 12);
    expect(angleDeg(vec(0, -1))).toBeCloseTo(270, 12);
  });
  it('formato de magnitudes', () => {
    expect(formatQuantity(5e-4, 'B')).toBe('500 µT');
    expect(formatQuantity(2, 'B')).toBe('2 T');
    expect(formatQuantity(0, 'B')).toBe('0 mT');
    expect(formatQuantity(2e6, 'E')).toBe('2 MV/m');
    expect(formatQuantity(500, 'E')).toBe('500 V/m');
    expect(formatQuantity(0.0025, 't')).toBe('2,5 ms');
    expect(formatQuantity(3, 't')).toBe('3 s');
    expect(formatQuantity(120, 'V')).toBe('120 V');
    expect(formatQuantity(0.05, 'pos')).toBe('5,0 cm');
    expect(formatQuantity(1e5, 'v')).toBe('100 000 m/s');
    expect(formatQuantity(8.33, 'I')).toBe('8,33 A');
    expect(formatQuantity(1000, 'P')).toBe('1000 W');
    expect(formatQuantity(9.1e-31, 'm')).toBe('9,1 × 10⁻³¹ kg');
    expect(formatNumber(NaN)).toBe('—');
    expect(formatNumber(1e-30, 4)).toBe('1 × 10⁻³⁰');
    expect(formatCm(-0.0123)).toBe('−1,2');
    expect(formatPoint(0.365, 0.184)).toBe('(36,5; 18,4)');
    expect(formatFixed(-2.5, 1)).toBe('−2,5');
    expect(formatFixed(-0.01, 1)).toBe('0,0');
  });
  it('geometría auxiliar', () => {
    expect(polylineSegments([vec(0, 0), vec(1, 0), vec(1, 1)])).toHaveLength(2);
    expect(rectSegments({ x0: 0, y0: 0, x1: 1, y1: 1 })).toHaveLength(4);
    expect(normRect({ x0: 1, y0: 1, x1: 0, y1: 0 })).toEqual({ x0: 0, y0: 0, x1: 1, y1: 1 });
    expect(rectStrictlyContains({ x0: 0, y0: 0, x1: 1, y1: 1 }, 1, 0.5)).toBe(false);
  });
  it('constantes, especies y semillas', () => {
    expect(getConstants('aula')).toBe(AULA);
    expect(getConstants('codata')).toBe(CODATA);
    expect(scriptConstants(AULA).K_C).toBe(9e9);
    const k = particleKind('custom', CODATA, { chargeE: -2, mass: 1e-26 });
    expect(k.q).toBeCloseTo(-2 * CODATA.e, 30);
    expect(particleKind('custom', CODATA).m).toBe(CODATA.mp);
    expect(speciesColor('custom')).toMatch(/^#/);
    expect(speciesColor('alpha')).toBe('#FFE08A');
    const s = newSeed();
    expect(Number.isInteger(s) && s >= 0).toBe(true);
  });
  it('niveles', () => {
    expect(isLevelId('2-3')).toBe(true);
    expect(isLevelId('4-1')).toBe(false);
    expect(nextLevelId('1-3')).toBe('2-1');
    expect(nextLevelId('3-3')).toBeNull();
    const cfg = defaultConfig(getLevel('1-2'));
    expect(controlNumber(cfg, 'voltage')).toBe(0);
    expect(controlNumber(cfg, 'nada', 7)).toBe(7);
    expect(controlString(cfg, 'positivePlate', 'x')).toBe('superior');
    expect(controlString(cfg, 'nada', 'x')).toBe('x');
  });
});

describe('Líneas de campo', () => {
  it('solo cargas negativas: las líneas siguen el sentido del campo (hacia la carga)', () => {
    const src = emptySources();
    src.charges.push({ id: 'n', x: 0.2, y: 0.12, q: -1e-9 });
    const lines = traceFieldLines(new FieldSystem(src, CODATA.k), { w: 0.4, h: 0.25 });
    expect(lines).toHaveLength(8);
    const p = lines[0].points;
    const dEnd = Math.hypot(p[p.length - 2] - 0.2, p[p.length - 1] - 0.12);
    expect(dEnd).toBeLessThan(0.01);
  });
  it('capacitor: 5 líneas rectas de la placa positiva a la negativa; el blindaje las corta', () => {
    const src = emptySources();
    src.capacitors.push({ id: 'C1', cx: 0.2, cy: 0.1, L: 0.1, d: 0.02, angle: 0, V: 50, positive: 'inferior' });
    src.charges.push({ id: 'q', x: 0.05, y: 0.05, q: 3e-9 });
    src.shields.push({ id: 'S', x0: 0.08, y0: 0.0, x1: 0.12, y1: 0.25, thickness: 0.003 });
    const lines = traceFieldLines(new FieldSystem(src, CODATA.k), { w: 0.4, h: 0.25 }, { densityFactor: 0.5 });
    const capLines = lines.filter((l) => l.points.length === 4);
    expect(capLines).toHaveLength(5);
    expect(capLines[0].points[1]).toBeCloseTo(0.09, 12);
    expect(capLines[0].points[3]).toBeCloseTo(0.11, 12);
    const f = new FieldSystem(src, CODATA.k);
    expect(f.insideShieldWall(0.081, 0.1)).toBe(true);
    expect(f.setPolarity('nada', 1)).toBe(false);
  });
});

describe('Generador y ejecución', () => {
  it('perfil senoidal y disparo de la protección', () => {
    const p = { kind: 'sine' as const, B0: 0.3, a: 0.2, fB: 1 };
    expect(profileAt(p, 0.25).B).toBeCloseTo(0.36, 12);
    const g = new GeneratorSim({ profile: { kind: 'constant', B0: 1 }, area: 0.1, f: 60, nTotal: 100, R: 10, tripV: 50, duration: 1 });
    while (!g.done) g.stepSample();
    expect(g.tripped?.cycle).toBe(0);
    expect(g.lastRms()).toBeGreaterThan(50);
  });
  it('guion vacío, errores de sintaxis y detención', () => {
    expect(isBlankScript('// nada\n\n')).toBe(true);
    expect(isBlankScript('$$$')).toBe(false);
    expect(checkScript('Ciclo\nx = 1\nFinCiclo', [], CODATA).error?.code).toBe('E-ASIG');
    const level = getLevel('2-3');
    const cfg = { ...defaultConfig(level), script: 'Inicio\n x <- 1 / 0\nFinInicio' };
    const r = runAttempt(level, cfg, 1, CODATA);
    const ev = evaluateRun(level, cfg, r);
    expect(ev.result).toBe('scriptError');
    expect(ev.cause).toBe('E-DIV0');
    const run = new AttemptRun({
      setup: setupForLevel(level, defaultConfig(level), 1, CODATA),
      script: '',
      devices: [],
      constants: CODATA,
    });
    expect(run.duration()).toBeCloseTo(110e-6, 12);
    run.advance(10);
    run.abort();
    expect(evaluateRun(level, defaultConfig(level), run).result).toBe('aborted');
  });
  it('error de sintaxis: el intento no empieza', () => {
    const level = getLevel('2-2');
    const cfg = { ...defaultConfig(level), script: 'Inicio\n x <- (1\nFinInicio' };
    const r = runAttempt(level, cfg, 1, CODATA);
    expect(r.finished).toBe(true);
    expect(r.time()).toBe(0);
    expect(r.output[0].kind).toBe('error');
  });
  it('2-3: cobertura de funciones de detectores y polaridad', () => {
    const level = getLevel('2-3');
    const script = `Ciclo
  Si cuentaCruces("D1") > 0 Y tiempoCruce("D2") < 0 Entonces
    Si campoActual("EM1") > 0 Entonces
      invertirPolaridad("EM1")
    FinSi
  FinSi
FinCiclo`;
    const cfg = { ...defaultConfig(level), controls: { bmag: 200 }, script };
    const ev = evaluateRun(level, cfg, runAttempt(level, cfg, 12345, CODATA));
    expect(ev.result).toBe('failure');
    expect(ev.ionRows).toHaveLength(10);
  });
});
