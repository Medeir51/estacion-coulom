/** Centro de Comando (sección 7.2). */
import { useRef } from 'react';
import { es } from '../../i18n/es';
import { navigate } from '../../router';
import { passedCount, totalStars, useStore } from '../../store';
import { Button, Modal } from '../components/base';

export default function Command() {
  const C = es.ui.command;
  const progress = useStore((s) => s.progress);
  const markWelcomed = useStore((s) => s.markWelcomed);
  const p = (id: '1-3' | '2-3' | '3-3') => !!progress.levels[id]?.passed;
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const cards = [
    { title: C.campaignTitle, sub: [C.campaignSub(passedCount(progress)), C.campaignStars(totalStars(progress))], to: '/campana' },
    { title: C.sandboxTitle, sub: [C.sandboxSub], to: '/sandbox' },
    { title: C.telemetryTitle, sub: [C.telemetrySub], to: '/telemetria' },
    { title: C.archiveTitle, sub: [C.archiveSub], to: '/archivo' },
  ];
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const cols = window.innerWidth >= 620 ? 2 : 1;
    const delta: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols };
    if (!(e.key in delta)) return;
    const j = i + delta[e.key];
    e.preventDefault();
    refs.current[(j + cards.length) % cards.length]?.focus();
  };
  return (
    <div className="screen" id="main">
      <div className="screen-head">
        <h1 className="glow" style={{ color: 'var(--fosforo)' }}>
          {es.ui.app.title}
        </h1>
        <span className="spacer" />
        <Button onClick={() => navigate('/perfil')}>{C.profile}</Button>
        <Button onClick={() => navigate('/ajustes')}>{C.settings}</Button>
      </div>
      <p className="status-line" aria-live="polite">
        {C.status(p('1-3'), p('2-3'), p('3-3'))}
      </p>
      <div className="cards" role="group" aria-label={es.ui.app.title}>
        {cards.map((c, i) => (
          <button
            key={c.to}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            className="card panel"
            onClick={() => navigate(c.to)}
            onKeyDown={(e) => onKey(e, i)}
          >
            <span className="corner-b" aria-hidden="true" />
            <h2>{c.title}</h2>
            {c.sub.map((s) => (
              <span key={s} className={s.startsWith('★') ? 'stars' : 'muted'}>
                {s}
              </span>
            ))}
          </button>
        ))}
      </div>
      <div className="row" style={{ marginTop: 16 }}>
        <Button onClick={() => navigate('/manual')}>{C.manual}</Button>
        <span className="spacer" />
        <span className="help">{es.ui.app.version}</span>
      </div>
      {!progress.welcomed && (
        <Modal title={C.welcomeTitle} onClose={markWelcomed}>
          {C.welcomeLines.map((l) => (
            <p key={l}>{l}</p>
          ))}
          <div className="modal-actions">
            <Button
              variant="primary"
              onClick={() => {
                markWelcomed();
                navigate('/nivel/1-1');
              }}
            >
              {C.welcomeStart}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
