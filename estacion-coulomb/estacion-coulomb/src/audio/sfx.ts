/** Sonidos sintetizados con Web Audio API (sección 6.5). El audio se crea tras la primera interacción. */
let ctx: AudioContext | null = null;
let enabled = true;
let volume = 0.4;
let humNode: { osc: OscillatorNode; gain: GainNode } | null = null;

export function configureAudio(on: boolean, vol: number): void {
  enabled = on;
  volume = Math.max(0, Math.min(1, vol / 100));
  if (!on) stopHum();
  else if (humNode && ctx) humNode.gain.gain.setValueAtTime(volume * 0.1, ctx.currentTime);
}

/** Debe llamarse dentro de un gesto del usuario. */
export function unlockAudio(): void {
  if (ctx) {
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
    return;
  }
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AC) ctx = new AC();
  } catch {
    ctx = null;
  }
}

function tone(type: OscillatorType, f0: number, dur: number, at = 0, f1?: number, gainMul = 1): void {
  if (!ctx || !enabled || volume === 0) return;
  const t0 = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, t0);
  if (f1 !== undefined) osc.frequency.linearRampToValueAtTime(f1, t0 + dur);
  g.gain.setValueAtTime(volume * 0.3 * gainMul, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

export const sfx = {
  click: () => tone('square', 800, 0.03, 0, undefined, 0.5),
  success: () => [523, 659, 784].forEach((f, i) => tone('triangle', f, 0.12, i * 0.12)),
  fail: () => tone('sawtooth', 120, 0.25, 0, 80),
  detector: () => tone('sine', 1500, 0.02),
  alarm: () => {
    for (let i = 0; i < 6; i++) tone('square', i % 2 ? 660 : 880, 0.15, i * 0.16, undefined, 0.6);
  },
  spark: () => {
    if (!ctx || !enabled || volume === 0) return;
    const dur = 0.08;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(volume * 0.3, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    src.connect(hp).connect(g).connect(ctx.destination);
    src.start();
  },
};

export function startHum(): void {
  if (!ctx || !enabled || humNode) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = 120;
  gain.gain.value = volume * 0.1;
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  humNode = { osc, gain };
}

export function stopHum(): void {
  if (!humNode) return;
  try {
    humNode.osc.stop();
  } catch {
    // ignorado
  }
  humNode = null;
}
