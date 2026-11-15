/** Lienzo de simulación de partículas (sección 8.2): capa estática en caché y capa dinámica. */
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import type { FieldLine } from '../../core/fieldlines';
import type { FieldSystem } from '../../core/fields';
import type { Anchor } from '../../core/level';
import { allWalls, type Scene } from '../../core/world';
import type { AttemptRun } from '../../core/attempt';
import type { GhostPath } from '../../store';
import { es } from '../../i18n/es';
import * as R from '../../render/scene';

export interface CanvasModel {
  world: { w: number; h: number };
  scene: Scene;
  field: FieldSystem;
  emitter: { x: number; y: number; angle: number } | null;
  anchors: Anchor[];
  occupied: Set<string>;
  run: AttemptRun | null;
  viewer: { on: boolean; lines: boolean; vectors: boolean; b: boolean };
  hideGhosts: boolean;
  ghosts: GhostPath[];
  highlightGhost: number | null;
  fieldLines: FieldLine[];
  hotAnchor: string | null;
  dragging: boolean;
  hiddenCharge: string | null;
  pins: { x: number; y: number; label: string }[];
  ruler: { a: { x: number; y: number }; b: { x: number; y: number }; label: string } | null;
  flashes: Record<string, number>;
  sparks: R.Spark[];
  sig: number;
  zoom: number;
  pan: { x: number; y: number };
  ariaLabel: string;
  /** Mostrar estela de las partículas */
  trails: boolean;
  /** Dibujo adicional (Cámara de Pruebas: selección, manijas, emisores) */
  overlay?: (ctx: CanvasRenderingContext2D, v: R.View, P: R.Palette) => void;
}

export interface CanvasHandle {
  draw: () => void;
  clientToWorld: (cx: number, cy: number) => { x: number; y: number; inside: boolean } | null;
  view: () => R.View | null;
  element: () => HTMLCanvasElement | null;
}

export interface CanvasEvents {
  onPointerWorld?: (p: { x: number; y: number } | null) => void;
  onDown?: (p: { x: number; y: number }, e: React.PointerEvent<HTMLCanvasElement>) => void;
  onMove?: (p: { x: number; y: number }, e: React.PointerEvent<HTMLCanvasElement>) => void;
  onUp?: (p: { x: number; y: number }, e: React.PointerEvent<HTMLCanvasElement>) => void;
  onContext?: (p: { x: number; y: number }) => void;
  onWheel?: (p: { x: number; y: number }, deltaY: number) => void;
}

export const ParticleCanvas = forwardRef<CanvasHandle, { model: CanvasModel } & CanvasEvents>(function ParticleCanvas(props, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const modelRef = useRef(props.model);
  modelRef.current = props.model;
  const eventsRef = useRef<CanvasEvents>(props);
  eventsRef.current = props;
  const staticRef = useRef<{ canvas: HTMLCanvasElement; key: unknown[] } | null>(null);
  const viewRef = useRef<R.View | null>(null);
  const longPress = useRef<number | null>(null);

  const draw = () => {
    const cv = canvasRef.current;
    if (!cv) return;
    const m = modelRef.current;
    const dpr = window.devicePixelRatio || 1;
    const cssW = cv.clientWidth;
    const cssH = cv.clientHeight;
    if (cssW === 0 || cssH === 0) return;
    if (cv.width !== Math.round(cssW * dpr) || cv.height !== Math.round(cssH * dpr)) {
      cv.width = Math.round(cssW * dpr);
      cv.height = Math.round(cssH * dpr);
    }
    const v = R.fitView(cssW, cssH, m.world, m.zoom, m.pan);
    viewRef.current = v;
    const P = R.readPalette();
    // Capa estática
    const scene = m.run?.sim?.scene ?? m.scene;
    const key = [cssW, cssH, dpr, scene.walls, m.viewer.on, m.viewer.lines, m.viewer.vectors, m.fieldLines, m.zoom, m.pan.x, m.pan.y, P.hc, m.field];
    let st = staticRef.current;
    if (!st || st.key.length !== key.length || st.key.some((k, i) => k !== key[i])) {
      const c = st?.canvas ?? document.createElement('canvas');
      c.width = cv.width;
      c.height = cv.height;
      const sctx = c.getContext('2d')!;
      sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      R.drawBackground(sctx, v, m.world, P);
      R.drawWalls(sctx, v, allWalls(scene), P);
      if (m.emitter) R.drawEmitter(sctx, v, m.emitter, P);
      if (m.viewer.on) {
        sctx.fillStyle = 'rgba(0,0,0,0.3)';
        sctx.fillRect(0, 0, cssW, cssH);
        if (m.viewer.lines) R.drawFieldLines(sctx, v, m.fieldLines, P);
        if (m.viewer.vectors) R.drawFieldVectors(sctx, v, m.field, m.world, P);
      }
      st = { canvas: c, key };
      staticRef.current = st;
    }
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(st.canvas, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const now = performance.now();
    const field = m.run?.sim?.field ?? m.field;
    const regions = [
      ...field.sources.magnets,
      ...field.sources.electromagnets.map((e) => ({ ...e, Bz: e.polarity * e.Bmag })),
    ];
    R.drawBRegions(ctx, v, regions, P, m.viewer.on && m.viewer.b, m.sig);
    R.drawCapacitors(ctx, v, field, P);
    R.drawDetectors(ctx, v, scene, P, m.flashes, now);
    R.drawReceivers(ctx, v, scene, P, m.flashes, now);
    R.drawAnchors(ctx, v, m.anchors, m.occupied, P, m.hotAnchor, m.dragging);
    R.drawCharges(ctx, v, m.field, P, m.hiddenCharge ?? undefined);
    if (!m.hideGhosts) {
      const alphas = [0.3, 0.2, 0.1];
      m.ghosts.forEach((g, i) => {
        const hl = m.highlightGhost === i;
        for (const path of g.paths) R.drawPath(ctx, v, path, hl ? P.ambar : P.texto2, hl ? 0.8 : alphas[i] ?? 0.1, hl ? 2 : 1.5);
        for (const c of g.crashes) R.drawCross(ctx, R.sx(v, c.x), R.sy(v, c.y), P.peligro, 5, hl ? 0.9 : alphas[i] ?? 0.1);
      });
    }
    m.overlay?.(ctx, v, P);
    if (m.run?.sim) R.drawParticles(ctx, v, m.run.sim.particles, P, m.trails);
    R.drawSparks(ctx, v, m.sparks, now, P);
    R.drawPins(ctx, v, m.pins, P);
    if (m.ruler) R.drawRuler(ctx, v, m.ruler.a, m.ruler.b, P, m.ruler.label);
    R.drawScaleBar(ctx, v, P, es.ui.level.scaleBar);
  };

  const clientToWorld = (cx: number, cy: number) => {
    const cv = canvasRef.current;
    const v = viewRef.current;
    if (!cv || !v) return null;
    const r = cv.getBoundingClientRect();
    const px = cx - r.left;
    const py = cy - r.top;
    return { x: R.wx(v, px), y: R.wy(v, py), inside: px >= 0 && py >= 0 && px <= r.width && py <= r.height };
  };

  useImperativeHandle(ref, () => ({ draw, clientToWorld, view: () => viewRef.current, element: () => canvasRef.current }));

  useEffect(() => {
    const ro = new ResizeObserver(() => draw());
    if (canvasRef.current) ro.observe(canvasRef.current);
    return () => ro.disconnect();
  }, []);

  const world = (e: { clientX: number; clientY: number }) => {
    const w = clientToWorld(e.clientX, e.clientY);
    return w ? { x: w.x, y: w.y } : null;
  };

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={props.model.ariaLabel}
      onPointerMove={(e) => {
        const p = world(e);
        eventsRef.current.onPointerWorld?.(p);
        if (p) eventsRef.current.onMove?.(p, e);
        if (longPress.current && (Math.abs(e.movementX) > 2 || Math.abs(e.movementY) > 2)) {
          clearTimeout(longPress.current);
          longPress.current = null;
        }
      }}
      onPointerLeave={() => eventsRef.current.onPointerWorld?.(null)}
      onPointerDown={(e) => {
        const p = world(e);
        if (!p) return;
        if (e.pointerType === 'touch') {
          longPress.current = window.setTimeout(() => {
            longPress.current = null;
            eventsRef.current.onContext?.(p);
          }, 500);
        }
        eventsRef.current.onDown?.(p, e);
      }}
      onPointerUp={(e) => {
        if (longPress.current) {
          clearTimeout(longPress.current);
          longPress.current = null;
        }
        const p = world(e);
        if (p) eventsRef.current.onUp?.(p, e);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        const p = world(e);
        if (p) eventsRef.current.onContext?.(p);
      }}
      onWheel={(e) => {
        const p = world(e);
        if (p) eventsRef.current.onWheel?.(p, e.deltaY);
      }}
    />
  );
});
