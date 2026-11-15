/** Mapa de campaña (sección 7.3). */
import { Fragment, useState } from 'react';
import { LEVEL_IDS, type LevelId } from '../../core/level';
import { es } from '../../i18n/es';
import { navigate } from '../../router';
import { isUnlocked, useStore } from '../../store';
import { Button, Stars } from '../components/base';

export default function Campaign() {
  const C = es.ui.campaign;
  const progress = useStore((s) => s.progress);
  const teacher = useStore((s) => s.settings.teacherMode);
  const [hover, setHover] = useState<LevelId | null>(null);
  return (
    <div className="screen" id="main">
      <div className="screen-head">
        <Button onClick={() => navigate('/')}>{C.back}</Button>
        <h1>{C.title}</h1>
      </div>
      <div className="campaign">
        {[1, 2, 3].map((lab) => (
          <div className="lab-col" key={lab}>
            <h2>{es.labs[lab].name}</h2>
            {LEVEL_IDS.filter((id) => id.startsWith(`${lab}-`)).map((id, i) => {
              const lp = progress.levels[id];
              const open = isUnlocked(id, progress, teacher);
              const state = lp?.passed ? C.passed : open ? C.available : C.locked;
              const name = es.levels[id].name;
              return (
                <Fragment key={id}>
                  {i > 0 && <div className={`wire ${open ? 'lit' : ''}`} aria-hidden="true" />}
                  <button
                    type="button"
                    className={`level-node ${lp?.passed ? 'passed' : ''}`}
                    aria-disabled={!open}
                    aria-label={C.levelAria(id, name, state)}
                    onClick={() => open && navigate(`/nivel/${id}`)}
                    onMouseEnter={() => setHover(id)}
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover(id)}
                    onBlur={() => setHover(null)}
                  >
                    <strong>
                      {open ? '' : C.lockIcon}
                      {id} · {name}
                    </strong>
                    <span className={lp?.passed ? 'ok' : open ? 'muted' : 'help'}>{state}</span>
                    <span className="row">
                      <Stars n={lp?.stars ?? 0} />
                      <span className="help">{C.attempts(lp?.attempts ?? 0)}</span>
                    </span>
                    <span className="level-objective">{hover === id ? es.levels[id].objective : ' '}</span>
                  </button>
                </Fragment>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
