/** Intérprete de árbol de PseudoCoulomb (secciones 10.4, 10.5 y 10.9). Sin eval ni new Function. */
import type { Expr, Program, Stmt } from './ast';
import { checkFinite, formatValue, num, type FunctionSpec, type Value } from './builtins';
import { errors, ScriptError } from './errors';
import { normalizeName, tokenize } from './lexer';
import { Parser, checkSize } from './parser';
import { es } from '../i18n/es';

export const LIMIT_INICIO = 100000;
export const LIMIT_CICLO = 10000;
export const MAX_OUTPUT = 200;

export interface RuntimeOptions {
  /** Constantes de solo lectura (nombres en cualquier forma; se normalizan) */
  constants: Record<string, number>;
  /** Funciones disponibles (nombres normalizados) */
  functions: Record<string, FunctionSpec>;
  /** Recibe cada línea de salida de Escribir */
  output: (text: string) => void;
}

function normKeys<T>(o: Record<string, T>): Map<string, T> {
  const m = new Map<string, T>();
  for (const [k, v] of Object.entries(o)) m.set(normalizeName(k), v);
  return m;
}

/** Revisión estática: funciones inexistentes, número de argumentos y asignación a constantes. */
export function analyzeProgram(prog: Program, functions: Record<string, FunctionSpec>, constants: Record<string, number>): void {
  const fns = normKeys(functions);
  const consts = normKeys(constants);
  const expr = (e: Expr): void => {
    switch (e.k) {
      case 'call': {
        const f = fns.get(e.name);
        if (!f) throw errors.noFunc(e.line, e.raw);
        if (e.args.length !== f.arity) throw errors.args(e.line, e.raw, f.arity);
        e.args.forEach(expr);
        break;
      }
      case 'un':
        expr(e.e);
        break;
      case 'bin':
        expr(e.a);
        expr(e.b);
        break;
      default:
        break;
    }
  };
  const stmts = (ss: Stmt[]): void => {
    for (const s of ss) {
      switch (s.k) {
        case 'assign':
          if (consts.has(s.name)) throw errors.constant(s.line, s.raw);
          expr(s.e);
          break;
        case 'write':
          s.args.forEach(expr);
          break;
        case 'if':
          expr(s.cond);
          stmts(s.then);
          if (s.else) stmts(s.else);
          break;
        case 'while':
          expr(s.cond);
          stmts(s.body);
          break;
        case 'for':
          if (consts.has(s.name)) throw errors.constant(s.line, s.raw);
          expr(s.from);
          expr(s.to);
          if (s.step) expr(s.step);
          stmts(s.body);
          break;
        case 'call': {
          const f = fns.get(s.name);
          if (!f) throw errors.noFunc(s.line, s.raw);
          if (s.args.length !== f.arity) throw errors.args(s.line, s.raw, f.arity);
          s.args.forEach(expr);
          break;
        }
      }
    }
  };
  if (prog.inicio) stmts(prog.inicio);
  if (prog.ciclo) stmts(prog.ciclo);
}

export class Runtime {
  readonly program: Program;
  readonly vars = new Map<string, Value>();
  private consts: Map<string, number>;
  private fns: Map<string, FunctionSpec>;
  private output: (t: string) => void;
  private outCount = 0;
  private budget = 0;
  /** Número de veces que se ejecutó el Ciclo */
  ticks = 0;

  constructor(program: Program, opts: RuntimeOptions) {
    this.program = program;
    this.consts = normKeys(opts.constants);
    this.fns = normKeys(opts.functions);
    this.output = opts.output;
  }

  write(text: string): void {
    if (this.outCount < MAX_OUTPUT) {
      this.output(text);
    } else if (this.outCount === MAX_OUTPUT) {
      this.output(es.script.omitted);
    }
    this.outCount++;
  }

  runInicio(): void {
    if (!this.program.inicio) return;
    this.budget = LIMIT_INICIO;
    this.block(this.program.inicio);
  }

  runCiclo(): void {
    this.ticks++;
    if (!this.program.ciclo) return;
    this.budget = LIMIT_CICLO;
    this.block(this.program.ciclo);
  }

  private spend(line: number): void {
    if (--this.budget < 0) throw errors.limit(line);
  }

  private block(ss: Stmt[]): void {
    for (const s of ss) this.stmt(s);
  }

  private assign(name: string, raw: string, v: Value, line: number): void {
    if (this.consts.has(name)) throw errors.constant(line, raw);
    this.vars.set(name, v);
  }

  private bool(e: Expr): boolean {
    const v = this.eval(e);
    if (typeof v !== 'boolean') throw errors.typeBool(e.line);
    return v;
  }

  private stmt(s: Stmt): void {
    this.spend(s.line);
    switch (s.k) {
      case 'assign':
        this.assign(s.name, s.raw, this.eval(s.e), s.line);
        return;
      case 'write':
        this.write(s.args.map((a) => formatValue(this.eval(a))).join(''));
        return;
      case 'if':
        if (this.bool(s.cond)) this.block(s.then);
        else if (s.else) this.block(s.else);
        return;
      case 'while':
        while (this.bool(s.cond)) {
          this.spend(s.line);
          this.block(s.body);
        }
        return;
      case 'for': {
        const from = num(this.eval(s.from), s.line);
        const to = num(this.eval(s.to), s.line);
        const step = s.step ? num(this.eval(s.step), s.line) : 1;
        if (step === 0) throw errors.step0(s.line);
        this.assign(s.name, s.raw, from, s.line);
        for (;;) {
          const i = this.vars.get(s.name);
          const iv = typeof i === 'number' ? i : num(i ?? 0, s.line);
          if (step > 0 ? iv > to : iv < to) break;
          this.spend(s.line);
          this.block(s.body);
          const cur = num(this.vars.get(s.name) ?? 0, s.line);
          this.vars.set(s.name, checkFinite(cur + step, s.line));
        }
        return;
      }
      case 'call':
        this.call(s.name, s.raw, s.args, s.line);
        return;
    }
  }

  private call(name: string, raw: string, args: Expr[], line: number): Value | void {
    const f = this.fns.get(name);
    if (!f) throw errors.noFunc(line, raw);
    if (args.length !== f.arity) throw errors.args(line, raw, f.arity);
    const vals = args.map((a) => this.eval(a));
    return f.fn(vals, { line, name: raw });
  }

  eval(e: Expr): Value {
    switch (e.k) {
      case 'num':
        return e.v;
      case 'str':
        return e.v;
      case 'bool':
        return e.v;
      case 'var': {
        const c = this.consts.get(e.name);
        if (c !== undefined) return c;
        const v = this.vars.get(e.name);
        if (v === undefined) throw errors.undefinedVar(e.line, e.raw);
        return v;
      }
      case 'call': {
        const f = this.fns.get(e.name);
        if (f && !f.returns) {
          this.call(e.name, e.raw, e.args, e.line);
          throw errors.typeNumber(e.line);
        }
        const v = this.call(e.name, e.raw, e.args, e.line);
        if (v === undefined) throw errors.typeNumber(e.line);
        return v;
      }
      case 'un': {
        if (e.op === 'no') return !this.bool(e.e);
        const v = num(this.eval(e.e), e.line);
        return e.op === '-' ? -v : v;
      }
      case 'bin':
        return this.binary(e);
    }
  }

  private binary(e: Extract<Expr, { k: 'bin' }>): Value {
    const line = e.line;
    if (e.op === 'y') {
      if (!this.bool(e.a)) return false;
      return this.bool(e.b);
    }
    if (e.op === 'o') {
      if (this.bool(e.a)) return true;
      return this.bool(e.b);
    }
    const a = this.eval(e.a);
    const b = this.eval(e.b);
    if (e.op === '=' || e.op === '<>') {
      if (typeof a !== typeof b) throw errors.typeSame(line);
      return e.op === '=' ? a === b : a !== b;
    }
    const x = num(a, line);
    const y = num(b, line);
    switch (e.op) {
      case '<':
        return x < y;
      case '<=':
        return x <= y;
      case '>':
        return x > y;
      case '>=':
        return x >= y;
      case '+':
        return checkFinite(x + y, line);
      case '-':
        return checkFinite(x - y, line);
      case '*':
        return checkFinite(x * y, line);
      case '/':
        if (y === 0) throw errors.div0(line);
        return checkFinite(x / y, line);
      case 'mod':
        if (y === 0) throw errors.div0(line);
        return checkFinite(x - y * Math.floor(x / y), line);
      case '^':
        return checkFinite(Math.pow(x, y), line);
    }
  }
}

/** Resultado de la calculadora. */
export type CalcResult = { ok: true; text: string } | { ok: false; error: ScriptError };

/** Calculadora (sección 10.11): una expresión o una asignación por línea. */
export function calculate(
  line: string,
  vars: Map<string, Value>,
  constants: Record<string, number>,
  functions: Record<string, FunctionSpec>,
): CalcResult {
  try {
    checkSize(line);
    const toks = tokenize(line).filter((t) => t.type !== 'nl');
    if (toks.length <= 1) return { ok: true, text: '' };
    const rt = new Runtime({ inicio: null, ciclo: null }, { constants, functions, output: () => {} });
    for (const [k, v] of vars) rt.vars.set(k, v);
    const p = new Parser(toks);
    const t0 = p.peekToken();
    const t1 = p.peekToken(1);
    let text: string;
    if (t0.type === 'id' && t1.type === 'op' && t1.value === '<-') {
      p.advance();
      p.advance();
      const e = p.expression();
      if (!p.atEnd()) throw errors.expected(1, 'el fin de la línea');
      if (normKeys(constants).has(t0.value)) throw errors.constant(1, t0.raw);
      analyzeExpr(e, functions);
      const v = rt.eval(e);
      vars.set(t0.value, v);
      text = `${t0.raw} = ${formatValue(v)}`;
    } else if (t0.type === 'id' && t1.type === 'op' && t1.value === '=') {
      throw errors.assign(1);
    } else {
      const e = p.expression();
      if (!p.atEnd()) throw errors.expected(1, 'el fin de la línea');
      analyzeExpr(e, functions);
      text = formatValue(rt.eval(e));
    }
    return { ok: true, text };
  } catch (err) {
    if (err instanceof ScriptError) return { ok: false, error: err };
    throw err;
  }
}

function analyzeExpr(e: Expr, functions: Record<string, FunctionSpec>): void {
  analyzeProgram({ inicio: [{ k: 'write', args: [e], line: e.line }], ciclo: null }, functions, {});
}
