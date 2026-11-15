/** Panel de Telemetría y modo docente (sección 16). Todo se calcula en el navegador. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { CODATA } from '../../core/constants';
import { FieldSystem } from '../../core/fields';
import { formatFixed } from '../../core/format';
import { LEVEL_IDS, defaultConfig, type LevelId, type ParticleLevel } from '../../core/level';
import {
  HEAT_COLS,
  HEAT_ROWS,
  allLevelMetrics,
  bottleneck,
  cividis,
  courseSummary,
  heatmap,
  importCourse,
  levelMetrics,
  toCsv,
  type AttemptRecord,
  type CourseImport,
  type TelemetryFile,
} from '../../core/telemetry';
import { getLevel } from '../../data/levels';
import { es } from '../../i18n/es';
import { navigate } from '../../router';
import { passedCount, totalStars, useStore } from '../../store';
import { downloadFile, readFileText } from '../../store/persist';
import * as R from '../../render/scene';
import { allWalls } from '../../core/world';
import { Button, ConfirmButton, Panel, Tabs } from '../components/base';
import { CodeEditor } from '../components/CodeEditor';

const T = es.ui.telemetry;
const PARTICLE_LEVELS: LevelId[] = ['1-1', '1-2', '1-3', '2-1', '2-2', '2-3'];

function fmt(v: number | null | undefined, d = 1): string {
  return v === null || v === undefined || !Number.isFinite(v) ? '—' : formatFixed(v, d);
}

export function buildExport(): TelemetryFile {
  const s = useStore.getState();
  return {
    app: 'estacion-coulomb',
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    profile: { nickname: s.profile.nickname || null, courseCode: s.profile.courseCode || null },
    attempts: s.settings.includeScripts
      ? s.telemetry.attempts
      : s.telemetry.attempts.map((a) => (a.script ? { ...a, script: { ...a.script, source: undefined } } : a)),
    sessions: s.telemetry.sessions,
  };
}

function cellStyle(t: number | null): React.CSSProperties {
  if (t === null) return { background: '#1b2430', color: 'var(--texto-2)' };
  return { background: cividis(t), color: t > 0.55 ? '#05090d' : '#ffffff' };
}

function DifficultyMatrix({ attempts }: { attempts: AttemptRecord[] }) {
  const m = allLevelMetrics(attempts);
  const cols: ((id: LevelId) => number | null)[] = [
    (id) => (m[id].attempts ? m[id].attempts : null),
    (id) => m[id].attemptsToPass,
    (id) => (m[id].attempts ? m[id].activeMinutes : null),
    (id) => (m[id].attempts ? m[id].hints : null),
    (id) => (m[id].attempts ? m[id].scriptErrors : null),
    (id) => m[id].idp,
  ];
  const ranges = cols.map((f) => {
    const vals = LEVEL_IDS.map(f).filter((v): v is number => v !== null);
    return vals.length ? [Math.min(...vals), Math.max(...vals)] : [0, 0];
  });
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="data-table">
        <thead>
          <tr>
            <th />
            {T.columns.map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {LEVEL_IDS.map((id) => (
            <tr key={id}>
              <th>
                {id} {es.levels[id].name}
              </th>
              {cols.map((f, j) => {
                const v = f(id);
                const [lo, hi] = ranges[j];
                const t = v === null ? null : hi > lo ? (v - lo) / (hi - lo) : 0.5;
                const label = v === null ? '—' : j === 5 && !m[id].solved ? `${fmt(v, 2)} (${T.unsolved})` : fmt(v, j === 2 || j === 5 ? 2 : 0);
                return (
                  <td key={j} className="heat-cell" style={cellStyle(t)}>
                    {label}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="help">{T.legend}</p>
    </div>
  );
}

function HeatCanvas({ levelId, points }: { levelId: LevelId; points: { x: number; y: number }[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const level = getLevel(levelId) as ParticleLevel;
    const dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth;
    const h = cv.clientHeight;
    cv.width = w * dpr;
    cv.height = h * dpr;
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const P = R.readPalette();
    const v = R.fitView(w, h, level.world);
    const scene = level.buildScene(defaultConfig(level), CODATA, 1);
    const field = new FieldSystem(scene.sources, CODATA.k);
    R.drawBackground(ctx, v, level.world, P);
    R.drawWalls(ctx, v, allWalls(scene), P);
    R.drawCapacitors(ctx, v, field, P);
    R.drawReceivers(ctx, v, scene, P, {}, 0);
    R.drawDetectors(ctx, v, scene, P, {}, 0);
    R.drawEmitter(ctx, v, level.emitter, P);
    R.drawAnchors(ctx, v, level.anchors, new Set(), P, null, false);
    const g = heatmap(points, level.world);
    const cw = (level.world.w / HEAT_COLS) * v.scale;
    const ch = (level.world.h / HEAT_ROWS) * v.scale;
    for (let r = 0; r < HEAT_ROWS; r++) {
      for (let c = 0; c < HEAT_COLS; c++) {
        const val = g[r * HEAT_COLS + c];
        if (val <= 0) continue;
        ctx.globalAlpha = 0.15 + 0.75 * val;
        ctx.fillStyle = cividis(val);
        ctx.fillRect(R.sx(v, (c * level.world.w) / HEAT_COLS), R.sy(v, ((r + 1) * level.world.h) / HEAT_ROWS), cw + 0.5, ch + 0.5);
      }
    }
    ctx.globalAlpha = 1;
  }, [levelId, points]);
  return <canvas ref={ref} style={{ width: '100%', height: 360 }} role="img" aria-label={`${T.views.heat} ${levelId}`} />;
}

function HeatView({ attempts }: { attempts: AttemptRecord[] }) {
  const [lv, setLv] = useState<LevelId>('1-3');
  const list = attempts.filter((a) => a.levelId === lv);
  const points = list.flatMap((a) => a.failurePoints);
  return (
    <div className="stack">
      <label className="row">
        {T.heatSelect}
        <select className="input" value={lv} onChange={(e) => setLv(e.target.value as LevelId)}>
          {PARTICLE_LEVELS.map((id) => (
            <option key={id} value={id}>
              {id} {es.levels[id].name}
            </option>
          ))}
        </select>
      </label>
      <HeatCanvas levelId={lv} points={points} />
      <p className="muted">{T.heatCaption(points.length, list.length)}</p>
    </div>
  );
}

function CausesView({ attempts }: { attempts: AttemptRecord[] }) {
  return (
    <div className="stack">
      {LEVEL_IDS.map((id) => {
        const counts: Record<string, number> = {};
        for (const a of attempts) if (a.levelId === id && a.cause && a.result !== 'success') counts[a.cause] = (counts[a.cause] ?? 0) + 1;
        const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
        if (!entries.length) return null;
        const max = entries[0][1];
        return (
          <div key={id}>
            <strong>
              {id} {es.levels[id].name}
            </strong>
            <div className="bars">
              {entries.map(([c, n]) => (
                <div key={c} className="row" style={{ flexWrap: 'nowrap' }}>
                  <span style={{ width: 140, flex: 'none' }}>{c}</span>
                  <div className="bar" style={{ width: `${(70 * n) / max}%` }} aria-hidden="true" />
                  <span>{n}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CurveView({ attempts }: { attempts: AttemptRecord[] }) {
  const [lv, setLv] = useState<LevelId>('1-1');
  const list = attempts.filter((a) => a.levelId === lv && a.result !== 'aborted');
  const W = 560;
  const H = 220;
  const maxX = Math.max(5, list.length);
  const maxY = Math.max(10, ...list.map((a) => a.thinkingSeconds));
  const color = (r: string) => (r === 'success' ? 'var(--fosforo)' : r === 'scriptError' ? 'var(--ambar)' : 'var(--peligro)');
  return (
    <div className="stack">
      <label className="row">
        {T.heatSelect}
        <select className="input" value={lv} onChange={(e) => setLv(e.target.value as LevelId)}>
          {LEVEL_IDS.map((id) => (
            <option key={id} value={id}>
              {id} {es.levels[id].name}
            </option>
          ))}
        </select>
      </label>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: W, background: '#04080c' }} role="img" aria-label={T.views.curve}>
        <line x1="30" y1={H - 20} x2={W - 10} y2={H - 20} stroke="var(--borde-fuerte)" />
        <line x1="30" y1="10" x2="30" y2={H - 20} stroke="var(--borde-fuerte)" />
        {list.map((a, i) => (
          <g key={a.id}>
            <circle
              cx={30 + ((W - 50) * (i + 1)) / maxX}
              cy={H - 20 - ((H - 40) * a.thinkingSeconds) / maxY}
              r="5"
              fill={color(a.result)}
            />
            <text x={30 + ((W - 50) * (i + 1)) / maxX} y={H - 6} fontSize="10" fill="var(--texto-3)" textAnchor="middle">
              {i + 1}
            </text>
          </g>
        ))}
        <text x="34" y="18" fontSize="10" fill="var(--texto-3)">
          {Math.round(maxY)} s
        </text>
      </svg>
      <p className="help">{T.curveCaption}</p>
      <div className="row">
        {(['success', 'failure', 'scriptError'] as const).map((r) => (
          <span key={r} className="row">
            <svg width="12" height="12" aria-hidden="true">
              <circle cx="6" cy="6" r="5" fill={color(r)} />
            </svg>
            {T.curveLegend[r]}
          </span>
        ))}
      </div>
    </div>
  );
}

function HypothesesView({ attempts }: { attempts: AttemptRecord[] }) {
  const list = attempts.filter((a) => a.hypothesis);
  return (
    <table className="data-table">
      <thead>
        <tr>
          {T.hypHeaders.map((h) => (
            <th key={h}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {list.map((a) => (
          <tr key={a.id}>
            <td>{a.levelId}</td>
            <td>{a.attemptNumber}</td>
            <td>{[a.hypothesis?.option, a.hypothesis?.text].filter(Boolean).join(' — ')}</td>
            <td>{es.ui.report.results[a.result]}</td>
            <td>{a.hypothesisMatched === null ? '—' : a.hypothesisMatched ? T.yes : T.no}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Teacher({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<CourseImport | null>(null);
  const [sort, setSort] = useState<'name' | 'idp' | 'passed'>('name');
  const [heatLv, setHeatLv] = useState<LevelId>('1-3');
  const [scriptLv, setScriptLv] = useState<LevelId>('2-3');
  const fileRef = useRef<HTMLInputElement>(null);
  const toast = useStore((s) => s.toast);
  const load = async (files: FileList | File[]) => {
    const inputs = await Promise.all(Array.from(files).map(async (f) => ({ name: f.name, text: await readFileText(f) })));
    const r = importCourse(inputs, data);
    r.invalid.forEach((n) => toast(T.invalidFile(n), 'warn'));
    r.duplicates.forEach((n) => toast(T.duplicateFile(n), 'warn'));
    setData(r);
  };
  const files = useMemo(() => data?.files ?? [], [data]);
  const students = useMemo(() => {
    const rows = files.map((f) => {
      const m = allLevelMetrics(f.data.attempts);
      return {
        name: f.data.profile.nickname || f.name || T.anonymous,
        m,
        idp: LEVEL_IDS.reduce((s, id) => s + (m[id].idp ?? 0), 0),
        passed: LEVEL_IDS.filter((id) => m[id].solved).length,
      };
    });
    return rows.sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name) : sort === 'idp' ? b.idp - a.idp : b.passed - a.passed));
  }, [files, sort]);
  const summary = useMemo(() => courseSummary(files.map((f) => f.data)), [files]);
  const maxIdp = Math.max(1, ...students.flatMap((s) => LEVEL_IDS.map((id) => s.m[id].idp ?? 0)));
  const courseBn = bottleneck(Object.fromEntries(summary.map((s) => [s.levelId, s.avgIdp])) as Record<LevelId, number | null>);
  const heatPoints = files.flatMap((f) => f.data.attempts.filter((a) => a.levelId === heatLv).flatMap((a) => a.failurePoints));
  const scripts = files
    .map((f) => {
      const ok = f.data.attempts.find((a) => a.levelId === scriptLv && a.result === 'success' && a.script?.source);
      return ok ? { name: f.data.profile.nickname || f.name, hash: ok.script!.hash, source: ok.script!.source! } : null;
    })
    .filter((x): x is { name: string; hash: string; source: string } => !!x);
  const groups = Object.values(
    scripts.reduce<Record<string, { names: string[]; source: string }>>((acc, s) => {
      (acc[s.hash] ??= { names: [], source: s.source }).names.push(s.name);
      return acc;
    }, {}),
  );
  return (
    <Panel title={T.teacherTitle}>
      <div
        className="stack"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (e.dataTransfer.files.length) void load(e.dataTransfer.files);
        }}
        style={{ border: '1px dashed var(--borde-fuerte)', padding: 12 }}
      >
        <p>{T.importHelp}</p>
        <div className="row">
          <Button onClick={() => fileRef.current?.click()}>{T.chooseFiles}</Button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files) void load(e.target.files);
              e.target.value = '';
            }}
          />
          <span className="muted">
            {T.students}: {files.length}
          </span>
          <span className="spacer" />
          <Button
            onClick={() =>
              downloadFile(
                'estacion-coulomb-analisis.json',
                JSON.stringify({ app: 'estacion-coulomb', kind: 'analysis', schemaVersion: 1, exportedAt: new Date().toISOString(), files: files.map((f) => f.data), summary }, null, 2),
              )
            }
            disabled={!files.length}
          >
            {T.exportAnalysis}
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              setData(null);
              onClose();
            }}
          >
            {T.closeAnalysis}
          </Button>
        </div>
      </div>
      {files.length > 0 && (
        <div className="stack" style={{ marginTop: 12 }}>
          <label className="row">
            {T.sortBy}
            <select className="input" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
              {(['name', 'idp', 'passed'] as const).map((k) => (
                <option key={k} value={k}>
                  {T.sortOptions[k]}
                </option>
              ))}
            </select>
          </label>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>{T.students}</th>
                  {LEVEL_IDS.map((id) => (
                    <th key={id}>{id}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {students.map((s, i) => (
                  <tr key={`${s.name}-${i}`}>
                    <th>{s.name}</th>
                    {LEVEL_IDS.map((id) => {
                      const v = s.m[id].idp;
                      return (
                        <td key={id} className="heat-cell" style={cellStyle(v === null ? null : v / maxIdp)}>
                          {v === null ? '—' : fmt(v, 1)} {s.m[id].solved ? '✓' : ''}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3>{T.perLevel}</h3>
          {courseBn && (
            <p className="warn">
              {T.courseBottleneck}: {courseBn} {es.levels[courseBn].name}
            </p>
          )}
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  {T.perLevelHeaders.map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {summary.map((s) => (
                  <tr key={s.levelId} style={s.levelId === courseBn ? { outline: '2px solid var(--ambar)' } : undefined}>
                    <td>{s.levelId}</td>
                    <td>{fmt(s.pctPassed, 0)}</td>
                    <td>{fmt(s.medianAttempts, 1)}</td>
                    <td>{fmt(s.medianMinutes, 1)}</td>
                    <td>{fmt(s.pctHint3, 0)}</td>
                    <td>{fmt(s.avgIdp, 2)}</td>
                    <td>{s.topCause ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3>{T.views.heat}</h3>
          <label className="row">
            {T.heatSelect}
            <select className="input" value={heatLv} onChange={(e) => setHeatLv(e.target.value as LevelId)}>
              {PARTICLE_LEVELS.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </label>
          <HeatCanvas levelId={heatLv} points={heatPoints} />
          <h3>{T.scripts}</h3>
          <label className="row">
            {T.heatSelect}
            <select className="input" value={scriptLv} onChange={(e) => setScriptLv(e.target.value as LevelId)}>
              {(['2-2', '2-3', '3-3'] as LevelId[]).map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </label>
          {groups.length === 0 && <p className="help">{T.noScripts}</p>}
          {groups.map((g, i) => (
            <div key={i} className="stack formula-card">
              <strong>{g.names.join(', ')}</strong>
              {g.names.length > 1 && <span className="warn">{T.sameScript(g.names.length)}</span>}
              <CodeEditor label={T.scripts} value={g.source} readOnly />
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

export default function Telemetry() {
  const attempts = useStore((s) => s.telemetry.attempts);
  const sessions = useStore((s) => s.telemetry.sessions);
  const progress = useStore((s) => s.progress);
  const [view, setView] = useState<'summary' | 'matrix' | 'heat' | 'causes' | 'curve' | 'hypotheses'>('summary');
  const [teacher, setTeacher] = useState(false);
  const metrics = useMemo(() => allLevelMetrics(attempts), [attempts]);
  const bn = bottleneck(Object.fromEntries(LEVEL_IDS.map((id) => [id, metrics[id].idp])) as Record<LevelId, number | null>);
  const activeMin = sessions.reduce((s, x) => s + x.activeSeconds, 0) / 60;
  const counted = attempts.filter((a) => a.result !== 'aborted').length;
  void levelMetrics;
  return (
    <div className="screen" id="main">
      <div className="screen-head">
        <Button onClick={() => navigate('/')}>{es.ui.campaign.back}</Button>
        <h1>{T.title}</h1>
        <span className="spacer" />
        <Button onClick={() => setTeacher(!teacher)} active={teacher}>
          {T.teacher}
        </Button>
      </div>
      <p className="help">{T.privacy}</p>
      {teacher ? (
        <Teacher onClose={() => setTeacher(false)} />
      ) : (
        <>
          <Tabs
            label={T.title}
            value={view}
            onChange={setView}
            tabs={(['summary', 'matrix', 'heat', 'causes', 'curve', 'hypotheses'] as const).map((id) => ({ id, label: T.views[id] }))}
          />
          <div style={{ marginTop: 12 }}>
            {view === 'summary' && (
              <>
                <div className="tiles">
                  <div className="tile">
                    <div className="muted">{T.passed}</div>
                    <div className="big">{passedCount(progress)}/9</div>
                  </div>
                  <div className="tile">
                    <div className="muted">{T.stars}</div>
                    <div className="big stars">{totalStars(progress)}/27</div>
                  </div>
                  <div className="tile">
                    <div className="muted">{T.activeTime}</div>
                    <div className="big">{T.minutes(formatFixed(activeMin, 1))}</div>
                  </div>
                  <div className="tile">
                    <div className="muted">{T.totalAttempts}</div>
                    <div className="big">{counted}</div>
                  </div>
                </div>
                <p className="warn">{bn ? T.bottleneck(bn, es.levels[bn].name) : T.noBottleneck}</p>
                {counted === 0 && <p className="help">{T.empty}</p>}
              </>
            )}
            {view === 'matrix' && <DifficultyMatrix attempts={attempts} />}
            {view === 'heat' && <HeatView attempts={attempts} />}
            {view === 'causes' && <CausesView attempts={attempts} />}
            {view === 'curve' && <CurveView attempts={attempts} />}
            {view === 'hypotheses' && <HypothesesView attempts={attempts} />}
          </div>
          <div className="row" style={{ marginTop: 16 }}>
            <Button onClick={() => downloadFile('estacion-coulomb-telemetria.json', JSON.stringify(buildExport(), null, 2))}>
              {T.exportJson}
            </Button>
            <Button onClick={() => downloadFile('estacion-coulomb-intentos.csv', toCsv(buildExport()), 'text/csv;charset=utf-8')}>
              {T.exportCsv}
            </Button>
            <ConfirmButton
              label={T.clear}
              confirmLabel={T.clearConfirm}
              onConfirm={() => {
                useStore.getState().clearTelemetry();
                useStore.getState().toast(T.cleared);
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}
