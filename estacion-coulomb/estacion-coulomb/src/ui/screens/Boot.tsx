/** Pantalla de arranque (sección 7.1). */
import { useEffect, useState } from 'react';
import { es } from '../../i18n/es';
import { prefersReducedMotion, useStore } from '../../store';

export default function Boot(props: { onDone: () => void }) {
  const settings = useStore((s) => s.settings);
  const reduce = prefersReducedMotion(settings);
  const lines = es.ui.boot.lines;
  const [n, setN] = useState(reduce ? lines.length : 1);
  const { onDone } = props;
  useEffect(() => {
    if (reduce) {
      const t = setTimeout(onDone, 500);
      return () => clearTimeout(t);
    }
    const timers = lines.map((_, i) => setTimeout(() => setN(i + 1), i * 280));
    const end = setTimeout(onDone, 1500);
    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(end);
    };
  }, [reduce, onDone, lines]);
  useEffect(() => {
    const skip = () => onDone();
    window.addEventListener('keydown', skip);
    return () => window.removeEventListener('keydown', skip);
  }, [onDone]);
  return (
    <div className="boot crt" onClick={onDone} role="status" aria-live="polite">
      {lines.slice(0, n).map((l, i) => (
        <div key={i} className={i === 0 && !reduce && settings.effects ? 'flicker glow' : 'glow'}>
          {l}
        </div>
      ))}
      <div className="help" style={{ marginTop: 24 }}>
        {es.ui.boot.skip}
      </div>
    </div>
  );
}
