/** Banco del generador: vista lateral, ranuras del rotor y osciloscopio (sección 14). */
import { forwardRef, useImperativeHandle, useRef } from 'react';
import type { AttemptRun } from '../../core/attempt';
import { profileAt } from '../../core/generator';
import { es } from '../../i18n/es';
import { drawGeneratorSide, drawScope } from '../../render/generator';
import { readPalette } from '../../render/scene';

export interface GenModel {
  B0: number;
  f: number;
  nTotal: number;
  load: 'lamp' | 'servers';
  servers: number;
  band: [number, number] | null;
  tripV: number | null;
  showB: boolean;
  duration: number;
  run: AttemptRun | null;
  loadOn: boolean;
  serversLit: number;
  /** Tiempo de animación (s) cuando no hay intento */
  idleTime: number;
  showLines: boolean;
}

export interface GenHandle {
  draw: () => void;
}

function fit(cv: HTMLCanvasElement): CanvasRenderingContext2D | null {
  const dpr = window.devicePixelRatio || 1;
  const w = cv.clientWidth;
  const h = cv.clientHeight;
  if (!w || !h) return null;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
  }
  const ctx = cv.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

export const GeneratorStage = forwardRef<
  GenHandle,
  {
    model: GenModel;
    slots: { id: string; label: string | null; hot: boolean }[];
    locked: boolean;
    onRemove: (slot: string) => void;
    ariaLabel: string;
  }
>(function GeneratorStage(props, ref) {
  const topRef = useRef<HTMLCanvasElement>(null);
  const scopeRef = useRef<HTMLCanvasElement>(null);
  const modelRef = useRef(props.model);
  modelRef.current = props.model;
  const G = es.ui.generator;

  const draw = () => {
    const m = modelRef.current;
    const P = readPalette();
    const gen = m.run?.gen ?? null;
    const t = gen ? gen.t : m.idleTime;
    const B = gen ? profileAt(gen.cfg.profile, t).B : m.B0;
    const omega = 2 * Math.PI * m.f;
    const top = topRef.current ? fit(topRef.current) : null;
    if (top && topRef.current) {
      drawGeneratorSide(
        top,
        topRef.current.clientWidth,
        topRef.current.clientHeight,
        {
          theta: (omega * t) / 30,
          B,
          Bnom: m.B0,
          nActive: gen ? gen.nActive : m.nTotal,
          nTotal: m.nTotal,
          loadOn: m.loadOn,
          load: m.load,
          servers: m.servers,
          serversLit: m.serversLit,
          showLines: m.showLines,
          labels: {
            N: G.poleN,
            S: G.poleS,
            rotor: G.rotor,
            slow: G.slowAnim,
            turbine: G.turbine,
            load: m.load === 'lamp' ? G.lamp : G.servers(m.servers),
            turns: gen && gen.nActive !== m.nTotal ? G.activeTurns(gen.nActive, m.nTotal) : G.totalTurns(m.nTotal),
          },
        },
        P,
      );
    }
    const sc = scopeRef.current ? fit(scopeRef.current) : null;
    if (sc && scopeRef.current) {
      drawScope(
        sc,
        scopeRef.current.clientWidth,
        scopeRef.current.clientHeight,
        {
          emfRing: gen ? gen.emfRing : new Float64Array(500),
          sampleIndex: gen ? gen.sampleIndex : 0,
          cycles: gen ? gen.cycles : [],
          totalCycles: Math.round(m.duration * m.f),
          emfScale: Math.max(10, m.nTotal * m.B0 * 1.4 * 0.02 * omega, (gen?.cycles.reduce((a, c) => Math.max(a, c.rms), 0) ?? 0) * 1.6),
          band: m.band,
          tripV: m.tripV,
          showB: m.showB,
          Bnom: m.B0,
          labels: { emf: G.traceEmf, rms: G.traceRms, B: G.traceB, band: G.band, trip: G.trip },
        },
        P,
      );
    }
  };

  useImperativeHandle(ref, () => ({ draw }));

  return (
    <div className="gen-stage">
      <div className="gen-top crt">
        <div className="gen-canvas">
          <canvas ref={topRef} role="img" aria-label={props.ariaLabel} />
        </div>
        <div className="slots" role="group" aria-label={G.rotor}>
          {props.slots.map((s, i) => (
            <div
              key={s.id}
              data-slot={s.id}
              className={`slot ${s.label ? 'filled' : ''} ${s.hot ? 'hot' : ''}`}
              aria-label={es.ui.inventory.slotAria(s.id, !s.label)}
              onContextMenu={(e) => {
                e.preventDefault();
                if (s.label && !props.locked) props.onRemove(s.id);
              }}
            >
              <span className="muted">{G.slot(i + 1)}</span>
              {s.label ? (
                <span>
                  {s.label}{' '}
                  {!props.locked && (
                    <button
                      type="button"
                      className="btn small ghost"
                      style={{ minHeight: 0, padding: '0 4px' }}
                      aria-label={es.ui.inventory.returnItem(s.label, G.slot(i + 1))}
                      onClick={() => props.onRemove(s.id)}
                    >
                      ×
                    </button>
                  )}
                </span>
              ) : (
                <span className="help">—</span>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="gen-scope crt">
        <canvas ref={scopeRef} role="img" aria-label={G.scope} />
      </div>
    </div>
  );
});
