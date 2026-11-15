import { describe, expect, it } from 'vitest';
import { CODATA, scriptConstants } from '../core/constants';
import { mathFunctions } from './builtins';
import { deviceFunctions } from './devices';
import { Runtime, analyzeProgram, calculate } from './interpreter';
import { parseProgram } from './parser';
import { ScriptError } from './errors';

const calc = (s: string) => {
  const r = calculate(s, new Map(), scriptConstants(CODATA), mathFunctions(() => 1.5));
  return r.ok ? r.text : r.error.code;
};

describe('Funciones matemáticas', () => {
  it('valores', () => {
    expect(calc('sen(PI / 2)')).toBe('1');
    expect(calc('cos(0) + tan(0)')).toBe('1');
    expect(calc('atan(1) * 4')).toBe('3.14159');
    expect(calc('atan2(1, 0)')).toBe('1.5708');
    expect(calc('exp(0) + ln(1) + log(100)')).toBe('3');
    expect(calc('abs(-3) + min(2, 5) + max(2, 5)')).toBe('10');
    expect(calc('tiempo()')).toBe('1.5');
    expect(calc('ln(0)')).toBe('E-NUM');
    expect(calc('log(-1)')).toBe('E-NUM');
    expect(calc('10 ^ 400')).toBe('E-NUM');
    expect(calc('5 MOD 0')).toBe('E-DIV0');
    expect(calc('raiz("a")')).toBe('E-TIPO');
    expect(calc('NO 1')).toBe('E-TIPO');
    expect(calc('1 = Verdadero')).toBe('E-TIPO');
    expect(calc('Verdadero O (1/0 > 0)')).toBe('Verdadero');
    expect(calc('3 >= 3 Y 2 <= 1')).toBe('Falso');
    expect(calc('"a" <> "b"')).toBe('Verdadero');
    expect(calc('-(+2)')).toBe('-2');
    expect(calc('x = 2')).toBe('E-ASIG');
    expect(calc('PI <- 3')).toBe('E-CONST');
    expect(calc('2 3')).toBe('E-SINT');
    expect(calc('')).toBe('');
  });
  it('Escribir con lógicos y textos; el Para conserva el valor final', () => {
    const out: string[] = [];
    const prog = parseProgram('Inicio\n Para i <- 1 Hasta 3 Hacer\n FinPara\n Escribir i, " ", Verdadero, \'x\'\nFinInicio');
    analyzeProgram(prog, mathFunctions(() => 0), {});
    new Runtime(prog, { constants: {}, functions: mathFunctions(() => 0), output: (t) => out.push(t) }).runInicio();
    expect(out).toEqual(['4 Verdaderox']);
  });
  it('funciones de dispositivos: selector y generador', () => {
    let V = 0;
    let side = '';
    let n = 0;
    const warns: string[] = [];
    const fns = {
      ...mathFunctions(() => 0),
      ...deviceFunctions(['selector', 'generator'], {
        hasCapacitor: (id) => id === 'C1',
        setVoltage: (_id, v) => (V = v),
        setPositivePlate: (_id, s) => (side = s),
        field: () => 0.3,
        rms: () => 120,
        cycleIndex: () => 4,
        setTurns: (x) => (n = x),
        activeTurns: () => n,
        totalTurns: () => 185,
        warn: (t) => warns.push(t),
      }),
    };
    const src = `Inicio
 fijarVoltaje("C1", 1000)
 placaPositiva("C1", "Inferior")
 fijarEspiras(campo() * 100 + voltajeRMS() - numeroCiclo())
 x <- espirasActivas() + espirasTotales()
FinInicio`;
    const prog = parseProgram(src);
    analyzeProgram(prog, fns, {});
    new Runtime(prog, { constants: {}, functions: fns, output: () => {} }).runInicio();
    expect(V).toBe(1000);
    expect(side).toBe('inferior');
    expect(n).toBe(146);
    const bad = (s: string) => {
      try {
        const p = parseProgram(`Inicio\n${s}\nFinInicio`);
        new Runtime(p, { constants: {}, functions: fns, output: () => {} }).runInicio();
        return 'ok';
      } catch (e) {
        return (e as ScriptError).code;
      }
    };
    expect(bad('fijarVoltaje("C1", 3000)')).toBe('E-RANGO');
    expect(bad('placaPositiva("C1", "izq")')).toBe('E-RANGO');
    expect(bad('fijarVoltaje("C9", 1)')).toBe('E-DISP');
    expect(bad('fijarVoltaje(1, 1)')).toBe('E-TIPO');
    expect(bad('fijarEspiras(-1)')).toBe('E-RANGO');
    expect(bad('x <- fijarEspiras(3)')).toBe('E-TIPO');
    expect(bad('fijarEspiras(999)')).toBe('ok');
    expect(bad('fijarEspiras(999)')).toBe('ok');
    expect(warns.length).toBeGreaterThanOrEqual(1);
  });
  it('errores de cierre y de bloque', () => {
    const code = (s: string) => {
      try {
        parseProgram(s);
        return 'ok';
      } catch (e) {
        return (e as ScriptError).code;
      }
    };
    expect(code('Inicio\n Mientras 1 < 2 Hacer\nFinInicio')).toBe('E-CIERRE');
    expect(code('Inicio\n Para i <- 1 Hasta 2 Hacer\nFinInicio')).toBe('E-CIERRE');
    expect(code('Inicio\n x <- 1')).toBe('E-CIERRE');
    expect(code('Inicio\n Si 1 > 0\n FinSi\nFinInicio')).toBe('E-SINT');
    expect(code('Inicio\n Para Y <- 1 Hasta 2 Hacer\n FinPara\nFinInicio')).toBe('E-RESERV');
    expect(code('Inicio\n Escribir "abc\nFinInicio')).toBe('E-LEX');
    expect(code('Inicio\n x\nFinInicio')).toBe('E-SINT');
    expect(code('Inicio\n Hacer\nFinInicio')).toBe('E-SINT');
    expect(code('Inicio\n x <- )\nFinInicio')).toBe('E-SINT');
    expect(code('x'.repeat(8001))).toBe('E-TAM');
  });
});
