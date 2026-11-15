/** Manual: cómo jugar, consola, convenciones y acerca de (sección 7.7). */
import { useState } from 'react';
import { REF_SCRIPT_22, REF_SCRIPT_23 } from '../../data/levels/lab2';
import { es } from '../../i18n/es';
import { navigate } from '../../router';
import { Button, Panel, Tabs } from '../components/base';
import { CodeEditor } from '../components/CodeEditor';
import { Reference } from '../hud/Console';

const EXAMPLES = [
  `Inicio\n    v <- raiz(2 * Q_E * 300 / M_E)\n    Escribir "v = ", v, " m/s"\nFinInicio\n`,
  REF_SCRIPT_22,
  REF_SCRIPT_23,
];

function CopyBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="stack" style={{ marginBottom: 12 }}>
      <CodeEditor label={es.ui.manual.title} value={code} readOnly />
      <Button
        small
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            setCopied(false);
          }
        }}
      >
        {copied ? es.ui.manual.copied : es.ui.manual.copy}
      </Button>
    </div>
  );
}

/** Diagrama de la regla de la mano derecha (v hacia arriba, B saliendo, F a la derecha). */
function RightHandDiagram() {
  return (
    <figure style={{ margin: '12px 0' }}>
      <svg width="260" height="170" viewBox="0 0 260 170" role="img" aria-label={es.manualContent.rhrCaption}>
        <defs>
          <marker id="ar" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 z" fill="currentColor" />
          </marker>
        </defs>
        <circle cx="100" cy="110" r="14" fill="none" stroke="var(--campo-b)" strokeWidth="2" />
        <circle cx="100" cy="110" r="4" fill="var(--campo-b)" />
        <text x="122" y="140" fill="var(--campo-b)" fontSize="13">{es.manualContent.rhrLabels.B}</text>
        <g color="var(--carga-pos)">
          <line x1="100" y1="96" x2="100" y2="30" stroke="currentColor" strokeWidth="2.5" markerEnd="url(#ar)" />
        </g>
        <text x="108" y="36" fill="var(--carga-pos)" fontSize="13">{es.manualContent.rhrLabels.v}</text>
        <g color="var(--fosforo)">
          <line x1="114" y1="110" x2="200" y2="110" stroke="currentColor" strokeWidth="2.5" markerEnd="url(#ar)" />
        </g>
        <text x="204" y="114" fill="var(--fosforo)" fontSize="13">{es.manualContent.rhrLabels.F}</text>
        <circle cx="60" cy="110" r="10" fill="var(--carga-pos)" />
        <text x="60" y="114" textAnchor="middle" fill="#fff" fontSize="13" fontWeight="700">+</text>
      </svg>
      <figcaption className="help">{es.manualContent.rhrCaption}</figcaption>
    </figure>
  );
}

export default function Manual() {
  const M = es.ui.manual;
  const C = es.manualContent;
  const [tab, setTab] = useState<'play' | 'console' | 'conventions' | 'about'>('play');
  return (
    <div className="screen" id="main">
      <div className="screen-head">
        <Button onClick={() => navigate('/')}>{es.ui.campaign.back}</Button>
        <h1>{M.title}</h1>
      </div>
      <Tabs
        label={M.title}
        value={tab}
        onChange={setTab}
        tabs={(['play', 'console', 'conventions', 'about'] as const).map((id) => ({ id, label: M.tabs[id] }))}
      />
      <div className="manual-text" style={{ marginTop: 12 }}>
        {tab === 'play' &&
          C.play.map((s) => (
            <Panel key={s.h} title={s.h} className="formula-card">
              {s.p.map((p) => (
                <p key={p}>{p}</p>
              ))}
            </Panel>
          ))}
        {tab === 'console' && (
          <>
            <Reference devices={[]} full />
            <div style={{ marginTop: 12 }}>
              {EXAMPLES.map((e) => (
                <CopyBlock key={e} code={e} />
              ))}
            </div>
          </>
        )}
        {tab === 'conventions' && (
          <Panel title={M.tabs.conventions}>
            {C.conventions.map((p) => (
              <p key={p}>{p}</p>
            ))}
            <RightHandDiagram />
          </Panel>
        )}
        {tab === 'about' && (
          <Panel title={M.tabs.about}>
            {C.about.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </Panel>
        )}
      </div>
    </div>
  );
}
