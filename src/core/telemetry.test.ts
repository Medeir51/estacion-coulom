import { describe, expect, it } from 'vitest';
import {
  CSV_COLUMNS,
  HEAT_COLS,
  bottleneck,
  courseSummary,
  emptyTelemetryFile,
  heatmap,
  idp,
  importCourse,
  levelMetrics,
  scriptHash,
  toCsv,
  type AttemptRecord,
  type TelemetryFile,
} from './telemetry';
import { evaluateRun, computeStars } from './evaluation';
import { runAttempt } from './attempt';
import { CODATA } from './constants';
import { getLevel } from '../data/levels';

function rec(partial: Partial<AttemptRecord>): AttemptRecord {
  return {
    id: 'x',
    levelId: '1-3',
    attemptNumber: 1,
    startedAt: '2026-11-01T10:00:00Z',
    thinkingSeconds: 30,
    result: 'failure',
    cause: 'F-PARED',
    failurePoints: [],
    stars: 0,
    hintsOpened: 0,
    hypothesis: null,
    hypothesisMatched: null,
    config: {},
    script: null,
    metrics: {},
    seed: 1,
    constantsMode: 'codata',
    teacherMode: false,
    ...partial,
  };
}

function fileWith(nick: string, toPass: number): TelemetryFile {
  const f = emptyTelemetryFile();
  f.profile.nickname = nick;
  f.exportedAt = `2026-11-0${toPass}T00:00:00Z`;
  for (let i = 1; i <= toPass; i++) f.attempts.push(rec({ attemptNumber: i, result: i === toPass ? 'success' : 'failure' }));
  return f;
}

describe('22.9 Telemetría', () => {
  it('T1', () => expect(idp(true, 4, 4, 1)).toBeCloseTo(5.333, 3));
  it('T2', () => {
    expect(idp(false, 6, null, 3)).toBe(14);
    const m = levelMetrics(
      Array.from({ length: 6 }, (_, i) => rec({ attemptNumber: i + 1, hintsOpened: 3 })),
      '1-3',
    );
    expect(m.idp).toBe(14);
    expect(m.solved).toBe(false);
  });
  it('T3', () => expect(bottleneck({ '1-1': 2.0, '1-3': 5.3, '2-1': 5.3 })).toBe('1-3'));
  it('T4', () => {
    const g = heatmap([{ x: 0.2, y: 0.125 }], { w: 0.4, h: 0.25 });
    const at = (c: number, r: number) => g[r * HEAT_COLS + c];
    expect(at(32, 20)).toBe(1);
    let max = 0;
    for (const v of g) max = Math.max(max, v);
    expect(max).toBe(1);
    expect(at(31, 20)).toBeCloseTo(at(33, 20), 12);
    expect(at(32, 19)).toBeCloseTo(at(32, 21), 12);
    expect(at(30, 18)).toBeCloseTo(at(34, 22), 12);
  });
  it('T5: encabezado del CSV', () => {
    const csv = toCsv(emptyTelemetryFile());
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1).split('\r\n')[0]).toBe(CSV_COLUMNS.join(','));
    expect(CSV_COLUMNS).toEqual([
      'apodo',
      'codigo_curso',
      'prueba',
      'intento',
      'inicio',
      'segundos_reflexion',
      'resultado',
      'causa',
      'puntos_fallo',
      'estrellas',
      'pistas',
      'hipotesis',
      'coincidio',
      'semilla',
      'constantes',
      'modo_docente',
      'lineas_guion',
      'hash_guion',
    ]);
  });
  it('T6: mediana de intentos hasta superar', () => {
    const files = [fileWith('a', 2), fileWith('b', 4), fileWith('c', 9)];
    const s = courseSummary(files).find((x) => x.levelId === '1-3')!;
    expect(s.medianAttempts).toBe(4);
    expect(s.pctPassed).toBe(100);
  });
  it('T7: archivo sin app', () => {
    const r = importCourse([{ name: 'malo.json', text: JSON.stringify({ schemaVersion: 1, attempts: [] }) }]);
    expect(r.invalid).toEqual(['malo.json']);
    expect(r.files).toHaveLength(0);
  });
  it('T8: archivo repetido', () => {
    const t = JSON.stringify(fileWith('a', 2));
    const r = importCourse([
      { name: 'a.json', text: t },
      { name: 'a2.json', text: t },
    ]);
    expect(r.files).toHaveLength(1);
    expect(r.duplicates).toEqual(['a2.json']);
  });
  it('T9: hash ignora comentarios', () => {
    const a = 'Inicio\n    x <- 1   // uno\nFinInicio';
    const b = 'Inicio\n    x <- 1\n// otro comentario\nFinInicio';
    expect(scriptHash(a)).not.toBe(scriptHash('Inicio\n    x <- 2\nFinInicio'));
    expect(scriptHash(a)).toBe(scriptHash('Inicio\n    x <- 1 // distinto\nFinInicio'));
    expect(scriptHash('Escribir "a // b"')).not.toBe(scriptHash('Escribir "a'));
    expect(scriptHash(b).length).toBe(8);
  });
});

describe('Estrellas', () => {
  it('reglas de la sección 11.5', () => {
    expect(computeStars(false, 0, true)).toBe(0);
    expect(computeStars(true, 0, true)).toBe(3);
    expect(computeStars(true, 0, false)).toBe(2);
    expect(computeStars(true, 2, true)).toBe(2);
    expect(computeStars(true, 3, true)).toBe(1);
  });
  it('sugerencias de nivel', () => {
    const l = getLevel('1-3');
    const cfg = { placements: {}, controls: {}, script: '' };
    const ev = evaluateRun(l, cfg, runAttempt(l, cfg, 1, CODATA));
    expect(ev.suggestion).toBe('Le faltó fuerza hacia el centro de la curva.');
    expect(ev.message).toContain('la pared exterior de la curva');
  });
});
