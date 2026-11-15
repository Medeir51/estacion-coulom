/** Vista lateral del generador y osciloscopio (sección 14). */
import { SAMPLES_PER_CYCLE, type CycleRecord } from '../core/generator';
import type { Palette } from './scene';

const FONT = '12px "IBM Plex Mono", monospace';

export interface GenViewState {
  theta: number;
  B: number;
  Bnom: number;
  nActive: number;
  nTotal: number;
  loadOn: boolean;
  load: 'lamp' | 'servers';
  servers: number;
  /** servidores encendidos (animación final) */
  serversLit: number;
  labels: { N: string; S: string; rotor: string; slow: string; turbine: string; load: string; turns: string };
  showLines: boolean;
}

export function drawGeneratorSide(ctx: CanvasRenderingContext2D, w: number, h: number, s: GenViewState, P: Palette) {
  ctx.fillStyle = '#05090d';
  ctx.fillRect(0, 0, w, h);
  const cx = w * 0.42;
  const cy = h * 0.45;
  const gap = Math.min(w * 0.42, 340);
  const poleW = Math.min(70, w * 0.09);
  const poleH = Math.min(h * 0.62, 200);
  // Polos
  ctx.fillStyle = '#7a2730';
  ctx.fillRect(cx - gap / 2 - poleW, cy - poleH / 2, poleW, poleH);
  ctx.fillStyle = '#23407a';
  ctx.fillRect(cx + gap / 2, cy - poleH / 2, poleW, poleH);
  ctx.font = 'bold 22px "Orbitron", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffd0d0';
  ctx.fillText(s.labels.N, cx - gap / 2 - poleW / 2, cy);
  ctx.fillStyle = '#d0e0ff';
  ctx.fillText(s.labels.S, cx + gap / 2 + poleW / 2, cy);
  // Líneas de B (de N a S), más densas cuanto mayor es B
  if (s.showLines) {
    const n = Math.max(3, Math.round(7 * (s.B / (s.Bnom || 1))));
    ctx.strokeStyle = P.campoB;
    ctx.fillStyle = P.campoB;
    ctx.lineWidth = 1;
    for (let i = 0; i < n; i++) {
      const y = cy - poleH * 0.4 + (poleH * 0.8 * (i + 0.5)) / n;
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.moveTo(cx - gap / 2 + 2, y);
      ctx.lineTo(cx + gap / 2 - 2, y);
      ctx.stroke();
      ctx.globalAlpha = 1;
      for (const fx of [0.2, 0.8]) {
        const ax = cx - gap / 2 + gap * fx;
        ctx.beginPath();
        ctx.moveTo(ax + 5, y);
        ctx.lineTo(ax - 2, y - 4);
        ctx.lineTo(ax - 2, y + 4);
        ctx.closePath();
        ctx.fill();
      }
    }
  }
  // Rotor: bobina que gira alrededor de un eje vertical (ancho proyectado = cos θ)
  const coilW = gap * 0.55;
  const coilH = poleH * 0.75;
  const proj = Math.cos(s.theta);
  ctx.strokeStyle = P.cobre;
  ctx.lineWidth = 3 + Math.min(6, s.nTotal / 40);
  ctx.strokeRect(cx - (coilW / 2) * Math.abs(proj), cy - coilH / 2, coilW * Math.abs(proj) || 2, coilH);
  ctx.strokeStyle = P.texto3;
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(cx, cy - coilH / 2 - 18);
  ctx.lineTo(cx, cy + poleH / 2 + 30);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.font = FONT;
  ctx.fillStyle = P.texto2;
  ctx.fillText(s.labels.rotor, cx, cy - coilH / 2 - 26);
  ctx.fillText(s.labels.turns, cx, cy + coilH / 2 + 14);
  // Turbina
  const ty = cy + poleH / 2 + 34;
  ctx.save();
  ctx.translate(cx, ty);
  ctx.rotate(s.theta);
  ctx.strokeStyle = P.texto2;
  ctx.lineWidth = 2;
  for (let i = 0; i < 6; i++) {
    ctx.rotate(Math.PI / 3);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(16, 5);
    ctx.stroke();
  }
  ctx.restore();
  ctx.fillStyle = P.texto3;
  ctx.textAlign = 'left';
  ctx.fillText(s.labels.turbine, cx + 24, ty + 4);
  // Carga
  const lx = w * 0.86;
  const ly = cy;
  ctx.strokeStyle = P.texto3;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx + gap / 2 + poleW + 4, cy - poleH / 2 - 10);
  ctx.lineTo(lx, cy - poleH / 2 - 10);
  ctx.lineTo(lx, ly - 30);
  ctx.stroke();
  if (s.load === 'lamp') {
    ctx.save();
    if (s.loadOn && !P.hc) {
      ctx.shadowColor = P.ambar;
      ctx.shadowBlur = 30;
    }
    ctx.fillStyle = s.loadOn ? P.ambar : '#2a3340';
    ctx.beginPath();
    ctx.arc(lx, ly, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = P.bordeFuerte;
    ctx.stroke();
  } else {
    for (let i = 0; i < s.servers; i++) {
      const y = ly - 26 + i * 22;
      ctx.fillStyle = '#1a2533';
      ctx.fillRect(lx - 30, y, 60, 18);
      ctx.strokeStyle = P.bordeFuerte;
      ctx.strokeRect(lx - 30, y, 60, 18);
      const lit = s.loadOn && i < s.serversLit;
      for (let k = 0; k < 4; k++) {
        ctx.fillStyle = lit ? P.fosforo : '#2a3340';
        ctx.fillRect(lx - 24 + k * 9, y + 6, 5, 5);
      }
    }
  }
  ctx.fillStyle = P.texto2;
  ctx.textAlign = 'center';
  ctx.fillText(s.labels.load, lx, ly + (s.load === 'lamp' ? 40 : 52));
  ctx.fillStyle = P.texto3;
  ctx.textAlign = 'left';
  ctx.fillText(s.labels.slow, 8, 16);
}

export interface ScopeState {
  emfRing: Float64Array;
  sampleIndex: number;
  cycles: CycleRecord[];
  totalCycles: number;
  /** Escala vertical de la fem (V) */
  emfScale: number;
  band: [number, number] | null;
  tripV: number | null;
  showB: boolean;
  Bnom: number;
  labels: { emf: string; rms: string; B: string; band: string; trip: string };
}

export function drawScope(ctx: CanvasRenderingContext2D, w: number, h: number, s: ScopeState, P: Palette) {
  ctx.fillStyle = '#03070a';
  ctx.fillRect(0, 0, w, h);
  const half = Math.floor(w * 0.42);
  // Rejilla
  ctx.strokeStyle = 'rgba(61,252,156,0.08)';
  ctx.lineWidth = 1;
  for (let x = 0; x < w; x += 24) {
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, h);
    ctx.stroke();
  }
  for (let y = 0; y < h; y += 24) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(w, y + 0.5);
    ctx.stroke();
  }
  ctx.font = FONT;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  // Traza 1: fem de los dos últimos ciclos con disparo en el cruce por cero hacia arriba
  const N = SAMPLES_PER_CYCLE;
  const ring = s.emfRing;
  const L = ring.length;
  const avail = Math.min(s.sampleIndex, L);
  if (avail > 4) {
    const end = s.sampleIndex;
    // busca el último cruce por cero hacia arriba que deje un ciclo completo detrás
    let trig = end - N;
    for (let i = end - N; i > end - avail + 1 && i > end - 2 * N; i--) {
      const a = ring[(i - 1 + L) % L];
      const b = ring[i % L];
      if (a < 0 && b >= 0) {
        trig = i;
        break;
      }
    }
    const start = Math.max(end - avail, trig - N);
    const mid = h / 2;
    const scale = (h * 0.42) / (s.emfScale || 1);
    ctx.strokeStyle = P.fosforo;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = start, k = 0; i < Math.min(end, start + 2 * N); i++, k++) {
      const x = (k / (2 * N)) * half;
      const y = mid - ring[i % L] * scale;
      if (k === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(159,179,200,0.4)';
  ctx.beginPath();
  ctx.moveTo(0, h / 2);
  ctx.lineTo(half, h / 2);
  ctx.stroke();
  ctx.fillStyle = P.fosforo;
  ctx.fillText(s.labels.emf, 6, 4);
  // Traza 2: valor eficaz por ciclo durante toda la prueba
  const x0 = half + 10;
  const pw = w - x0 - 6;
  const vmax = Math.max(s.tripV ?? 0, s.band ? s.band[1] * 1.3 : 0, ...s.cycles.map((c) => c.rms), 10) * 1.05;
  const ys = (V: number) => h - 8 - ((h - 26) * V) / vmax;
  if (s.band) {
    ctx.fillStyle = 'rgba(61,252,156,0.15)';
    ctx.fillRect(x0, ys(s.band[1]), pw, ys(s.band[0]) - ys(s.band[1]));
    ctx.fillStyle = P.fosforo;
    ctx.textAlign = 'right';
    ctx.fillText(s.labels.band, w - 6, ys(s.band[1]) - 14);
  }
  if (s.tripV) {
    ctx.strokeStyle = P.peligro;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(x0, ys(s.tripV));
    ctx.lineTo(x0 + pw, ys(s.tripV));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = P.peligro;
    ctx.textAlign = 'right';
    ctx.fillText(`${s.labels.trip} ${s.tripV} V`, w - 6, ys(s.tripV) - 14);
  }
  ctx.strokeStyle = P.ambar;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  s.cycles.forEach((c, i) => {
    const x = x0 + (pw * (i + 0.5)) / Math.max(1, s.totalCycles);
    if (i === 0) ctx.moveTo(x, ys(c.rms));
    else ctx.lineTo(x, ys(c.rms));
  });
  ctx.stroke();
  ctx.fillStyle = P.ambar;
  ctx.textAlign = 'left';
  ctx.fillText(s.labels.rms, x0 + 4, 4);
  // Traza 3: B(t)
  if (s.showB && s.cycles.length) {
    const bmax = s.Bnom * 1.5;
    const yb = (B: number) => h - 8 - ((h - 26) * B) / bmax;
    ctx.strokeStyle = P.campoB;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    s.cycles.forEach((c, i) => {
      const x = x0 + (pw * (i + 0.5)) / Math.max(1, s.totalCycles);
      if (i === 0) ctx.moveTo(x, yb(c.B));
      else ctx.lineTo(x, yb(c.B));
    });
    ctx.stroke();
    ctx.fillStyle = P.campoB;
    ctx.fillText(s.labels.B, x0 + 4, 18);
  }
  ctx.strokeStyle = 'rgba(159,179,200,0.4)';
  ctx.strokeRect(x0, 0.5, pw, h - 1);
}
