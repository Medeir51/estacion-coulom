/** Formato de números y unidades para la interfaz (sección 18.3). */
const SUP: Record<string, string> = {
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
  '-': '⁻',
};
export const MINUS = '−';
const THIN = ' ';

function stripZeros(s: string): string {
  return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
}

function groupThousands(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, THIN);
}

export function formatNumber(x: number, sig = 4): string {
  if (!Number.isFinite(x)) return '—';
  if (x === 0) return '0';
  const r = Number(x.toPrecision(sig));
  if (r === 0) return '0';
  const neg = r < 0;
  const a = Math.abs(r);
  let body: string;
  if (a >= 0.001 && a < 1e6) {
    const decimals = Math.max(0, sig - 1 - Math.floor(Math.log10(a)));
    const fixed = stripZeros(a.toFixed(Math.min(decimals, 20)));
    const [ip, fp] = fixed.split('.');
    const intStr = a >= 10000 ? groupThousands(ip) : ip;
    body = fp ? `${intStr},${fp}` : intStr;
  } else {
    const [m, e] = a.toExponential(sig - 1).split('e');
    const exp = String(Number(e))
      .split('')
      .map((ch) => SUP[ch] ?? ch)
      .join('');
    body = `${stripZeros(m).replace('.', ',')} × 10${exp}`;
  }
  return neg ? MINUS + body : body;
}

export type QuantityKind = 'E' | 'B' | 't' | 'Q' | 'V' | 'F' | 'pos' | 'v' | 'I' | 'P' | 'm';

export function formatQuantity(x: number, kind: QuantityKind, sig = 4): string {
  const a = Math.abs(x);
  switch (kind) {
    case 'E':
      if (a < 1000) return `${formatNumber(x, sig)} V/m`;
      if (a < 1e6) return `${formatNumber(x / 1000, sig)} kV/m`;
      return `${formatNumber(x / 1e6, sig)} MV/m`;
    case 'B':
      if (a === 0) return '0 mT';
      if (a < 1e-3) return `${formatNumber(x * 1e6, sig)} µT`;
      if (a < 1) return `${formatNumber(x * 1e3, sig)} mT`;
      return `${formatNumber(x, sig)} T`;
    case 't':
      if (a < 1e-6) return `${formatNumber(x * 1e9, sig)} ns`;
      if (a < 1e-3) return `${formatNumber(x * 1e6, sig)} µs`;
      if (a < 1) return `${formatNumber(x * 1e3, sig)} ms`;
      return `${formatNumber(x, sig)} s`;
    case 'Q':
      return `${formatNumber(x * 1e9, sig)} nC`;
    case 'V':
      if (a < 1000) return `${formatNumber(x, sig)} V`;
      return `${formatNumber(x / 1000, sig)} kV`;
    case 'F':
      return `${formatNumber(x, sig)} N`;
    case 'pos':
      return `${formatCm(x)} cm`;
    case 'v':
      return `${formatNumber(x, sig)} m/s`;
    case 'I':
      return `${formatNumber(x, sig)} A`;
    case 'P':
      return `${formatNumber(x, sig)} W`;
    case 'm':
      return `${formatNumber(x, sig)} kg`;
  }
}

/** Posición en metros mostrada en cm con un decimal y coma decimal. */
export function formatCm(m: number): string {
  const v = Math.round(m * 1000) / 10;
  const s = (Object.is(v, -0) ? 0 : v).toFixed(1).replace('.', ',');
  return s.startsWith('-') ? MINUS + s.slice(1) : s;
}

/** Punto (x; y) en cm. */
export function formatPoint(x: number, y: number): string {
  return `(${formatCm(x)}; ${formatCm(y)})`;
}

/** Número con decimales fijos y coma (para porcentajes, mm, etc.). */
export function formatFixed(x: number, decimals: number): string {
  const s = x.toFixed(decimals).replace('.', ',');
  return s.startsWith('-') && Number(x.toFixed(decimals)) !== 0 ? MINUS + s.slice(1) : s.replace(/^-/, '');
}
