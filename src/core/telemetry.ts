/** Telemetría: modelo de datos, métricas, mapas de calor, CSV y análisis de un curso (sección 16). */
import { LEVEL_IDS, type LevelId } from './level';

export interface AttemptRecord {
  id: string;
  levelId: LevelId;
  attemptNumber: number;
  startedAt: string;
  thinkingSeconds: number;
  result: 'success' | 'failure' | 'scriptError' | 'aborted';
  cause: string | null;
  failurePoints: { x: number; y: number }[];
  stars: 0 | 1 | 2 | 3;
  hintsOpened: number;
  hypothesis: { option: string | null; text: string | null } | null;
  hypothesisMatched: boolean | null;
  config: Record<string, unknown>;
  script: { lines: number; chars: number; hash: string; source?: string } | null;
  metrics: Record<string, number>;
  seed: number;
  constantsMode: 'codata' | 'aula';
  teacherMode: boolean;
}

export interface SessionRecord {
  start: string;
  end: string;
  activeSeconds: number;
}

export interface TelemetryFile {
  app: 'estacion-coulomb';
  schemaVersion: 1;
  exportedAt: string;
  profile: { nickname: string | null; courseCode: string | null };
  attempts: AttemptRecord[];
  sessions: SessionRecord[];
}

/** FNV-1a de 32 bits en hexadecimal. */
export function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Guion sin comentarios ni espacios al final de las líneas. */
export function normalizeScript(src: string): string {
  return src
    .split('\n')
    .map((line) => {
      let quote: string | null = null;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (quote) {
          if (c === quote) quote = null;
        } else if (c === '"' || c === "'") {
          quote = c;
        } else if (c === '/' && line[i + 1] === '/') {
          return line.slice(0, i).trimEnd();
        }
      }
      return line.trimEnd();
    })
    .join('\n')
    .replace(/\r/g, '');
}

export function scriptHash(src: string): string {
  return fnv1a(normalizeScript(src));
}

const COUNTED = new Set(['success', 'failure', 'scriptError']);

export interface LevelMetrics {
  attempts: number;
  attemptsToPass: number | null;
  activeMinutes: number;
  hints: number;
  scriptErrors: number;
  topCause: string | null;
  hypothesisPct: number | null;
  idp: number | null;
  solved: boolean;
}

export function idp(solved: boolean, attempts: number, attemptsToPass: number | null, hints: number): number {
  return solved ? (attemptsToPass ?? 0) * (1 + hints / 3) : (attempts + 1) * (1 + hints / 3);
}

export function levelMetrics(all: AttemptRecord[], levelId: LevelId): LevelMetrics {
  const list = all.filter((a) => a.levelId === levelId && COUNTED.has(a.result));
  const firstOk = list.findIndex((a) => a.result === 'success');
  const solved = firstOk >= 0;
  const upTo = solved ? list.slice(0, firstOk + 1) : list;
  const hints = solved ? list[firstOk].hintsOpened : list.reduce((m, a) => Math.max(m, a.hintsOpened), 0);
  const causes: Record<string, number> = {};
  for (const a of list) if (a.cause && a.result !== 'success') causes[a.cause] = (causes[a.cause] ?? 0) + 1;
  let topCause: string | null = null;
  for (const [c, n] of Object.entries(causes)) if (!topCause || n > causes[topCause]) topCause = c;
  const withHyp = list.filter((a) => a.hypothesisMatched !== null);
  return {
    attempts: list.length,
    attemptsToPass: solved ? firstOk + 1 : null,
    activeMinutes: upTo.reduce((s, a) => s + a.thinkingSeconds, 0) / 60,
    hints,
    scriptErrors: list.filter((a) => a.result === 'scriptError').length,
    topCause,
    hypothesisPct: withHyp.length ? (100 * withHyp.filter((a) => a.hypothesisMatched).length) / withHyp.length : null,
    idp: list.length ? idp(solved, list.length, solved ? firstOk + 1 : null, hints) : null,
    solved,
  };
}

export function allLevelMetrics(attempts: AttemptRecord[]): Record<LevelId, LevelMetrics> {
  const out = {} as Record<LevelId, LevelMetrics>;
  for (const id of LEVEL_IDS) out[id] = levelMetrics(attempts, id);
  return out;
}

/** Nivel jugado con el IDP más alto (en empate, el de número menor). */
export function bottleneck(idps: Partial<Record<LevelId, number | null>>): LevelId | null {
  let best: LevelId | null = null;
  for (const id of LEVEL_IDS) {
    const v = idps[id];
    if (v === null || v === undefined) continue;
    if (best === null || v > (idps[best] as number)) best = id;
  }
  return best;
}

export const HEAT_COLS = 64;
export const HEAT_ROWS = 40;
const K1 = [1, 4, 6, 4, 1];

/** Rejilla 64 × 40 de densidad suavizada y normalizada al máximo (fila 0 abajo). */
export function heatmap(points: { x: number; y: number }[], world: { w: number; h: number }): Float64Array {
  const counts = new Float64Array(HEAT_COLS * HEAT_ROWS);
  for (const p of points) {
    const c = Math.min(HEAT_COLS - 1, Math.max(0, Math.floor((p.x / world.w) * HEAT_COLS)));
    const r = Math.min(HEAT_ROWS - 1, Math.max(0, Math.floor((p.y / world.h) * HEAT_ROWS)));
    counts[r * HEAT_COLS + c]++;
  }
  const out = new Float64Array(HEAT_COLS * HEAT_ROWS);
  let max = 0;
  for (let r = 0; r < HEAT_ROWS; r++) {
    for (let c = 0; c < HEAT_COLS; c++) {
      let s = 0;
      for (let i = -2; i <= 2; i++) {
        const rr = r + i;
        if (rr < 0 || rr >= HEAT_ROWS) continue;
        for (let j = -2; j <= 2; j++) {
          const cc = c + j;
          if (cc < 0 || cc >= HEAT_COLS) continue;
          s += K1[i + 2] * K1[j + 2] * counts[rr * HEAT_COLS + cc];
        }
      }
      s /= 256;
      out[r * HEAT_COLS + c] = s;
      if (s > max) max = s;
    }
  }
  if (max > 0) for (let i = 0; i < out.length; i++) out[i] /= max;
  return out;
}

const CIVIDIS: [number, number, number][] = [
  [0, 34, 78],
  [18, 53, 112],
  [59, 73, 108],
  [87, 92, 109],
  [112, 113, 115],
  [138, 134, 120],
  [165, 156, 116],
  [195, 179, 105],
  [225, 204, 85],
  [253, 231, 55],
];

/** Escala cividis (apta para daltonismo), t entre 0 y 1. */
export function cividis(t: number): string {
  const x = Math.min(1, Math.max(0, t)) * (CIVIDIS.length - 1);
  const i = Math.min(CIVIDIS.length - 2, Math.floor(x));
  const f = x - i;
  const [r, g, b] = CIVIDIS[i].map((v, k) => Math.round(v + f * (CIVIDIS[i + 1][k] - v)));
  return `rgb(${r}, ${g}, ${b})`;
}

export const CSV_COLUMNS = [
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
];

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(file: TelemetryFile): string {
  const rows = [CSV_COLUMNS.join(',')];
  for (const a of file.attempts) {
    const pts = a.failurePoints.map((p) => `${(p.x * 100).toFixed(2)};${(p.y * 100).toFixed(2)}`).join('|');
    const hyp = a.hypothesis ? [a.hypothesis.option, a.hypothesis.text].filter(Boolean).join(' — ') : '';
    rows.push(
      [
        file.profile.nickname,
        file.profile.courseCode,
        a.levelId,
        a.attemptNumber,
        a.startedAt,
        Math.round(a.thinkingSeconds),
        a.result,
        a.cause,
        pts,
        a.stars,
        a.hintsOpened,
        hyp,
        a.hypothesisMatched === null ? '' : a.hypothesisMatched ? 'si' : 'no',
        a.seed,
        a.constantsMode,
        a.teacherMode ? 'si' : 'no',
        a.script?.lines ?? '',
        a.script?.hash ?? '',
      ]
        .map(csvCell)
        .join(','),
    );
  }
  return '﻿' + rows.join('\r\n') + '\r\n';
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function isTelemetryFile(o: unknown): o is TelemetryFile {
  if (!o || typeof o !== 'object') return false;
  const f = o as Partial<TelemetryFile>;
  return (
    f.app === 'estacion-coulomb' &&
    f.schemaVersion === 1 &&
    Array.isArray(f.attempts) &&
    typeof f.profile === 'object' &&
    f.profile !== null
  );
}

export interface CourseImport {
  files: { name: string; data: TelemetryFile }[];
  invalid: string[];
  duplicates: string[];
}

/** Valida y agrega archivos de varios estudiantes; ignora los repetidos (mismo apodo, código y fecha). */
export function importCourse(inputs: { name: string; text: string }[], existing: CourseImport | null = null): CourseImport {
  const out: CourseImport = existing
    ? { files: [...existing.files], invalid: [], duplicates: [] }
    : { files: [], invalid: [], duplicates: [] };
  for (const inp of inputs) {
    let data: unknown;
    try {
      data = JSON.parse(inp.text);
    } catch {
      out.invalid.push(inp.name);
      continue;
    }
    if (!isTelemetryFile(data)) {
      out.invalid.push(inp.name);
      continue;
    }
    const key = (f: TelemetryFile) => `${f.profile.nickname ?? ''}|${f.profile.courseCode ?? ''}|${f.exportedAt}`;
    if (out.files.some((f) => key(f.data) === key(data as TelemetryFile))) {
      out.duplicates.push(inp.name);
      continue;
    }
    out.files.push({ name: inp.name, data });
  }
  return out;
}

export interface LevelCourseSummary {
  levelId: LevelId;
  pctPassed: number | null;
  medianAttempts: number | null;
  medianMinutes: number | null;
  pctHint3: number | null;
  avgIdp: number | null;
  topCause: string | null;
}

export function courseSummary(files: TelemetryFile[]): LevelCourseSummary[] {
  return LEVEL_IDS.map((id) => {
    const ms = files.map((f) => levelMetrics(f.attempts, id)).filter((m) => m.attempts > 0);
    const causes: Record<string, number> = {};
    for (const f of files)
      for (const a of f.attempts)
        if (a.levelId === id && a.cause && a.result !== 'success') causes[a.cause] = (causes[a.cause] ?? 0) + 1;
    let topCause: string | null = null;
    for (const [c, n] of Object.entries(causes)) if (!topCause || n > causes[topCause]) topCause = c;
    const hint3 = files.filter((f) => f.attempts.some((a) => a.levelId === id && a.hintsOpened >= 3)).length;
    return {
      levelId: id,
      pctPassed: ms.length ? (100 * ms.filter((m) => m.solved).length) / ms.length : null,
      medianAttempts: median(ms.filter((m) => m.solved).map((m) => m.attemptsToPass!)),
      medianMinutes: median(ms.map((m) => m.activeMinutes)),
      pctHint3: ms.length ? (100 * hint3) / ms.length : null,
      avgIdp: ms.length ? ms.reduce((s, m) => s + (m.idp ?? 0), 0) / ms.length : null,
      topCause,
    };
  });
}

export function emptyTelemetryFile(): TelemetryFile {
  return {
    app: 'estacion-coulomb',
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    profile: { nickname: null, courseCode: null },
    attempts: [],
    sessions: [],
  };
}
