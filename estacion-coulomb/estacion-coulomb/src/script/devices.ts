/** Funciones de dispositivos por nivel (sección 10.8). */
import { num, roundHalfAway, str, type FunctionSpec } from './builtins';
import { errors } from './errors';
import { normalizeName } from './lexer';
import { es } from '../i18n/es';

export type DeviceGroup = 'selector' | 'isotopes' | 'generator';

/** Lo que el mundo simulado le ofrece a la consola. */
export interface DeviceHost {
  // Selector de velocidades
  hasCapacitor?(id: string): boolean;
  setVoltage?(id: string, v: number): void;
  setPositivePlate?(id: string, side: 'superior' | 'inferior'): void;
  // Detectores y electroimanes
  hasDetector?(id: string): boolean;
  detectorSignal?(id: string): boolean;
  crossTime?(id: string): number;
  crossCount?(id: string): number;
  hasElectromagnet?(id: string): boolean;
  setPolarity?(id: string, p: number): void;
  getPolarity?(id: string): number;
  fieldOf?(id: string): number;
  // Generador
  field?(): number;
  rms?(): number;
  cycleIndex?(): number;
  setTurns?(n: number): void;
  activeTurns?(): number;
  totalTurns?(): number;
  /** Escribe un aviso en la salida */
  warn?(text: string): void;
}

export const DEVICE_FUNCTIONS: Record<DeviceGroup, string[]> = {
  selector: ['fijarVoltaje', 'placaPositiva'],
  isotopes: ['detector', 'tiempoCruce', 'cuentaCruces', 'polaridad', 'invertirPolaridad', 'campoActual'],
  generator: ['campo', 'voltajeRMS', 'numeroCiclo', 'fijarEspiras', 'espirasActivas', 'espirasTotales'],
};

export function deviceFunctions(groups: DeviceGroup[], host: DeviceHost): Record<string, FunctionSpec> {
  const out: Record<string, FunctionSpec> = {};
  const devName = (v: Parameters<typeof str>[0], line: number, exists: ((id: string) => boolean) | undefined) => {
    const id = str(v, line);
    if (!exists || !exists(id)) throw errors.noDevice(line, id);
    return id;
  };
  if (groups.includes('selector')) {
    out.fijarVoltaje = {
      arity: 2,
      returns: false,
      fn: (a, c) => {
        const id = devName(a[0], c.line, host.hasCapacitor);
        const v = num(a[1], c.line);
        if (v < 0 || v > 2000) throw errors.range(c.line, 'voltage');
        host.setVoltage!(id, v);
      },
    };
    out.placaPositiva = {
      arity: 2,
      returns: false,
      fn: (a, c) => {
        const id = devName(a[0], c.line, host.hasCapacitor);
        const side = normalizeName(str(a[1], c.line));
        if (side !== 'superior' && side !== 'inferior') throw errors.range(c.line, 'plate');
        host.setPositivePlate!(id, side);
      },
    };
  }
  if (groups.includes('isotopes')) {
    out.detector = {
      arity: 1,
      returns: true,
      fn: (a, c) => host.detectorSignal!(devName(a[0], c.line, host.hasDetector)),
    };
    out.tiempocruce = {
      arity: 1,
      returns: true,
      fn: (a, c) => host.crossTime!(devName(a[0], c.line, host.hasDetector)),
    };
    out.cuentacruces = {
      arity: 1,
      returns: true,
      fn: (a, c) => host.crossCount!(devName(a[0], c.line, host.hasDetector)),
    };
    out.polaridad = {
      arity: 2,
      returns: false,
      fn: (a, c) => {
        const id = devName(a[0], c.line, host.hasElectromagnet);
        const p = num(a[1], c.line);
        if (p !== 1 && p !== -1) throw errors.range(c.line, 'polarity');
        host.setPolarity!(id, p);
      },
    };
    out.invertirpolaridad = {
      arity: 1,
      returns: false,
      fn: (a, c) => {
        const id = devName(a[0], c.line, host.hasElectromagnet);
        host.setPolarity!(id, -host.getPolarity!(id));
      },
    };
    out.campoactual = {
      arity: 1,
      returns: true,
      fn: (a, c) => host.fieldOf!(devName(a[0], c.line, host.hasElectromagnet)),
    };
  }
  if (groups.includes('generator')) {
    let warned = false;
    out.campo = { arity: 0, returns: true, fn: () => host.field!() };
    out.voltajerms = { arity: 0, returns: true, fn: () => host.rms!() };
    out.numerociclo = { arity: 0, returns: true, fn: () => host.cycleIndex!() };
    out.fijarespiras = {
      arity: 1,
      returns: false,
      fn: (a, c) => {
        const n = num(a[0], c.line);
        if (n < 0) throw errors.range(c.line, 'turns');
        const total = host.totalTurns!();
        let r = roundHalfAway(n);
        if (r > total) {
          r = total;
          if (!warned) {
            warned = true;
            host.warn?.(es.script.turnsClamped(total));
          }
        }
        host.setTurns!(r);
      },
    };
    out.espirasactivas = { arity: 0, returns: true, fn: () => host.activeTurns!() };
    out.espirastotales = { arity: 0, returns: true, fn: () => host.totalTurns!() };
  }
  return out;
}

/** Nombres visibles de las funciones disponibles en un conjunto de grupos (para la referencia). */
export function availableDeviceNames(groups: DeviceGroup[]): string[] {
  return groups.flatMap((g) => DEVICE_FUNCTIONS[g]);
}
