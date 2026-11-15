/** Ejecución de un intento: simulación con paso fijo + consola con tics de control (secciones 5.4 y 10.5). */
import { scriptConstants, type PhysConstants } from './constants';
import type { PlateSide } from './fields';
import { GeneratorSim, profileAt, type GeneratorConfig } from './generator';
import { totalTurns, generatorFrequency, type LevelConfig, type LevelDef } from './level';
import { generateProfile } from './generator';
import { ParticleSim, type Scene, type SimSettings } from './world';
import { mathFunctions, type FunctionSpec } from '../script/builtins';
import { deviceFunctions, type DeviceGroup, type DeviceHost } from '../script/devices';
import { ScriptError } from '../script/errors';
import { Runtime, analyzeProgram } from '../script/interpreter';
import { tokenize } from '../script/lexer';
import { parseProgram } from '../script/parser';
import type { Program } from '../script/ast';
import { formatScriptNumber } from '../script/builtins';

export interface ParticleSetup {
  kind: 'particles';
  scene: Scene;
  settings: SimSettings;
  controlPeriod: number | null;
}

export interface GeneratorSetup {
  kind: 'generator';
  config: GeneratorConfig;
  controlPeriod: number | null;
}

export type Setup = ParticleSetup | GeneratorSetup;

export interface RunInput {
  setup: Setup;
  script: string;
  devices: DeviceGroup[];
  levelConstants?: Record<string, number>;
  constants: PhysConstants;
}

export interface OutputLine {
  t: number;
  text: string;
  kind: 'out' | 'warn' | 'error';
}

/** Un guion sin instrucciones (vacío o solo comentarios) se trata como «sin guion». */
export function isBlankScript(src: string): boolean {
  try {
    return tokenize(src).every((t) => t.type === 'nl' || t.type === 'eof');
  } catch {
    return false;
  }
}

/** Funciones que la consola ve: matemáticas + dispositivos. */
export function consoleFunctions(devices: DeviceGroup[], host: DeviceHost, time: () => number): Record<string, FunctionSpec> {
  return { ...mathFunctions(time), ...deviceFunctions(devices, host) };
}

export function consoleConstants(c: PhysConstants, levelConstants?: Record<string, number>): Record<string, number> {
  return { ...scriptConstants(c), ...(levelConstants ?? {}) };
}

/** Analiza el guion (sintaxis y funciones) sin ejecutarlo. */
export function checkScript(
  src: string,
  devices: DeviceGroup[],
  c: PhysConstants,
  levelConstants?: Record<string, number>,
): { program: Program | null; error: ScriptError | null } {
  if (isBlankScript(src)) return { program: null, error: null };
  try {
    const program = parseProgram(src);
    analyzeProgram(program, consoleFunctions(devices, {}, () => 0), consoleConstants(c, levelConstants));
    return { program, error: null };
  } catch (e) {
    if (e instanceof ScriptError) return { program: null, error: e };
    throw e;
  }
}

export function setupForLevel(level: LevelDef, cfg: LevelConfig, seed: number, c: PhysConstants): Setup {
  if (level.kind === 'particles') {
    return {
      kind: 'particles',
      scene: level.buildScene(cfg, c, seed),
      settings: { dt: level.dt, particleTmax: level.particleTmax, totalTmax: level.totalTmax },
      controlPeriod: level.controlPeriod,
    };
  }
  return {
    kind: 'generator',
    config: {
      profile:
        level.profile === 'peaks'
          ? { kind: 'peaks', B0: level.B0, events: generateProfile(seed) }
          : { kind: 'constant', B0: level.B0 },
      area: level.area,
      f: generatorFrequency(level, cfg),
      nTotal: totalTurns(level, cfg),
      R: level.R,
      tripV: level.tripV,
      duration: level.duration,
    },
    controlPeriod: level.controlPeriod,
  };
}

export class AttemptRun {
  readonly input: RunInput;
  readonly sim: ParticleSim | null = null;
  readonly gen: GeneratorSim | null = null;
  runtime: Runtime | null = null;
  output: OutputLine[] = [];
  scriptError: ScriptError | null = null;
  /** Cambios que el guion hizo en los controles (la perilla se mueve sola). */
  scriptActions: { voltage?: number; positivePlate?: PlateSide; usedSetVoltage: boolean } = { usedSetVoltage: false };
  finished = false;
  aborted = false;
  private controlEvery = 0;
  private started = false;

  constructor(input: RunInput) {
    this.input = input;
    const s = input.setup;
    if (s.kind === 'particles') {
      this.sim = new ParticleSim(s.scene, s.settings, input.constants.k);
      if (s.controlPeriod) this.controlEvery = Math.max(1, Math.round(s.controlPeriod / s.settings.dt));
    } else {
      this.gen = new GeneratorSim(s.config);
      if (s.controlPeriod) this.controlEvery = Math.max(1, Math.round(s.controlPeriod / this.gen.dtSample));
    }
    const check = checkScript(input.script, input.devices, input.constants, input.levelConstants);
    if (check.error) {
      this.fail(check.error);
      return;
    }
    if (check.program) {
      this.runtime = new Runtime(check.program, {
        constants: consoleConstants(input.constants, input.levelConstants),
        functions: consoleFunctions(input.devices, this.host(), () => this.time()),
        output: (text) => this.output.push({ t: this.time(), text, kind: 'out' }),
      });
    }
  }

  private fail(err: ScriptError): void {
    this.scriptError = err;
    this.output.push({ t: this.time(), text: `${err.code} · ${err.message}`, kind: 'error' });
    this.finished = true;
  }

  time(): number {
    if (this.sim) return this.sim.t;
    if (this.gen) return this.gen.t;
    return 0;
  }

  /** Duración total esperada (s). */
  duration(): number {
    const s = this.input.setup;
    return s.kind === 'particles' ? s.settings.totalTmax : s.config.duration;
  }

  private host(): DeviceHost {
    const sim = this.sim;
    const gen = this.gen;
    const warn = (text: string) => this.output.push({ t: this.time(), text, kind: 'warn' });
    if (sim) {
      return {
        hasCapacitor: (id) => !!sim.field.findCapacitor(id),
        setVoltage: (id, v) => {
          sim.field.findCapacitor(id)!.V = v;
          this.scriptActions.voltage = v;
          this.scriptActions.usedSetVoltage = true;
        },
        setPositivePlate: (id, side) => {
          sim.field.findCapacitor(id)!.positive = side;
          this.scriptActions.positivePlate = side;
        },
        hasDetector: (id) => sim.detectors.has(id.toLowerCase()),
        detectorSignal: (id) => sim.detectors.get(id.toLowerCase())!.signal,
        crossTime: (id) => sim.detectors.get(id.toLowerCase())!.lastTime,
        crossCount: (id) => sim.detectors.get(id.toLowerCase())!.count,
        hasElectromagnet: (id) => !!sim.field.findElectromagnet(id),
        setPolarity: (id, p) => {
          sim.field.findElectromagnet(id)!.polarity = p;
        },
        getPolarity: (id) => sim.field.findElectromagnet(id)!.polarity,
        fieldOf: (id) => {
          const em = sim.field.findElectromagnet(id)!;
          return em.polarity * em.Bmag;
        },
        warn,
      };
    }
    const g = gen!;
    return {
      field: () => profileAt(g.cfg.profile, g.t).B,
      rms: () => g.lastRms(),
      cycleIndex: () => g.lastCycleIndex(),
      setTurns: (n) => {
        g.nActive = n;
      },
      activeTurns: () => g.nActive,
      totalTurns: () => g.cfg.nTotal,
      warn,
    };
  }

  private guard(fn: () => void): void {
    try {
      fn();
    } catch (e) {
      if (e instanceof ScriptError) this.fail(e);
      else throw e;
    }
  }

  /** Ejecuta Inicio en t = 0. */
  start(): void {
    if (this.started) return;
    this.started = true;
    if (this.finished) return;
    if (this.runtime) this.guard(() => this.runtime!.runInicio());
  }

  /** Avanza hasta el tiempo indicado o hasta agotar maxSteps pasos. Devuelve los pasos dados. */
  advance(maxSteps: number, tTarget = Infinity): number {
    this.start();
    let n = 0;
    const rt = this.runtime;
    const hasCiclo = !!rt?.program.ciclo;
    if (this.sim) {
      const sim = this.sim;
      while (!this.finished && n < maxSteps && sim.t < tTarget) {
        if (hasCiclo && this.controlEvery > 0 && sim.stepIndex % this.controlEvery === 0) {
          this.guard(() => rt!.runCiclo());
          if (this.finished) break;
          sim.clearSignals();
        }
        sim.step();
        n++;
        if (sim.done) this.finished = true;
      }
    } else if (this.gen) {
      const gen = this.gen;
      while (!this.finished && n < maxSteps && gen.t < tTarget) {
        if (hasCiclo && this.controlEvery > 0 && gen.sampleIndex % this.controlEvery === 0) {
          this.guard(() => rt!.runCiclo());
          if (this.finished) break;
        }
        gen.stepSample();
        n++;
        if (gen.done) this.finished = true;
      }
    }
    return n;
  }

  runToEnd(): void {
    while (!this.finished) this.advance(1_000_000);
  }

  abort(): void {
    this.aborted = true;
    this.finished = true;
  }
}

/** Ejecuta un intento completo sin dibujar («Resultado inmediato»). */
export function runAttempt(level: LevelDef, cfg: LevelConfig, seed: number, c: PhysConstants): AttemptRun {
  const run = new AttemptRun({
    setup: setupForLevel(level, cfg, seed, c),
    script: level.scriptMode === 'none' ? '' : cfg.script,
    devices: level.devices,
    levelConstants: level.levelConstants,
    constants: c,
  });
  run.runToEnd();
  return run;
}

export { formatScriptNumber };
