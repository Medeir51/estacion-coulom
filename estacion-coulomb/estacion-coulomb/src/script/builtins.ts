/** Funciones matemáticas de PseudoCoulomb (sección 10.6). */
import { errors } from './errors';

export type Value = number | boolean | string;

export interface CallCtx {
  line: number;
  name: string;
}

export interface FunctionSpec {
  /** Número de argumentos */
  arity: number;
  /** Devuelve un valor (si no, solo se puede usar como instrucción) */
  returns: boolean;
  fn: (args: Value[], ctx: CallCtx) => Value | void;
}

export function num(v: Value, line: number): number {
  if (typeof v !== 'number') throw errors.typeNumber(line);
  return v;
}

export function str(v: Value, line: number): string {
  if (typeof v !== 'string') throw errors.typeText(line);
  return v;
}

export function checkFinite(x: number, line: number): number {
  if (!Number.isFinite(x)) throw errors.nan(line);
  return x;
}

/** Redondeo con las mitades alejándose de cero. */
export function roundHalfAway(x: number): number {
  return Math.sign(x) * Math.floor(Math.abs(x) + 0.5);
}

const unary = (f: (x: number, line: number) => number): FunctionSpec => ({
  arity: 1,
  returns: true,
  fn: (a, c) => checkFinite(f(num(a[0], c.line), c.line), c.line),
});

export function mathFunctions(time: () => number): Record<string, FunctionSpec> {
  return {
    abs: unary(Math.abs),
    raiz: unary((x, line) => {
      if (x < 0) throw errors.sqrtNeg(line);
      return Math.sqrt(x);
    }),
    sen: unary(Math.sin),
    cos: unary(Math.cos),
    tan: unary(Math.tan),
    atan: unary(Math.atan),
    atan2: {
      arity: 2,
      returns: true,
      fn: (a, c) => checkFinite(Math.atan2(num(a[0], c.line), num(a[1], c.line)), c.line),
    },
    exp: unary(Math.exp),
    ln: unary((x, line) => {
      if (x <= 0) throw errors.logNonPos(line);
      return Math.log(x);
    }),
    log: unary((x, line) => {
      if (x <= 0) throw errors.logNonPos(line);
      return Math.log10(x);
    }),
    redondear: unary(roundHalfAway),
    trunc: unary(Math.trunc),
    min: { arity: 2, returns: true, fn: (a, c) => Math.min(num(a[0], c.line), num(a[1], c.line)) },
    max: { arity: 2, returns: true, fn: (a, c) => Math.max(num(a[0], c.line), num(a[1], c.line)) },
    tiempo: { arity: 0, returns: true, fn: () => time() },
  };
}

/** Formato de Escribir: punto decimal, notación exponencial para valores grandes o pequeños (sección 10.4). */
export function formatScriptNumber(x: number): string {
  const a = Math.abs(x);
  if (a >= 1e6 || (a > 0 && a < 0.001)) return x.toExponential(4);
  return String(Number(x.toPrecision(6)));
}

export function formatValue(v: Value): string {
  if (typeof v === 'number') return formatScriptNumber(v);
  if (typeof v === 'boolean') return v ? 'Verdadero' : 'Falso';
  return v;
}
