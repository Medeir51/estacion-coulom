import { describe, expect, it } from 'vitest';
import { AULA, CODATA, scriptConstants } from '../core/constants';
import { mathFunctions, type FunctionSpec, type Value } from './builtins';
import { deviceFunctions, type DeviceHost } from './devices';
import { ScriptError } from './errors';
import { Runtime, analyzeProgram, calculate } from './interpreter';
import { parseProgram } from './parser';

function run(src: string, opts: { ticks?: number; extra?: Record<string, FunctionSpec>; aula?: boolean } = {}) {
  const out: string[] = [];
  const prog = parseProgram(src);
  const functions = { ...mathFunctions(() => 0), ...(opts.extra ?? {}) };
  const constants = scriptConstants(opts.aula ? AULA : CODATA);
  analyzeProgram(prog, functions, constants);
  const rt = new Runtime(prog, { constants, functions, output: (t) => out.push(t) });
  rt.runInicio();
  for (let i = 0; i < (opts.ticks ?? 0); i++) rt.runCiclo();
  return out;
}

const inicio = (body: string) => `Inicio\n${body}\nFinInicio`;

function errOf(fn: () => unknown): ScriptError {
  try {
    fn();
  } catch (e) {
    if (e instanceof ScriptError) return e;
    throw e;
  }
  throw new Error('no lanzó error');
}

describe('22.6 Intérprete: salidas', () => {
  it('S1', () => expect(run(inicio('Escribir 2 + 3 * 4'))).toEqual(['14']));
  it('S2', () => expect(run(inicio('Escribir (2 + 3) * 4'))).toEqual(['20']));
  it('S3', () => expect(run(inicio('Escribir -2^2'))).toEqual(['-4']));
  it('S4', () => expect(run(inicio('Escribir 2^3^2'))).toEqual(['512']));
  it('S5', () => expect(run(inicio('Escribir 7 MOD 3, " ", -7 MOD 3'))).toEqual(['1 2']));
  it('S6', () =>
    expect(run(inicio('Escribir redondear(2.5), " ", redondear(-2.5), " ", trunc(-2.7)'))).toEqual(['3 -3 -2']));
  it('S7', () => expect(run(inicio('Escribir 1/3'))).toEqual(['0.333333']));
  it('S8', () => expect(run(inicio('Escribir 1.6e-19 * 2'))).toEqual(['3.2000e-19']));
  it('S9', () => expect(run(inicio('s <- 0\nPara i <- 1 Hasta 10 Hacer\n  s <- s + i\nFinPara\nEscribir s'))).toEqual(['55']));
  it('S10', () =>
    expect(run(inicio('s <- 0\nPara i <- 10 Hasta 1 Con Paso -3 Hacer\n s <- s + i\nFinPara\nEscribir s, " ", i'))).toEqual([
      '22 -2',
    ]));
  it('S11', () => expect(run(inicio('n <- 0\nMientras n < 5 Hacer\n n <- n + 2\nFinMientras\nEscribir n'))).toEqual(['6']));
  it('S12', () =>
    expect(
      run(inicio('Si Falso Y (1/0 > 0) Entonces\n Escribir "no"\nSiNo\n Escribir "cortocircuito"\nFinSi')),
    ).toEqual(['cortocircuito']));
  it('S13', () => expect(run(inicio('Escribir "abc" = "abc", " ", 3 <> 3'))).toEqual(['Verdadero Falso']));
  it('S14', () => expect(run(inicio('x <- 4\nSI x > 1 ENTONCES\n ESCRIBIR raíz(16) + X\nFINSI'))).toEqual(['8']));
  it('S15', () =>
    expect(run('Inicio\n c <- 0\nFinInicio\nCiclo\n c <- c + 1\n Escribir c\nFinCiclo', { ticks: 3 })).toEqual([
      '1',
      '2',
      '3',
    ]));
  it('S16', () => expect(run(inicio('Escribir K_C * Q_E * 1e-9 / 0.05^2'))).toEqual(['5.7599e-16']));
  it('S17', () => {
    expect(run(inicio('Escribir 0.0001234'))).toEqual(['1.2340e-4']);
    expect(run(inicio('Escribir 123456.7'))).toEqual(['123457']);
  });
  it('S18: calculadora', () => {
    const vars = new Map<string, Value>();
    const r = calculate('v <- raiz(2 * Q_E * 300 / M_E)', vars, scriptConstants(CODATA), mathFunctions(() => 0));
    expect(r).toEqual({ ok: true, text: 'v = 1.0273e+7' });
    expect(calculate('v * 2', vars, scriptConstants(CODATA), mathFunctions(() => 0))).toEqual({
      ok: true,
      text: '2.0545e+7',
    });
  });
  it('S19', () => {
    expect(run(inicio('Escribir K_C'))).toEqual(['8.9876e+9']);
    expect(run(inicio('Escribir K_C'), { aula: true })).toEqual(['9.0000e+9']);
  });
  it('acepta ← , ; y operadores alternativos', () => {
    expect(run(inicio('x ← 3;\nSi x == 3 && !(x != 3) || Falso Entonces\n Escribir x % 2\nFinSi'))).toEqual(['1']);
  });
});

describe('22.6 Intérprete: errores', () => {
  it('S20', () => {
    const e = errOf(() => run('Ciclo\nx = 5\nFinCiclo'));
    expect([e.code, e.line]).toEqual(['E-ASIG', 2]);
  });
  it('S21', () => {
    const e = errOf(() => run('Ciclo\nSi 1 > 0 Entonces\nx <- 1\nFinCiclo'));
    expect([e.code, e.line]).toEqual(['E-CIERRE', 4]);
    expect(e.message).toBe('Falta «FinSi» para cerrar el «Si» de la línea 2.');
  });
  it('S22', () => {
    const e = errOf(() => run('x <- 3\nCiclo\nFinCiclo'));
    expect([e.code, e.line]).toEqual(['E-ESTR', 1]);
  });
  it('S23', () => {
    const e = errOf(() => run('Inicio\nx <- y2 + 1\nFinInicio'));
    expect([e.code, e.line]).toEqual(['E-VAR', 2]);
  });
  it('S24', () => expect(errOf(() => run(inicio('a <- 0\nb <- 5 / a'))).code).toBe('E-DIV0'));
  it('S25', () =>
    expect(errOf(() => run('Ciclo\nMientras Verdadero Hacer\nx <- 1\nFinMientras\nFinCiclo', { ticks: 1 })).code).toBe(
      'E-LIM',
    ));
  it('S26', () => expect(errOf(() => run(inicio('disparar("EM1")'))).code).toBe('E-FUNC'));
  it('S27', () => {
    const e = errOf(() => run(inicio('x <- 1,5')));
    expect(e.code).toBe('E-SINT');
    expect(e.message).toContain('Para decimales usa punto: 1.5');
  });
  it('S28', () => expect(errOf(() => run(inicio('y <- 2'))).code).toBe('E-RESERV'));
  it('S29', () => {
    const e = errOf(() => run(inicio('a <- 1\nSi 0 < a < 2 Entonces\nFinSi')));
    expect(e.code).toBe('E-SINT');
    expect(e.message).toContain('(a < b) Y (b < c)');
  });
  it('S30', () => expect(errOf(() => run(inicio('Si 5 Entonces\nFinSi'))).code).toBe('E-TIPO'));
  it('S31', () => expect(errOf(() => run(inicio('PI <- 3'))).code).toBe('E-CONST'));
  it('S32', () => expect(errOf(() => run(inicio('x <- raiz(-4)'))).code).toBe('E-NUM'));
  it('S33', () => expect(errOf(() => run('// solo un comentario')).code).toBe('E-ESTR'));
  it('S34', () => expect(errOf(() => run(inicio('Para i <- 1 Hasta 3 Con Paso 0 Hacer\nFinPara'))).code).toBe('E-PASO'));
  it('S35', () => {
    let pol = 1;
    const host: DeviceHost = {
      hasElectromagnet: (id) => id.toLowerCase() === 'em1',
      setPolarity: (_id, p) => {
        pol = p;
      },
      getPolarity: () => pol,
      fieldOf: () => pol * 0.2,
      hasDetector: () => false,
    };
    const extra = deviceFunctions(['isotopes'], host);
    expect(errOf(() => run(inicio('polaridad("EM1", 2)'), { extra })).code).toBe('E-RANGO');
    expect(errOf(() => run(inicio('polaridad("EM2", 1)'), { extra })).code).toBe('E-DISP');
    run(inicio('invertirPolaridad("em1")'), { extra });
    expect(pol).toBe(-1);
  });
  it('S36: calculadora en 1-1', () => {
    const r = calculate('campo()', new Map(), scriptConstants(CODATA), mathFunctions(() => 0));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('E-FUNC');
  });
  it('S37', () => {
    const src = Array.from({ length: 201 }, () => '// x').join('\n');
    expect(errOf(() => run(src)).code).toBe('E-TAM');
  });
  it('S38', () => {
    const out = run(inicio('Para i <- 1 Hasta 250 Hacer\n Escribir i\nFinPara'));
    expect(out).toHaveLength(201);
    expect(out[199]).toBe('200');
    expect(out[200]).toBe('(se omitieron más mensajes)');
  });
  it('E-ARGS y E-LEX', () => {
    expect(errOf(() => run(inicio('x <- raiz(1, 2)'))).code).toBe('E-ARGS');
    expect(errOf(() => run(inicio('x <- 3 $ 4'))).code).toBe('E-LEX');
  });
  it('bloque repetido', () => expect(errOf(() => run('Inicio\nFinInicio\nInicio\nFinInicio')).code).toBe('E-ESTR'));
});
