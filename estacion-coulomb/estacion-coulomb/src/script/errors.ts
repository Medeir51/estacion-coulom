/** Códigos de error de PseudoCoulomb (sección 10.10). Los textos viven en src/i18n/es.ts. */
import { es } from '../i18n/es';

export type ErrorCode =
  | 'E-LEX'
  | 'E-SINT'
  | 'E-CIERRE'
  | 'E-ESTR'
  | 'E-ASIG'
  | 'E-RESERV'
  | 'E-VAR'
  | 'E-CONST'
  | 'E-TIPO'
  | 'E-DIV0'
  | 'E-NUM'
  | 'E-PASO'
  | 'E-LIM'
  | 'E-FUNC'
  | 'E-ARGS'
  | 'E-DISP'
  | 'E-RANGO'
  | 'E-TAM';

export class ScriptError extends Error {
  readonly code: ErrorCode;
  readonly line: number;
  constructor(code: ErrorCode, line: number, message: string) {
    super(message);
    this.code = code;
    this.line = line;
    this.name = 'ScriptError';
  }
}

const E = es.script.errors;

export const errors = {
  lex: (line: number, c: string) => new ScriptError('E-LEX', line, E.lex(c)),
  unterminatedString: (line: number) => new ScriptError('E-LEX', line, E.unterminatedString),
  expected: (line: number, what: string) => new ScriptError('E-SINT', line, E.expected(what)),
  decimalComma: (line: number, a: string, b: string) => new ScriptError('E-SINT', line, E.decimalComma(a, b)),
  chained: (line: number) => new ScriptError('E-SINT', line, E.chained),
  close: (line: number, closer: string, opener: string, openLine: number) =>
    new ScriptError('E-CIERRE', line, E.close(closer, opener, openLine)),
  outside: (line: number) => new ScriptError('E-ESTR', line, E.outside),
  empty: (line: number) => new ScriptError('E-ESTR', line, E.empty),
  repeated: (line: number, block: string) => new ScriptError('E-ESTR', line, E.repeated(block)),
  assign: (line: number) => new ScriptError('E-ASIG', line, E.assign),
  reserved: (line: number, word: string) => new ScriptError('E-RESERV', line, E.reserved(word)),
  undefinedVar: (line: number, name: string) => new ScriptError('E-VAR', line, E.undefinedVar(name)),
  constant: (line: number, name: string) => new ScriptError('E-CONST', line, E.constant(name)),
  typeNumber: (line: number) => new ScriptError('E-TIPO', line, E.typeNumber),
  typeBool: (line: number) => new ScriptError('E-TIPO', line, E.typeBool),
  typeSame: (line: number) => new ScriptError('E-TIPO', line, E.typeSame),
  typeText: (line: number) => new ScriptError('E-TIPO', line, E.typeText),
  div0: (line: number) => new ScriptError('E-DIV0', line, E.div0),
  sqrtNeg: (line: number) => new ScriptError('E-NUM', line, E.sqrtNeg),
  logNonPos: (line: number) => new ScriptError('E-NUM', line, E.logNonPos),
  nan: (line: number) => new ScriptError('E-NUM', line, E.nan),
  step0: (line: number) => new ScriptError('E-PASO', line, E.step0),
  limit: (line: number) => new ScriptError('E-LIM', line, E.limit),
  noFunc: (line: number, f: string) => new ScriptError('E-FUNC', line, E.noFunc(f)),
  args: (line: number, f: string, n: number) => new ScriptError('E-ARGS', line, E.args(f, n)),
  noDevice: (line: number, d: string) => new ScriptError('E-DISP', line, E.noDevice(d)),
  range: (line: number, which: 'polarity' | 'voltage' | 'plate' | 'turns') =>
    new ScriptError('E-RANGO', line, E.range[which]),
  tooManyLines: () => new ScriptError('E-TAM', 1, E.tooManyLines),
  tooManyChars: () => new ScriptError('E-TAM', 1, E.tooManyChars),
};
