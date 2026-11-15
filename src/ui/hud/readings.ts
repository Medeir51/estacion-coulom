/** Lecturas del multímetro por tipo de entidad y por punto (sección 8.4). */
import { ELECTROMAGNET_TURNS_PER_M, type PhysConstants } from '../../core/constants';
import { capacitorAxes, electromagnetCurrent, FieldSystem } from '../../core/fields';
import { formatCm, formatNumber, formatPoint, formatQuantity } from '../../core/format';
import { rectContains } from '../../core/geometry';
import type { ParticleKind } from '../../core/species';
import { angleDeg } from '../../core/vec';
import type { ParticleSim, Scene } from '../../core/world';
import { es } from '../../i18n/es';
import { chargeRadiusPx, type View } from '../../render/scene';

const M = es.ui.multimeter;

export type Probe =
  | { kind: 'point'; x: number; y: number }
  | { kind: 'charge'; id: string }
  | { kind: 'particle'; index: number }
  | { kind: 'capacitor'; id: string }
  | { kind: 'magnet'; id: string }
  | { kind: 'electromagnet'; id: string }
  | { kind: 'detector'; id: string }
  | { kind: 'receiver'; id: string };

export interface ReadingCtx {
  scene: Scene;
  field: FieldSystem;
  sim: ParticleSim | null;
  c: PhysConstants;
  /** Partícula del nivel, para F = q·E en un punto */
  probeParticle: ParticleKind | null;
  sig: number;
}

export interface Reading {
  title: string;
  rows: [string, string][];
}

const bText = (Bz: number, sig: number) =>
  Bz === 0 ? '0 mT' : `${formatQuantity(Math.abs(Bz), 'B', sig)} ${Bz > 0 ? M.out : M.in}`;

/** Busca la entidad bajo el puntero (en metros), con tolerancia en píxeles. */
export function pick(x: number, y: number, view: View, ctx: ReadingCtx): Probe {
  const tol = 8 / view.scale;
  if (ctx.sim) {
    for (const p of ctx.sim.particles) {
      if (p.status === 'flying' && Math.hypot(p.x - x, p.y - y) < tol) return { kind: 'particle', index: p.index };
    }
  }
  for (const ch of ctx.scene.sources.charges) {
    if (Math.hypot(ch.x - x, ch.y - y) < chargeRadiusPx(ch.q) / view.scale) return { kind: 'charge', id: ch.id };
  }
  for (const d of ctx.scene.detectors) {
    const len = Math.hypot(d.bx - d.ax, d.by - d.ay) || 1;
    const u = ((x - d.ax) * (d.bx - d.ax) + (y - d.ay) * (d.by - d.ay)) / (len * len);
    const px = d.ax + u * (d.bx - d.ax);
    const py = d.ay + u * (d.by - d.ay);
    if (u >= -0.05 && u <= 1.05 && Math.hypot(px - x, py - y) < tol) return { kind: 'detector', id: d.id };
  }
  for (const r of ctx.scene.receivers) if (rectContains(r, x, y)) return { kind: 'receiver', id: r.id };
  for (const c of ctx.scene.sources.capacitors) {
    const { ux, uy, nx, ny } = capacitorAxes(c);
    const a = (x - c.cx) * ux + (y - c.cy) * uy;
    const b = (x - c.cx) * nx + (y - c.cy) * ny;
    if (Math.abs(a) <= c.L / 2 && Math.abs(b) <= c.d / 2 + tol) return { kind: 'capacitor', id: c.id };
  }
  return { kind: 'point', x, y };
}

export function readProbe(p: Probe, ctx: ReadingCtx): Reading {
  const { field, c, sig } = ctx;
  const e = { x: 0, y: 0 };
  switch (p.kind) {
    case 'point': {
      field.E(p.x, p.y, e);
      const mag = Math.hypot(e.x, e.y);
      const rows: [string, string][] = [
        [M.pos, `${formatPoint(p.x, p.y)} cm`],
        [M.E, formatQuantity(mag, 'E', sig)],
        [M.dir, mag > 0 ? `${formatNumber(angleDeg(e), 3)}°` : '—'],
        [M.V, ctx.scene.sources.capacitors.length ? M.noPotential : formatQuantity(field.V(p.x, p.y), 'V', sig)],
        [M.B, bText(field.B(p.x, p.y), sig)],
      ];
      if (ctx.probeParticle) rows.push([M.F, formatQuantity(Math.abs(ctx.probeParticle.q) * mag, 'F', sig)]);
      // Regiones bajo el punto
      return { title: M.point, rows };
    }
    case 'charge': {
      const ch = field.sources.charges.find((x) => x.id === p.id);
      if (!ch) return { title: M.point, rows: [] };
      const others = new FieldSystem({ ...field.sources, charges: field.sources.charges.filter((x) => x !== ch) }, field.k);
      others.E(ch.x, ch.y, e);
      const mag = Math.hypot(e.x, e.y);
      const F = { x: ch.q * e.x, y: ch.q * e.y };
      return {
        title: `${M.Q} · ${ch.label ?? ch.id}`,
        rows: [
          [M.Q, formatQuantity(ch.q, 'Q', sig)],
          [M.pos, `${formatPoint(ch.x, ch.y)} cm`],
          [M.Eothers, formatQuantity(mag, 'E', sig)],
          [M.Fnet, `${formatQuantity(Math.hypot(F.x, F.y), 'F', sig)}${mag > 0 ? ` · ${formatNumber(angleDeg(F), 3)}°` : ''}`],
        ],
      };
    }
    case 'particle': {
      const pt = ctx.sim?.particles[p.index];
      if (!pt) return { title: M.point, rows: [] };
      field.E(pt.x, pt.y, e);
      const Bz = field.B(pt.x, pt.y);
      const v = Math.hypot(pt.vx, pt.vy);
      const q = pt.kind.q;
      const Fx = q * (e.x + pt.vy * Bz);
      const Fy = q * (e.y - pt.vx * Bz);
      const ke = (0.5 * pt.kind.m * v * v) / c.e;
      return {
        title: es.ui.sandbox.species[pt.kind.species] ?? pt.kind.species,
        rows: [
          [M.species, es.ui.sandbox.species[pt.kind.species] ?? pt.kind.species],
          [M.q, `${formatNumber(q, sig)} C (${formatNumber(q / c.e, 3)} e)`],
          [M.m, formatQuantity(pt.kind.m, 'm', sig)],
          [M.speed, `${formatQuantity(v, 'v', sig)} · ${M.pctC(formatNumber((100 * v) / c.c, 3))}`],
          [M.ke, `${formatNumber(ke, sig)} eV`],
          [M.E, formatQuantity(Math.hypot(e.x, e.y), 'E', sig)],
          [M.B, bText(Bz, sig)],
          [M.Ftotal, formatQuantity(Math.hypot(Fx, Fy), 'F', sig)],
        ],
      };
    }
    case 'capacitor': {
      const cap = field.sources.capacitors.find((x) => x.id === p.id)!;
      return {
        title: cap.id,
        rows: [
          [M.V, formatQuantity(cap.V, 'V', sig)],
          [M.d, `${formatCm(cap.d)} cm`],
          [M.Ecap, formatQuantity(cap.V / cap.d, 'E', sig)],
          [M.posPlate, es.ui.inventory.plateOptions[cap.positive]],
        ],
      };
    }
    case 'magnet':
    case 'electromagnet': {
      const mg = field.sources.magnets.find((x) => x.id === p.id);
      if (mg) return { title: mg.id, rows: [[M.B, bText(mg.Bz, sig)]] };
      const em = field.sources.electromagnets.find((x) => x.id === p.id)!;
      return {
        title: em.id,
        rows: [
          [M.B, bText(em.polarity * em.Bmag, sig)],
          [M.current, formatQuantity(electromagnetCurrent(em.Bmag, c.mu0, ELECTROMAGNET_TURNS_PER_M), 'I', sig)],
        ],
      };
    }
    case 'detector': {
      const st = ctx.sim?.detectors.get(p.id.toLowerCase());
      return {
        title: p.id,
        rows: [
          [M.crossings, String(st?.count ?? 0)],
          [M.lastCross, st && st.lastTime >= 0 ? formatQuantity(st.lastTime, 't', sig) : '—'],
        ],
      };
    }
    case 'receiver': {
      const r = ctx.scene.receivers.find((x) => x.id === p.id)!;
      const n = ctx.sim ? ctx.sim.particles.filter((x) => x.receiverId === r.id).length : 0;
      return {
        title: r.id,
        rows: [
          [M.center, `${formatPoint((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2)} cm`],
          [M.received, String(n)],
        ],
      };
    }
  }
}

/** Regiones magnéticas que contienen el punto (para mostrarlas como entidad). */
export function regionAt(x: number, y: number, field: FieldSystem): Probe | null {
  for (const em of field.sources.electromagnets) if (rectContains(em, x, y)) return { kind: 'electromagnet', id: em.id };
  for (const m of field.sources.magnets) if (rectContains(m, x, y)) return { kind: 'magnet', id: m.id };
  return null;
}
