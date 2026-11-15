/** Pantalla de nivel (sección 7.4): HUD, simulación animada, intentos, informe y progreso. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AttemptRun, checkScript, isBlankScript, setupForLevel, type OutputLine } from '../../core/attempt';
import { getConstants } from '../../core/constants';
import { challengeMet, computeStars, evaluateRun, type Evaluation } from '../../core/evaluation';
import { traceFieldLines, type FieldLine } from '../../core/fieldlines';
import { FieldSystem } from '../../core/fields';
import { formatCm, formatFixed, formatQuantity } from '../../core/format';
import {
  defaultConfig,
  generatorFrequency,
  totalTurns,
  usedCounts,
  type LevelConfig,
  type LevelId,
  type ParticleLevel,
} from '../../core/level';
import { newSeed } from '../../core/rng';
import { scriptHash, type AttemptRecord } from '../../core/telemetry';
import { getLevel, nextLevelId } from '../../data/levels';
import { es } from '../../i18n/es';
import { navigate } from '../../router';
import { sfx, startHum, stopHum, unlockAudio } from '../../audio/sfx';
import { useStore, totalStars, type GhostPath } from '../../store';
import { uuid } from '../../store/persist';
import { decimate, chargeRadiusPx, type Spark } from '../../render/scene';
import { Button } from '../components/base';
import { Console } from '../hud/Console';
import {
  BriefingDialog,
  CreditsDialog,
  HypothesisDialog,
  ReferenceDialog,
  ReportPanel,
  ShortcutsDialog,
  SuccessDialog,
} from '../hud/Dialogs';
import { GeneratorStage, type GenHandle } from '../hud/GeneratorStage';
import { ParticleCanvas, type CanvasHandle } from '../hud/ParticleCanvas';
import { Controls, ControlBar, FieldViewer, Inventory, ItemIcon, Mission, Multimeter, SPEEDS, itemLabel, type LogEntry, type Target } from '../hud/Panels';
import { pick, readProbe, regionAt, type Reading } from '../hud/readings';

type Status = 'idle' | 'running' | 'paused' | 'finished';

interface ReportState {
  ev: Evaluation;
  attempt: number;
  hyp: { option: string | null; text: string | null } | null;
  matched: boolean | null;
  corner: 'tl' | 'tr' | 'bl' | 'br';
}

interface DragState {
  itemId: string;
  from: string | null;
  x: number;
  y: number;
  hot: string | null;
  bounce?: { x: number; y: number };
}

const isTyping = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  if (!el) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
};

export default function LevelScreen({ id }: { id: LevelId }) {
  const level = getLevel(id);
  const L = es.ui.level;
  const settings = useStore((s) => s.settings);
  const c = getConstants(settings.constants);
  const sig = settings.sigFigs;
  const store = useStore;
  const progress = useStore((s) => s.progress);
  const lp = progress.levels[id];
  const hintsUsed = lp?.hintsUsed ?? 0;

  // ---------- Configuración (borrador) ----------
  const [cfg, setCfg] = useState<LevelConfig>(() => {
    const d = store.getState().drafts[id];
    const base = defaultConfig(level);
    if (d && typeof d === 'object') {
      return {
        placements: { ...(d.placements ?? {}) },
        controls: { ...base.controls, ...(d.controls ?? {}) },
        script: typeof d.script === 'string' ? d.script : '',
      };
    }
    return base;
  });
  const cfgRef = useRef(cfg);
  cfgRef.current = cfg;
  const hadDraft = useRef(!!store.getState().drafts[id]);
  useEffect(() => {
    if (hadDraft.current) store.getState().toast(L.restored);
    hadDraft.current = false;
    const save = () => store.getState().setDraft(id, cfgRef.current);
    return save;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  useEffect(() => {
    const t = setTimeout(() => store.getState().setDraft(id, cfg), 2000);
    return () => clearTimeout(t);
  }, [cfg, id, store]);

  // ---------- Estado de la simulación ----------
  const runRef = useRef<AttemptRun | null>(null);
  const [status, setStatusState] = useState<Status>('idle');
  const statusRef = useRef<Status>('idle');
  const setStatus = (s: Status) => {
    statusRef.current = s;
    setStatusState(s);
  };
  const [speed, setSpeedState] = useState(settings.initialSpeed);
  const speedRef = useRef(speed);
  const setSpeed = (s: number) => {
    speedRef.current = s;
    setSpeedState(s);
  };
  const targetRef = useRef(0);
  const [simTime, setSimTime] = useState(0);
  const [seed, setSeed] = useState<number | null>(null);
  const lastSeed = useRef<number | null>(null);
  const [report, setReport] = useState<ReportState | null>(null);
  const [success, setSuccess] = useState<{
    stars: number;
    challenge: boolean;
    attempts: number;
    extra: string | null;
    minutes: number;
  } | null>(null);
  const [credits, setCredits] = useState(false);
  const pendingCredits = useRef(false);
  const [hypOpen, setHypOpen] = useState<null | 'animated' | 'instant' | 'repeat'>(null);
  const [briefing, setBriefing] = useState(() => !store.getState().progress.briefed.includes(id));
  const [shortcuts, setShortcuts] = useState(false);
  const [refOpen, setRefOpen] = useState(false);
  const [ghosts, setGhosts] = useState<GhostPath[]>([]);
  const [highlightGhost, setHighlightGhost] = useState<number | null>(null);
  const [viewer, setViewer] = useState({ on: false, lines: true, vectors: false, b: true, hideGhosts: false });
  const [fieldLines, setFieldLines] = useState<FieldLine[]>([]);
  const [output, setOutput] = useState<OutputLine[]>([]);
  const [errorLine, setErrorLine] = useState<number | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [conditions, setConditions] = useState<boolean[] | null>(null);
  const [announce, setAnnounce] = useState('');
  const [reading, setReading] = useState<Reading | null>(null);
  const [pins, setPins] = useState<{ x: number; y: number; label: string }[]>([]);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const [rulerOn, setRulerOn] = useState(false);
  const [ruler, setRuler] = useState<{ a: { x: number; y: number }; b: { x: number; y: number } } | null>(null);
  const [placing, setPlacing] = useState<string | null>(null);
  const [focusTarget, setFocusTarget] = useState<string | null>(null);
  const [drag, setDragState] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const setDrag = (d: DragState | null) => {
    dragRef.current = d;
    setDragState(d);
  };
  const [drawers, setDrawers] = useState({ left: false, right: false });
  const [serversLit, setServersLit] = useState(0);
  const [loadOn, setLoadOnState] = useState(false);
  const loadOnRef = useRef(false);
  const setLoadOn = (v: boolean) => {
    loadOnRef.current = v;
    setLoadOnState(v);
  };
  const flashes = useRef<Record<string, number>>({});
  const sparks = useRef<Spark[]>([]);
  const evIdx = useRef(0);
  const pointerWorld = useRef<{ x: number; y: number } | null>(null);
  const downInfo = useRef<{ x: number; y: number; t: number; moved: boolean } | null>(null);
  const attemptCtx = useRef<{
    cfg: LevelConfig;
    seed: number;
    hyp: { option: string | null; text: string | null; index: number | null } | null;
    replay: boolean;
    startedAt: string;
  } | null>(null);
  const replayReport = useRef<ReportState | null>(null);
  const canvasRef = useRef<CanvasHandle>(null);
  const genRef = useRef<GenHandle>(null);
  const locked = status === 'running' || status === 'paused';

  // ---------- Escena de vista previa ----------
  const preview = useMemo(() => {
    if (level.kind !== 'particles') return null;
    const scene = level.buildScene(cfg, c, 1);
    return { scene, field: new FieldSystem(scene.sources, c.k) };
  }, [level, cfg, c]);

  const density = useRef(1);
  useEffect(() => {
    if (!preview || !viewer.on || !viewer.lines) return;
    const t = setTimeout(() => {
      const t0 = performance.now();
      setFieldLines(traceFieldLines(preview.field, (level as ParticleLevel).world, { densityFactor: density.current }));
      const ms = performance.now() - t0;
      if (ms > 30 && density.current > 0.4) {
        density.current *= 0.7;
        console.debug(`Visor de campo: ${ms.toFixed(1)} ms; se reducen las líneas por carga.`);
      }
    }, 50);
    return () => clearTimeout(t);
  }, [preview, viewer.on, viewer.lines, level]);

  // ---------- Destinos (anclajes o ranuras) ----------
  const targets: Target[] = useMemo(() => {
    if (level.kind === 'particles') {
      return level.anchors.map((a) => ({
        id: a.id,
        label: es.ui.inventory.anchorAria(a.id, formatCm(a.x), formatCm(a.y), !cfg.placements[a.id]),
        free: !cfg.placements[a.id],
      }));
    }
    return Array.from({ length: level.slots }, (_, i) => {
      const sid = `S${i + 1}`;
      return { id: sid, label: es.ui.inventory.slotAria(sid, !cfg.placements[sid]), free: !cfg.placements[sid] };
    });
  }, [level, cfg.placements]);

  const place = useCallback(
    (itemId: string, target: string, from: string | null) => {
      setCfg((prev) => {
        const placements = { ...prev.placements };
        if (from) delete placements[from];
        if (placements[target]) return prev;
        const it = level.inventory.find((x) => x.id === itemId);
        const used = usedCounts({ ...prev, placements });
        if (!it || (used[itemId] ?? 0) >= it.count) return prev;
        placements[target] = itemId;
        return { ...prev, placements };
      });
      sfx.click();
    },
    [level],
  );
  const removeAt = useCallback((where: string) => {
    setCfg((prev) => {
      const placements = { ...prev.placements };
      delete placements[where];
      return { ...prev, placements };
    });
  }, []);

  // ---------- Arrastrar y soltar ----------
  const hotFor = useCallback(
    (cx: number, cy: number, from: string | null): string | null => {
      if (level.kind === 'particles') {
        const w = canvasRef.current?.clientToWorld(cx, cy);
        if (!w || !w.inside) return null;
        let best: string | null = null;
        let bd = 0.02;
        for (const a of level.anchors) {
          if (cfgRef.current.placements[a.id] && a.id !== from) continue;
          const d = Math.hypot(a.x - w.x, a.y - w.y);
          if (d < bd) {
            bd = d;
            best = a.id;
          }
        }
        return best;
      }
      const el = document.elementFromPoint(cx, cy)?.closest('[data-slot]') as HTMLElement | null;
      const sid = el?.dataset.slot ?? null;
      if (sid && (!cfgRef.current.placements[sid] || sid === from)) return sid;
      return null;
    },
    [level],
  );

  const beginDrag = useCallback(
    (itemId: string, from: string | null, cx: number, cy: number, origin?: { x: number; y: number }) => {
      const st: DragState = { itemId, from, x: cx, y: cy, hot: hotFor(cx, cy, from), bounce: origin };
      setDrag(st);
      const move = (e: PointerEvent) => {
        const d = dragRef.current;
        if (!d) return;
        setDrag({ ...d, x: e.clientX, y: e.clientY, hot: hotFor(e.clientX, e.clientY, d.from) });
      };
      const up = (e: PointerEvent) => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        const d = dragRef.current;
        if (!d) return;
        const hot = hotFor(e.clientX, e.clientY, d.from);
        if (hot) {
          place(d.itemId, hot, d.from);
          setDrag(null);
          return;
        }
        if (d.from) {
          const w = canvasRef.current?.clientToWorld(e.clientX, e.clientY);
          if (!w || !w.inside) {
            removeAt(d.from);
            setDrag(null);
            return;
          }
        }
        // Rebote hacia el inventario
        setDrag({ ...d, x: d.bounce?.x ?? d.x, y: d.bounce?.y ?? d.y, hot: null, bounce: { x: -1, y: -1 } });
        dragRef.current = null;
        setTimeout(() => setDragState(null), 260);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    },
    [hotFor, place, removeAt],
  );

  // ---------- Intentos ----------
  const processEvents = (run: AttemptRun) => {
    const sim = run.sim;
    if (!sim) return;
    const now = performance.now();
    for (; evIdx.current < sim.events.length; evIdx.current++) {
      const e = sim.events[evIdx.current];
      if (e.type === 'cross' && e.id) {
        flashes.current[e.id] = now;
        sfx.detector();
      } else if (e.type === 'capture' && e.id) {
        flashes.current[e.id] = now;
      } else if (e.type === 'crash' || e.type === 'hitCharge') {
        if (!document.documentElement.dataset.motion) sparks.current.push({ x: e.x, y: e.y, t0: now });
        sfx.spark();
      }
    }
    sparks.current = sparks.current.filter((s) => now - s.t0 < 400);
  };

  const finishAttempt = () => {
    const run = runRef.current;
    const ctx = attemptCtx.current;
    if (!run || !ctx) return;
    stopHum();
    processEvents(run);
    const ev = evaluateRun(level, ctx.cfg, run, sig);
    setStatus('finished');
    setSimTime(run.time());
    setConditions(ev.conditions);
    if (run.scriptError) setErrorLine(run.scriptError.line);
    // Guion: la perilla se mueve sola al valor fijado
    if (run.scriptActions.voltage !== undefined || run.scriptActions.positivePlate) {
      setCfg((p) => ({
        ...p,
        controls: {
          ...p.controls,
          ...(run.scriptActions.voltage !== undefined ? { voltage: run.scriptActions.voltage } : {}),
          ...(run.scriptActions.positivePlate ? { positivePlate: run.scriptActions.positivePlate } : {}),
        },
      }));
    }
    if (level.kind === 'generator') setLoadOn(ev.result === 'success');
    const corner: ReportState['corner'] = (() => {
      if (!ev.focus || level.kind !== 'particles') return 'tr';
      const right = ev.focus.x > level.world.w / 2;
      const top = ev.focus.y > level.world.h / 2;
      return `${top ? 'b' : 't'}${right ? 'l' : 'r'}` as ReportState['corner'];
    })();
    const S = store.getState();
    const matched = ctx.hyp && ctx.hyp.index !== null ? ctx.hyp.index === ev.outcomeIndex : null;
    if (ctx.replay) {
      setReport(replayReport.current);
      return;
    }
    const prevAttempts = S.telemetry.attempts.filter((a) => a.levelId === id).length;
    const attemptNumber = prevAttempts + 1;
    const lpNow = S.levelProgress(id);
    const physical = ev.result === 'success' || ev.result === 'failure';
    const physicalNumber = lpNow.attempts + (physical ? 1 : 0);
    let stars: 0 | 1 | 2 | 3 = 0;
    let challenge = false;
    if (ev.result === 'success') {
      challenge = challengeMet(level, ev, { attemptNumber: physicalNumber, priorMethods: lpNow.methods });
      stars = computeStars(true, lpNow.hintsUsed, challenge);
    }
    const firstPass = ev.result === 'success' && !lpNow.passed;
    S.updateLevel(id, {
      attempts: physicalNumber,
      passed: lpNow.passed || ev.result === 'success',
      stars: Math.max(lpNow.stars, stars) as 0 | 1 | 2 | 3,
      methods: ev.result === 'success' && ev.challenge.method && !lpNow.methods.includes(ev.challenge.method) ? [...lpNow.methods, ev.challenge.method] : lpNow.methods,
      best: ev.metrics.inRangePct ?? ev.metrics.correctIons ?? lpNow.best,
    });
    const scriptSrc = level.scriptMode === 'none' ? '' : ctx.cfg.script;
    const rec: AttemptRecord = {
      id: uuid(),
      levelId: id,
      attemptNumber,
      startedAt: ctx.startedAt,
      thinkingSeconds: S.takeThinking(id),
      result: ev.result,
      cause: ev.cause,
      failurePoints: ev.failurePoints,
      stars,
      hintsOpened: lpNow.hintsUsed,
      hypothesis: ctx.hyp ? { option: ctx.hyp.option, text: ctx.hyp.text } : null,
      hypothesisMatched: matched,
      config: { placements: ctx.cfg.placements, controls: ctx.cfg.controls },
      script:
        scriptSrc && !isBlankScript(scriptSrc)
          ? {
              lines: scriptSrc.split('\n').length,
              chars: scriptSrc.length,
              hash: scriptHash(scriptSrc),
              ...(S.settings.includeScripts ? { source: scriptSrc } : {}),
            }
          : null,
      metrics: ev.metrics,
      seed: ctx.seed,
      constantsMode: S.settings.constants,
      teacherMode: S.settings.teacherMode,
    };
    S.addAttempt(rec);
    // Fantasmas
    let ghostIndex: number | null = null;
    if (run.sim) {
      const g: GhostPath = {
        paths: run.sim.particles.filter((p) => p.path.length > 2).map((p) => decimate(p.path, 2000)),
        crashes: ev.failurePoints,
      };
      setGhosts((gs) => [g, ...gs].slice(0, 3));
      ghostIndex = 0;
    }
    setLog((l) => [
      { n: attemptNumber, result: es.ui.report.results[ev.result], cause: ev.cause ?? '✓', hypothesis: ctx.hyp?.option ?? ctx.hyp?.text ?? null, ghostIndex },
      ...l.map((e) => ({ ...e, ghostIndex: e.ghostIndex === null ? null : e.ghostIndex + 1 < 3 ? e.ghostIndex + 1 : null })),
    ]);
    setReport({ ev, attempt: attemptNumber, hyp: ctx.hyp, matched, corner });
    setAnnounce(es.ui.report.announce(attemptNumber, es.ui.report.results[ev.result], ev.message));
    if (ev.result === 'success') {
      sfx.success();
      let extra: string | null = null;
      if (id === '1-3' && firstPass) extra = es.ui.level.generatorOn;
      if (id === '3-3' && firstPass) {
        pendingCredits.current = true;
        setServersLit(0);
        let k = 0;
        const iv = setInterval(() => {
          k++;
          setServersLit(k);
          if (k >= 3) clearInterval(iv);
        }, 400);
      }
      const secs = store
        .getState()
        .telemetry.attempts.filter((a) => a.levelId === id)
        .reduce((s, a) => s + a.thinkingSeconds, 0);
      setSuccess({ stars, challenge, attempts: physicalNumber, extra, minutes: secs / 60 });
    } else if (ev.result === 'failure') {
      if (ev.cause === 'F-SOBRECARGA') sfx.alarm();
      else sfx.fail();
    } else if (ev.result === 'scriptError') {
      sfx.fail();
    }
  };

  const startAttempt = (mode: 'animated' | 'instant', hyp: AttemptCtxHyp, opts: { seed?: number; replay?: boolean } = {}) => {
    unlockAudio();
    const S = store.getState();
    const cur = cfgRef.current;
    const s = opts.seed ?? S.settings.fixedSeed ?? newSeed();
    lastSeed.current = s;
    setSeed(s);
    setReport(null);
    setSuccess(null);
    setConditions(null);
    setErrorLine(null);
    setLoadOn(false);
    if (!opts.replay) setOutput([]);
    sparks.current = [];
    flashes.current = {};
    evIdx.current = 0;
    const run = new AttemptRun({
      setup: setupForLevel(level, cur, s, c),
      script: level.scriptMode === 'none' ? '' : cur.script,
      devices: level.devices,
      levelConstants: level.levelConstants,
      constants: c,
    });
    run.output = [];
    const outBuf = run.output;
    runRef.current = run;
    attemptCtx.current = { cfg: cur, seed: s, hyp, replay: !!opts.replay, startedAt: new Date().toISOString() };
    targetRef.current = 0;
    if (run.finished) {
      setOutput([...outBuf]);
      finishAttempt();
      return;
    }
    if (mode === 'instant') {
      run.runToEnd();
      setOutput([...outBuf]);
      finishAttempt();
      return;
    }
    run.start();
    if (level.kind === 'generator') startHum();
    setStatus('running');
  };
  type AttemptCtxHyp = { option: string | null; text: string | null; index: number | null } | null;

  const requestRun = (mode: 'animated' | 'instant', repeat = false) => {
    if (statusRef.current === 'running' || statusRef.current === 'paused') {
      // Detener y descartar
      const run = runRef.current;
      if (run && attemptCtx.current && !attemptCtx.current.replay) {
        run.abort();
        const S = store.getState();
        S.addAttempt({
          id: uuid(),
          levelId: id,
          attemptNumber: S.telemetry.attempts.filter((a) => a.levelId === id).length + 1,
          startedAt: attemptCtx.current.startedAt,
          thinkingSeconds: S.takeThinking(id),
          result: 'aborted',
          cause: null,
          failurePoints: [],
          stars: 0,
          hintsOpened: S.levelProgress(id).hintsUsed,
          hypothesis: null,
          hypothesisMatched: null,
          config: { placements: attemptCtx.current.cfg.placements, controls: attemptCtx.current.cfg.controls },
          script: null,
          metrics: {},
          seed: attemptCtx.current.seed,
          constantsMode: S.settings.constants,
          teacherMode: S.settings.teacherMode,
        });
      }
      stopHum();
      runRef.current = null;
      setStatus('idle');
      return;
    }
    if (level.scriptMode !== 'none') {
      const r = checkScript(cfgRef.current.script, level.devices, c, level.levelConstants);
      if (r.error) {
        // El intento no empieza: el error aparece en la salida y la línea se marca en rojo.
        startAttempt('instant', null);
        return;
      }
    }
    if (store.getState().settings.askHypothesis) setHypOpen(repeat ? 'repeat' : mode);
    else startAttempt(mode, null, repeat && lastSeed.current !== null ? { seed: lastSeed.current } : {});
  };

  const reset = () => {
    stopHum();
    runRef.current = null;
    setStatus('idle');
    setReport(null);
    setSimTime(0);
    setLoadOn(false);
  };

  // ---------- Bucle de animación ----------
  const finishRef = useRef(finishAttempt);
  finishRef.current = finishAttempt;
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let lastUi = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const run = runRef.current;
      if (run && statusRef.current === 'running') {
        targetRef.current += dt * level.timeScale * speedRef.current;
        run.advance(20000, targetRef.current);
        processEvents(run);
        if (run.finished) {
          setOutput([...run.output]);
          finishRef.current();
        }
      }
      canvasRef.current?.draw();
      genRef.current?.draw();
      if (now - lastUi > 100) {
        lastUi = now;
        if (run) {
          setSimTime(run.time());
          if (run.output.length) setOutput((o) => (o.length !== run.output.length ? [...run.output] : o));
        }
        updateReading();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const onVis = () => {
      if (document.hidden && statusRef.current === 'running') setStatus('paused');
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVis);
      stopHum();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level]);

  const stepFrame = () => {
    const run = runRef.current;
    if (!run || statusRef.current !== 'paused') return;
    targetRef.current += (1 / 60) * level.timeScale * speedRef.current;
    run.advance(20000, targetRef.current);
    processEvents(run);
    if (run.finished) {
      setOutput([...run.output]);
      finishAttempt();
    }
  };

  // ---------- Multímetro ----------
  const readingCtx = () => {
    if (!preview || level.kind !== 'particles') return null;
    const run = runRef.current;
    const scene = run?.sim?.scene ?? preview.scene;
    const field = run?.sim?.field ?? preview.field;
    const shot = scene.shots[0];
    return { scene, field, sim: run?.sim ?? null, c, probeParticle: shot ? shot.kind : null, sig };
  };
  const updateReading = () => {
    if (level.kind === 'generator') {
      setReading(generatorReading());
      return;
    }
    const p = pointerWorld.current;
    const ctx = readingCtx();
    const view = canvasRef.current?.view();
    if (!p || !ctx || !view) return;
    setReading(readProbe(pick(p.x, p.y, view, ctx), ctx));
  };
  const regionReading = () => {
    const ctx = readingCtx();
    const p = pointerWorld.current;
    if (!ctx || !p) return null;
    const reg = regionAt(p.x, p.y, ctx.field);
    return reg ? readProbe(reg, ctx) : null;
  };
  const generatorReading = (): Reading | null => {
    if (level.kind !== 'generator') return null;
    const M = es.ui.multimeter;
    const run = runRef.current;
    const gen = run?.gen;
    const f = generatorFrequency(level, cfgRef.current);
    const N = totalTurns(level, cfgRef.current);
    const nA = gen ? gen.nActive : N;
    const B = gen ? gen.fieldNow().B : level.B0;
    const omega = 2 * Math.PI * f;
    const vr = gen ? gen.lastRms() : 0;
    return {
      title: es.ui.generator.rotor,
      rows: [
        [M.nActive, `${nA} / ${N}`],
        [M.area, `${formatFixed(level.area, 3)} m²`],
        [M.B, formatQuantity(B, 'B', sig)],
        [M.omega, `${formatQuantity(omega, 'v', sig).replace(' m/s', '')} rad/s`],
        [M.emf, formatQuantity(gen ? gen.lastEmf : 0, 'V', sig)],
        [M.e0, formatQuantity(nA * B * level.area * omega, 'V', sig)],
        [M.vrms, formatQuantity(vr, 'V', sig)],
        [M.irms, formatQuantity(vr / level.R, 'I', sig)],
        [M.power, formatQuantity((vr * vr) / level.R, 'P', sig)],
        [M.state, level.load === 'lamp' ? (loadOnRef.current ? M.lampOn : M.lampOff) : loadOnRef.current ? M.serversOn : M.serversOff],
      ],
    };
  };

  // ---------- Atajos de teclado ----------
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyRef.current = (e: KeyboardEvent) => {
    if (document.querySelector('.modal-veil')) return;
    if (isTyping(e.target)) return;
    store.getState().touch();
    const k = e.key;
    if (k === ' ' && e.shiftKey) {
      e.preventDefault();
      if (statusRef.current !== 'running' && statusRef.current !== 'paused') requestRun('instant');
    } else if (k === ' ') {
      if ((e.target as HTMLElement)?.tagName === 'BUTTON') return;
      e.preventDefault();
      requestRun('animated');
    } else if (k === 'p' || k === 'P') {
      if (statusRef.current === 'running') setStatus('paused');
      else if (statusRef.current === 'paused') setStatus('running');
    } else if (k === 'r' || k === 'R') reset();
    else if (k === 'f' || k === 'F') setViewer((v) => ({ ...v, on: !v.on }));
    else if (k === 'c' || k === 'C') store.getState().setUi({ consoleOpen: !store.getState().ui.consoleOpen });
    else if ((k === 'm' || k === 'M') && level.kind === 'particles') setRulerOn((r) => !r);
    else if (k === 'h' || k === 'H') openHint();
    else if (k === '+' || k === '=') setSpeed(SPEEDS[Math.min(SPEEDS.length - 1, SPEEDS.indexOf(speedRef.current) + 1)]);
    else if (k === '-') setSpeed(SPEEDS[Math.max(0, SPEEDS.indexOf(speedRef.current) - 1)]);
    else if (k === '.') stepFrame();
    else if (k === '?') setShortcuts(true);
    else if (k === 'Escape') {
      setRuler(null);
      setPlacing(null);
      setReport(null);
    } else if (k === 'Delete' && drag === null) {
      const sel = store.getState().ui.selected;
      if (sel && cfgRef.current.placements[sel] && !locked) removeAt(sel);
    }
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const openHint = () => {
    const S = store.getState();
    if (S.levelProgress(id).hintsUsed >= 3) return;
    S.openHint(id);
  };

  // ---------- Resumen del lienzo para lectores de pantalla ----------
  const ariaSummary = useMemo(() => {
    if (level.kind === 'generator') {
      return L.canvasAria(id, `${es.ui.generator.totalTurns(totalTurns(level, cfg))}. ${es.ui.inventory.gearOption(String(cfg.controls.gear ?? '1'), generatorFrequency(level, cfg))}`);
    }
    const list = Object.entries(cfg.placements)
      .map(([a, it]) => {
        const item = level.inventory.find((x) => x.id === it);
        return item ? `${itemLabel(item)} en ${a}` : '';
      })
      .filter(Boolean);
    return L.canvasAria(id, `${L.sceneParticles} ${L.chargesPlaced(list.length, list.join(', '))}`);
  }, [cfg, level, id, L]);

  const next = nextLevelId(id);
  const T = es.levels[id];
  const occupied = useMemo(() => new Set(Object.keys(cfg.placements)), [cfg.placements]);
  const hiddenCharge = drag?.from ?? null;
  const dragItem = drag ? level.inventory.find((x) => x.id === drag.itemId) : null;
  const pinReadings = pins
    .map((p) => {
      const ctx = readingCtx();
      return ctx ? { label: p.label, reading: readProbe({ kind: 'point', x: p.x, y: p.y }, ctx) } : null;
    })
    .filter((x): x is { label: string; reading: Reading } => !!x);
  const regionR = level.kind === 'particles' && reading?.title === es.ui.multimeter.point ? regionReading() : null;
  const shownReading = reading && regionR ? { title: reading.title, rows: [...reading.rows, ...regionR.rows.map(([k, v]) => [`${regionR.title} · ${k}`, v] as [string, string])] } : reading;

  return (
    <div className="level-screen" onPointerDown={() => store.getState().touch()}>
      <header className="level-head">
        <Button small onClick={() => navigate('/campana')}>
          {L.back}
        </Button>
        <h1>
          {es.labs[level.lab].short.toUpperCase()} · {id} {T.name.toUpperCase()}
        </h1>
        <span className="muted">{L.attempt(store.getState().telemetry.attempts.filter((a) => a.levelId === id).length + (status === 'finished' ? 0 : 1))}</span>
        <span className="spacer" />
        <Button small className="drawer-btn" onClick={() => setDrawers((d) => ({ ...d, left: !d.left }))} aria-expanded={drawers.left}>
          {L.openLeft}
        </Button>
        <Button small className="drawer-btn" onClick={() => setDrawers((d) => ({ ...d, right: !d.right }))} aria-expanded={drawers.right}>
          {L.openRight}
        </Button>
        <Button small onClick={() => setShortcuts(true)} aria-label={L.help}>
          {L.helpShort}
        </Button>
        <Button small onClick={() => navigate('/ajustes')} aria-label={L.settings}>
          {L.settingsShort}
        </Button>
      </header>

      <aside className={`side-left ${drawers.left ? 'open' : ''}`}>
        {drawers.left && (
          <Button small className="drawer-btn" onClick={() => setDrawers((d) => ({ ...d, left: false }))}>
            {es.ui.app.close}
          </Button>
        )}
        <Inventory
          level={level}
          cfg={cfg}
          locked={locked}
          targets={targets}
          placing={placing}
          focusTarget={focusTarget}
          onPointerPick={(itemId, e) => {
            if (locked) return;
            e.preventDefault();
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
            beginDrag(itemId, null, e.clientX, e.clientY, { x: r.left + 20, y: r.top + r.height / 2 });
          }}
          onKeyPick={(itemId) => {
            if (locked) return;
            const free = targets.filter((t) => t.free);
            setPlacing(itemId);
            setFocusTarget(free[0]?.id ?? null);
          }}
          onFocusTarget={setFocusTarget}
          onPlace={(t) => {
            if (placing) place(placing, t, null);
            setPlacing(null);
            setFocusTarget(null);
          }}
          onCancel={() => {
            setPlacing(null);
            setFocusTarget(null);
          }}
          onRemove={removeAt}
        />
        <Controls level={level} cfg={cfg} locked={locked} onControl={(k, v) => setCfg((p) => ({ ...p, controls: { ...p.controls, [k]: v } }))} />
        <Mission
          level={level}
          conditions={conditions}
          hintsUsed={hintsUsed}
          onHint={openHint}
          log={log}
          onLogClick={(e) => setHighlightGhost(e.ghostIndex)}
          teacher={settings.teacherMode}
          onReference={() => setRefOpen(true)}
          onResetDraft={() => {
            store.getState().clearDraft(id);
            setCfg(defaultConfig(level));
            reset();
          }}
        />
      </aside>

      <main className="center" id="main">
        <div className="canvas-wrap crt">
          {level.kind === 'particles' && preview ? (
            <ParticleCanvas
              ref={canvasRef}
              model={{
                world: level.world,
                scene: preview.scene,
                field: preview.field,
                emitter: level.emitter,
                anchors: level.anchors,
                occupied,
                run: runRef.current,
                viewer: { on: viewer.on, lines: viewer.lines, vectors: viewer.vectors, b: viewer.b },
                hideGhosts: viewer.hideGhosts,
                ghosts,
                highlightGhost,
                fieldLines,
                hotAnchor: drag?.hot ?? (placing ? focusTarget : null),
                dragging: !!drag || !!placing,
                hiddenCharge,
                pins,
                ruler: ruler
                  ? {
                      ...ruler,
                      label: L.ruler(
                        formatFixed(Math.hypot(ruler.b.x - ruler.a.x, ruler.b.y - ruler.a.y) * 100, 1),
                        formatFixed((Math.atan2(ruler.b.y - ruler.a.y, ruler.b.x - ruler.a.x) * 180) / Math.PI, 1),
                      ),
                    }
                  : null,
                flashes: flashes.current,
                sparks: sparks.current,
                sig,
                zoom: 1,
                pan: { x: 0, y: 0 },
                ariaLabel: ariaSummary,
                trails: true,
              }}
              onPointerWorld={(p) => {
                pointerWorld.current = p;
                setPointer(p);
              }}
              onDown={(p, e) => {
                downInfo.current = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false };
                if (rulerOn) {
                  setRuler({ a: p, b: p });
                  return;
                }
                if (locked) return;
                // ¿Carga colocada bajo el puntero?
                const view = canvasRef.current?.view();
                for (const a of level.anchors) {
                  const it = cfgRef.current.placements[a.id];
                  if (!it || !view) continue;
                  const item = level.inventory.find((x) => x.id === it);
                  if (Math.hypot(a.x - p.x, a.y - p.y) < chargeRadiusPx((item?.value ?? 1) * 1e-9) / view.scale) {
                    if (e.button !== 0) return;
                    store.getState().setUi({ selected: a.id });
                    beginDrag(it, a.id, e.clientX, e.clientY, { x: e.clientX, y: e.clientY });
                    downInfo.current = null;
                    return;
                  }
                }
              }}
              onMove={(p, e) => {
                if (downInfo.current && Math.hypot(e.clientX - downInfo.current.x, e.clientY - downInfo.current.y) > 4) downInfo.current.moved = true;
                if (rulerOn && ruler && e.buttons) setRuler({ a: ruler.a, b: p });
              }}
              onUp={(p) => {
                const d = downInfo.current;
                downInfo.current = null;
                if (rulerOn || !d || d.moved || drag) return;
                if (pins.length < 3) {
                  const used = new Set(pins.map((x) => x.label));
                  const label = ['P1', 'P2', 'P3'].find((l) => !used.has(l))!;
                  setPins([...pins, { x: p.x, y: p.y, label }]);
                }
              }}
              onContext={(p) => {
                if (locked) return;
                const view = canvasRef.current?.view();
                for (const a of level.anchors) {
                  if (cfgRef.current.placements[a.id] && view && Math.hypot(a.x - p.x, a.y - p.y) < 20 / view.scale) removeAt(a.id);
                }
              }}
            />
          ) : level.kind === 'generator' ? (
            <GeneratorStage
              ref={genRef}
              ariaLabel={ariaSummary}
              locked={locked}
              onRemove={removeAt}
              slots={Array.from({ length: level.slots }, (_, i) => {
                const sid = `S${i + 1}`;
                const it = level.inventory.find((x) => x.id === cfg.placements[sid]);
                return { id: sid, label: it ? itemLabel(it) : null, hot: drag?.hot === sid || (placing !== null && focusTarget === sid) };
              })}
              model={{
                B0: level.B0,
                f: generatorFrequency(level, cfg),
                nTotal: totalTurns(level, cfg),
                load: level.load,
                servers: level.servers,
                band: level.id === '3-1' ? null : [114, 126],
                tripV: level.tripV,
                showB: level.profile === 'peaks',
                duration: level.duration,
                run: runRef.current,
                loadOn:
                  loadOn ||
                  (status !== 'idle' &&
                    !!runRef.current?.gen &&
                    (level.load === 'lamp'
                      ? (() => {
                          const g = runRef.current!.gen!;
                          const e0 = g.nActive * level.B0 * level.area * 2 * Math.PI * g.cfg.f;
                          return e0 >= 145 && e0 <= 160;
                        })()
                      : runRef.current.gen.cycles.length > 0 && runRef.current.gen.lastRms() >= 114 && runRef.current.gen.lastRms() <= 126 && Math.abs(runRef.current.gen.cfg.f - 60) < 1e-9)),
                serversLit: loadOn ? (id === '3-3' && serversLit < 3 ? serversLit : 3) : 0,
                idleTime: 0,
                showLines: true,
              }}
            />
          ) : null}
          {report && (
            <ReportPanel
              attempt={report.attempt}
              ev={report.ev}
              hypothesis={report.hyp}
              matched={report.matched}
              corner={report.corner}
              hasNext={!!next}
              onAdjust={reset}
              onReplay={() => {
                const ctx = attemptCtx.current;
                if (!ctx) return;
                const keep = report;
                setCfg(ctx.cfg);
                cfgRef.current = ctx.cfg;
                replayReport.current = keep;
                startAttempt('animated', ctx.hyp, { seed: ctx.seed, replay: true });
              }}
              onNext={() => next && navigate(`/nivel/${next}`)}
            />
          )}
        </div>
        <div className="canvas-foot">
          <span>{pointer && level.kind === 'particles' ? L.pointer(formatCm(pointer.x), formatCm(pointer.y)) : ' '}</span>
          <span className="sr-only" aria-live="polite">
            {announce}
          </span>
        </div>
      </main>

      <aside className={`side-right ${drawers.right ? 'open' : ''}`}>
        {drawers.right && (
          <Button small className="drawer-btn" onClick={() => setDrawers((d) => ({ ...d, right: false }))}>
            {es.ui.app.close}
          </Button>
        )}
        <Multimeter reading={shownReading} pins={pinReadings} onRemovePin={(i) => setPins(pins.filter((_, k) => k !== i))} />
        <FieldViewer {...viewer} onChange={(p) => setViewer((v) => ({ ...v, ...p }))} />
      </aside>

      <ControlBar
        status={status}
        speed={speed}
        scaleLabel={level.scaleLabel}
        seed={seed}
        time={formatQuantity(simTime, 't', 4)}
        rulerOn={rulerOn}
        showRuler={level.kind === 'particles'}
        onRun={() => requestRun('animated')}
        onPause={() => setStatus(status === 'paused' ? 'running' : 'paused')}
        onReset={reset}
        onSpeed={setSpeed}
        onStep={stepFrame}
        onInstant={() => requestRun('instant')}
        onRepeatSeed={() => lastSeed.current !== null && requestRun('animated', true)}
        onRuler={() => setRulerOn(!rulerOn)}
      />

      <div className="console-area">
        <Console
          scriptEnabled={level.scriptMode !== 'none'}
          script={cfg.script}
          onScript={(s) => setCfg((p) => ({ ...p, script: s }))}
          output={output}
          onClearOutput={() => setOutput([])}
          onRun={() => requestRun('animated')}
          devices={level.devices}
          levelConstants={level.levelConstants}
          constants={c}
          errorLine={errorLine}
          readOnly={locked}
          sig={sig}
          onVerify={(m) => {
            setOutput((o) => [...o, m]);
            const ln = /línea (\d+)/.exec(m.text);
            setErrorLine(m.kind === 'error' && ln ? Number(ln[1]) : null);
          }}
        />
      </div>

      {drag && dragItem && (
        <div className={`drag-ghost ${drag.bounce && drag.bounce.x === -1 ? 'bounce' : ''}`} style={{ left: drag.x, top: drag.y }} aria-hidden="true">
          <ItemIcon it={dragItem} />
        </div>
      )}
      {hypOpen && (
        <HypothesisDialog
          level={level}
          onCancel={() => setHypOpen(null)}
          onRun={(h) => {
            const mode = hypOpen;
            setHypOpen(null);
            startAttempt(mode === 'instant' ? 'instant' : 'animated', h, mode === 'repeat' && lastSeed.current !== null ? { seed: lastSeed.current } : {});
          }}
        />
      )}
      {briefing && (
        <BriefingDialog
          level={level}
          onStart={() => {
            store.getState().markBriefed(id);
            setBriefing(false);
          }}
        />
      )}
      {success && (
        <SuccessDialog
          level={level}
          stars={success.stars}
          hint3={hintsUsed >= 3}
          challenge={success.challenge}
          attempts={success.attempts}
          time={es.ui.telemetry.minutes(formatFixed(success.minutes, 1))}
          hasNext={!!next}
          extra={success.extra}
          onNext={() => {
            setSuccess(null);
            if (pendingCredits.current) setCredits(true);
            else if (next) navigate(`/nivel/${next}`);
          }}
          onMap={() => {
            setSuccess(null);
            if (pendingCredits.current) setCredits(true);
            else navigate('/campana');
          }}
          onStay={() => {
            setSuccess(null);
            if (pendingCredits.current) setCredits(true);
          }}
        />
      )}
      {credits && (
        <CreditsDialog
          stars={totalStars(store.getState().progress)}
          time={`${formatFixed(store.getState().telemetry.attempts.reduce((s, a) => s + a.thinkingSeconds, 0) / 60, 0)} min`}
          onClose={() => {
            pendingCredits.current = false;
            setCredits(false);
            navigate('/');
          }}
        />
      )}
      {shortcuts && <ShortcutsDialog onClose={() => setShortcuts(false)} />}
      {refOpen && (
        <ReferenceDialog
          level={level}
          onClose={() => setRefOpen(false)}
          onApply={(r) => {
            setCfg({ placements: { ...r.placements }, controls: { ...defaultConfig(level).controls, ...r.controls }, script: r.script });
            setRefOpen(false);
          }}
        />
      )}
    </div>
  );
}
