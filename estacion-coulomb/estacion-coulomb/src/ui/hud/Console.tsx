/** Consola de Algoritmos: Guion, Calculadora y Referencia (secciones 8.5 y 10.11). */
import { useEffect, useMemo, useRef, useState } from 'react';
import { checkScript, consoleConstants, consoleFunctions } from '../../core/attempt';
import type { PhysConstants } from '../../core/constants';
import { formatQuantity } from '../../core/format';
import type { OutputLine } from '../../core/attempt';
import { TEMPLATE_IDS, templateSource, type TemplateId } from '../../data/templates';
import { es } from '../../i18n/es';
import type { Value } from '../../script/builtins';
import { DEVICE_FUNCTIONS, type DeviceGroup } from '../../script/devices';
import { calculate } from '../../script/interpreter';
import { useStore } from '../../store';
import { Button, Modal, Tabs } from '../components/base';
import { CodeEditor } from '../components/CodeEditor';

const T = es.ui.console;

export interface ConsoleProps {
  scriptEnabled: boolean;
  script: string;
  onScript: (s: string) => void;
  output: OutputLine[];
  onClearOutput: () => void;
  onRun: () => void;
  devices: DeviceGroup[];
  levelConstants?: Record<string, number>;
  constants: PhysConstants;
  errorLine: number | null;
  readOnly: boolean;
  sig: number;
  /** Mensaje en la salida del botón Verificar */
  onVerify?: (msg: OutputLine) => void;
}

export function Console(props: ConsoleProps) {
  const open = useStore((s) => s.ui.consoleOpen);
  const height = useStore((s) => s.ui.consoleHeight);
  const setUi = useStore((s) => s.setUi);
  const [tab, setTab] = useState<'script' | 'calc' | 'ref'>(props.scriptEnabled ? 'script' : 'calc');
  const [focusLine, setFocusLine] = useState<{ line: number; nonce: number } | null>(null);
  const [pendingTemplate, setPendingTemplate] = useState<TemplateId | null>(null);
  const [menu, setMenu] = useState(false);
  const outRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (outRef.current) outRef.current.scrollTop = outRef.current.scrollHeight;
  }, [props.output.length]);

  const startResize = (e: React.PointerEvent) => {
    const y0 = e.clientY;
    const h0 = height;
    const move = (ev: PointerEvent) => setUi({ consoleHeight: Math.min(480, Math.max(120, h0 + (y0 - ev.clientY))) });
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  if (!open) {
    return (
      <div className="console" style={{ padding: 4 }}>
        <div className="row">
          <Button small onClick={() => setUi({ consoleOpen: true })} aria-expanded={false}>
            {T.show}
          </Button>
        </div>
      </div>
    );
  }

  const applyTemplate = (id: TemplateId) => {
    props.onScript(templateSource(id, props.devices));
    setPendingTemplate(null);
  };

  return (
    <div className="console" style={{ height }}>
      <button
        className="console-resize"
        type="button"
        aria-label={T.resize}
        onPointerDown={startResize}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp') setUi({ consoleHeight: Math.min(480, height + 20) });
          if (e.key === 'ArrowDown') setUi({ consoleHeight: Math.max(120, height - 20) });
        }}
      />
      <div className="console-head">
        <h3 style={{ fontSize: 14 }}>{T.title}</h3>
        <Tabs
          label={T.title}
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'script', label: T.tabScript },
            { id: 'calc', label: T.tabCalc },
            { id: 'ref', label: T.tabRef },
          ]}
        />
        <span className="spacer" />
        <Button small onClick={() => setUi({ consoleOpen: false })} aria-expanded={true}>
          {T.hide}
        </Button>
      </div>
      {tab === 'script' &&
        (props.scriptEnabled ? (
          <div className="console-body" style={{ minHeight: 0 }}>
            <div className="stack" style={{ minHeight: 0 }}>
              <div className="row">
                <Button
                  small
                  onClick={() => {
                    const r = checkScript(props.script, props.devices, props.constants, props.levelConstants);
                    props.onVerify?.(
                      r.error
                        ? { t: 0, text: es.script.errorLine(r.error.code, r.error.line, r.error.message), kind: 'error' }
                        : { t: 0, text: es.script.syntaxOk, kind: 'out' },
                    );
                  }}
                >
                  {T.verify}
                </Button>
                <div style={{ position: 'relative' }}>
                  <Button small onClick={() => setMenu(!menu)} aria-expanded={menu} disabled={props.readOnly}>
                    {T.templates}
                  </Button>
                  {menu && (
                    <div className="stack panel" style={{ position: 'absolute', bottom: '110%', left: 0, zIndex: 30, minWidth: 220 }}>
                      {TEMPLATE_IDS.map((id) => (
                        <Button
                          small
                          key={id}
                          onClick={() => {
                            setMenu(false);
                            if (props.script.trim()) setPendingTemplate(id);
                            else applyTemplate(id);
                          }}
                        >
                          {T.templatesList[id]}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
                <Button small onClick={props.onClearOutput}>
                  {T.clearOutput}
                </Button>
              </div>
              <CodeEditor
                label={T.editorAria}
                value={props.script}
                onChange={props.onScript}
                errorLine={props.errorLine}
                onRun={props.onRun}
                readOnly={props.readOnly}
                focusLine={focusLine}
                style={{ flex: 1, minHeight: 60 }}
              />
            </div>
            <div className="output crt" ref={outRef} aria-label={T.output} aria-live="polite">
              {props.output.map((o, i) => {
                const m = o.kind === 'error' ? /línea (\d+)/.exec(o.text) : null;
                return (
                  <div key={i} className={o.kind === 'error' ? 'line-error' : o.kind === 'warn' ? 'line-warn' : undefined}>
                    {o.kind !== 'error' && `${T.timeTag(formatQuantity(o.t, 't', 3))} `}
                    {o.text}
                    {m && (
                      <>
                        {' '}
                        <button
                          type="button"
                          className="btn small ghost"
                          onClick={() => setFocusLine({ line: Number(m[1]), nonce: Date.now() })}
                        >
                          {es.script.goToLine(Number(m[1]))}
                        </button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <p className="help" style={{ padding: 8 }}>
            {es.script.noScriptLevel}
          </p>
        ))}
      {tab === 'calc' && <Calculator devices={props.devices} constants={props.constants} levelConstants={props.levelConstants} />}
      {tab === 'ref' && <Reference devices={props.devices} levelConstants={props.levelConstants} />}
      {pendingTemplate && (
        <Modal title={T.templates} onClose={() => setPendingTemplate(null)}>
          <p>{T.replaceConfirm}</p>
          <div className="modal-actions">
            <Button onClick={() => setPendingTemplate(null)}>{es.ui.app.cancel}</Button>
            <Button variant="primary" onClick={() => applyTemplate(pendingTemplate)}>
              {T.replaceYes}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Calculator(props: { devices: DeviceGroup[]; constants: PhysConstants; levelConstants?: Record<string, number> }) {
  const vars = useRef(new Map<string, Value>());
  const [history, setHistory] = useState<{ input: string; out: string; error: boolean }[]>([]);
  const [line, setLine] = useState('');
  const [hIdx, setHIdx] = useState<number | null>(null);
  const outRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (outRef.current) outRef.current.scrollTop = outRef.current.scrollHeight;
  }, [history.length]);
  const submit = () => {
    if (!line.trim()) return;
    const r = calculate(
      line,
      vars.current,
      consoleConstants(props.constants, props.levelConstants),
      consoleFunctions([], {}, () => 0),
    );
    const entry = r.ok
      ? { input: line, out: r.text, error: false }
      : { input: line, out: `${r.error.code} · ${r.error.message}`, error: true };
    setHistory((h) => [...h, entry].slice(-50));
    setLine('');
    setHIdx(null);
  };
  return (
    <div className="console-body" style={{ gridTemplateColumns: '1fr' }}>
      <div className="output crt calc-history" ref={outRef} aria-live="polite">
        {history.map((h, i) => (
          <div key={i}>
            <span className="muted">&gt; {h.input}</span>
            {'\n'}
            <span className={h.error ? 'bad' : 'ok'}>{h.out}</span>
          </div>
        ))}
      </div>
      <div className="row">
        <input
          className="input"
          style={{ flex: 1 }}
          aria-label={T.calcAria}
          placeholder={T.calcPlaceholder}
          value={line}
          data-editor="true"
          onChange={(e) => setLine(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
            const inputs = history.map((h) => h.input);
            if (e.key === 'ArrowUp' && inputs.length) {
              e.preventDefault();
              const i = hIdx === null ? inputs.length - 1 : Math.max(0, hIdx - 1);
              setHIdx(i);
              setLine(inputs[i]);
            }
            if (e.key === 'ArrowDown' && hIdx !== null) {
              e.preventDefault();
              const i = hIdx + 1;
              if (i >= inputs.length) {
                setHIdx(null);
                setLine('');
              } else {
                setHIdx(i);
                setLine(inputs[i]);
              }
            }
          }}
        />
        <Button small onClick={() => (vars.current = new Map())}>
          {T.clearVars}
        </Button>
      </div>
    </div>
  );
}

export function Reference(props: { devices: DeviceGroup[]; levelConstants?: Record<string, number>; full?: boolean }) {
  const R = es.reference;
  const devNames = useMemo(
    () => (props.full ? Object.keys(R.devices) : props.devices.flatMap((g) => DEVICE_FUNCTIONS[g])),
    [props.devices, props.full, R.devices],
  );
  const lc = props.full ? Object.keys(R.levelConstants) : Object.keys(props.levelConstants ?? {});
  return (
    <div className="output" style={{ whiteSpace: 'normal', margin: 6, overflow: 'auto' }}>
      {!props.full && <p className="help">{T.refIntro}</p>}
      <h3 style={{ fontSize: 13, margin: '6px 0' }}>{R.sections.syntax}</h3>
      <RefTable rows={R.syntax} />
      <h3 style={{ fontSize: 13, margin: '6px 0' }}>{R.sections.math}</h3>
      <RefTable rows={R.math} />
      <h3 style={{ fontSize: 13, margin: '6px 0' }}>{R.sections.constants}</h3>
      <RefTable rows={R.constants} />
      {devNames.length > 0 && (
        <>
          <h3 style={{ fontSize: 13, margin: '6px 0' }}>{R.sections.devices}</h3>
          <RefTable rows={devNames.map((n) => R.devices[n]).filter(Boolean)} />
        </>
      )}
      {lc.length > 0 && (
        <>
          <h3 style={{ fontSize: 13, margin: '6px 0' }}>{R.sections.levelConstants}</h3>
          <RefTable rows={lc.map((k) => [k, R.levelConstants[k] ?? ''] as [string, string])} />
        </>
      )}
    </div>
  );
}

function RefTable(props: { rows: [string, string][] }) {
  return (
    <table className="data-table">
      <tbody>
        {props.rows.map(([a, b]) => (
          <tr key={a}>
            <td>
              <code className="ok">{a}</code>
            </td>
            <td>{b}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
