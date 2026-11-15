/** Archivo técnico (secciones 7.8 y 17). Se carga bajo demanda junto con KaTeX. */
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { useMemo, useState } from 'react';
import { es } from '../../i18n/es';
import { navigate } from '../../router';
import { Button, Panel } from '../components/base';

function Tex({ tex }: { tex: string }) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(tex, { displayMode: true, throwOnError: false, output: 'htmlAndMathml' });
    } catch {
      return tex;
    }
  }, [tex]);
  return <div className="formula-tex" dangerouslySetInnerHTML={{ __html: html }} />;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

export default function Archive() {
  const A = es.ui.archive;
  const [q, setQ] = useState('');
  const list = es.formulas.filter((f) => {
    if (!q.trim()) return true;
    const hay = norm(`${f.id} ${f.name} ${f.symbols} ${f.when} ${f.error} ${f.levels.join(' ')}`);
    return norm(q)
      .split(/\s+/)
      .every((w) => hay.includes(w));
  });
  return (
    <div className="screen" id="main">
      <div className="screen-head">
        <Button onClick={() => navigate('/')}>{es.ui.campaign.back}</Button>
        <h1>{A.title}</h1>
        <span className="spacer" />
        <label htmlFor="arch-q" className="sr-only">
          {A.search}
        </label>
        <input id="arch-q" className="input" placeholder={A.search} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {list.length === 0 && <p className="help">{A.noResults}</p>}
      {[1, 2, 3].map((lab) => {
        const items = list.filter((f) => f.lab === lab);
        if (!items.length) return null;
        return (
          <section key={lab} style={{ marginBottom: 16 }}>
            <h2 style={{ marginBottom: 8 }}>{es.labs[lab].name}</h2>
            {items.map((f) => (
              <article className="formula-card" key={f.id}>
                <h3>
                  {f.id} · {f.name}
                </h3>
                <Tex tex={f.tex} />
                <dl className="readings" style={{ gridTemplateColumns: 'auto 1fr' }}>
                  <dt>{A.symbols}</dt>
                  <dd style={{ textAlign: 'left', color: 'var(--texto)' }}>{f.symbols}</dd>
                  <dt>{A.when}</dt>
                  <dd style={{ textAlign: 'left', color: 'var(--texto)' }}>{f.when}</dd>
                  <dt>{A.error}</dt>
                  <dd style={{ textAlign: 'left' }} className="warn">
                    {f.error}
                  </dd>
                  <dt>{A.example}</dt>
                  <dd style={{ textAlign: 'left', color: 'var(--texto)' }}>{f.example}</dd>
                  <dt>{A.levels}</dt>
                  <dd style={{ textAlign: 'left' }}>
                    {f.levels.length
                      ? f.levels.map((l) => (
                          <a key={l} href={`#/nivel/${l}`} style={{ marginRight: 8 }}>
                            {l}
                          </a>
                        ))
                      : '—'}
                  </dd>
                </dl>
              </article>
            ))}
          </section>
        );
      })}
      <Panel title={A.constants}>
        <table className="data-table">
          <thead>
            <tr>
              {A.constHeaders.map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {es.constantsTable.map((r) => (
              <tr key={r[0]}>
                {r.map((c, i) => (
                  <td key={i}>{c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      <div style={{ height: 12 }} />
      <Panel title={A.simplifications}>
        <ol>
          {es.simplifications.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      </Panel>
    </div>
  );
}
