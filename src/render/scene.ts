/** Dibujo de la escena de partículas en Canvas 2D (sección 6.6). Ningún módulo de física conoce píxeles. */
import { capacitorAxes, capacitorPlates, capacitorVn, shieldInner, type FieldSystem } from '../core/fields';
import type { FieldLine } from '../core/fieldlines';
import { formatQuantity } from '../core/format';
import type { Anchor } from '../core/level';
import { speciesColor } from '../core/species';
import type { Scene, SimParticle, Wall } from '../core/world';

export interface View {
  scale: number;
  ox: number;
  oy: number;
  w: number;
  h: number;
}

export function fitView(cssW: number, cssH: number, world: { w: number; h: number }, zoom = 1, pan = { x: 0, y: 0 }): View {
  const pad = 22;
  const scale = Math.max(1, Math.min((cssW - 2 * pad) / world.w, (cssH - 2 * pad) / world.h)) * zoom;
  return {
    scale,
    ox: (cssW - world.w * scale) / 2 + pan.x,
    oy: (cssH + world.h * scale) / 2 + pan.y,
    w: cssW,
    h: cssH,
  };
}

export const sx = (v: View, x: number) => v.ox + x * v.scale;
export const sy = (v: View, y: number) => v.oy - y * v.scale;
export const wx = (v: View, px: number) => (px - v.ox) / v.scale;
export const wy = (v: View, py: number) => (v.oy - py) / v.scale;

export interface Palette {
  fondo: string;
  panel: string;
  borde: string;
  bordeFuerte: string;
  texto: string;
  texto2: string;
  texto3: string;
  fosforo: string;
  ambar: string;
  peligro: string;
  campoE: string;
  campoB: string;
  pos: string;
  neg: string;
  cobre: string;
  vidrio: string;
  hc: boolean;
}

export function readPalette(): Palette {
  const cs = typeof document !== 'undefined' ? getComputedStyle(document.documentElement) : null;
  const v = (name: string, fb: string) => cs?.getPropertyValue(name).trim() || fb;
  return {
    fondo: v('--fondo', '#070B10'),
    panel: v('--panel', '#0D141C'),
    borde: v('--borde', '#2B3D52'),
    bordeFuerte: v('--borde-fuerte', '#5A7896'),
    texto: v('--texto', '#E6F1FF'),
    texto2: v('--texto-2', '#9FB3C8'),
    texto3: v('--texto-3', '#7C90A6'),
    fosforo: v('--fosforo', '#3DFC9C'),
    ambar: v('--ambar', '#FFB547'),
    peligro: v('--peligro', '#FF6B6B'),
    campoE: v('--campo-e', '#4FD8FF'),
    campoB: v('--campo-b', '#FF6BD6'),
    pos: v('--carga-pos', '#FF6B6B'),
    neg: v('--carga-neg', '#5B9BFF'),
    cobre: v('--cobre', '#D9894A'),
    vidrio: v('--vidrio', '#8FB8D8'),
    hc: document?.documentElement?.dataset?.contrast === 'high',
  };
}

const FONT = '12px "IBM Plex Mono", monospace';

function alpha(hex: string, a: number): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return hex;
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

export function drawBackground(ctx: CanvasRenderingContext2D, v: View, world: { w: number; h: number }, P: Palette) {
  ctx.fillStyle = P.fondo;
  ctx.fillRect(0, 0, v.w, v.h);
  ctx.fillStyle = '#05090d';
  ctx.fillRect(sx(v, 0), sy(v, world.h), world.w * v.scale, world.h * v.scale);
  ctx.lineWidth = 1;
  for (let cmx = 0; cmx <= Math.round(world.w * 100); cmx++) {
    ctx.strokeStyle = cmx % 5 === 0 ? 'rgba(90,120,150,0.18)' : 'rgba(90,120,150,0.07)';
    const x = Math.round(sx(v, cmx / 100)) + 0.5;
    ctx.beginPath();
    ctx.moveTo(x, sy(v, 0));
    ctx.lineTo(x, sy(v, world.h));
    ctx.stroke();
  }
  for (let cmy = 0; cmy <= Math.round(world.h * 100); cmy++) {
    ctx.strokeStyle = cmy % 5 === 0 ? 'rgba(90,120,150,0.18)' : 'rgba(90,120,150,0.07)';
    const y = Math.round(sy(v, cmy / 100)) + 0.5;
    ctx.beginPath();
    ctx.moveTo(sx(v, 0), y);
    ctx.lineTo(sx(v, world.w), y);
    ctx.stroke();
  }
  ctx.strokeStyle = P.borde;
  ctx.strokeRect(sx(v, 0), sy(v, world.h), world.w * v.scale, world.h * v.scale);
}

function bSymbol(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, out: boolean, color: string) {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  if (out) {
    ctx.beginPath();
    ctx.arc(x, y, Math.max(1.2, r * 0.28), 0, Math.PI * 2);
    ctx.fill();
  } else {
    const k = r * 0.62;
    ctx.beginPath();
    ctx.moveTo(x - k, y - k);
    ctx.lineTo(x + k, y + k);
    ctx.moveTo(x + k, y - k);
    ctx.lineTo(x - k, y + k);
    ctx.stroke();
  }
}

/** Regiones de campo B con su rejilla de ⊙/⊗ cada 2 cm. */
export function drawBRegions(
  ctx: CanvasRenderingContext2D,
  v: View,
  regions: { x0: number; y0: number; x1: number; y1: number; Bz: number; id: string }[],
  P: Palette,
  showLabel: boolean,
  sig = 4,
) {
  for (const r of regions) {
    const X = sx(v, r.x0);
    const Y = sy(v, r.y1);
    const W = (r.x1 - r.x0) * v.scale;
    const H = (r.y1 - r.y0) * v.scale;
    ctx.fillStyle = alpha(P.campoB, P.hc ? 0 : 0.08);
    ctx.fillRect(X, Y, W, H);
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = P.campoB;
    ctx.lineWidth = 1;
    ctx.strokeRect(X, Y, W, H);
    ctx.setLineDash([]);
    if (r.Bz !== 0) {
      const rad = Math.min(0.009 * v.scale, 3 + 4 * Math.min(1, Math.abs(r.Bz) / 0.3) + 2);
      const step = 0.02;
      const x0 = Math.ceil((r.x0 + 0.005) / step) * step;
      const y0 = Math.ceil((r.y0 + 0.005) / step) * step;
      for (let x = x0; x <= r.x1 - 0.004; x += step) {
        for (let y = y0; y <= r.y1 - 0.004; y += step) {
          bSymbol(ctx, sx(v, x), sy(v, y), rad, r.Bz > 0, alpha(P.campoB, 0.75));
        }
      }
    }
    if (showLabel) {
      ctx.font = FONT;
      ctx.fillStyle = P.campoB;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      const label = `B = ${formatQuantity(Math.abs(r.Bz), 'B', sig)} ${r.Bz > 0 ? '⊙' : r.Bz < 0 ? '⊗' : ''}`;
      ctx.fillStyle = 'rgba(5,9,13,0.8)';
      const w = ctx.measureText(label).width;
      ctx.fillRect(X + 4, Y + 4, w + 8, 18);
      ctx.fillStyle = P.campoB;
      ctx.fillText(label, X + 8, Y + 7);
    }
  }
}

export function drawWalls(ctx: CanvasRenderingContext2D, v: View, walls: Wall[], P: Palette) {
  for (const w of walls) {
    if (w.kind === 'plate' || w.kind === 'shield') continue;
    const ax = sx(v, w.ax);
    const ay = sy(v, w.ay);
    const bx = sx(v, w.bx);
    const by = sy(v, w.by);
    ctx.strokeStyle = w.kind === 'screen' ? P.texto2 : alpha(P.vidrio, P.hc ? 1 : 0.85);
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
    // Rayado diagonal
    const len = Math.hypot(bx - ax, by - ay);
    const n = Math.floor(len / 7);
    ctx.strokeStyle = alpha(P.vidrio, 0.4);
    ctx.lineWidth = 1;
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const px = ax + (bx - ax) * t;
      const py = ay + (by - ay) * t;
      ctx.beginPath();
      ctx.moveTo(px - 3, py + 3);
      ctx.lineTo(px + 3, py - 3);
      ctx.stroke();
    }
  }
  ctx.lineCap = 'butt';
}

export function drawCapacitors(ctx: CanvasRenderingContext2D, v: View, field: FieldSystem, P: Palette) {
  for (const c of field.sources.capacitors) {
    const plates = capacitorPlates(c);
    const vn = capacitorVn(c);
    const { nx, ny } = capacitorAxes(c);
    for (const side of ['superior', 'inferior'] as const) {
      const s = plates[side];
      ctx.strokeStyle = P.cobre;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(sx(v, s.ax), sy(v, s.ay));
      ctx.lineTo(sx(v, s.bx), sy(v, s.by));
      ctx.stroke();
      const positive = (side === 'superior') === vn > 0 && c.V !== 0;
      const sign = c.V === 0 ? '' : positive ? '+' : '−';
      if (sign) {
        const mx = (s.ax + s.bx) / 2 + (side === 'superior' ? 1 : -1) * 0.006 * nx;
        const my = (s.ay + s.by) / 2 + (side === 'superior' ? 1 : -1) * 0.006 * ny;
        ctx.font = 'bold 14px "IBM Plex Mono", monospace';
        ctx.fillStyle = positive ? P.pos : P.neg;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(sign, sx(v, mx), sy(v, my));
      }
    }
    ctx.font = FONT;
    ctx.fillStyle = P.cobre;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(c.id, sx(v, plates.superior.ax), sy(v, plates.superior.ay) - 6);
  }
  for (const s of field.sources.shields) {
    const inner = shieldInner(s);
    ctx.strokeStyle = P.cobre;
    ctx.lineWidth = Math.max(2, s.thickness * v.scale);
    const m = (s.thickness / 2) * v.scale;
    ctx.strokeRect(sx(v, s.x0) + m, sy(v, s.y1) + m, (s.x1 - s.x0) * v.scale - 2 * m, (s.y1 - s.y0) * v.scale - 2 * m);
    void inner;
  }
}

export function drawDetectors(
  ctx: CanvasRenderingContext2D,
  v: View,
  scene: Scene,
  P: Palette,
  flash: Record<string, number>,
  now: number,
) {
  for (const d of scene.detectors) {
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = P.texto;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sx(v, d.ax), sy(v, d.ay));
    ctx.lineTo(sx(v, d.bx), sy(v, d.by));
    ctx.stroke();
    ctx.setLineDash([]);
    const lit = (flash[d.id] ?? -1e9) > now - 150;
    const lx = sx(v, d.bx);
    const ly = sy(v, d.by) - 10;
    ctx.fillStyle = lit ? P.fosforo : '#233040';
    ctx.beginPath();
    ctx.arc(lx, ly, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = P.bordeFuerte;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.font = FONT;
    ctx.fillStyle = P.texto;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(d.id, lx, ly - 7);
  }
}

export function drawReceivers(
  ctx: CanvasRenderingContext2D,
  v: View,
  scene: Scene,
  P: Palette,
  flash: Record<string, number>,
  now: number,
) {
  for (const r of scene.receivers) {
    const lit = (flash[r.id] ?? -1e9) > now - 400;
    const X = sx(v, r.x0);
    const Y = sy(v, r.y1);
    const W = (r.x1 - r.x0) * v.scale;
    const H = (r.y1 - r.y0) * v.scale;
    ctx.save();
    if (!P.hc) {
      ctx.shadowColor = P.fosforo;
      ctx.shadowBlur = lit ? 16 : 6;
    }
    ctx.fillStyle = alpha(P.fosforo, lit ? 0.35 : 0.08);
    ctx.fillRect(X, Y, W, H);
    ctx.strokeStyle = P.fosforo;
    ctx.lineWidth = 2;
    ctx.strokeRect(X, Y, W, H);
    ctx.restore();
    ctx.font = FONT;
    ctx.fillStyle = P.fosforo;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(r.id, X + W / 2, Y - 3);
  }
}

export function drawEmitter(ctx: CanvasRenderingContext2D, v: View, e: { x: number; y: number; angle: number }, P: Palette) {
  const x = sx(v, e.x);
  const y = sy(v, e.y);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((-e.angle * Math.PI) / 180);
  ctx.fillStyle = '#2a3c52';
  ctx.strokeStyle = P.bordeFuerte;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.rect(-22, -7, 22, 14);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = P.ambar;
  ctx.fillRect(-3, -3, 4, 6);
  ctx.restore();
}

function hexagon(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i + Math.PI / 6;
    const px = x + r * Math.cos(a);
    const py = y + r * Math.sin(a);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

export function drawAnchors(
  ctx: CanvasRenderingContext2D,
  v: View,
  anchors: Anchor[],
  occupied: Set<string>,
  P: Palette,
  hot: string | null,
  dragging: boolean,
) {
  for (const a of anchors) {
    const x = sx(v, a.x);
    const y = sy(v, a.y);
    const isHot = hot === a.id;
    const free = !occupied.has(a.id);
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = isHot ? P.fosforo : dragging && free ? alpha(P.fosforo, 0.6) : P.bordeFuerte;
    ctx.lineWidth = isHot ? 2.5 : 1.2;
    hexagon(ctx, x, y, 15);
    ctx.stroke();
    ctx.setLineDash([]);
    if (isHot && !P.hc) {
      ctx.fillStyle = alpha(P.fosforo, 0.15);
      ctx.fill();
    }
    ctx.font = FONT;
    ctx.fillStyle = isHot ? P.fosforo : P.texto2;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(a.id, x + 15, y + 8);
  }
}

export function chargeRadiusPx(qC: number): number {
  return Math.min(20, 10 + 3 * Math.abs(qC * 1e9));
}

export function drawCharge(ctx: CanvasRenderingContext2D, x: number, y: number, qC: number, P: Palette, label?: string) {
  const r = chargeRadiusPx(qC);
  const pos = qC >= 0;
  ctx.save();
  if (!P.hc) {
    ctx.shadowColor = pos ? P.pos : P.neg;
    ctx.shadowBlur = 10;
  }
  ctx.fillStyle = pos ? P.pos : P.neg;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${Math.round(r * 1.1)}px "IBM Plex Mono", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(pos ? '+' : '−', x, y + 1);
  if (label) {
    ctx.font = FONT;
    ctx.fillStyle = P.texto;
    ctx.fillText(label, x, y + r + 10);
  }
}

export function drawCharges(ctx: CanvasRenderingContext2D, v: View, field: FieldSystem, P: Palette, hidden?: string) {
  for (const c of field.sources.charges) {
    if (c.id === hidden) continue;
    const q = c.q * 1e9;
    drawCharge(ctx, sx(v, c.x), sy(v, c.y), c.q, P, `${q > 0 ? '+' : '−'}${Math.abs(Number(q.toFixed(2)))} nC`);
  }
}

export function drawScaleBar(ctx: CanvasRenderingContext2D, v: View, P: Palette, label: string) {
  const len = 0.05 * v.scale;
  const x = sx(v, 0) + 10;
  const y = sy(v, 0) - 12;
  ctx.strokeStyle = P.texto;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y - 4);
  ctx.lineTo(x, y);
  ctx.lineTo(x + len, y);
  ctx.lineTo(x + len, y - 4);
  ctx.stroke();
  ctx.font = FONT;
  ctx.fillStyle = P.texto;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(label, x + len / 2, y - 4);
}

export function drawPath(ctx: CanvasRenderingContext2D, v: View, pts: number[], color: string, a: number, width = 1.5) {
  if (pts.length < 4) return;
  ctx.strokeStyle = alpha(color, a);
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(sx(v, pts[0]), sy(v, pts[1]));
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(sx(v, pts[i]), sy(v, pts[i + 1]));
  ctx.stroke();
}

export function drawCross(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, size = 6, a = 1) {
  ctx.strokeStyle = color.startsWith('#') ? alpha(color, a) : color;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(x - size, y - size);
  ctx.lineTo(x + size, y + size);
  ctx.moveTo(x + size, y - size);
  ctx.lineTo(x - size, y + size);
  ctx.stroke();
}

/** Partículas: estela de las últimas 400 posiciones y círculo con brillo. */
export function drawParticles(
  ctx: CanvasRenderingContext2D,
  v: View,
  particles: SimParticle[],
  P: Palette,
  showTrail = true,
) {
  for (const p of particles) {
    if (p.status === 'pending') continue;
    const color = speciesColor(p.kind.species);
    if (showTrail) {
      const pts = p.path;
      const start = Math.max(0, pts.length - 800);
      const n = (pts.length - start) / 2;
      for (let i = start + 2, k = 1; i < pts.length; i += 2, k++) {
        ctx.strokeStyle = alpha(color, 0.08 + 0.75 * (k / n));
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(sx(v, pts[i - 2]), sy(v, pts[i - 1]));
        ctx.lineTo(sx(v, pts[i]), sy(v, pts[i + 1]));
        ctx.stroke();
      }
    }
    if (p.status === 'flying') {
      ctx.save();
      if (!P.hc) {
        ctx.shadowColor = color;
        ctx.shadowBlur = 10;
      }
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(sx(v, p.x), sy(v, p.y), 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else if (p.status === 'crashed' || p.status === 'hitCharge' || p.status === 'lost') {
      drawCross(ctx, sx(v, p.endX), sy(v, p.endY), P.peligro);
    }
  }
}

export interface Spark {
  x: number;
  y: number;
  t0: number;
}

export function drawSparks(ctx: CanvasRenderingContext2D, v: View, sparks: Spark[], now: number, P: Palette) {
  for (const s of sparks) {
    const age = now - s.t0;
    if (age > 300) continue;
    const k = age / 300;
    const x = sx(v, s.x);
    const y = sy(v, s.y);
    ctx.strokeStyle = alpha(P.ambar, 1 - k);
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI * 2 * i) / 8 + i;
      const r0 = 3 + 10 * k;
      const r1 = r0 + 6;
      ctx.beginPath();
      ctx.moveTo(x + r0 * Math.cos(a), y + r0 * Math.sin(a));
      ctx.lineTo(x + r1 * Math.cos(a), y + r1 * Math.sin(a));
      ctx.stroke();
    }
  }
}

/** Líneas de campo con una flecha cada 4 cm. */
export function drawFieldLines(ctx: CanvasRenderingContext2D, v: View, lines: FieldLine[], P: Palette) {
  ctx.strokeStyle = alpha(P.campoE, 0.8);
  ctx.fillStyle = P.campoE;
  ctx.lineWidth = 1.2;
  for (const l of lines) {
    const pts = l.points;
    if (pts.length < 4) continue;
    ctx.beginPath();
    ctx.moveTo(sx(v, pts[0]), sy(v, pts[1]));
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(sx(v, pts[i]), sy(v, pts[i + 1]));
    ctx.stroke();
    let acc = 0;
    const isShort = pts.length === 4;
    const target = isShort ? Math.hypot(pts[2] - pts[0], pts[3] - pts[1]) / 2 : 0.04;
    for (let i = 2; i < pts.length; i += 2) {
      const dx = pts[i] - pts[i - 2];
      const dy = pts[i + 1] - pts[i - 1];
      const d = Math.hypot(dx, dy);
      acc += d;
      if (acc >= target && d > 0) {
        acc = 0;
        const mx = isShort ? (pts[0] + pts[2]) / 2 : pts[i];
        const my = isShort ? (pts[1] + pts[3]) / 2 : pts[i + 1];
        const ang = Math.atan2(-dy, dx);
        const x = sx(v, mx);
        const y = sy(v, my);
        ctx.beginPath();
        ctx.moveTo(x + 6 * Math.cos(ang), y + 6 * Math.sin(ang));
        ctx.lineTo(x + 6 * Math.cos(ang + 2.5), y + 6 * Math.sin(ang + 2.5));
        ctx.lineTo(x + 6 * Math.cos(ang - 2.5), y + 6 * Math.sin(ang - 2.5));
        ctx.closePath();
        ctx.fill();
        if (isShort) break;
      }
    }
  }
}

/** Rejilla de vectores de E cada 2 cm. */
export function drawFieldVectors(
  ctx: CanvasRenderingContext2D,
  v: View,
  field: FieldSystem,
  world: { w: number; h: number },
  P: Palette,
) {
  const e = { x: 0, y: 0 };
  const samples: [number, number, number, number, number][] = [];
  let max = 0;
  for (let x = 0.01; x < world.w; x += 0.02) {
    for (let y = 0.01; y < world.h; y += 0.02) {
      field.E(x, y, e);
      const m = Math.hypot(e.x, e.y);
      if (m === 0 || !Number.isFinite(m)) continue;
      samples.push([x, y, e.x / m, e.y / m, m]);
      if (m > max) max = m;
    }
  }
  ctx.strokeStyle = P.campoE;
  for (const [x, y, ux, uy, m] of samples) {
    const L = Math.min(18, 6 + 4 * Math.log10(1 + m / 100));
    const a = Math.max(0.15, Math.min(1, Math.sqrt(m / max)));
    ctx.globalAlpha = a;
    const X = sx(v, x);
    const Y = sy(v, y);
    const ex = X + ux * L;
    const ey = Y - uy * L;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(X - (ux * L) / 2, Y + (uy * L) / 2);
    ctx.lineTo(ex - (ux * L) / 2, ey + (uy * L) / 2);
    ctx.stroke();
    const ang = Math.atan2(-uy, ux);
    const hx = ex - (ux * L) / 2;
    const hy = ey + (uy * L) / 2;
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(hx - 4 * Math.cos(ang - 0.5), hy - 4 * Math.sin(ang - 0.5));
    ctx.moveTo(hx, hy);
    ctx.lineTo(hx - 4 * Math.cos(ang + 0.5), hy - 4 * Math.sin(ang + 0.5));
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** Regla: distancia (cm) y ángulo (°). */
export function drawRuler(ctx: CanvasRenderingContext2D, v: View, a: { x: number; y: number }, b: { x: number; y: number }, P: Palette, label: string) {
  ctx.strokeStyle = P.ambar;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 3]);
  ctx.beginPath();
  ctx.moveTo(sx(v, a.x), sy(v, a.y));
  ctx.lineTo(sx(v, b.x), sy(v, b.y));
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.font = FONT;
  ctx.fillStyle = 'rgba(5,9,13,0.85)';
  const tx = sx(v, b.x) + 8;
  const ty = sy(v, b.y) - 8;
  const w = ctx.measureText(label).width;
  ctx.fillRect(tx - 3, ty - 13, w + 6, 17);
  ctx.fillStyle = P.ambar;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(label, tx, ty);
}

export function drawPins(ctx: CanvasRenderingContext2D, v: View, pins: { x: number; y: number; label: string }[], P: Palette) {
  for (const p of pins) {
    const x = sx(v, p.x);
    const y = sy(v, p.y);
    ctx.strokeStyle = P.ambar;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.moveTo(x - 9, y);
    ctx.lineTo(x + 9, y);
    ctx.moveTo(x, y - 9);
    ctx.lineTo(x, y + 9);
    ctx.stroke();
    ctx.font = FONT;
    ctx.fillStyle = P.ambar;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(p.label, x + 7, y - 5);
  }
}

/** Reduce una trayectoria a como máximo n puntos tomando una de cada k posiciones. */
export function decimate(pts: number[], maxPoints = 2000): number[] {
  const n = pts.length / 2;
  if (n <= maxPoints) return pts.slice();
  const k = Math.ceil(n / maxPoints);
  const out: number[] = [];
  for (let i = 0; i < n; i += k) out.push(pts[2 * i], pts[2 * i + 1]);
  out.push(pts[pts.length - 2], pts[pts.length - 1]);
  return out;
}
