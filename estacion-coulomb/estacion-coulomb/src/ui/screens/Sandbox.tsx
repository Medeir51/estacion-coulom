/** Cámara de Pruebas (sección 15): edición libre, emisores, banco del generador, guardar, exportar y compartir. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { AttemptRun, type OutputLine } from '../../core/attempt';
import { getConstants } from '../../core/constants';
import { traceFieldLines, type FieldLine } from '../../core/fieldlines';
import { FieldSystem } from '../../core/fields';
import { formatCm, formatQuantity } from '../../core/format';
import { newSeed } from '../../core/rng';
import {
  LIMITS,
  SHARE_LIMIT,
  WORLD_SIZES,
  benchConfig,
  buildSandbox,
  countOf,
  decodeScene,
  emitterSpeed,
  emptySandbox,
  encodeScene,
  limitKey,
  newItem,
  nextId,
  validateScene,
  type SandboxScene,
  type SbItem,
  type SbKind,
} from '../../core/sandbox';
import { EXAMPLE_IDS, example, type ExampleId } from '../../data/examples';
import { es } from '../../i18n/es';
import { navigate, useRoute } from '../../router';
import { useStore } from '../../store';
import { downloadFile, load, readFileText, save, KEYS } from '../../store/persist';
import { drawEmitter, sx, sy, type Spark } from '../../render/scene';
import { sfx, startHum, stopHum, unlockAudio } from '../../audio/sfx';
import { Button, ConfirmButton, Panel, Select, Tabs, Toggle, NumberField } from '../components/base';
import { Console } from '../hud/Console';
import { GeneratorStage, type GenHandle } from '../hud/GeneratorStage';
import { ParticleCanvas, type CanvasHandle } from '../hud/ParticleCanvas';
import { ControlBar, FieldViewer, Multimeter } from '../hud/Panels';
import { pick, readProbe, type Reading } from '../hud/readings';

const S = es.ui.sandbox;
const PALETTE: SbKind[] = ['charge', 'capacitor', 'magnet', 'electromagnet', 'wall', 'shield', 'emitter', 'detector', 'receiver'];

interface SlotData {
  name: string;
  date: string;
  scene: SandboxScene;
}
interface SandboxStore {
  slots: (SlotData | null)[];
  runs: number;
}

function loadSlots(): SandboxStore {
  const d = load<SandboxStore>(KEYS.sandbox);
  const slots = Array.from({ length: 10 }, (_, i) => {
    const s = d?.slots?.[i];
    const scene = s ? validateScene(s.scene) : null;
    return s && scene ? { name: String(s.name).slice(0, 40), date: String(s.date), scene } : null;
  });
  return { slots, runs: typeof d?.runs === 'number' ? d.runs : 0 };
}

const snap = (v: number, on: boolean) => (on ? Math.round(v * 100) / 100 : v);

/** Punto central de un componente (para moverlo). */
function anchorOf(i: SbItem): { x: number; y: number } {
  switch (i.kind) {
    case 'charge':
    case 'emitter':
      return { x: i.x, y: i.y };
    case 'capacitor':
      return { x: i.cx, y: i.cy };
    case 'wall':
      return i.points[0];
    case 'detector':
      return { x: (i.ax + i.bx) / 2, y: (i.ay + i.by) / 2 };
    default:
      return { x: (i.x0 + i.x1) / 2, y: (i.y0 + i.y1) / 2 };
  }
}

function moveItem(i: SbItem, dx: number, dy: number): SbItem {
  switch (i.kind) {
    case 'charge':
    case 'emitter':
      return { ...i, x: i.x + dx, y: i.y + dy };
    case 'capacitor':
      return { ...i, cx: i.cx + dx, cy: i.cy + dy };
    case 'wall':
      return { ...i, points: i.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
    case 'detector':
      return { ...i, ax: i.ax + dx, ay: i.ay + dy, bx: i.bx + dx, by: i.by + dy };
    default:
      return { ...i, x0: i.x0 + dx, y0: i.y0 + dy, x1: i.x1 + dx, y1: i.y1 + dy };
  }
}

function distSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const l = dx * dx + dy * dy || 1;
  const u = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l));
  return Math.hypot(px - ax - u * dx, py - ay - u * dy);
}

function hitItem(items: SbItem[], x: number, y: number, tol: number): SbItem | null {
  const order: SbKind[] = ['charge', 'emitter', 'detector', 'receiver', 'capacitor', 'wall', 'shield', 'electromagnet', 'magnet'];
  for (const k of order) {
    for (let n = items.length - 1; n >= 0; n--) {
      const i = items[n];
      if (i.kind !== k) continue;
      switch (i.kind) {
        case 'charge':
        case 'emitter':
          if (Math.hypot(i.x - x, i.y - y) < tol * 2) return i;
          break;
        case 'detector':
          if (distSeg(x, y, i.ax, i.ay, i.bx, i.by) < tol) return i;
          break;
        case 'wall':
          for (let s = 0; s + 1 < i.points.length; s++)
            if (distSeg(x, y, i.points[s].x, i.points[s].y, i.points[s + 1].x, i.points[s + 1].y) < tol) return i;
          break;
        case 'capacitor': {
          const r = (i.angle * Math.PI) / 180;
          const a = (x - i.cx) * Math.cos(r) + (y - i.cy) * Math.sin(r);
          const b = -(x - i.cx) * Math.sin(r) + (y - i.cy) * Math.cos(r);
          if (Math.abs(a) <= i.L / 2 + tol && Math.abs(b) <= i.d / 2 + tol) return i;
          break;
        }
        default: {
          const x0 = Math.min(i.x0, i.x1);
          const x1 = Math.max(i.x0, i.x1);
          const y0 = Math.min(i.y0, i.y1);
          const y1 = Math.max(i.y0, i.y1);
          if (x >= x0 - tol && x <= x1 + tol && y >= y0 - tol && y <= y1 + tol) return i;
        }
      }
    }
  }
  return null;
}

/** Manija de un componente: esquina superior derecha (tamaño) o rotación del capacitor. */
function handleOf(i: SbItem): { x: number; y: number; type: 'resize' | 'rotate' | 'end' } | null {
  if (i.kind === 'capacitor') {
    const r = (i.angle * Math.PI) / 180;
    return { x: i.cx + (i.L / 2 + 0.01) * Math.cos(r), y: i.cy + (i.L / 2 + 0.01) * Math.sin(r), type: 'rotate' };
  }
  if (i.kind === 'detector') return { x: i.bx, y: i.by, type: 'end' };
  if ('x0' in i) return { x: Math.max(i.x0, i.x1), y: Math.max(i.y0, i.y1), type: 'resize' };
  return null;
}

export default function Sandbox() {
  const route = useRoute();
  const settings = useStore((s) => s.settings);
  const toast = useStore((s) => s.toast);
  const c = getConstants(settings.constants);
  const sig = settings.sigFigs;
  const [tab, setTab] = useState<'fields' | 'bench'>('fields');
  const [scene, setSceneState] = useState<SandboxScene>(() => emptySandbox());
  const sceneRef = useRef(scene);
  sceneRef.current = scene;
  const history = useRef<{ past: SandboxScene[]; future: SandboxScene[] }>({ past: [], future: [] });
  const commit = (next: SandboxScene) => {
    history.current.past = [...history.current.past, sceneRef.current].slice(-50);
    history.current.future = [];
    setSceneState(next);
  };
  const [selected, setSelected] = useState<string | null>(null);
  const [snapOn, setSnapOn] = useState(true);
  const [tool, setTool] = useState<'select' | 'wall'>('select');
  const [wallDraft, setWallDraft] = useState<{ x: number; y: number }[]>([]);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [viewer, setViewer] = useState({ on: false, lines: true, vectors: false, b: true, hideGhosts: false });
  const [fieldLines, setFieldLines] = useState<FieldLine[]>([]);
  const [status, setStatusState] = useState<'idle' | 'running' | 'paused' | 'finished'>('idle');
  const statusRef = useRef(status);
  const setStatus = (s: typeof status) => {
    statusRef.current = s;
    setStatusState(s);
  };
  const [speed, setSpeedState] = useState(settings.initialSpeed);
  const speedRef = useRef(speed);
  const setSpeed = (v: number) => {
    speedRef.current = v;
    setSpeedState(v);
  };
  const runRef = useRef<AttemptRun | null>(null);
  const scaleRef = useRef(1e-8);
  const targetRef = useRef(0);
  const [simTime, setSimTime] = useState(0);
  const [seed, setSeed] = useState<number | null>(null);
  const [output, setOutput] = useState<OutputLine[]>([]);
  const [events, setEvents] = useState<string[]>([]);
  const [reading, setReading] = useState<Reading | null>(null);
  const [pins, setPins] = useState<{ x: number; y: number; label: string }[]>([]);
  const [slotsData, setSlotsData] = useState<SandboxStore>(() => loadSlots());
  const [slotName, setSlotName] = useState('');
  const [menu, setMenu] = useState<null | 'examples' | 'slots'>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const canvasRef = useRef<CanvasHandle>(null);
  const genRef = useRef<GenHandle>(null);
  const pointerWorld = useRef<{ x: number; y: number } | null>(null);
  const dragRef = useRef<null | { mode: 'move' | 'handle' | 'pan'; id?: string; start: { x: number; y: number }; orig: SandboxScene; px: number; py: number; pan0: { x: number; y: number }; moved: boolean }>(null);
  const spaceDown = useRef(false);
  const flashes = useRef<Record<string, number>>({});
  const sparks = useRef<Spark[]>([]);
  const evIdx = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const locked = status === 'running' || status === 'paused';

  // Escena compartida por enlace
  useEffect(() => {
    const code = route.query.get('e');
    if (!code) return;
    const s = decodeScene(code);
    if (s) {
      setSceneState(s);
      toast(S.loadedFromLink);
    } else toast(S.invalidScene, 'error');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const field = useMemo(() => {
    try {
      return new FieldSystem(buildSandbox(scene, c, 1).scene.sources, c.k);
    } catch {
      return new FieldSystem({ charges: [], capacitors: [], magnets: [], electromagnets: [], shields: [] }, c.k);
    }
  }, [scene, c]);
  const preview = useMemo(() => buildSandbox(scene, c, 1), [scene, c]);

  useEffect(() => {
    if (!viewer.on || !viewer.lines) return;
    const t = setTimeout(() => setFieldLines(traceFieldLines(field, scene.world)), 50);
    return () => clearTimeout(t);
  }, [field, viewer.on, viewer.lines, scene.world]);

  useEffect(() => {
    const em = scene.items.filter((i): i is Extract<SbItem, { kind: 'emitter' }> => i.kind === 'emitter');
    setWarning(em.some((e) => emitterSpeed(e, c) > 0.1 * c.c) ? S.relativistic : null);
  }, [scene, c]);

  const sel = scene.items.find((i) => i.id === selected) ?? null;
  const update = (id: string, patch: Partial<SbItem>) =>
    commit({ ...scene, items: scene.items.map((i) => (i.id === id ? ({ ...i, ...patch } as SbItem) : i)) });

  const add = (kind: SbKind) => {
    if (kind === 'wall') {
      setTool('wall');
      setWallDraft([]);
      return;
    }
    if (countOf(scene, kind) >= LIMITS[limitKey(kind)]) return;
    const it = newItem(scene, kind, snap(scene.world.w / 2, true), snap(scene.world.h / 2, true));
    commit({ ...scene, items: [...scene.items, it] });
    setSelected(it.id);
  };

  const remove = (id: string) => {
    commit({ ...scene, items: scene.items.filter((i) => i.id !== id) });
    setSelected(null);
  };

  const duplicate = (id: string) => {
    const it = scene.items.find((i) => i.id === id);
    if (!it || countOf(scene, it.kind) >= LIMITS[limitKey(it.kind)]) return;
    const copy = { ...moveItem(it, 0.01, -0.01), id: nextId(scene, it.kind) } as SbItem;
    commit({ ...scene, items: [...scene.items, copy] });
    setSelected(copy.id);
  };

  const undo = () => {
    const h = history.current;
    const prev = h.past.pop();
    if (!prev) return;
    h.future.push(sceneRef.current);
    setSceneState(prev);
  };
  const redo = () => {
    const h = history.current;
    const nx = h.future.pop();
    if (!nx) return;
    h.past.push(sceneRef.current);
    setSceneState(nx);
  };

  // ---------- Simulación ----------
  const processEvents = (run: AttemptRun) => {
    const sim = run.sim;
    if (!sim) return;
    const now = performance.now();
    const add: string[] = [];
    for (; evIdx.current < sim.events.length; evIdx.current++) {
      const e = sim.events[evIdx.current];
      if (e.type === 'cross' && e.id) {
        flashes.current[e.id] = now;
        sfx.detector();
      }
      if (e.type === 'capture' && e.id) flashes.current[e.id] = now;
      if (e.type === 'crash' || e.type === 'hitCharge') {
        sparks.current.push({ x: e.x, y: e.y, t0: now });
        sfx.spark();
      }
      add.push(`[${formatQuantity(e.t, 't', 3)}] #${e.particle + 1} ${S.eventTypes[e.type]}${e.id ? ` ${e.id}` : ''}`);
    }
    if (add.length) setEvents((ev) => [...ev, ...add].slice(-200));
  };

  const start = (instant: boolean, fixed?: number) => {
    unlockAudio();
    const s = fixed ?? settings.fixedSeed ?? newSeed();
    setSeed(s);
    setOutput([]);
    setEvents([]);
    evIdx.current = 0;
    sparks.current = [];
    let run: AttemptRun;
    if (tab === 'fields') {
      const built = buildSandbox(scene, c, s);
      scaleRef.current = built.timeScale;
      run = new AttemptRun({
        setup: { kind: 'particles', scene: built.scene, settings: built.settings, controlPeriod: built.controlPeriod },
        script: scene.script,
        devices: ['selector', 'isotopes'],
        constants: c,
      });
    } else {
      scaleRef.current = 1;
      run = new AttemptRun({
        setup: { kind: 'generator', config: benchConfig(scene.bench, s), controlPeriod: 1e-3 },
        script: scene.benchScript,
        devices: ['generator'],
        levelConstants: { AREA: scene.bench.area, FRECUENCIA: scene.bench.f, OMEGA: 2 * Math.PI * scene.bench.f },
        constants: c,
      });
      startHum();
    }
    runRef.current = run;
    targetRef.current = 0;
    const next = { ...slotsData, runs: slotsData.runs + 1 };
    setSlotsData(next);
    save(KEYS.sandbox, next);
    if (instant || run.finished) {
      run.runToEnd();
      processEvents(run);
      setOutput([...run.output]);
      setSimTime(run.time());
      setStatus('finished');
      stopHum();
      return;
    }
    run.start();
    setStatus('running');
  };
  const stop = () => {
    runRef.current = null;
    stopHum();
    setStatus('idle');
  };

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let lastUi = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const run = runRef.current;
      if (run && statusRef.current === 'running') {
        targetRef.current += dt * scaleRef.current * speedRef.current;
        run.advance(20000, targetRef.current);
        processEvents(run);
        if (run.finished) {
          setOutput([...run.output]);
          setStatus('finished');
          stopHum();
        }
      }
      canvasRef.current?.draw();
      genRef.current?.draw();
      if (now - lastUi > 100) {
        lastUi = now;
        if (run) {
          setSimTime(run.time());
          setOutput((o) => (o.length !== run.output.length ? [...run.output] : o));
        }
        const p = pointerWorld.current;
        const view = canvasRef.current?.view();
        if (p && view) {
          const r = runRef.current;
          const sc = r?.sim?.scene ?? preview.scene;
          const fld = r?.sim?.field ?? field;
          setReading(readProbe(pick(p.x, p.y, view, { scene: sc, field: fld, sim: r?.sim ?? null, c, probeParticle: sc.shots[0]?.kind ?? null, sig }), { scene: sc, field: fld, sim: r?.sim ?? null, c, probeParticle: sc.shots[0]?.kind ?? null, sig }));
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      stopHum();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview, field, c, sig]);

  // ---------- Teclado ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      if (document.querySelector('.modal-veil')) return;
      if (e.key === ' ') {
        if (e.shiftKey) {
          e.preventDefault();
          if (statusRef.current !== 'running') start(true);
        } else spaceDown.current = true;
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        undo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault();
        redo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        if (selected) duplicate(selected);
      } else if (e.key === 'Delete' && selected && !locked) remove(selected);
      else if (e.key === 'g' || e.key === 'G') setSnapOn((v) => !v);
      else if (e.key === 'f' || e.key === 'F') setViewer((v) => ({ ...v, on: !v.on }));
      else if (e.key === 'c' || e.key === 'C') useStore.getState().setUi({ consoleOpen: !useStore.getState().ui.consoleOpen });
      else if (e.key === 'p' || e.key === 'P') {
        if (statusRef.current === 'running') setStatus('paused');
        else if (statusRef.current === 'paused') setStatus('running');
      } else if (e.key === 'r' || e.key === 'R') stop();
      else if (e.key === 'Escape') {
        setTool('select');
        setWallDraft([]);
        setSelected(null);
      }
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.key === ' ') spaceDown.current = false;
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onUp);
    };
  });

  const finishWall = (pts: { x: number; y: number }[]) => {
    setTool('select');
    setWallDraft([]);
    if (pts.length < 2 || countOf(scene, 'wall') >= LIMITS.wall) return;
    const it: SbItem = { kind: 'wall', id: nextId(scene, 'wall'), points: pts.slice(0, LIMITS.wallVertices) };
    commit({ ...scene, items: [...scene.items, it] });
    setSelected(it.id);
  };

  const overlay = (ctx: CanvasRenderingContext2D, v: Parameters<NonNullable<Parameters<typeof ParticleCanvas>[0]['model']['overlay']>>[1], P: Parameters<NonNullable<Parameters<typeof ParticleCanvas>[0]['model']['overlay']>>[2]) => {
    for (const i of scene.items) if (i.kind === 'emitter') drawEmitter(ctx, v, i, P);
    if (sel) {
      ctx.strokeStyle = P.ambar;
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 1.5;
      const a = anchorOf(sel);
      ctx.strokeRect(sx(v, a.x) - 14, sy(v, a.y) - 14, 28, 28);
      ctx.setLineDash([]);
      const h = handleOf(sel);
      if (h) {
        ctx.fillStyle = P.ambar;
        ctx.fillRect(sx(v, h.x) - 5, sy(v, h.y) - 5, 10, 10);
      }
    }
    if (wallDraft.length) {
      ctx.strokeStyle = P.ambar;
      ctx.lineWidth = 2;
      ctx.beginPath();
      wallDraft.forEach((p, k) => (k ? ctx.lineTo(sx(v, p.x), sy(v, p.y)) : ctx.moveTo(sx(v, p.x), sy(v, p.y))));
      const pw = pointerWorld.current;
      if (pw) ctx.lineTo(sx(v, pw.x), sy(v, pw.y));
      ctx.stroke();
    }
  };

  const shareCode = useMemo(() => encodeScene(scene), [scene]);
  const shareTooBig = shareCode.length > SHARE_LIMIT;

  const fieldsTab = (
    <>
      <aside className="side-left" style={{ position: 'static', transform: 'none', width: 'auto' }}>
        <Panel title={S.palette}>
          {PALETTE.map((k) => {
            const full = countOf(scene, k) >= LIMITS[limitKey(k)];
            return (
              <Button key={k} small className="palette-item" disabled={full || locked} onClick={() => add(k)} active={k === 'wall' && tool === 'wall'}>
                {S.items[k]}
                {full ? ` · ${S.limit(LIMITS[limitKey(k)])}` : ''}
              </Button>
            );
          })}
          {tool === 'wall' && <p className="help">{S.wallHelp}</p>}
          <Toggle label={S.snap} checked={snapOn} onChange={setSnapOn} />
          <p className="help">{S.zoomHelp}</p>
        </Panel>
        <Panel title={S.events}>
          <div className="events-log" aria-live="polite">
            {events.length === 0 ? <p className="help">{S.noEvents}</p> : events.map((e, k) => <div key={k}>{e}</div>)}
          </div>
        </Panel>
      </aside>
      <main className="center" id="main">
        <div className="canvas-wrap crt">
          <ParticleCanvas
            ref={canvasRef}
            model={{
              world: scene.world,
              scene: preview.scene,
              field,
              emitter: null,
              anchors: [],
              occupied: new Set(),
              run: runRef.current,
              viewer: { on: viewer.on, lines: viewer.lines, vectors: viewer.vectors, b: viewer.b },
              hideGhosts: true,
              ghosts: [],
              highlightGhost: null,
              fieldLines,
              hotAnchor: null,
              dragging: false,
              hiddenCharge: null,
              pins,
              ruler: null,
              flashes: flashes.current,
              sparks: sparks.current,
              sig,
              zoom,
              pan,
              ariaLabel: `${S.title}. ${scene.items.map((i) => i.id).join(', ')}`,
              trails: true,
              overlay,
            }}
            onPointerWorld={(p) => {
              pointerWorld.current = p;
            }}
            onDown={(p, e) => {
              const view = canvasRef.current?.view();
              if (!view) return;
              (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
              if (e.button === 1 || spaceDown.current) {
                dragRef.current = { mode: 'pan', start: p, orig: scene, px: e.clientX, py: e.clientY, pan0: pan, moved: false };
                return;
              }
              if (tool === 'wall') {
                setWallDraft((d) => [...d, { x: snap(p.x, snapOn), y: snap(p.y, snapOn) }]);
                return;
              }
              if (locked) return;
              const tol = 8 / view.scale;
              if (sel) {
                const h = handleOf(sel);
                if (h && Math.hypot(h.x - p.x, h.y - p.y) < tol * 1.5) {
                  dragRef.current = { mode: 'handle', id: sel.id, start: p, orig: scene, px: e.clientX, py: e.clientY, pan0: pan, moved: false };
                  return;
                }
              }
              const hit = hitItem(scene.items, p.x, p.y, tol);
              if (hit) {
                setSelected(hit.id);
                dragRef.current = { mode: 'move', id: hit.id, start: p, orig: scene, px: e.clientX, py: e.clientY, pan0: pan, moved: false };
              } else {
                setSelected(null);
                dragRef.current = { mode: 'pan', start: p, orig: scene, px: e.clientX, py: e.clientY, pan0: pan, moved: false };
                (dragRef.current as { click?: boolean }).click = true;
              }
            }}
            onMove={(p, e) => {
              const d = dragRef.current;
              if (!d) return;
              if (Math.hypot(e.clientX - d.px, e.clientY - d.py) > 3) d.moved = true;
              if (!d.moved) return;
              if (d.mode === 'pan') {
                if ((d as { click?: boolean }).click && !spaceDown.current && e.buttons !== 4) return;
                setPan({ x: d.pan0.x + e.clientX - d.px, y: d.pan0.y + e.clientY - d.py });
                return;
              }
              const it = d.orig.items.find((i) => i.id === d.id);
              if (!it) return;
              let next: SbItem = it;
              if (d.mode === 'move') {
                const a = anchorOf(it);
                const nx = snap(a.x + p.x - d.start.x, snapOn);
                const ny = snap(a.y + p.y - d.start.y, snapOn);
                next = moveItem(it, nx - a.x, ny - a.y);
              } else {
                const x = snap(p.x, snapOn);
                const y = snap(p.y, snapOn);
                if (it.kind === 'capacitor') next = { ...it, angle: Math.round((Math.atan2(p.y - it.cy, p.x - it.cx) * 180) / Math.PI) };
                else if (it.kind === 'detector') next = { ...it, bx: x, by: y };
                else if ('x0' in it) next = { ...it, x1: Math.max(x, Math.min(it.x0, it.x1) + 0.01), y1: Math.max(y, Math.min(it.y0, it.y1) + 0.01), x0: Math.min(it.x0, it.x1), y0: Math.min(it.y0, it.y1) } as SbItem;
              }
              setSceneState({ ...d.orig, items: d.orig.items.map((i) => (i.id === d.id ? next : i)) });
            }}
            onUp={(p) => {
              const d = dragRef.current;
              dragRef.current = null;
              if (!d) return;
              if (d.mode !== 'pan' && d.moved) {
                history.current.past = [...history.current.past, d.orig].slice(-50);
                history.current.future = [];
              } else if (d.mode === 'pan' && (d as { click?: boolean }).click && !d.moved && pins.length < 3) {
                const used = new Set(pins.map((x) => x.label));
                setPins([...pins, { x: p.x, y: p.y, label: ['P1', 'P2', 'P3'].find((l) => !used.has(l))! }]);
              }
            }}
            onContext={(p) => {
              const view = canvasRef.current?.view();
              if (!view || locked) return;
              const hit = hitItem(scene.items, p.x, p.y, 8 / view.scale);
              if (hit) remove(hit.id);
            }}
            onWheel={(p, dy) => {
              const view = canvasRef.current?.view();
              if (!view) return;
              const nz = Math.min(4, Math.max(0.5, zoom * (dy > 0 ? 0.9 : 1.1)));
              const s0 = view.scale / zoom;
              const sc = s0 * nz;
              const px = view.ox + p.x * view.scale;
              const py = view.oy - p.y * view.scale;
              setZoom(nz);
              setPan({ x: px - p.x * sc - (view.w - scene.world.w * sc) / 2, y: py + p.y * sc - (view.h + scene.world.h * sc) / 2 });
            }}
          />
        </div>
        <div className="canvas-foot">
          <span>{warning && <span className="warn">{warning}</span>}</span>
          <span className="muted">{S.autoDt(formatQuantity(preview.settings.dt, 't', 3))}</span>
          {tool === 'wall' && wallDraft.length >= 2 && (
            <Button small onClick={() => finishWall(wallDraft)}>
              {es.ui.app.accept}
            </Button>
          )}
        </div>
      </main>
      <aside className="side-right" style={{ position: 'static', transform: 'none', width: 'auto' }}>
        <Panel title={S.properties}>{sel ? <Properties item={sel} onChange={(p) => update(sel.id, p)} onDelete={() => remove(sel.id)} onDuplicate={() => duplicate(sel.id)} locked={locked} /> : <p className="help">{S.noSelection}</p>}</Panel>
        <Multimeter reading={reading} pins={pins.map((p) => ({ label: p.label, reading: readProbe({ kind: 'point', x: p.x, y: p.y }, { scene: preview.scene, field, sim: null, c, probeParticle: null, sig }) }))} onRemovePin={(k) => setPins(pins.filter((_, j) => j !== k))} />
        <FieldViewer {...viewer} onChange={(p) => setViewer((v) => ({ ...v, ...p }))} />
      </aside>
    </>
  );

  // Doble clic termina la pared
  useEffect(() => {
    const el = canvasRef.current?.element();
    if (!el) return;
    const dbl = () => {
      if (tool === 'wall') finishWall(wallDraft);
    };
    el.addEventListener('dblclick', dbl);
    return () => el.removeEventListener('dblclick', dbl);
  });

  const b = scene.bench;
  const setBench = (p: Partial<typeof b>) => commit({ ...scene, bench: { ...b, ...p } });
  const benchTab = (
    <>
      <aside className="side-left" style={{ position: 'static', transform: 'none', width: 'auto', overflow: 'auto' }}>
        <Panel title={S.tabBench}>
          <NumberField label={S.bench.B} value={b.B0} min={0} max={1} onChange={(v) => setBench({ B0: v })} />
          <NumberField label={S.bench.A} value={b.area} min={0.001} max={0.1} onChange={(v) => setBench({ area: v })} />
          <NumberField label={S.bench.f} value={b.f} min={1} max={120} onChange={(v) => setBench({ f: v })} />
          <NumberField label={S.bench.turns} value={b.turns} min={1} max={1000} onChange={(v) => setBench({ turns: Math.round(v) })} />
          <NumberField label={S.bench.R} value={b.R} min={1} max={1000} onChange={(v) => setBench({ R: v })} />
          <div className="field">
            <label htmlFor="trip">{S.bench.trip}</label>
            <input
              id="trip"
              className="input"
              defaultValue={b.tripV ?? ''}
              onBlur={(e) => {
                const v = Number(e.target.value.replace(',', '.'));
                setBench({ tripV: e.target.value.trim() === '' || !Number.isFinite(v) ? null : v });
              }}
            />
          </div>
          <Select label={S.bench.profile} value={b.profile} options={(['constant', 'peaks', 'sine'] as const).map((v) => ({ value: v, label: S.bench.profiles[v] }))} onChange={(v) => setBench({ profile: v })} />
          {b.profile === 'sine' && (
            <>
              <NumberField label={S.bench.a} value={b.a} min={0} max={1} onChange={(v) => setBench({ a: v })} />
              <NumberField label={S.bench.fB} value={b.fB} min={0.01} max={10} onChange={(v) => setBench({ fB: v })} />
            </>
          )}
          <NumberField label={S.bench.duration} value={b.duration} min={0.1} max={20} onChange={(v) => setBench({ duration: v })} />
        </Panel>
      </aside>
      <main className="center" id="main">
        <div className="canvas-wrap crt">
          <GeneratorStage
            ref={genRef}
            ariaLabel={S.tabBench}
            locked={locked}
            onRemove={() => {}}
            slots={[]}
            model={{
              B0: b.B0,
              f: b.f,
              nTotal: b.turns,
              load: 'servers',
              servers: 1,
              band: null,
              tripV: b.tripV,
              showB: b.profile !== 'constant',
              duration: b.duration,
              run: runRef.current,
              loadOn: status === 'running' || (status === 'finished' && !runRef.current?.gen?.tripped),
              serversLit: 1,
              idleTime: 0,
              showLines: true,
            }}
          />
        </div>
      </main>
      <aside className="side-right" style={{ position: 'static', transform: 'none', width: 'auto' }}>
        <Multimeter
          reading={(() => {
            const g = runRef.current?.gen;
            const M = es.ui.multimeter;
            const vr = g ? g.lastRms() : 0;
            return {
              title: es.ui.generator.rotor,
              rows: [
                [M.nActive, `${g ? g.nActive : b.turns} / ${b.turns}`],
                [M.B, formatQuantity(g ? g.fieldNow().B : b.B0, 'B', sig)],
                [M.emf, formatQuantity(g ? g.lastEmf : 0, 'V', sig)],
                [M.e0, formatQuantity(b.turns * b.B0 * b.area * 2 * Math.PI * b.f, 'V', sig)],
                [M.vrms, formatQuantity(vr, 'V', sig)],
                [M.irms, formatQuantity(vr / b.R, 'I', sig)],
                [M.power, formatQuantity((vr * vr) / b.R, 'P', sig)],
              ] as [string, string][],
            };
          })()}
          pins={[]}
          onRemovePin={() => {}}
        />
      </aside>
    </>
  );

  return (
    <div className="sandbox">
      <header className="level-head" style={{ gridArea: 'head' }}>
        <Button small onClick={() => navigate('/')}>
          {es.ui.campaign.back}
        </Button>
        <h1>{S.title}</h1>
        <Tabs label={S.title} value={tab} onChange={(t) => { stop(); setTab(t); }} tabs={[{ id: 'fields', label: S.tabFields }, { id: 'bench', label: S.tabBench }]} />
        <span className="spacer" />
        {tab === 'fields' && (
          <label className="row">
            {S.worldSize}
            <select
              className="input"
              value={WORLD_SIZES.findIndex((w) => w.w === scene.world.w && w.h === scene.world.h)}
              onChange={(e) => commit({ ...scene, world: { ...WORLD_SIZES[Number(e.target.value)] } })}
            >
              {WORLD_SIZES.map((_, k) => (
                <option key={k} value={k}>
                  {S.worldSizes[k]}
                </option>
              ))}
            </select>
          </label>
        )}
        <Button small onClick={undo}>
          {S.undo}
        </Button>
        <Button small onClick={redo}>
          {S.redo}
        </Button>
        <div style={{ position: 'relative' }}>
          <Button small onClick={() => setMenu(menu === 'examples' ? null : 'examples')} aria-expanded={menu === 'examples'}>
            {S.examples}
          </Button>
          {menu === 'examples' && (
            <div className="panel stack" style={{ position: 'absolute', right: 0, top: '110%', zIndex: 30, minWidth: 240 }}>
              {EXAMPLE_IDS.map((id: ExampleId) => (
                <Button
                  small
                  key={id}
                  onClick={() => {
                    const ex = example(id);
                    stop();
                    commit(ex.scene);
                    setTab('fields');
                    setPins(ex.pin ? [{ ...ex.pin, label: 'P1' }] : []);
                    setViewer((v) => ({ ...v, on: !!ex.viewer }));
                    setZoom(1);
                    setPan({ x: 0, y: 0 });
                    setMenu(null);
                  }}
                >
                  {S.exampleNames[id]}
                </Button>
              ))}
            </div>
          )}
        </div>
        <div style={{ position: 'relative' }}>
          <Button small onClick={() => setMenu(menu === 'slots' ? null : 'slots')} aria-expanded={menu === 'slots'}>
            {S.slots}
          </Button>
          {menu === 'slots' && (
            <div className="panel stack" style={{ position: 'absolute', right: 0, top: '110%', zIndex: 30, minWidth: 300 }}>
              <div className="field">
                <label htmlFor="slot-name">{S.slotName}</label>
                <input id="slot-name" className="input" maxLength={40} value={slotName} onChange={(e) => setSlotName(e.target.value)} />
              </div>
              {slotsData.slots.map((s, k) => (
                <div key={k} className="row">
                  <span style={{ flex: 1 }}>{s ? `${k + 1}. ${s.name} · ${new Date(s.date).toLocaleDateString('es-CO')}` : S.slotEmpty(k + 1)}</span>
                  <Button
                    small
                    onClick={() => {
                      const slots = [...slotsData.slots];
                      slots[k] = { name: slotName.trim() || `${S.title} ${k + 1}`, date: new Date().toISOString(), scene };
                      const next = { ...slotsData, slots };
                      setSlotsData(next);
                      save(KEYS.sandbox, next);
                    }}
                  >
                    {S.save}
                  </Button>
                  <Button
                    small
                    disabled={!s}
                    onClick={() => {
                      if (!s) return;
                      stop();
                      commit(s.scene);
                      setMenu(null);
                    }}
                  >
                    {S.load}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
        <Button small onClick={() => downloadFile('escena.ecoulomb.json', JSON.stringify(scene, null, 2))}>
          {S.exportFile}
        </Button>
        <Button small onClick={() => fileRef.current?.click()}>
          {S.importFile}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            try {
              const s = validateScene(JSON.parse(await readFileText(f)));
              if (!s) throw new Error();
              stop();
              commit(s);
            } catch {
              toast(S.invalidScene, 'error');
            }
          }}
        />
        <Button
          small
          disabled={shareTooBig}
          title={shareTooBig ? S.shareTooBig : undefined}
          onClick={async () => {
            const url = `${window.location.origin}${window.location.pathname}#/sandbox?e=${shareCode}`;
            try {
              await navigator.clipboard.writeText(url);
              toast(S.shareCopied);
            } catch {
              toast(url);
            }
          }}
        >
          {shareTooBig ? S.shareTooBig : S.share}
        </Button>
        <ConfirmButton small label={S.clear} confirmLabel={S.clearConfirm} onConfirm={() => { stop(); commit(emptySandbox()); setSelected(null); }} />
      </header>
      {tab === 'fields' ? fieldsTab : benchTab}
      <div className="console-area" style={{ gridArea: 'console' }}>
        <ControlBar
          status={status}
          speed={speed}
          scaleLabel={tab === 'fields' ? `${S.scale}: ${formatQuantity(scene.timeScale ?? preview.timeScale, 't', 3)}` : es.ui.scales.realtime}
          seed={seed}
          time={formatQuantity(simTime, 't', 4)}
          rulerOn={false}
          showRuler={false}
          onRun={() => (status === 'running' || status === 'paused' ? stop() : start(false))}
          onPause={() => setStatus(status === 'paused' ? 'running' : 'paused')}
          onReset={stop}
          onSpeed={setSpeed}
          onStep={() => {
            const run = runRef.current;
            if (!run || statusRef.current !== 'paused') return;
            targetRef.current += (1 / 60) * scaleRef.current * speedRef.current;
            run.advance(20000, targetRef.current);
            processEvents(run);
          }}
          onInstant={() => start(true)}
          onRepeatSeed={() => seed !== null && start(false, seed)}
          onRuler={() => {}}
        />
        <Console
          scriptEnabled
          script={tab === 'fields' ? scene.script : scene.benchScript}
          onScript={(s) => setSceneState({ ...scene, ...(tab === 'fields' ? { script: s } : { benchScript: s }) })}
          output={output}
          onClearOutput={() => setOutput([])}
          onRun={() => start(false)}
          devices={tab === 'fields' ? ['selector', 'isotopes'] : ['generator']}
          levelConstants={tab === 'bench' ? { AREA: b.area, FRECUENCIA: b.f, OMEGA: 2 * Math.PI * b.f } : undefined}
          constants={c}
          errorLine={null}
          readOnly={locked}
          sig={sig}
          onVerify={(m) => setOutput((o) => [...o, m])}
        />
      </div>
    </div>
  );
}

function Properties(props: { item: SbItem; onChange: (p: Partial<SbItem>) => void; onDelete: () => void; onDuplicate: () => void; locked: boolean }) {
  const F = S.fields;
  const i = props.item;
  const cmF = (label: string, v: number, key: string) => (
    <NumberField key={key} label={label} value={Number((v * 100).toFixed(2))} onChange={(x) => props.onChange({ [key]: x / 100 } as Partial<SbItem>)} />
  );
  return (
    <div className="stack">
      <div className="field">
        <label htmlFor="sb-name">{S.name}</label>
        <input
          id="sb-name"
          className="input"
          maxLength={12}
          defaultValue={i.id}
          key={i.id}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v && v !== i.id) props.onChange({ id: v });
          }}
        />
      </div>
      {i.kind === 'charge' && (
        <>
          <NumberField label={F.q} value={i.q} min={-10} max={10} onChange={(q) => props.onChange({ q: Math.round(q * 10) / 10 })} />
          {cmF(F.x, i.x, 'x')}
          {cmF(F.y, i.y, 'y')}
        </>
      )}
      {i.kind === 'capacitor' && (
        <>
          {cmF(F.x, i.cx, 'cx')}
          {cmF(F.y, i.cy, 'cy')}
          {cmF(F.L, i.L, 'L')}
          {cmF(F.d, i.d, 'd')}
          <NumberField label={F.angle} value={i.angle} onChange={(a) => props.onChange({ angle: a })} />
          <NumberField label={F.V} value={i.V} min={0} max={100000} onChange={(V) => props.onChange({ V })} />
          <Select label={F.positive} value={i.positive} options={(['superior', 'inferior'] as const).map((v) => ({ value: v, label: es.ui.inventory.plateOptions[v] }))} onChange={(v) => props.onChange({ positive: v })} />
        </>
      )}
      {(i.kind === 'magnet' || i.kind === 'electromagnet') && (
        <>
          {cmF(F.x0, i.x0, 'x0')}
          {cmF(F.y0, i.y0, 'y0')}
          {cmF(F.x1, i.x1, 'x1')}
          {cmF(F.y1, i.y1, 'y1')}
          <NumberField label={F.bmag} value={i.bmag} min={0} max={2000} onChange={(v) => props.onChange({ bmag: v })} />
          {i.kind === 'magnet' ? (
            <Select label={F.sense} value={i.sense} options={(['out', 'in'] as const).map((v) => ({ value: v, label: es.ui.inventory.senseOptions[v] }))} onChange={(v) => props.onChange({ sense: v })} />
          ) : (
            <Select label={F.polarity} value={String(i.polarity)} options={['1', '-1'].map((v) => ({ value: v, label: S.polarityOptions[v] }))} onChange={(v) => props.onChange({ polarity: v === '-1' ? -1 : 1 })} />
          )}
        </>
      )}
      {i.kind === 'shield' && (
        <>
          {cmF(F.x0, i.x0, 'x0')}
          {cmF(F.y0, i.y0, 'y0')}
          {cmF(F.x1, i.x1, 'x1')}
          {cmF(F.y1, i.y1, 'y1')}
          <NumberField label={F.thickness} value={i.thickness * 1000} min={1} max={20} onChange={(v) => props.onChange({ thickness: v / 1000 })} />
        </>
      )}
      {i.kind === 'receiver' && (
        <>
          {cmF(F.x0, i.x0, 'x0')}
          {cmF(F.y0, i.y0, 'y0')}
          {cmF(F.x1, i.x1, 'x1')}
          {cmF(F.y1, i.y1, 'y1')}
        </>
      )}
      {i.kind === 'detector' && (
        <>
          {cmF(F.x, i.ax, 'ax')}
          {cmF(F.y, i.ay, 'ay')}
          {cmF(F.x2, i.bx, 'bx')}
          {cmF(F.y2, i.by, 'by')}
        </>
      )}
      {i.kind === 'wall' && (
        <p className="muted">
          {i.points.length} · {i.points.map((p) => `(${formatCm(p.x)}; ${formatCm(p.y)})`).join(' ')}
        </p>
      )}
      {i.kind === 'emitter' && (
        <>
          {cmF(F.x, i.x, 'x')}
          {cmF(F.y, i.y, 'y')}
          <NumberField label={F.angle} value={i.angle} onChange={(a) => props.onChange({ angle: a })} />
          <Select label={F.species} value={i.species} options={Object.entries(S.species).map(([value, label]) => ({ value: value as typeof i.species, label }))} onChange={(v) => props.onChange({ species: v })} />
          {i.species === 'custom' && (
            <>
              <NumberField label={F.chargeE} value={i.chargeE} min={-10} max={10} onChange={(v) => props.onChange({ chargeE: Math.round(v) || 1 })} />
              <NumberField label={F.massU} value={i.massU} min={0.00054858} max={300} onChange={(v) => props.onChange({ massU: v })} />
            </>
          )}
          <Select label={F.speedMode} value={i.speedMode} options={(['vacc', 'speed'] as const).map((v) => ({ value: v, label: S.speedModes[v] }))} onChange={(v) => props.onChange({ speedMode: v })} />
          {i.speedMode === 'vacc' ? (
            <NumberField label={F.vacc} value={i.vacc} min={0} max={1e6} onChange={(v) => props.onChange({ vacc: v })} />
          ) : (
            <NumberField label={F.speed} value={i.speed} min={0} max={3e8} onChange={(v) => props.onChange({ speed: v })} />
          )}
          <NumberField label={F.count} value={i.count} min={1} max={50} onChange={(v) => props.onChange({ count: Math.round(v) })} />
          <NumberField label={F.interval} value={i.interval} min={0} max={1e6} onChange={(v) => props.onChange({ interval: v })} />
          <NumberField label={F.spread} value={i.spread} min={0} max={20} onChange={(v) => props.onChange({ spread: v })} />
          <p className="muted">{formatQuantity(emitterSpeed(i, getConstants(useStore.getState().settings.constants)), 'v', 4)}</p>
        </>
      )}
      <div className="row">
        <Button small onClick={props.onDuplicate} disabled={props.locked}>
          {S.duplicate}
        </Button>
        <Button small variant="danger" onClick={props.onDelete} disabled={props.locked}>
          {S.delete}
        </Button>
      </div>
    </div>
  );
}
