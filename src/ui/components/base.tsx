/** Componentes base de la interfaz (sección 6.3). */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { es } from '../../i18n/es';
import { useStore } from '../../store';
import { sfx, unlockAudio } from '../../audio/sfx';

export function Panel(props: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section className={`panel ${props.className ?? ''}`} id={props.id} aria-label={typeof props.title === 'string' ? props.title : undefined}>
      <span className="corner-b" aria-hidden="true" />
      {props.title !== undefined && (
        <div className="panel-title">
          <h3 style={{ fontSize: 'inherit' }}>{props.title}</h3>
          {props.actions}
        </div>
      )}
      {props.children}
    </section>
  );
}

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  small?: boolean;
  active?: boolean;
  silent?: boolean;
};

export function Button({ variant = 'secondary', small, active, silent, className, onClick, ...rest }: BtnProps) {
  return (
    <button
      type="button"
      {...rest}
      className={`btn ${variant !== 'secondary' ? variant : ''} ${small ? 'small' : ''} ${active ? 'active' : ''} ${className ?? ''}`}
      onClick={(e) => {
        unlockAudio();
        if (!silent) sfx.click();
        onClick?.(e);
      }}
    />
  );
}

export function Led(props: { color: 'off' | 'green' | 'amber' | 'red'; children: ReactNode }) {
  return (
    <span className="led">
      <span className={`led-dot ${props.color}`} aria-hidden="true" />
      <span>{props.children}</span>
    </span>
  );
}

export function Toggle(props: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.checked}
      className="toggle"
      disabled={props.disabled}
      onClick={() => {
        unlockAudio();
        sfx.click();
        props.onChange(!props.checked);
      }}
    >
      <span className="toggle-track" aria-hidden="true">
        <span className="toggle-knob" />
      </span>
      <span className="toggle-state" aria-hidden="true">
        {props.checked ? es.ui.app.on : es.ui.app.off}
      </span>
      <span>{props.label}</span>
    </button>
  );
}

export function Tabs<T extends string>(props: {
  tabs: { id: T; label: string; disabled?: boolean }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const idx = props.tabs.findIndex((t) => t.id === props.value);
  return (
    <div className="tabs" role="tablist" aria-label={props.label}>
      {props.tabs.map((t, i) => (
        <button
          key={t.id}
          ref={(el) => {
            refs.current[i] = el;
          }}
          role="tab"
          type="button"
          className="tab"
          aria-selected={t.id === props.value}
          tabIndex={i === idx ? 0 : -1}
          disabled={t.disabled}
          onClick={() => props.onChange(t.id)}
          onKeyDown={(e) => {
            if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
            e.preventDefault();
            const dir = e.key === 'ArrowRight' ? 1 : -1;
            for (let k = 1; k <= props.tabs.length; k++) {
              const j = (i + dir * k + props.tabs.length) % props.tabs.length;
              if (!props.tabs[j].disabled) {
                props.onChange(props.tabs[j].id);
                refs.current[j]?.focus();
                break;
              }
            }
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** Ventana modal: se cierra con Esc y atrapa el foco. */
export function Modal(props: { title: string; onClose?: () => void; children: ReactNode; wide?: boolean; labelledBy?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const { onClose } = props;
  useEffect(() => {
    const prevFocus = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const focusables = () =>
      el
        ? Array.from(
            el.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'),
          ).filter((x) => !x.hasAttribute('disabled'))
        : [];
    // Se enfoca la ventana (no un botón) para que la tecla que la abrió no active un botón por accidente.
    el?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onClose) {
        e.stopPropagation();
        onClose();
      } else if (e.key === 'Tab') {
        const f = focusables();
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (document.activeElement === el) {
          e.preventDefault();
          (e.shiftKey ? last : first).focus();
        } else if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      prevFocus?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="modal-veil" onMouseDown={(e) => e.target === e.currentTarget && props.onClose?.()}>
      <div
        className={`modal ${props.wide ? 'wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={ref}
        tabIndex={-1}
      >
        <h2 id={titleId}>{props.title}</h2>
        {props.children}
      </div>
    </div>
  );
}

export function ToastHost() {
  const toasts = useStore((s) => s.ui.toasts);
  const dismiss = useStore((s) => s.dismissToast);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          <span>{t.text}</span>
          <button className="btn small ghost" type="button" onClick={() => dismiss(t.id)} aria-label={es.ui.app.close}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

export function CrtScreen(props: { children: ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={`crt ${props.className ?? ''}`} style={props.style}>
      {props.children}
    </div>
  );
}

/** Botón destructivo con confirmación en la página: cambia de texto durante 5 s. */
export function ConfirmButton(props: { label: string; confirmLabel: string; onConfirm: () => void; small?: boolean }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 5000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <Button
      variant="danger"
      small={props.small}
      onClick={() => {
        if (armed) {
          setArmed(false);
          props.onConfirm();
        } else setArmed(true);
      }}
    >
      {armed ? props.confirmLabel : props.label}
    </Button>
  );
}

export function Stars(props: { n: number }) {
  return (
    <span className="stars" aria-label={es.ui.campaign.starsAria(props.n)}>
      {'★'.repeat(props.n)}
      {'☆'.repeat(3 - props.n)}
    </span>
  );
}

/** Perilla: un input range accesible con pantalla digital y entrada de texto (sección 6.3). */
export function Knob(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  disabled?: boolean;
  onChange: (v: number) => void;
}) {
  const id = useId();
  const [text, setText] = useState<string | null>(null);
  const decimals = props.step < 1 ? (String(props.step).split('.')[1]?.length ?? 1) : 0;
  const clamp = (v: number) => {
    const r = Math.round(v / props.step) * props.step;
    return Math.min(props.max, Math.max(props.min, Number(r.toFixed(decimals))));
  };
  const frac = (props.value - props.min) / (props.max - props.min || 1);
  const shown = props.value.toFixed(decimals).replace('.', ',');
  return (
    <div className="knob">
      <div className="knob-dial" style={{ ['--angle' as string]: `${-135 + 270 * frac}deg` }} aria-hidden="true" />
      <label className="knob-label" htmlFor={id}>
        {props.label}
      </label>
      <div className="knob-controls">
        <input
          id={id}
          type="range"
          min={props.min}
          max={props.max}
          step={props.step}
          value={props.value}
          disabled={props.disabled}
          aria-valuetext={`${shown} ${props.unit}`}
          onChange={(e) => props.onChange(clamp(Number(e.target.value)))}
          onKeyDown={(e) => {
            if (!e.shiftKey) return;
            const delta =
              e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0;
            if (!delta) return;
            e.preventDefault();
            props.onChange(clamp(props.value + delta * props.step * 10));
          }}
        />
        <input
          className="knob-display"
          aria-label={`${props.label} (${props.unit}) · ${es.ui.inventory.knobType}`}
          value={text ?? `${shown}`}
          disabled={props.disabled}
          onFocus={() => setText(shown)}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            const v = Number((text ?? '').replace(',', '.'));
            if (Number.isFinite(v)) props.onChange(clamp(v));
            setText(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
        />
        <span>{props.unit}</span>
      </div>
    </div>
  );
}

export function Select<T extends string>(props: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{props.label}</label>
      <select
        id={id}
        className="input"
        value={props.value}
        disabled={props.disabled}
        onChange={(e) => props.onChange(e.target.value as T)}
      >
        {props.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function NumberField(props: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  const id = useId();
  const [text, setText] = useState<string | null>(null);
  return (
    <div className="field">
      <label htmlFor={id}>{props.label}</label>
      <input
        id={id}
        className="input"
        inputMode="decimal"
        value={text ?? String(props.value).replace('.', ',')}
        onFocus={() => setText(String(props.value).replace('.', ','))}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          let v = Number((text ?? '').replace(',', '.'));
          if (Number.isFinite(v)) {
            if (props.min !== undefined) v = Math.max(props.min, v);
            if (props.max !== undefined) v = Math.min(props.max, v);
            props.onChange(v);
          }
          setText(null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
      />
    </div>
  );
}
