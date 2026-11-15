/** Analizador sintáctico de descenso recursivo de PseudoCoulomb (sección 10.3). */
import type { BinOp, Expr, Program, Stmt } from './ast';
import { errors } from './errors';
import { tokenize, type Token } from './lexer';

export const MAX_LINES = 200;
export const MAX_CHARS = 8000;

const CLOSERS: Record<string, string> = {
  inicio: 'FinInicio',
  ciclo: 'FinCiclo',
  si: 'FinSi',
  mientras: 'FinMientras',
  para: 'FinPara',
};
const OPENER_NAME: Record<string, string> = {
  inicio: 'Inicio',
  ciclo: 'Ciclo',
  si: 'Si',
  mientras: 'Mientras',
  para: 'Para',
};
const TERMINATORS = new Set(['fininicio', 'finciclo', 'finsi', 'sino', 'finmientras', 'finpara', 'inicio', 'ciclo']);
const CMP = new Set(['=', '<>', '<', '<=', '>', '>=']);
const KW_DISPLAY: Record<string, string> = {
  entonces: '«Entonces»',
  hacer: '«Hacer»',
  hasta: '«Hasta»',
  paso: '«Paso»',
  '<-': '«<-»',
  ')': '«)»',
  '(': '«(»',
};

export class Parser {
  private toks: Token[];
  private pos = 0;

  constructor(toks: Token[]) {
    this.toks = toks;
  }

  private peek(o = 0): Token {
    return this.toks[Math.min(this.pos + o, this.toks.length - 1)];
  }
  private next(): Token {
    const t = this.toks[this.pos];
    if (this.pos < this.toks.length - 1) this.pos++;
    return t;
  }
  private isKw(v: string, o = 0): boolean {
    const t = this.peek(o);
    return t.type === 'kw' && t.value === v;
  }
  private isOp(v: string, o = 0): boolean {
    const t = this.peek(o);
    return t.type === 'op' && t.value === v;
  }
  private skipNl(): void {
    while (this.peek().type === 'nl') this.next();
  }
  private expectKw(v: string): Token {
    if (!this.isKw(v)) throw errors.expected(this.peek().line, KW_DISPLAY[v] ?? `«${v}»`);
    return this.next();
  }
  private expectOp(v: string): Token {
    if (!this.isOp(v)) throw errors.expected(this.peek().line, KW_DISPLAY[v] ?? `«${v}»`);
    return this.next();
  }

  /** fin = [ ";" ] salto */
  private fin(lastExpr?: Expr): void {
    if (this.isOp(';')) this.next();
    const t = this.peek();
    if (t.type === 'nl') {
      this.next();
      return;
    }
    if (t.type === 'eof') return;
    if (t.type === 'op' && t.value === ',' && this.peek(1).type === 'num' && lastExpr && lastExpr.k === 'num') {
      throw errors.decimalComma(t.line, lastExpr.raw, this.peek(1).raw);
    }
    throw errors.expected(t.line, 'el fin de la línea');
  }

  parseProgram(): Program {
    const prog: Program = { inicio: null, ciclo: null };
    this.skipNl();
    let lastLine = 1;
    while (this.peek().type !== 'eof') {
      const t = this.peek();
      lastLine = t.line;
      if (t.type === 'kw' && (t.value === 'inicio' || t.value === 'ciclo')) {
        const key = t.value as 'inicio' | 'ciclo';
        if (prog[key]) throw errors.repeated(t.line, OPENER_NAME[key]);
        this.next();
        this.fin();
        const body = this.instructions();
        const end = this.peek();
        const closer = key === 'inicio' ? 'fininicio' : 'finciclo';
        if (!(end.type === 'kw' && end.value === closer)) {
          throw errors.close(end.line, CLOSERS[key], OPENER_NAME[key], t.line);
        }
        this.next();
        this.fin();
        prog[key] = body;
      } else {
        throw errors.outside(t.line);
      }
      this.skipNl();
    }
    if (!prog.inicio && !prog.ciclo) throw errors.empty(lastLine);
    return prog;
  }

  private instructions(): Stmt[] {
    const out: Stmt[] = [];
    for (;;) {
      this.skipNl();
      const t = this.peek();
      if (t.type === 'eof') return out;
      if (t.type === 'kw' && TERMINATORS.has(t.value)) return out;
      out.push(this.instruction());
    }
  }

  private closeBlock(opener: string, openLine: number, closer: string): void {
    const t = this.peek();
    if (!(t.type === 'kw' && t.value === closer)) {
      throw errors.close(t.line, CLOSERS[opener], OPENER_NAME[opener], openLine);
    }
    this.next();
  }

  private instruction(): Stmt {
    const t = this.peek();
    if (t.type === 'kw') {
      switch (t.value) {
        case 'escribir': {
          this.next();
          const args = [this.expression()];
          while (this.isOp(',')) {
            this.next();
            args.push(this.expression());
          }
          this.fin();
          return { k: 'write', args, line: t.line };
        }
        case 'si': {
          this.next();
          const cond = this.expression();
          this.expectKw('entonces');
          this.fin();
          const then = this.instructions();
          let els: Stmt[] | null = null;
          if (this.isKw('sino')) {
            this.next();
            this.fin();
            els = this.instructions();
          }
          this.closeBlock('si', t.line, 'finsi');
          this.fin();
          return { k: 'if', cond, then, else: els, line: t.line };
        }
        case 'mientras': {
          this.next();
          const cond = this.expression();
          this.expectKw('hacer');
          this.fin();
          const body = this.instructions();
          this.closeBlock('mientras', t.line, 'finmientras');
          this.fin();
          return { k: 'while', cond, body, line: t.line };
        }
        case 'para': {
          this.next();
          const id = this.peek();
          if (id.type === 'kw' && this.isOp('<-', 1)) throw errors.reserved(id.line, id.raw);
          if (id.type !== 'id') throw errors.expected(id.line, 'el nombre de una variable');
          this.next();
          this.expectOp('<-');
          const from = this.expression();
          this.expectKw('hasta');
          const to = this.expression();
          let step: Expr | null = null;
          if (this.isKw('con')) {
            this.next();
            this.expectKw('paso');
            step = this.expression();
          }
          this.expectKw('hacer');
          this.fin();
          const body = this.instructions();
          this.closeBlock('para', t.line, 'finpara');
          this.fin();
          return { k: 'for', name: id.value, raw: id.raw, from, to, step, body, line: t.line };
        }
        default:
          if (this.isOp('<-', 1) || this.isOp('=', 1)) throw errors.reserved(t.line, t.raw);
          throw errors.expected(t.line, 'una instrucción');
      }
    }
    if (t.type === 'id') {
      if (this.isOp('<-', 1)) {
        this.next();
        this.next();
        const e = this.expression();
        this.fin(e);
        return { k: 'assign', name: t.value, raw: t.raw, e, line: t.line };
      }
      if (this.isOp('=', 1)) throw errors.assign(t.line);
      if (this.isOp('(', 1)) {
        this.next();
        const args = this.callArgs();
        this.fin();
        return { k: 'call', name: t.value, raw: t.raw, args, line: t.line };
      }
      throw errors.expected(this.peek(1).line, '«<-» para asignar o «(» para llamar una función');
    }
    throw errors.expected(t.line, 'una instrucción');
  }

  private callArgs(): Expr[] {
    this.expectOp('(');
    const args: Expr[] = [];
    if (!this.isOp(')')) {
      args.push(this.expression());
      while (this.isOp(',')) {
        this.next();
        args.push(this.expression());
      }
    }
    this.expectOp(')');
    return args;
  }

  expression(): Expr {
    return this.disjunction();
  }

  private disjunction(): Expr {
    let a = this.conjunction();
    while (this.isKw('o')) {
      const t = this.next();
      a = { k: 'bin', op: 'o', a, b: this.conjunction(), line: t.line };
    }
    return a;
  }

  private conjunction(): Expr {
    let a = this.negation();
    while (this.isKw('y')) {
      const t = this.next();
      a = { k: 'bin', op: 'y', a, b: this.negation(), line: t.line };
    }
    return a;
  }

  private negation(): Expr {
    if (this.isKw('no')) {
      const t = this.next();
      return { k: 'un', op: 'no', e: this.negation(), line: t.line };
    }
    return this.comparison();
  }

  private comparison(): Expr {
    const a = this.sum();
    const t = this.peek();
    if (t.type === 'op' && CMP.has(t.value)) {
      this.next();
      const b = this.sum();
      const n = this.peek();
      if (n.type === 'op' && CMP.has(n.value)) throw errors.chained(n.line);
      return { k: 'bin', op: t.value as BinOp, a, b, line: t.line };
    }
    return a;
  }

  private sum(): Expr {
    let a = this.product();
    while (this.isOp('+') || this.isOp('-')) {
      const t = this.next();
      a = { k: 'bin', op: t.value as BinOp, a, b: this.product(), line: t.line };
    }
    return a;
  }

  private product(): Expr {
    let a = this.unary();
    while (this.isOp('*') || this.isOp('/') || this.isKw('mod')) {
      const t = this.next();
      a = { k: 'bin', op: t.value as BinOp, a, b: this.unary(), line: t.line };
    }
    return a;
  }

  private unary(): Expr {
    if (this.isOp('-') || this.isOp('+')) {
      const t = this.next();
      return { k: 'un', op: t.value as '-' | '+', e: this.unary(), line: t.line };
    }
    return this.power();
  }

  private power(): Expr {
    const a = this.primary();
    if (this.isOp('^')) {
      const t = this.next();
      return { k: 'bin', op: '^', a, b: this.unary(), line: t.line };
    }
    return a;
  }

  private primary(): Expr {
    const t = this.peek();
    if (t.type === 'num') {
      this.next();
      return { k: 'num', v: t.num!, raw: t.raw, line: t.line };
    }
    if (t.type === 'str') {
      this.next();
      return { k: 'str', v: t.value, line: t.line };
    }
    if (t.type === 'kw' && (t.value === 'verdadero' || t.value === 'falso')) {
      this.next();
      return { k: 'bool', v: t.value === 'verdadero', line: t.line };
    }
    if (t.type === 'id') {
      this.next();
      if (this.isOp('(')) {
        const args = this.callArgs();
        return { k: 'call', name: t.value, raw: t.raw, args, line: t.line };
      }
      return { k: 'var', name: t.value, raw: t.raw, line: t.line };
    }
    if (t.type === 'op' && t.value === '(') {
      this.next();
      const e = this.expression();
      this.expectOp(')');
      return e;
    }
    throw errors.expected(t.line, 'un valor (número, variable o expresión)');
  }

  atEnd(): boolean {
    return this.peek().type === 'eof' || this.peek().type === 'nl';
  }

  peekToken(o = 0): Token {
    return this.peek(o);
  }

  advance(): Token {
    return this.next();
  }
}

export function checkSize(src: string): void {
  if (src.split('\n').length > MAX_LINES) throw errors.tooManyLines();
  if (src.length > MAX_CHARS) throw errors.tooManyChars();
}

/** Analiza un guion completo. Lanza ScriptError si hay errores de sintaxis. */
export function parseProgram(src: string): Program {
  checkSize(src);
  const p = new Parser(tokenize(src));
  return p.parseProgram();
}
