/** Éxito, fallo, causas, sugerencias y estrellas (secciones 11.2, 11.5 y 12 a 14). */
import { es } from '../i18n/es';
import type { AttemptRun } from './attempt';
import { formatFixed, formatNumber, formatPoint, formatQuantity } from './format';
import { peakEmf } from './generator';
import { totalTurns, generatorFrequency, type LevelConfig, type LevelDef } from './level';
import type { SimParticle } from './world';

export type AttemptResult = 'success' | 'failure' | 'scriptError' | 'aborted';

export interface ReportRow {
  label: string;
  value: string;
}

export interface IonRow {
  n: number;
  species: string;
  flight: string;
  polarity: string;
  dest: string;
  ok: boolean;
}

export interface Evaluation {
  result: AttemptResult;
  cause: string | null;
  message: string;
  suggestion: string;
  failurePoints: { x: number; y: number }[];
  metrics: Record<string, number>;
  details: ReportRow[];
  ionRows?: IonRow[];
  /** Lugar del fallo (m), para ubicar el informe en la esquina opuesta */
  focus: { x: number; y: number } | null;
  /** Índice de la opción de hipótesis que describe lo que pasó */
  outcomeIndex: number | null;
  /** Estado de cada condición de la misión */
  conditions: boolean[];
  /** Datos para el reto de tres estrellas */
  challenge: { method?: 'attract' | 'repel'; chargesUsed?: number; usedSetVoltage?: boolean; full?: boolean };
}

const C = es.causes;
const R = es.ui.report;

function suggestionFor(level: LevelDef, key: string | null, cause: string): string {
  const s = key ? es.levels[level.id].suggestions[key] : undefined;
  return s ?? C.general[cause] ?? '';
}

function failurePoints(ps: SimParticle[]): { x: number; y: number }[] {
  return ps
    .filter((p) => p.status === 'crashed' || p.status === 'lost' || p.status === 'hitCharge')
    .map((p) => ({ x: p.endX, y: p.endY }));
}

function wallName(p: SimParticle): string {
  const tag = p.wall?.tag ?? 'glass';
  return C.walls[tag] ?? C.walls.glass;
}

/** Causa genérica de una partícula que no llegó a su destino. */
function particleCause(p: SimParticle, level: LevelDef, sig: number): { cause: string; message: string } {
  const pt = formatPoint(p.endX, p.endY);
  if (p.status === 'crashed' && p.wall) {
    if (p.wall.kind === 'plate') {
      return {
        cause: 'F-PLACA',
        message: C.messages['F-PLACA']({ side: p.wall.side ?? 'superior', cap: p.wall.ownerId ?? 'C1' }),
      };
    }
    return { cause: 'F-PARED', message: C.messages['F-PARED']({ wall: wallName(p), pt }) };
  }
  if (p.status === 'hitCharge') {
    return { cause: 'F-CARGA', message: C.messages['F-CARGA']({ anchor: p.chargeId ?? '' }) };
  }
  if (p.status === 'lost') {
    return { cause: 'F-FUERA', message: C.messages['F-FUERA']({ side: C.sides[p.exitSide ?? 'derecha'], pt }) };
  }
  const tmax = level.kind === 'particles' ? level.particleTmax : 0;
  return { cause: 'F-TIEMPO', message: C.messages['F-TIEMPO']({ tmax: formatQuantity(tmax, 't', sig) }) };
}

function baseEval(): Evaluation {
  return {
    result: 'failure',
    cause: null,
    message: '',
    suggestion: '',
    failurePoints: [],
    metrics: {},
    details: [],
    focus: null,
    outcomeIndex: null,
    conditions: [],
    challenge: {},
  };
}

export function evaluateRun(level: LevelDef, cfg: LevelConfig, run: AttemptRun, sig = 4): Evaluation {
  const ev = baseEval();
  if (run.aborted) {
    ev.result = 'aborted';
    ev.message = C.aborted;
    return ev;
  }
  if (run.scriptError) {
    ev.result = 'scriptError';
    ev.cause = run.scriptError.code;
    ev.message = C.messages['F-GUION']({ line: run.scriptError.line, msg: run.scriptError.message });
    ev.suggestion = C.general['F-GUION'];
    ev.details.push({ label: R.time, value: formatQuantity(run.time(), 't', sig) });
    return ev;
  }
  if (level.kind === 'particles') return evaluateParticles(level, cfg, run, ev, sig);
  return evaluateGenerator(level, cfg, run, ev, sig);
}

function evaluateParticles(
  level: Extract<LevelDef, { kind: 'particles' }>,
  cfg: LevelConfig,
  run: AttemptRun,
  ev: Evaluation,
  sig: number,
): Evaluation {
  const sim = run.sim!;
  const ps = sim.particles;
  ev.failurePoints = failurePoints(ps);
  const id = level.id;

  if (id === '2-2') return evaluateSelector(level, cfg, run, ev, sig);
  if (id === '2-3') return evaluateIsotopes(level, run, ev, sig);

  const p = ps[0];
  const target = level.targets[p.kind.species];
  const ok = p.status === 'captured' && p.receiverId === target;
  const minMm = Number.isFinite(p.minClearance) ? p.minClearance * 1000 : 0;
  ev.metrics = { flightTimeNs: p.endT * 1e9, minClearanceMm: minMm };
  ev.details.push({ label: R.time, value: formatQuantity(p.endT, 't', sig) });
  if (level.id === '1-3') ev.details.push({ label: R.minClearance, value: `${formatFixed(minMm, 1)} mm` });
  ev.conditions = level.id === '1-3' ? [ok, ok] : [ok];
  const charges = run.input.setup.kind === 'particles' ? run.input.setup.scene.sources.charges : [];
  ev.challenge.chargesUsed = charges.length;
  if (charges.length > 0 && charges.every((c) => c.q > 0)) ev.challenge.method = 'attract';
  if (charges.length > 0 && charges.every((c) => c.q < 0)) ev.challenge.method = 'repel';

  ev.focus = { x: p.endX, y: p.endY };
  if (ok) {
    ev.result = 'success';
    ev.message = R.reached(p.receiverId!, formatPoint(p.endX, p.endY));
    ev.outcomeIndex = 0;
    return ev;
  }
  const { cause, message } = particleCause(p, level, sig);
  ev.cause = cause;
  ev.message = message;
  let key: string | null = null;

  if (id === '1-1') {
    if (p.status === 'lost') {
      ev.outcomeIndex = { arriba: 1, abajo: 2, derecha: 3 }[p.exitSide as 'arriba' | 'abajo' | 'derecha'] ?? null;
      if (p.exitSide === 'abajo') key = 'outBottom';
      if (p.exitSide === 'arriba' && charges.length >= 2) key = 'outTopTwo';
    }
  } else if (id === '1-2') {
    const plate = String(cfg.controls.positivePlate ?? 'superior');
    if (p.status === 'crashed' && p.wall?.kind === 'screen') {
      const rec = sim.scene.receivers[0];
      const below = p.endY < rec.y0;
      const dMm = (below ? rec.y0 - p.endY : p.endY - rec.y1) * 1000;
      ev.cause = 'F-PANTALLA';
      ev.message = C.messages['F-PANTALLA']({
        d: formatNumber(Math.round(dMm * 10) / 10, 3),
        dir: below ? C.below : C.above,
      });
      ev.outcomeIndex = below ? 2 : 1;
      if (plate === 'inferior' && p.endY < level.emitter.y) key = 'wrongPlate';
      else key = below ? 'screenBelow' : 'screenAbove';
      ev.details.push({ label: R.impact, value: `${formatPoint(p.endX, p.endY)} cm` });
    } else if (cause === 'F-PLACA') {
      ev.outcomeIndex = 3;
      key = plate === 'inferior' && p.wall?.side === 'inferior' ? 'wrongPlate' : 'plate';
    }
  } else if (id === '1-3') {
    if (cause === 'F-PARED') {
      const tag = p.wall?.tag;
      if (tag === 'exterior') {
        key = 'exterior';
        ev.outcomeIndex = 1;
      } else if (tag === 'interior') {
        key = 'interior';
        ev.outcomeIndex = 2;
      }
    } else if (cause === 'F-CARGA') ev.outcomeIndex = 3;
  } else if (id === '2-1') {
    if (p.status === 'lost') {
      ev.outcomeIndex = 3;
      if (p.exitSide === 'izquierda') key = 'outLeft';
    } else if (p.status === 'crashed') {
      if (p.endX > 0.41) {
        key = 'right';
        ev.outcomeIndex = 1;
      } else if (p.endX < 0.39) {
        key = 'left';
        ev.outcomeIndex = 2;
      }
    }
  }
  ev.suggestion = suggestionFor(level, key, ev.cause!);
  return ev;
}

function speedLabel(v: number): string {
  return `${formatFixed(v / 1e5, 1)} × 10⁵ m/s`;
}

function evaluateSelector(
  level: Extract<LevelDef, { kind: 'particles' }>,
  _cfg: LevelConfig,
  run: AttemptRun,
  ev: Evaluation,
  sig: number,
): Evaluation {
  const ps = run.sim!.particles;
  const target = 5e5;
  const arrived = ps.filter((p) => p.status === 'captured' && p.receiverId === 'R1');
  const goodArrived = arrived.some((p) => Math.abs(p.shot.speed - target) < 1);
  const wrong = arrived.filter((p) => Math.abs(p.shot.speed - target) >= 1);
  ev.metrics = { protonsArrived: arrived.length, correctArrived: goodArrived ? 1 : 0 };
  ev.challenge.usedSetVoltage = run.scriptActions.usedSetVoltage;
  ev.conditions = [goodArrived, wrong.length === 0];
  for (const p of [...ps].sort((a, b) => a.shot.speed - b.shot.speed)) {
    ev.details.push({
      label: speedLabel(p.shot.speed),
      value: p.status === 'captured' ? R.arrivedAt(p.receiverId!) : particleCause(p, level, sig).message,
    });
  }
  if (goodArrived && wrong.length === 0) {
    ev.result = 'success';
    ev.message = R.selectorOk;
    ev.outcomeIndex = 0;
    return ev;
  }
  ev.cause = 'F-PUREZA';
  ev.message = C.messages['F-PUREZA']({ list: wrong.length ? wrong.map((p) => speedLabel(p.shot.speed)).join(', ') : '—' });
  const crashedSides = ps.filter((p) => p.status === 'crashed' && p.wall?.kind === 'plate').map((p) => p.wall!.side);
  let key: string | null = null;
  if (wrong.some((p) => p.shot.speed < target)) key = 'slowPass';
  else if (crashedSides.length === ps.length && new Set(crashedSides).size === 1) key = 'sameSide';
  if (arrived.length > 1) ev.outcomeIndex = 1;
  else if (arrived.length === 0)
    ev.outcomeIndex = crashedSides.length === ps.length && crashedSides.every((s) => s === 'superior') ? 3 : 2;
  const firstFail = ps.find((p) => p.status !== 'captured');
  if (firstFail) ev.focus = { x: firstFail.endX, y: firstFail.endY };
  ev.suggestion = suggestionFor(level, key, 'F-PUREZA');
  return ev;
}

function evaluateIsotopes(
  level: Extract<LevelDef, { kind: 'particles' }>,
  run: AttemptRun,
  ev: Evaluation,
  sig: number,
): Evaluation {
  const ps = run.sim!.particles;
  let correct = 0;
  let wrongContainer = 0;
  let anyContainer = 0;
  const bySpecies: Record<string, { ok: number; total: number }> = {};
  ev.ionRows = ps.map((p, i) => {
    const target = level.targets[p.kind.species];
    const ok = p.status === 'captured' && p.receiverId === target;
    if (p.status === 'captured') anyContainer++;
    if (ok) correct++;
    else if (p.status === 'captured') wrongContainer++;
    const s = (bySpecies[p.kind.species] ??= { ok: 0, total: 0 });
    s.total++;
    if (ok) s.ok++;
    const d1 = p.crossings.find((c) => c.id === 'D1');
    const d2 = p.crossings.find((c) => c.id === 'D2');
    return {
      n: i + 1,
      species: p.kind.species === 'ne20' ? '²⁰Ne⁺' : '²²Ne⁺',
      flight: d1 && d2 ? formatQuantity(d2.t - d1.t, 't', sig) : '—',
      polarity: p.entryPolarity === null ? '—' : p.entryPolarity > 0 ? '+1 ⊙' : '−1 ⊗',
      dest: p.status === 'captured' ? p.receiverId! : particleCause(p, level, sig).message,
      ok,
    };
  });
  ev.metrics = { correctIons: correct };
  ev.challenge.full = correct === 10;
  ev.conditions = [correct >= 8];
  ev.details.push({ label: R.correctIons, value: `${correct} / 10` });
  ev.outcomeIndex = correct === 10 ? 0 : correct >= 8 ? 1 : correct === 5 ? 2 : correct === 0 ? 3 : null;
  if (correct >= 8) {
    ev.result = 'success';
    ev.message = R.isotopesOk(correct);
    return ev;
  }
  ev.cause = 'F-CLASIFICACION';
  ev.message = C.messages['F-CLASIFICACION']({ n: correct });
  let key: string | null = null;
  const sp = Object.values(bySpecies);
  if (anyContainer === 0) key = 'none';
  else if (wrongContainer > correct) key = 'swapped';
  else if (sp.some((s) => s.ok === s.total) && sp.some((s) => s.ok === 0)) key = 'oneType';
  const firstFail = ps.find((p) => p.status !== 'captured');
  if (firstFail) ev.focus = { x: firstFail.endX, y: firstFail.endY };
  ev.suggestion = suggestionFor(level, key, 'F-CLASIFICACION');
  return ev;
}

function evaluateGenerator(
  level: Extract<LevelDef, { kind: 'generator' }>,
  cfg: LevelConfig,
  run: AttemptRun,
  ev: Evaluation,
  sig: number,
): Evaluation {
  const gen = run.gen!;
  const N = totalTurns(level, cfg);
  const f = generatorFrequency(level, cfg);
  const cycles = gen.cycles;
  const rmsVals = cycles.map((c) => c.rms);
  const meanRms = rmsVals.length ? rmsVals.reduce((a, b) => a + b, 0) / rmsVals.length : 0;
  ev.details.push({ label: R.turns, value: String(N) });
  ev.details.push({ label: R.frequency, value: `${formatNumber(f, sig)} Hz` });
  let key: string | null = null;
  if (level.id === '3-1') {
    const e0 = peakEmf(N, level.B0, level.area, f);
    ev.metrics = { e0, turns: N };
    ev.details.push({ label: R.peak, value: `${formatNumber(e0, sig)} V` });
    const ok = e0 >= 145 && e0 <= 160;
    ev.conditions = [ok];
    if (ok) {
      ev.result = 'success';
      ev.message = R.lampOk(formatNumber(e0, sig));
      ev.outcomeIndex = 0;
      return ev;
    }
    ev.cause = e0 < 145 ? 'F-LAMPARA-BAJA' : 'F-LAMPARA-ALTA';
    ev.message = C.messages[ev.cause as 'F-LAMPARA-BAJA']({ e0: formatNumber(e0, sig) });
    ev.outcomeIndex = e0 < 145 ? 1 : 2;
  } else if (level.id === '3-2') {
    ev.metrics = { vrms: meanRms, freq: f, turns: N };
    ev.details.push({ label: R.rms, value: `${formatNumber(meanRms, sig)} V` });
    const freqOk = Math.abs(f - 60) < 1e-9;
    const vOk = meanRms >= 114 && meanRms <= 126;
    ev.conditions = [freqOk, vOk];
    if (freqOk && vOk) {
      ev.result = 'success';
      ev.message = R.serversOk(formatNumber(meanRms, sig));
      ev.outcomeIndex = 0;
      return ev;
    }
    if (!freqOk) {
      ev.cause = 'F-FRECUENCIA';
      ev.message = C.messages['F-FRECUENCIA']({ f: formatNumber(f, sig) });
      ev.outcomeIndex = 1;
    } else {
      ev.cause = 'F-VOLTAJE';
      ev.message = C.messages['F-VOLTAJE']({ V: formatNumber(meanRms, sig) });
      ev.outcomeIndex = meanRms < 114 ? 2 : 3;
      if (Math.abs(meanRms - 120 / Math.SQRT2) < 4) key = 'peakAsRms';
    }
  } else {
    const inRange = rmsVals.filter((v) => v >= 114 && v <= 126).length;
    const total = Math.round(level.duration * f);
    const pct = (100 * inRange) / total;
    const minV = rmsVals.length ? Math.min(...rmsVals) : 0;
    const maxV = rmsVals.length ? Math.max(...rmsVals) : 0;
    ev.metrics = { inRangePct: pct, inRange, cycles: rmsVals.length, minV, maxV, turns: N };
    ev.details.push({ label: R.cyclesInRange, value: `${inRange} / ${total} (${formatFixed(pct, 1)} %)` });
    ev.details.push({ label: R.minMax, value: `${formatNumber(minV, sig)} V · ${formatNumber(maxV, sig)} V` });
    ev.challenge.full = inRange === total;
    if (gen.tripped) {
      ev.conditions = [false, false];
      ev.cause = 'F-SOBRECARGA';
      ev.message = C.messages['F-SOBRECARGA']({
        k: gen.tripped.cycle,
        t: formatFixed(gen.tripped.t, 2),
        V: formatFixed(gen.tripped.V, 1),
      });
      ev.metrics.overloadCycle = gen.tripped.cycle;
      ev.metrics.overloadV = gen.tripped.V;
      ev.outcomeIndex = 1;
      key = 'overload';
    } else {
      ev.conditions = [true, pct >= 95];
      if (pct >= 95) {
        ev.result = 'success';
        ev.message = R.gridOk(formatFixed(pct, 1));
        ev.outcomeIndex = 0;
        return ev;
      }
      ev.cause = 'F-CALIDAD';
      ev.message = C.messages['F-CALIDAD']({ pct: formatFixed(pct, 1) });
      ev.outcomeIndex = 2;
      if (meanRms > 70 && meanRms < 100) key = 'peakAsRms';
      else if (minV < 114 && N < 118) key = 'fewTurns';
    }
  }
  ev.suggestion = suggestionFor(level, key, ev.cause!);
  return ev;
}

/** ¿Se cumplió el reto de tres estrellas? */
export function challengeMet(
  level: LevelDef,
  ev: Evaluation,
  ctx: { attemptNumber: number; priorMethods: string[] },
): boolean {
  switch (level.id) {
    case '1-1': {
      const methods = new Set(ctx.priorMethods);
      if (ev.challenge.method) methods.add(ev.challenge.method);
      return methods.has('attract') && methods.has('repel');
    }
    case '1-2':
    case '2-1':
    case '3-2':
      return ctx.attemptNumber <= 2;
    case '1-3':
      return (ev.challenge.chargesUsed ?? 99) <= 2;
    case '2-2':
      return !!ev.challenge.usedSetVoltage;
    case '2-3':
    case '3-3':
      return !!ev.challenge.full;
    case '3-1':
      return ctx.attemptNumber <= 1;
  }
}

/** Estrellas de un intento exitoso (sección 11.5). */
export function computeStars(success: boolean, hintsOpened: number, challenge: boolean): 0 | 1 | 2 | 3 {
  if (!success) return 0;
  if (hintsOpened === 0 && challenge) return 3;
  if (hintsOpened < 3) return 2;
  return 1;
}
