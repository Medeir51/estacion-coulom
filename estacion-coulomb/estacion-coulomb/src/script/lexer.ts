/** Analizador léxico de PseudoCoulomb (sección 10.2). */
import { errors } from './errors';

export type TokType = 'num' | 'str' | 'id' | 'kw' | 'op' | 'nl' | 'eof';

export interface Token {
  type: TokType;
  /** Valor normalizado: palabra clave o identificador en minúsculas y sin tildes; operador canónico. */
  value: string;
  /** Texto tal como se escribió */
  raw: string;
  num?: number;
  line: number;
  col: number;
}

export const KEYWORDS = new Set([
  'inicio',
  'fininicio',
  'ciclo',
  'finciclo',
  'si',
  'entonces',
  'sino',
  'finsi',
  'mientras',
  'hacer',
  'finmientras',
  'para',
  'hasta',
  'con',
  'paso',
  'finpara',
  'escribir',
  'y',
  'o',
  'no',
  'mod',
  'verdadero',
  'falso',
]);

const ACCENTS: Record<string, string> = { á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u' };

/** Mayúsculas y tildes no importan (se conserva la ñ). */
export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .split('')
    .map((c) => ACCENTS[c] ?? c)
    .join('');
}

const isLetter = (c: string) => /[a-zA-Z_áéíóúüñÁÉÍÓÚÜÑ]/.test(c);
const isDigit = (c: string) => c >= '0' && c <= '9';

export function tokenize(src: string): Token[] {
  const toks: Token[] = [];
  let i = 0;
  let line = 1;
  let col = 1;
  const push = (type: TokType, value: string, raw: string, extra: Partial<Token> = {}) =>
    toks.push({ type, value, raw, line, col, ...extra });
  while (i < src.length) {
    const c = src[i];
    if (c === '\r') {
      i++;
      continue;
    }
    if (c === '\n') {
      push('nl', '\n', '\n');
      i++;
      line++;
      col = 1;
      continue;
    }
    if (c === ' ' || c === '\t' || c === ' ') {
      i++;
      col++;
      continue;
    }
    if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }
    const start = i;
    const startCol = col;
    if (isDigit(c)) {
      while (isDigit(src[i] ?? '')) i++;
      if (src[i] === '.' && isDigit(src[i + 1] ?? '')) {
        i++;
        while (isDigit(src[i] ?? '')) i++;
      }
      if ((src[i] === 'e' || src[i] === 'E') && (isDigit(src[i + 1] ?? '') || (/[+-]/.test(src[i + 1] ?? '') && isDigit(src[i + 2] ?? '')))) {
        i += 2;
        while (isDigit(src[i] ?? '')) i++;
      }
      const raw = src.slice(start, i);
      toks.push({ type: 'num', value: raw, raw, num: Number(raw), line, col: startCol });
      col += i - start;
      continue;
    }
    if (isLetter(c)) {
      while (i < src.length && (isLetter(src[i]) || isDigit(src[i]))) i++;
      const raw = src.slice(start, i);
      const norm = normalizeName(raw);
      toks.push({ type: KEYWORDS.has(norm) ? 'kw' : 'id', value: norm, raw, line, col: startCol });
      col += i - start;
      continue;
    }
    if (c === '"' || c === "'") {
      i++;
      while (i < src.length && src[i] !== c && src[i] !== '\n') i++;
      if (src[i] !== c) throw errors.unterminatedString(line);
      const raw = src.slice(start, i + 1);
      i++;
      toks.push({ type: 'str', value: raw.slice(1, -1), raw, line, col: startCol });
      col += i - start;
      continue;
    }
    const two = src.slice(i, i + 2);
    const ops2: Record<string, string> = { '<-': '<-', '<=': '<=', '>=': '>=', '<>': '<>', '==': '=', '!=': '<>', '&&': 'y', '||': 'o' };
    if (ops2[two]) {
      const v = ops2[two];
      toks.push({ type: v === 'y' || v === 'o' ? 'kw' : 'op', value: v, raw: two, line, col: startCol });
      i += 2;
      col += 2;
      continue;
    }
    const ops1: Record<string, string> = {
      '←': '<-',
      '+': '+',
      '-': '-',
      '*': '*',
      '/': '/',
      '^': '^',
      '%': 'mod',
      '=': '=',
      '<': '<',
      '>': '>',
      '(': '(',
      ')': ')',
      ',': ',',
      ';': ';',
      '!': 'no',
    };
    if (ops1[c]) {
      const v = ops1[c];
      toks.push({ type: v === 'mod' || v === 'no' ? 'kw' : 'op', value: v, raw: c, line, col: startCol });
      i++;
      col++;
      continue;
    }
    throw errors.lex(line, c);
  }
  toks.push({ type: 'eof', value: '', raw: '', line, col });
  return toks;
}
