import { describe, expect, it } from 'vitest';
import { AULA, CODATA } from './constants';
import { FieldSystem, emptySources, electromagnetCurrent, type FieldSources } from './fields';
import { formatNumber, formatQuantity } from './format';
import { arcPoints, pointSegmentDistance, rectContains, segmentIntersection } from './geometry';
import { borisStep, type FieldSampler } from './integrator';
import { mulberry32, shuffle } from './rng';
import { SPECIES, particleKind, speedFromVoltage } from './species';
import { emfAt, generateProfile, peakEmf, profileAt, GeneratorSim, SAMPLES_PER_CYCLE } from './generator';
import { traceFieldLines } from './fieldlines';

const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);
const THIN = ' ';

describe('22.1 Formato de números', () => {
  const cases: [number, string][] = [
    [5.759858e-16, '5,76 × 10⁻¹⁶'],
    [3595.0207, '3595'],
    [179.751, '179,8'],
    [10272740.65, '1,027 × 10⁷'],
    [0.5, '0,5'],
    [2, '2'],
    [0, '0'],
    [-0.131383, '−0,1314'],
    [12345.6, `12${THIN}350`],
    [0.00099, '9,9 × 10⁻⁴'],
    [999999.7, '1 × 10⁶'],
  ];
  cases.forEach(([x, s], i) => it(`P${i + 1}: ${x}`, () => expect(formatNumber(x)).toBe(s)));
  it('P12–P19: formatQuantity', () => {
    expect(formatQuantity(3595.02, 'E')).toBe('3,595 kV/m');
    expect(formatQuantity(0.04308067, 'B')).toBe('43,08 mT');
    expect(formatQuantity(0.2, 'B')).toBe('200 mT');
    expect(formatQuantity(3.884e-8, 't')).toBe('38,84 ns');
    expect(formatQuantity(2.0356884e-6, 't')).toBe('2,036 µs');
    expect(formatQuantity(1e-9, 'Q')).toBe('1 nC');
    expect(formatQuantity(1500, 'V')).toBe('1,5 kV');
    expect(formatQuantity(1.602177e-15, 'F')).toBe('1,602 × 10⁻¹⁵ N');
  });
});

function sources(partial: Partial<FieldSources>): FieldSources {
  return { ...emptySources(), ...partial };
}

describe('22.2 Física básica', () => {
  const c = CODATA;
  it('F1: k en modo CODATA', () => expect(rel(c.k, 8.987551786e9)).toBeLessThan(1e-9));
  it('F2: fuerza electrón–(+1 nC) a 5 cm', () => {
    const f = (c.k * c.e * 1e-9) / 0.05 ** 2;
    expect(rel(f, 5.75986e-16)).toBeLessThan(1e-5);
    const fs = new FieldSystem(sources({ charges: [{ id: 'a', x: 0, y: 0, q: 1e-9 }] }), c.k);
    const e = { x: 0, y: 0 };
    fs.E(0.05, 0, e);
    // F = qE con q = −e: apunta hacia la carga (−x): atracción
    expect(-c.e * e.x).toBeLessThan(0);
  });
  it('F3: E de +1 nC a 5 cm', () => {
    const fs = new FieldSystem(sources({ charges: [{ id: 'a', x: 0, y: 0, q: 1e-9 }] }), c.k);
    const e = { x: 0, y: 0 };
    fs.E(0, 0.05, e);
    expect(rel(e.y, 3595.02)).toBeLessThan(1e-5);
    expect(Math.abs(e.x)).toBeLessThan(1e-9);
  });
  it('F4: dipolo, E en el punto medio', () => {
    const fs = new FieldSystem(
      sources({
        charges: [
          { id: 'a', x: 0, y: 0, q: 1e-9 },
          { id: 'b', x: 0.1, y: 0, q: -1e-9 },
        ],
      }),
      c.k,
    );
    const e = { x: 0, y: 0 };
    fs.E(0.05, 0, e);
    expect(rel(e.x, 7190.04)).toBeLessThan(1e-5);
  });
  it('F5: V de +1 nC a 5 cm', () => {
    const fs = new FieldSystem(sources({ charges: [{ id: 'a', x: 0, y: 0, q: 1e-9 }] }), c.k);
    expect(rel(fs.V(0.05, 0), 179.751)).toBeLessThan(1e-5);
  });
  it('F6–F8: rapideces', () => {
    expect(rel(speedFromVoltage(c.e, c.me, 300), 1.027274e7)).toBeLessThan(1e-5);
    expect(rel(speedFromVoltage(c.e, c.mp, 2000), 6.18994e5)).toBeLessThan(1e-5);
    const n20 = particleKind('ne20', c);
    const n22 = particleKind('ne22', c);
    expect(rel(speedFromVoltage(n20.q, n20.m, 1000), 9.82469e4)).toBeLessThan(1e-5);
    expect(rel(speedFromVoltage(n22.q, n22.m, 1000), 9.36752e4)).toBeLessThan(1e-5);
  });
  it('F9: capacitor horizontal', () => {
    const fs = new FieldSystem(
      sources({ capacitors: [{ id: 'C1', cx: 0, cy: 0, L: 0.1, d: 0.03, angle: 0, V: 45, positive: 'superior' }] }),
      c.k,
    );
    const e = { x: 0, y: 0 };
    fs.E(0, 0, e);
    expect(e.x).toBeCloseTo(0, 12);
    expect(e.y).toBeCloseTo(-1500, 9);
    fs.E(0.2, 0, e);
    expect(e.x).toBe(0);
    expect(e.y).toBe(0);
  });
  it('F10: capacitor con φ = 90°', () => {
    const fs = new FieldSystem(
      sources({ capacitors: [{ id: 'C1', cx: 0, cy: 0, L: 0.1, d: 0.02, angle: 90, V: 100, positive: 'superior' }] }),
      c.k,
    );
    const e = { x: 0, y: 0 };
    fs.E(0, 0, e);
    expect(e.x).toBeCloseTo(5000, 9);
    expect(e.y).toBeCloseTo(0, 9);
  });
  it('F11: regiones B', () => {
    const r = { id: 'M', x0: 0, y0: 0, x1: 0.1, y1: 0.1, Bz: 0.1 };
    const fs = new FieldSystem(sources({ magnets: [r] }), c.k);
    expect(fs.B(0.05, 0.05)).toBe(0.1);
    expect(fs.B(0.1, 0.05)).toBe(0.1);
    expect(fs.B(0.2, 0.05)).toBe(0);
    const fs2 = new FieldSystem(sources({ magnets: [r, { id: 'N', x0: 0, y0: 0, x1: 0.1, y1: 0.1, Bz: -0.03 }] }), c.k);
    expect(fs2.B(0.05, 0.05)).toBeCloseTo(0.07, 15);
  });
  it('F12: fuerza magnética sobre un protón', () => {
    const v = { x: 1e5, y: 0 };
    const Bz = 0.1;
    const F = { x: c.e * v.y * Bz, y: -c.e * v.x * Bz };
    expect(F.x).toBe(0);
    expect(rel(F.y, -1.602177e-15)).toBeLessThan(1e-5);
  });
  it('F13: radio y periodo', () => {
    const r = (c.mp * 1e5) / (c.e * 0.1);
    const T = (2 * Math.PI * c.mp) / (c.e * 0.1);
    expect(rel(r, 0.0104397)).toBeLessThan(1e-5);
    expect(rel(T, 6.55945e-7)).toBeLessThan(1e-5);
  });
  it('F14: blindaje', () => {
    const fs = new FieldSystem(
      sources({
        charges: [{ id: 'a', x: 0, y: 0, q: 1e-9 }],
        shields: [{ id: 'S', x0: 0.05, y0: -0.05, x1: 0.15, y1: 0.05, thickness: 0.003 }],
      }),
      c.k,
    );
    const e = { x: 0, y: 0 };
    fs.E(0.1, 0, e);
    expect(Math.hypot(e.x, e.y)).toBe(0);
    fs.E(0.2, 0, e);
    expect(rel(Math.hypot(e.x, e.y), 224.689)).toBeLessThan(1e-5);
  });
  it('F15: corriente del electroimán', () => {
    expect(rel(electromagnetCurrent(0.2, c.mu0, 1e4), 15.9155)).toBeLessThan(1e-5);
  });
  it('F16: modo aula', () => {
    expect(AULA.k).toBe(9e9);
    expect(rel(speedFromVoltage(AULA.e, AULA.me, 300), 1.026541e7)).toBeLessThan(1e-5);
  });
  it('especies', () => {
    expect(SPECIES.alpha.chargeE).toBe(2);
  });
});

describe('22.3 Integrador', () => {
  const none: FieldSampler = {
    E: (_x, _y, out) => {
      out.x = 0;
      out.y = 0;
    },
    B: () => 0,
  };
  const c = CODATA;
  it('I1: línea recta', () => {
    const p = { x: 0.01, y: 0.02, vx: 1e6, vy: -3e5 };
    const dt = 1e-11;
    for (let i = 0; i < 1000; i++) borisStep(p, c.e, c.mp, dt, none);
    expect(Math.abs(p.x - (0.01 + 1e6 * 1000 * dt))).toBeLessThan(1e-12);
    expect(Math.abs(p.y - (0.02 - 3e5 * 1000 * dt))).toBeLessThan(1e-12);
  });
  const Bonly: FieldSampler = {
    E: (_x, _y, out) => {
      out.x = 0;
      out.y = 0;
    },
    B: () => 0.1,
  };
  const T = (2 * Math.PI * c.mp) / (c.e * 0.1);
  const r = (c.mp * 1e5) / (c.e * 0.1);
  it('I2 e I3: una vuelta', () => {
    const p = { x: 0, y: 0, vx: 1e5, vy: 0 };
    let maxDev = 0;
    for (let i = 0; i < 1000; i++) {
      borisStep(p, c.e, c.mp, T / 1000, Bonly);
      maxDev = Math.max(maxDev, Math.abs(Math.hypot(p.vx, p.vy) - 1e5) / 1e5);
    }
    expect(maxDev).toBeLessThan(1e-12);
    expect(Math.hypot(p.x, p.y)).toBeLessThan(1e-4 * r);
  });
  it('I4: media vuelta', () => {
    const p = { x: 0, y: 0, vx: 1e5, vy: 0 };
    for (let i = 0; i < 500; i++) borisStep(p, c.e, c.mp, T / 1000, Bonly);
    expect(rel(p.y, -0.0208794)).toBeLessThan(1e-5);
    expect(Math.abs(p.x)).toBeLessThan(0.01 * r);
  });
});

describe('22.4 Geometría', () => {
  it('G1', () => {
    const i = segmentIntersection(0, 0, 1, 1, 0, 1, 1, 0)!;
    expect(i.x).toBeCloseTo(0.5, 12);
    expect(i.y).toBeCloseTo(0.5, 12);
    expect(i.t).toBeCloseTo(0.5, 12);
  });
  it('G2', () => expect(segmentIntersection(0, 0, 1, 0, 0, 1, 1, 1)).toBeNull());
  it('G3', () => {
    const i = segmentIntersection(0, 0, 1, 0, 1, 0, 1, 1)!;
    expect(i.t).toBe(1);
    expect(i.x).toBe(1);
    expect(i.y).toBe(0);
  });
  it('G4: arco interior del 1-3', () => {
    const pts = arcPoints(0.2, 0.18, 0.105, -90, 0, 48);
    expect(pts).toHaveLength(49);
    expect(pts[0].x).toBeCloseTo(0.2, 12);
    expect(pts[0].y).toBeCloseTo(0.075, 12);
    expect(pts[48].x).toBeCloseTo(0.305, 12);
    expect(pts[48].y).toBeCloseTo(0.18, 12);
  });
  it('G5', () => expect(pointSegmentDistance(0.5, 1, 0, 0, 1, 0)).toBe(1));
  it('G6', () => expect(rectContains({ x0: 0, y0: 0, x1: 1, y1: 1 }, 1, 0.5)).toBe(true));
});

describe('22.7 Aleatoriedad', () => {
  it('R1', () => {
    const r = mulberry32(12345);
    const exp = [0.9797282678, 0.3067522645, 0.4842054215, 0.8179344125, 0.5094283693];
    for (const v of exp) expect(r()).toBeCloseTo(v, 9);
  });
  it('R2', () => {
    const r = mulberry32(7);
    for (const v of [0.0117047532, 0.0619582576, 0.9769076328]) expect(r()).toBeCloseTo(v, 9);
  });
  it('R3: perfil con semilla 12345', () => {
    const ev = generateProfile(12345);
    const exp = [
      ['peak', 0.927174, 0.552829, 0.284747],
      ['peak', 1.80213, 0.629919, 0.349683],
      ['peak', 2.979555, 0.53798, 0.344584],
      ['dip', 4.084723, 0.690803, -0.131383],
    ] as const;
    exp.forEach(([type, s, d, a], i) => {
      expect(ev[i].type).toBe(type);
      expect(Math.abs(ev[i].start - s)).toBeLessThan(1e-6);
      expect(Math.abs(ev[i].duration - d)).toBeLessThan(1e-6);
      expect(Math.abs(ev[i].amplitude - a)).toBeLessThan(1e-6);
    });
    const prof = { kind: 'peaks' as const, B0: 0.3, events: ev };
    let bmax = 0;
    let bmin = 1;
    for (let i = 0; i <= 7000; i++) {
      const { B } = profileAt(prof, i / 1000);
      bmax = Math.max(bmax, B);
      bmin = Math.min(bmin, B);
    }
    expect(bmax).toBeCloseTo(0.4049, 4);
    expect(bmin).toBeCloseTo(0.26059, 4);
  });
  it('shuffle es determinista', () => {
    expect(shuffle([1, 2, 3, 4, 5], mulberry32(3))).toEqual(shuffle([1, 2, 3, 4, 5], mulberry32(3)));
  });
});

describe('22.8 Generador', () => {
  it('GEN1', () => expect(rel(peakEmf(80, 0.25, 0.02, 60), 150.796)).toBeLessThan(1e-5));
  it('GEN2–GEN3', () => {
    expect(rel(peakEmf(1, 0.3, 0.015, 60) / Math.SQRT2, 1.19958)).toBeLessThan(1e-5);
    expect(rel(peakEmf(100, 0.3, 0.015, 60) / Math.SQRT2, 119.958)).toBeLessThan(1e-5);
  });
  it('GEN4: valor eficaz de una senoidal pura', () => {
    const g = new GeneratorSim({
      profile: { kind: 'constant', B0: 0.3 },
      area: 0.015,
      f: 60,
      nTotal: 100,
      R: 14.4,
      tripV: null,
      duration: 1 / 60,
    });
    for (let i = 0; i < SAMPLES_PER_CYCLE; i++) g.stepSample();
    expect(rel(g.cycles[0].rms, peakEmf(100, 0.3, 0.015, 60) / Math.SQRT2)).toBeLessThan(1e-12);
  });
  it('GEN5–GEN6: B(t) y fem con la semilla 12345', () => {
    const prof = { kind: 'peaks' as const, B0: 0.3, events: generateProfile(12345) };
    expect(profileAt(prof, 1.2).B).toBeCloseTo(0.385424, 6);
    const p95 = profileAt(prof, 0.95);
    expect(p95.B).toBeCloseTo(0.304789, 6);
    expect(p95.dB).toBeCloseTo(0.411558, 6);
    expect(profileAt(prof, 4.3).B).toBeCloseTo(0.260585, 6);
    const omega = 2 * Math.PI * 60;
    expect(emfAt(100, 0.015, omega, p95.B, p95.dB, 0.95)).toBeCloseTo(-0.61734, 5);
  });
});

describe('Líneas de campo', () => {
  it('traza 8 líneas para +1 nC y terminan cerca de la negativa', () => {
    const fs = new FieldSystem(
      sources({
        charges: [
          { id: 'a', x: 0.1, y: 0.1, q: 1e-9 },
          { id: 'b', x: 0.2, y: 0.1, q: -1e-9 },
        ],
      }),
      CODATA.k,
    );
    const lines = traceFieldLines(fs, { w: 0.4, h: 0.25 });
    expect(lines).toHaveLength(8);
    const l0 = lines[0].points;
    expect(Math.hypot(l0[l0.length - 2] - 0.2, l0[l0.length - 1] - 0.1)).toBeLessThan(0.0061);
  });
});
