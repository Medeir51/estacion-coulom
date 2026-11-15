/** Árbol de sintaxis de PseudoCoulomb. */
export type BinOp = 'o' | 'y' | '=' | '<>' | '<' | '<=' | '>' | '>=' | '+' | '-' | '*' | '/' | 'mod' | '^';

export type Expr =
  | { k: 'num'; v: number; raw: string; line: number }
  | { k: 'str'; v: string; line: number }
  | { k: 'bool'; v: boolean; line: number }
  | { k: 'var'; name: string; raw: string; line: number }
  | { k: 'call'; name: string; raw: string; args: Expr[]; line: number }
  | { k: 'un'; op: '-' | '+' | 'no'; e: Expr; line: number }
  | { k: 'bin'; op: BinOp; a: Expr; b: Expr; line: number };

export type Stmt =
  | { k: 'assign'; name: string; raw: string; e: Expr; line: number }
  | { k: 'write'; args: Expr[]; line: number }
  | { k: 'if'; cond: Expr; then: Stmt[]; else: Stmt[] | null; line: number }
  | { k: 'while'; cond: Expr; body: Stmt[]; line: number }
  | {
      k: 'for';
      name: string;
      raw: string;
      from: Expr;
      to: Expr;
      step: Expr | null;
      body: Stmt[];
      line: number;
    }
  | { k: 'call'; name: string; raw: string; args: Expr[]; line: number };

export interface Program {
  inicio: Stmt[] | null;
  ciclo: Stmt[] | null;
}
