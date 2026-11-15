/** Store global de Zustand con porciones (sección 5.2). La lógica de cálculo vive en core/ y script/. */
import { create } from 'zustand';
import type { ConstantsMode } from '../core/constants';
import type { Evaluation } from '../core/evaluation';
import { LEVEL_IDS, type LevelConfig, type LevelId } from '../core/level';
import type { AttemptRecord, SessionRecord } from '../core/telemetry';
import { KEYS, load, remove, save } from './persist';

export interface Settings {
  soundOn: boolean;
  volume: number;
  effects: boolean;
  reduceMotion: 'auto' | 'yes' | 'no';
  highContrast: boolean;
  textSize: 14 | 16 | 18;
  constants: ConstantsMode;
  sigFigs: 3 | 4 | 5;
  askHypothesis: boolean;
  initialSpeed: number;
  fixedSeed: number | null;
  includeScripts: boolean;
  teacherMode: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  soundOn: true,
  volume: 40,
  effects: true,
  reduceMotion: 'auto',
  highContrast: false,
  textSize: 14,
  constants: 'codata',
  sigFigs: 4,
  askHypothesis: true,
  initialSpeed: 1,
  fixedSeed: null,
  includeScripts: true,
  teacherMode: false,
};

export interface Profile {
  nickname: string;
  courseCode: string;
}

export interface LevelProgress {
  passed: boolean;
  stars: 0 | 1 | 2 | 3;
  /** Intentos físicos (éxito o fallo) */
  attempts: number;
  /** Mejor resultado del nivel (métrica principal) */
  best: number | null;
  /** Pistas abiertas (0–3) */
  hintsUsed: number;
  /** Retos de estrellas cumplidos (p. ej. 'attract', 'repel', 'challenge') */
  methods: string[];
  activeSeconds: number;
}

export interface ProgressState {
  levels: Partial<Record<LevelId, LevelProgress>>;
  welcomed: boolean;
  briefed: LevelId[];
}

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'warn' | 'error';
}

export interface GhostPath {
  /** Trayectoria de cada partícula (x, y intercalados) */
  paths: number[][];
  crashes: { x: number; y: number }[];
}

export interface SimSlice {
  status: 'idle' | 'running' | 'paused' | 'finished';
  time: number;
  speed: number;
  seed: number;
  result: Evaluation | null;
  ghosts: GhostPath[];
}

export interface TelemetryState {
  attempts: AttemptRecord[];
  sessions: SessionRecord[];
}

export const MAX_ATTEMPTS = 2000;

interface State {
  settings: Settings;
  profile: Profile;
  progress: ProgressState;
  drafts: Partial<Record<LevelId, LevelConfig>>;
  telemetry: TelemetryState;
  sim: SimSlice;
  ui: { toasts: Toast[]; consoleOpen: boolean; consoleHeight: number; selected: string | null; tool: 'none' | 'ruler' };
  /** Segundos activos desde el último intento, por nivel (no se guarda) */
  thinking: Partial<Record<LevelId, number>>;
  lastInteraction: number;

  setSettings: (p: Partial<Settings>) => void;
  setProfile: (p: Partial<Profile>) => void;
  setDraft: (id: LevelId, cfg: LevelConfig) => void;
  clearDraft: (id: LevelId) => void;
  levelProgress: (id: LevelId) => LevelProgress;
  updateLevel: (id: LevelId, p: Partial<LevelProgress>) => void;
  openHint: (id: LevelId) => number;
  markWelcomed: () => void;
  markBriefed: (id: LevelId) => void;
  addAttempt: (a: AttemptRecord) => void;
  setSessions: (s: SessionRecord[]) => void;
  clearTelemetry: () => void;
  resetAll: () => void;
  importProgress: (data: { progress?: ProgressState; drafts?: State['drafts']; settings?: Settings }) => void;
  toast: (text: string, kind?: Toast['kind']) => void;
  dismissToast: (id: number) => void;
  setSim: (p: Partial<SimSlice>) => void;
  setUi: (p: Partial<State['ui']>) => void;
  touch: () => void;
  addThinking: (id: LevelId, s: number) => void;
  takeThinking: (id: LevelId) => number;
}

export const emptyLevelProgress = (): LevelProgress => ({
  passed: false,
  stars: 0,
  attempts: 0,
  best: null,
  hintsUsed: 0,
  methods: [],
  activeSeconds: 0,
});

const initialSettings = { ...DEFAULT_SETTINGS, ...(load<Partial<Settings>>(KEYS.settings) ?? {}) };
delete (initialSettings as Partial<{ schemaVersion: number }>).schemaVersion;
const loadedProfile = load<Profile>(KEYS.profile);
const loadedProgress = load<ProgressState>(KEYS.progress);
const loadedDrafts = load<{ drafts: State['drafts'] }>(KEYS.drafts);
const loadedTelemetry = load<TelemetryState>(KEYS.telemetry);

let toastId = 1;

export const useStore = create<State>()((set, get) => ({
  settings: initialSettings,
  profile: { nickname: loadedProfile?.nickname ?? '', courseCode: loadedProfile?.courseCode ?? '' },
  progress: {
    levels: loadedProgress?.levels ?? {},
    welcomed: loadedProgress?.welcomed ?? false,
    briefed: loadedProgress?.briefed ?? [],
  },
  drafts: loadedDrafts?.drafts ?? {},
  telemetry: {
    attempts: Array.isArray(loadedTelemetry?.attempts) ? loadedTelemetry!.attempts : [],
    sessions: Array.isArray(loadedTelemetry?.sessions) ? loadedTelemetry!.sessions : [],
  },
  sim: { status: 'idle', time: 0, speed: initialSettings.initialSpeed, seed: 0, result: null, ghosts: [] },
  ui: { toasts: [], consoleOpen: true, consoleHeight: 220, selected: null, tool: 'none' },
  thinking: {},
  lastInteraction: Date.now(),

  setSettings: (p) => set((s) => ({ settings: { ...s.settings, ...p } })),
  setProfile: (p) => set((s) => ({ profile: { ...s.profile, ...p } })),
  setDraft: (id, cfg) => set((s) => ({ drafts: { ...s.drafts, [id]: cfg } })),
  clearDraft: (id) =>
    set((s) => {
      const d = { ...s.drafts };
      delete d[id];
      return { drafts: d };
    }),
  levelProgress: (id) => get().progress.levels[id] ?? emptyLevelProgress(),
  updateLevel: (id, p) =>
    set((s) => ({
      progress: {
        ...s.progress,
        levels: { ...s.progress.levels, [id]: { ...(s.progress.levels[id] ?? emptyLevelProgress()), ...p } },
      },
    })),
  openHint: (id) => {
    const lp = get().levelProgress(id);
    const n = Math.min(3, lp.hintsUsed + 1);
    get().updateLevel(id, { hintsUsed: n });
    return n;
  },
  markWelcomed: () => set((s) => ({ progress: { ...s.progress, welcomed: true } })),
  markBriefed: (id) =>
    set((s) => ({
      progress: { ...s.progress, briefed: s.progress.briefed.includes(id) ? s.progress.briefed : [...s.progress.briefed, id] },
    })),
  addAttempt: (a) =>
    set((s) => {
      const attempts = [...s.telemetry.attempts, a];
      if (attempts.length > MAX_ATTEMPTS) attempts.splice(0, attempts.length - MAX_ATTEMPTS);
      return { telemetry: { ...s.telemetry, attempts } };
    }),
  setSessions: (sessions) => set((s) => ({ telemetry: { ...s.telemetry, sessions } })),
  clearTelemetry: () => set((s) => ({ telemetry: { attempts: [], sessions: s.telemetry.sessions.slice(-1) } })),
  resetAll: () => {
    for (const k of Object.values(KEYS)) remove(k);
    set({
      settings: { ...DEFAULT_SETTINGS },
      profile: { nickname: '', courseCode: '' },
      progress: { levels: {}, welcomed: false, briefed: [] },
      drafts: {},
      telemetry: { attempts: [], sessions: [] },
    });
  },
  importProgress: (data) =>
    set((s) => ({
      progress: data.progress
        ? {
            levels: data.progress.levels ?? {},
            welcomed: true,
            briefed: Array.isArray(data.progress.briefed) ? data.progress.briefed : [],
          }
        : s.progress,
      drafts: data.drafts ?? s.drafts,
      settings: data.settings ? { ...DEFAULT_SETTINGS, ...data.settings } : s.settings,
    })),
  toast: (text, kind = 'info') => {
    const id = toastId++;
    set((s) => ({ ui: { ...s.ui, toasts: [...s.ui.toasts.slice(-4), { id, text, kind }] } }));
    if (kind !== 'error') setTimeout(() => get().dismissToast(id), 4000);
  },
  dismissToast: (id) => set((s) => ({ ui: { ...s.ui, toasts: s.ui.toasts.filter((t) => t.id !== id) } })),
  setSim: (p) => set((s) => ({ sim: { ...s.sim, ...p } })),
  setUi: (p) => set((s) => ({ ui: { ...s.ui, ...p } })),
  touch: () => set({ lastInteraction: Date.now() }),
  addThinking: (id, sec) => set((s) => ({ thinking: { ...s.thinking, [id]: (s.thinking[id] ?? 0) + sec } })),
  takeThinking: (id) => {
    const v = get().thinking[id] ?? 0;
    set((s) => ({ thinking: { ...s.thinking, [id]: 0 } }));
    return v;
  },
}));

/** Guarda cada porción cuando cambia. */
let prev = useStore.getState();
useStore.subscribe((s) => {
  if (s.settings !== prev.settings) save(KEYS.settings, s.settings);
  if (s.profile !== prev.profile) save(KEYS.profile, s.profile);
  if (s.progress !== prev.progress) save(KEYS.progress, s.progress);
  if (s.drafts !== prev.drafts) save(KEYS.drafts, { drafts: s.drafts });
  if (s.telemetry !== prev.telemetry) save(KEYS.telemetry, s.telemetry);
  prev = s;
});

/** Una prueba está disponible si es la 1-1, si la anterior está superada o en modo docente (sección 11.6). */
export function isUnlocked(id: LevelId, progress: ProgressState, teacher: boolean): boolean {
  if (teacher) return true;
  const i = LEVEL_IDS.indexOf(id);
  if (i <= 0) return true;
  return !!progress.levels[LEVEL_IDS[i - 1]]?.passed;
}

export function totalStars(progress: ProgressState): number {
  return LEVEL_IDS.reduce((s, id) => s + (progress.levels[id]?.stars ?? 0), 0);
}

export function passedCount(progress: ProgressState): number {
  return LEVEL_IDS.filter((id) => progress.levels[id]?.passed).length;
}

export function prefersReducedMotion(settings: Settings): boolean {
  if (settings.reduceMotion === 'yes') return true;
  if (settings.reduceMotion === 'no') return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}
