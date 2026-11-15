/** Paneles del HUD: inventario, controles, misión, multímetro, visor de campo y barra de control (sección 8). */
import { useEffect, useRef, useState } from 'react';
import { generatorFrequency, usedCounts, type InventoryItem, type LevelConfig, type LevelDef } from '../../core/level';
import { es } from '../../i18n/es';
import { Button, ConfirmButton, Knob, Led, Panel, Select, Toggle } from '../components/base';
import type { Reading } from './readings';

const I = es.ui.inventory;

export function itemLabel(it: InventoryItem): string {
  return it.kind === 'charge' ? I.charge(it.value) : I.coil(it.value);
}

export function ItemIcon({ it }: { it: InventoryItem }) {
  if (it.kind === 'coil')
    return (
      <span className="inv-icon coil" aria-hidden="true">
        {it.value}
      </span>
    );
  return (
    <span className={`inv-icon ${it.value > 0 ? 'pos' : 'neg'}`} aria-hidden="true">
      {it.value > 0 ? '+' : '−'}
    </span>
  );
}

export interface Target {
  id: string;
  label: string;
  free: boolean;
}

export function Inventory(props: {
  level: LevelDef;
  cfg: LevelConfig;
  locked: boolean;
  targets: Target[];
  placing: string | null;
  focusTarget: string | null;
  onPointerPick: (itemId: string, e: React.PointerEvent) => void;
  onKeyPick: (itemId: string) => void;
  onFocusTarget: (id: string) => void;
  onPlace: (targetId: string) => void;
  onCancel: () => void;
  onRemove: (targetId: string) => void;
}) {
  const used = usedCounts(props.cfg);
  const listRef = useRef<HTMLDivElement>(null);
  const free = props.targets.filter((t) => t.free);
  useEffect(() => {
    if (props.placing) listRef.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus();
  }, [props.placing, props.focusTarget]);
  if (props.level.inventory.length === 0) return null;
  return (
    <Panel title={I.title}>
      {props.locked && <p className="help">{I.lockedRunning}</p>}
      {props.level.inventory.map((it) => {
        const left = it.count - (used[it.id] ?? 0);
        return (
          <button
            key={it.id}
            type="button"
            className="inv-item"
            disabled={props.locked || left <= 0}
            aria-label={I.take(itemLabel(it), left)}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              props.onPointerPick(it.id, e);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                props.onKeyPick(it.id);
              }
            }}
          >
            <ItemIcon it={it} />
            <span style={{ flex: 1 }}>{itemLabel(it)}</span>
            <span className="muted">{I.count(left)}</span>
          </button>
        );
      })}
      {props.placing && (
        <div
          className="anchor-list"
          role="listbox"
          aria-label={I.anchorsLabel}
          ref={listRef}
          onKeyDown={(e) => {
            const i = free.findIndex((t) => t.id === props.focusTarget);
            if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
              e.preventDefault();
              props.onFocusTarget(free[(i + 1) % free.length].id);
            } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
              e.preventDefault();
              props.onFocusTarget(free[(i - 1 + free.length) % free.length].id);
            } else if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              props.onCancel();
            }
          }}
        >
          <p className="help">{I.anchorsLabel}</p>
          {free.length === 0 && <p className="warn">{I.noFreeAnchor}</p>}
          {free.map((t) => (
            <button
              key={t.id}
              type="button"
              role="option"
              className="btn small"
              aria-selected={t.id === props.focusTarget}
              tabIndex={t.id === props.focusTarget ? 0 : -1}
              onClick={() => props.onPlace(t.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  props.onPlace(t.id);
                }
              }}
            >
              {t.label}
            </button>
          ))}
          <Button small onClick={props.onCancel}>
            {es.ui.app.cancel}
          </Button>
        </div>
      )}
      {Object.keys(props.cfg.placements).length > 0 && (
        <div className="stack" style={{ marginTop: 8 }}>
          <span className="muted">{I.placed}</span>
          {Object.entries(props.cfg.placements).map(([where, itemId]) => {
            const it = props.level.inventory.find((x) => x.id === itemId);
            if (!it) return null;
            return (
              <div key={where} className="row">
                <ItemIcon it={it} />
                <span style={{ flex: 1 }}>
                  {itemLabel(it)} · {where}
                </span>
                <Button small disabled={props.locked} aria-label={I.returnItem(itemLabel(it), where)} onClick={() => props.onRemove(where)}>
                  ×
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

export function Controls(props: {
  level: LevelDef;
  cfg: LevelConfig;
  locked: boolean;
  onControl: (id: string, v: number | string) => void;
}) {
  const { level, cfg } = props;
  if (level.knobs.length === 0 && level.selectors.length === 0) return null;
  return (
    <Panel title={I.controls}>
      {level.knobs.map((k) => (
        <Knob
          key={k.id}
          label={k.id === 'voltage' ? I.voltage : I.bmag}
          unit={k.unit}
          min={k.min}
          max={k.max}
          step={k.step}
          value={typeof cfg.controls[k.id] === 'number' ? (cfg.controls[k.id] as number) : k.default}
          disabled={props.locked}
          onChange={(v) => props.onControl(k.id, v)}
        />
      ))}
      {level.selectors.map((s) => {
        const value = String(cfg.controls[s.id] ?? s.default);
        if (s.id === 'gear' && level.kind === 'generator') {
          return (
            <Select
              key={s.id}
              label={I.gear}
              value={value}
              disabled={props.locked || s.locked}
              options={s.options.map((o) => ({
                value: o,
                label: I.gearOption(o, generatorFrequency(level, { ...cfg, controls: { ...cfg.controls, gear: o } })),
              }))}
              onChange={(v) => props.onControl(s.id, v)}
            />
          );
        }
        const labels = s.id === 'positivePlate' ? I.plateOptions : I.senseOptions;
        return (
          <Select
            key={s.id}
            label={s.id === 'positivePlate' ? I.positivePlate : I.bSense}
            value={value}
            disabled={props.locked}
            options={s.options.map((o) => ({ value: o, label: labels[o] ?? o }))}
            onChange={(v) => props.onControl(s.id, v)}
          />
        );
      })}
    </Panel>
  );
}

export interface LogEntry {
  n: number;
  result: string;
  cause: string;
  hypothesis: string | null;
  ghostIndex: number | null;
}

export function Mission(props: {
  level: LevelDef;
  conditions: boolean[] | null;
  hintsUsed: number;
  onHint: () => void;
  log: LogEntry[];
  onLogClick: (e: LogEntry) => void;
  teacher: boolean;
  onReference: () => void;
  onResetDraft: () => void;
}) {
  const T = es.levels[props.level.id];
  const M = es.ui.mission;
  const [warned, setWarned] = useState(false);
  const [showLog, setShowLog] = useState(false);
  return (
    <Panel title={M.title}>
      <p style={{ marginTop: 0 }}>{T.objective}</p>
      <ul style={{ listStyle: 'none', padding: 0, margin: '6px 0' }}>
        {T.conditions.map((c, i) => (
          <li key={c}>
            <span aria-hidden="true">{props.conditions?.[i] ? '☑' : '☐'}</span> {c}
          </li>
        ))}
      </ul>
      <p className="help" style={{ margin: '6px 0' }}>
        {M.challenge(T.challenge)}
      </p>
      <div className="stack">
        <div className="row">
          <strong>{M.hints(props.hintsUsed)}</strong>
          {props.hintsUsed < 3 && (
            <Button
              small
              onClick={() => {
                if (props.hintsUsed === 0 && !warned) setWarned(true);
                else props.onHint();
              }}
            >
              {M.showHint(props.hintsUsed + 1)}
            </Button>
          )}
        </div>
        {warned && props.hintsUsed === 0 && (
          <div className="warn">
            {M.hintWarning}{' '}
            <Button small onClick={props.onHint}>
              {M.showHint(1)}
            </Button>
          </div>
        )}
        {T.hints.slice(0, props.hintsUsed).map((h, i) => (
          <p key={i} style={{ margin: 0 }}>
            <strong className="warn">{M.hintLabel(i + 1)}:</strong> {h}
          </p>
        ))}
        <Button small onClick={() => setShowLog(!showLog)} aria-expanded={showLog}>
          {M.log}
        </Button>
        {showLog && (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {props.log.length === 0 && <li className="help">{M.logEmpty}</li>}
            {props.log.map((e) => (
              <li key={e.n}>
                <button type="button" className="btn small ghost" style={{ textAlign: 'left', textTransform: 'none' }} onClick={() => props.onLogClick(e)}>
                  {M.logItem(e.n, e.result)} · {e.cause}
                  {e.hypothesis ? ` · «${e.hypothesis}»` : ''}
                </button>
              </li>
            ))}
          </ul>
        )}
        {props.teacher && (
          <Button small onClick={props.onReference}>
            {M.reference}
          </Button>
        )}
        <ConfirmButton small label={es.ui.level.resetDraft} confirmLabel={es.ui.level.resetDraftConfirm} onConfirm={props.onResetDraft} />
      </div>
    </Panel>
  );
}

export function Multimeter(props: { reading: Reading | null; pins: { label: string; reading: Reading }[]; onRemovePin: (i: number) => void }) {
  const M = es.ui.multimeter;
  const [announce, setAnnounce] = useState('');
  return (
    <Panel title={M.title}>
      <div className="crt" style={{ padding: 6 }}>
        {props.reading ? (
          <>
            <div className="muted">{props.reading.title}</div>
            <dl className="readings">
              {props.reading.rows.map(([k, v]) => (
                <div key={k} style={{ display: 'contents' }}>
                  <dt>{k}</dt>
                  <dd className="glow">{v}</dd>
                </div>
              ))}
            </dl>
          </>
        ) : (
          <p className="help" style={{ margin: 0 }}>
            {M.pin}
          </p>
        )}
      </div>
      <Button
        small
        onClick={() => {
          const r = props.reading;
          setAnnounce(r ? `${r.title}. ${r.rows.map(([k, v]) => `${k}: ${v}`).join('. ')}` : M.pin);
        }}
        style={{ marginTop: 6 }}
      >
        {M.readAloud}
      </Button>
      <div className="sr-only" aria-live="polite">
        {announce}
      </div>
      {props.pins.length > 0 && (
        <div className="pins">
          {props.pins.map((p, i) => (
            <div className="pin" key={p.label}>
              <div className="row">
                <strong className="warn">{p.label}</strong>
                <span className="spacer" />
                <Button small aria-label={M.removePin(p.label)} onClick={() => props.onRemovePin(i)}>
                  ×
                </Button>
              </div>
              <dl className="readings">
                {p.reading.rows.map(([k, v]) => (
                  <div key={k} style={{ display: 'contents' }}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

export function FieldViewer(props: {
  on: boolean;
  lines: boolean;
  vectors: boolean;
  b: boolean;
  hideGhosts: boolean;
  onChange: (p: Partial<{ on: boolean; lines: boolean; vectors: boolean; b: boolean; hideGhosts: boolean }>) => void;
}) {
  const V = es.ui.viewer;
  return (
    <Panel title={V.title}>
      <div className="stack">
        <Button active={props.on} onClick={() => props.onChange({ on: !props.on })} aria-pressed={props.on}>
          <Led color={props.on ? 'green' : 'off'}>{V.toggle}</Led>
        </Button>
        <Toggle label={V.linesE} checked={props.lines} onChange={(v) => props.onChange({ lines: v })} />
        <Toggle label={V.vectorsE} checked={props.vectors} onChange={(v) => props.onChange({ vectors: v })} />
        <Toggle label={V.fieldB} checked={props.b} onChange={(v) => props.onChange({ b: v })} />
        <Toggle label={V.hideGhosts} checked={props.hideGhosts} onChange={(v) => props.onChange({ hideGhosts: v })} />
      </div>
    </Panel>
  );
}

export const SPEEDS = [0.25, 0.5, 1, 2, 4];

export function ControlBar(props: {
  status: 'idle' | 'running' | 'paused' | 'finished';
  speed: number;
  scaleLabel: string;
  seed: number | null;
  time: string;
  rulerOn: boolean;
  onRun: () => void;
  onPause: () => void;
  onReset: () => void;
  onSpeed: (s: number) => void;
  onStep: () => void;
  onInstant: () => void;
  onRepeatSeed: () => void;
  onRuler: () => void;
  showRuler: boolean;
}) {
  const C = es.ui.control;
  const running = props.status === 'running' || props.status === 'paused';
  const i = SPEEDS.indexOf(props.speed);
  return (
    <div className="control-bar" role="toolbar" aria-label={es.ui.control.toolbar}>
      <Button variant={running ? 'danger' : 'primary'} onClick={props.onRun}>
        {running ? C.stop : C.run}
      </Button>
      <Button onClick={props.onPause} disabled={!running}>
        {props.status === 'paused' ? C.resume : C.pause}
      </Button>
      <Button onClick={props.onReset}>{C.reset}</Button>
      <Button small onClick={() => props.onSpeed(SPEEDS[Math.max(0, i - 1)])} aria-label={C.slower} disabled={i <= 0}>
        −
      </Button>
      <span aria-live="polite">{C.speed(String(props.speed).replace('.', ','))}</span>
      <Button small onClick={() => props.onSpeed(SPEEDS[Math.min(SPEEDS.length - 1, i + 1)])} aria-label={C.faster} disabled={i >= SPEEDS.length - 1}>
        +
      </Button>
      <Button small onClick={props.onStep} disabled={props.status !== 'paused'}>
        {C.step}
      </Button>
      <Button onClick={props.onInstant} disabled={running}>
        {C.instant}
      </Button>
      {props.showRuler && (
        <Button small active={props.rulerOn} aria-pressed={props.rulerOn} onClick={props.onRuler}>
          {C.ruler}
        </Button>
      )}
      <span className="spacer" />
      <span className="muted">{C.t(props.time)}</span>
      <span className="muted">{props.scaleLabel}</span>
      {props.seed !== null && (
        <>
          <span className="muted">{C.seed(props.seed)}</span>
          <Button small onClick={props.onRepeatSeed} disabled={running}>
            {C.repeatSeed}
          </Button>
        </>
      )}
    </div>
  );
}
