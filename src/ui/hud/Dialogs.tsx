/** Ventanas de la partida: hipótesis, informe del intento, nivel superado, informe de misión y atajos (secciones 7.4–7.6, 11). */
import { useState } from 'react';
import type { Evaluation } from '../../core/evaluation';
import type { LevelConfig, LevelDef } from '../../core/level';
import { es } from '../../i18n/es';
import { Button, Modal } from '../components/base';
import { CodeEditor } from '../components/CodeEditor';
import { itemLabel } from './Panels';

export function HypothesisDialog(props: {
  level: LevelDef;
  onRun: (h: { option: string | null; text: string | null; index: number | null } | null) => void;
  onCancel: () => void;
}) {
  const H = es.ui.hypothesis;
  const opts = es.levels[props.level.id].hypothesis;
  const [sel, setSel] = useState<number | null>(null);
  const [text, setText] = useState('');
  return (
    <Modal title={H.title} onClose={props.onCancel}>
      <div className="stack" role="radiogroup" aria-label={H.title}>
        {opts.map((o, i) => (
          <label key={o} className="row" style={{ cursor: 'pointer' }}>
            <input type="radio" name="hyp" checked={sel === i} onChange={() => setSel(i)} />
            {o}
          </label>
        ))}
      </div>
      <div className="field" style={{ marginTop: 10 }}>
        <label htmlFor="hyp-text" className="sr-only">
          {H.placeholder}
        </label>
        <input
          id="hyp-text"
          className="input"
          maxLength={140}
          placeholder={H.placeholder}
          value={text}
          data-editor="true"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') props.onRun({ option: sel !== null ? opts[sel] : null, text: text.trim() || null, index: sel });
          }}
        />
      </div>
      <div className="modal-actions">
        <Button onClick={() => props.onRun(null)}>{H.skip}</Button>
        <Button
          variant="primary"
          onClick={() => props.onRun({ option: sel !== null ? opts[sel] : null, text: text.trim() || null, index: sel })}
        >
          {H.run}
        </Button>
      </div>
    </Modal>
  );
}

export function ReportPanel(props: {
  attempt: number;
  ev: Evaluation;
  hypothesis: { option: string | null; text: string | null } | null;
  matched: boolean | null;
  corner: 'tl' | 'tr' | 'bl' | 'br';
  hasNext: boolean;
  onAdjust: () => void;
  onReplay: () => void;
  onNext: () => void;
}) {
  const R = es.ui.report;
  const { ev } = props;
  const hypText = props.hypothesis ? [props.hypothesis.option, props.hypothesis.text].filter(Boolean).join(' — ') : null;
  return (
    <div className={`report ${props.corner}`} role="region" aria-label={R.header(props.attempt, R.results[ev.result])}>
      <h3 className={ev.result === 'success' ? 'ok' : 'bad'}>{R.header(props.attempt, R.results[ev.result])}</h3>
      <p style={{ margin: '4px 0' }}>{ev.message}</p>
      {hypText && (
        <p style={{ margin: '4px 0' }}>
          {R.yourHypothesis(hypText)} {props.matched === null ? '' : props.matched ? R.matched : R.notMatched}
        </p>
      )}
      {ev.details.length > 0 && (
        <p className="muted" style={{ margin: '4px 0' }}>
          {ev.details.map((d) => `${d.label}: ${d.value}`).join(' · ')}
        </p>
      )}
      {ev.ionRows && (
        <table>
          <thead>
            <tr>
              {R.ionHeaders.map((h, i) => (
                <th key={i}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ev.ionRows.map((r) => (
              <tr key={r.n}>
                <td>{r.n}</td>
                <td>{r.species}</td>
                <td>{r.flight}</td>
                <td>{r.polarity}</td>
                <td>{r.dest}</td>
                <td className={r.ok ? 'ok' : 'bad'}>{r.ok ? '✓' : '✗'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {ev.suggestion && (
        <p style={{ margin: '6px 0' }}>
          <strong className="warn">{R.suggestion}</strong> {ev.suggestion}
        </p>
      )}
      <div className="row" style={{ marginTop: 8 }}>
        <Button variant="primary" small onClick={props.onAdjust}>
          {R.adjust}
        </Button>
        <Button small onClick={props.onReplay} disabled={ev.result === 'scriptError'}>
          {R.replay}
        </Button>
        {ev.result === 'success' && props.hasNext && (
          <Button small onClick={props.onNext}>
            {R.next}
          </Button>
        )}
      </div>
    </div>
  );
}

export function SuccessDialog(props: {
  level: LevelDef;
  stars: number;
  hint3: boolean;
  challenge: boolean;
  attempts: number;
  time: string;
  hasNext: boolean;
  extra?: string | null;
  onNext: () => void;
  onMap: () => void;
  onStay: () => void;
}) {
  const S = es.ui.success;
  const T = es.levels[props.level.id];
  return (
    <Modal title={`${S.title} · ${props.level.id} ${T.name}`} onClose={props.onStay}>
      {props.extra && <p className="ok glow">{props.extra}</p>}
      <ul style={{ listStyle: 'none', padding: 0 }}>
        <li className="stars">{S.star1}</li>
        <li className={props.stars >= 2 ? 'stars' : 'muted'}>{props.stars >= 2 ? S.star2 : S.star2no}</li>
        <li className={props.stars >= 3 ? 'stars' : 'muted'}>{props.stars >= 3 ? S.star3(T.challenge) : S.star3no(T.challenge)}</li>
      </ul>
      <p className="muted">
        {S.attempts(props.attempts)} · {S.time(props.time)}
      </p>
      <h3 style={{ fontSize: 14, margin: '8px 0 4px' }}>{S.concept}</h3>
      <p>{T.concept}</p>
      <div className="modal-actions">
        <Button onClick={props.onStay}>{S.stay}</Button>
        <Button onClick={props.onMap}>{S.map}</Button>
        {props.hasNext && (
          <Button variant="primary" onClick={props.onNext}>
            {S.next}
          </Button>
        )}
      </div>
    </Modal>
  );
}

export function BriefingDialog(props: { level: LevelDef; onStart: () => void }) {
  const L = es.ui.level;
  const T = es.levels[props.level.id];
  return (
    <Modal title={`${L.briefingTitle} · ${props.level.id} ${T.name}`} onClose={props.onStart}>
      <p>{T.story}</p>
      <h3 style={{ fontSize: 14, margin: '10px 0 4px' }}>{L.objective}</h3>
      <p>{T.objective}</p>
      <h3 style={{ fontSize: 14, margin: '10px 0 4px' }}>{L.newControls}</h3>
      <p>{T.newControls}</p>
      <div className="modal-actions">
        <Button variant="primary" onClick={props.onStart}>
          {L.start}
        </Button>
      </div>
    </Modal>
  );
}

export function ShortcutsDialog(props: { onClose: () => void }) {
  return (
    <Modal title={es.ui.level.shortcutsTitle} onClose={props.onClose}>
      <table className="data-table">
        <tbody>
          {es.ui.level.shortcuts.map(([k, d]) => (
            <tr key={k}>
              <td>
                <kbd>{k}</kbd>
              </td>
              <td>{d}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="modal-actions">
        <Button onClick={props.onClose}>{es.ui.app.close}</Button>
      </div>
    </Modal>
  );
}

export function ReferenceDialog(props: { level: LevelDef; onApply: (cfg: LevelConfig) => void; onClose: () => void }) {
  const M = es.ui.mission;
  const show = (cfg: LevelConfig) => (
    <div className="stack">
      {Object.entries(cfg.placements).map(([k, v]) => {
        const it = props.level.inventory.find((x) => x.id === v);
        return <div key={k}>{`${k}: ${it ? itemLabel(it) : v}`}</div>;
      })}
      {Object.entries(cfg.controls).map(([k, v]) => (
        <div key={k}>{`${k}: ${v}`}</div>
      ))}
      {cfg.script && <CodeEditor label={M.referenceTitle} value={cfg.script} readOnly style={{ maxHeight: 260 }} />}
      <Button small onClick={() => props.onApply(cfg)}>
        {M.referenceApply}
      </Button>
    </div>
  );
  return (
    <Modal title={M.referenceTitle} onClose={props.onClose} wide>
      {show(props.level.reference)}
      {props.level.altReference && (
        <>
          <h3 style={{ fontSize: 14, margin: '12px 0 6px' }}>{M.altReference}</h3>
          {show(props.level.altReference)}
        </>
      )}
      <div className="modal-actions">
        <Button onClick={props.onClose}>{es.ui.app.close}</Button>
      </div>
    </Modal>
  );
}

export function CreditsDialog(props: { stars: number; time: string; onClose: () => void }) {
  const S = es.ui.success;
  return (
    <Modal title={S.creditsTitle} onClose={props.onClose}>
      <p className="ok glow">{S.credits(props.stars, props.time)}</p>
      <p className="muted">{S.creditsBy}</p>
      <div className="modal-actions">
        <Button variant="primary" onClick={props.onClose}>
          {es.ui.app.close}
        </Button>
      </div>
    </Modal>
  );
}
