/** Perfil (sección 7.10). */
import { useState } from 'react';
import { es } from '../../i18n/es';
import { navigate } from '../../router';
import { useStore } from '../../store';
import { Button, Panel } from '../components/base';

export default function Profile() {
  const T = es.ui.profile;
  const profile = useStore((s) => s.profile);
  const [nick, setNick] = useState(profile.nickname);
  const [course, setCourse] = useState(profile.courseCode);
  return (
    <div className="screen" id="main">
      <div className="screen-head">
        <Button onClick={() => navigate('/')}>{es.ui.campaign.back}</Button>
        <h1>{T.title}</h1>
      </div>
      <Panel title={T.title}>
        <p className="help">{T.help}</p>
        <div className="field">
          <label htmlFor="nick">{T.nickname}</label>
          <input id="nick" className="input" maxLength={24} value={nick} onChange={(e) => setNick(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="course">{T.course}</label>
          <input id="course" className="input" maxLength={20} value={course} onChange={(e) => setCourse(e.target.value)} />
        </div>
        <Button
          variant="primary"
          onClick={() => {
            useStore.getState().setProfile({ nickname: nick.trim().slice(0, 24), courseCode: course.trim().slice(0, 20) });
            useStore.getState().toast(T.saved);
          }}
        >
          {T.save}
        </Button>
      </Panel>
    </div>
  );
}
