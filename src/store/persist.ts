/** Persistencia en localStorage con claves versionadas (sección 5.5). */
export const KEYS = {
  settings: 'ec.v1.settings',
  profile: 'ec.v1.profile',
  progress: 'ec.v1.progress',
  drafts: 'ec.v1.drafts',
  telemetry: 'ec.v1.telemetry',
  sandbox: 'ec.v1.sandbox',
} as const;

export const SCHEMA_VERSION = 1;

/** Migra datos guardados; por ahora solo acepta la versión 1. */
export function migrate<T>(data: unknown): T | null {
  if (!data || typeof data !== 'object') return null;
  const v = (data as { schemaVersion?: unknown }).schemaVersion;
  if (v !== SCHEMA_VERSION) return null;
  return data as T;
}

export function load<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return migrate<T>(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function save(key: string, value: object): void {
  try {
    localStorage.setItem(key, JSON.stringify({ ...value, schemaVersion: SCHEMA_VERSION }));
  } catch {
    // Sin espacio o almacenamiento bloqueado: se ignora sin mostrar errores.
  }
}

export function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignorado
  }
}

/** Descarga un archivo generado en el navegador. */
export function downloadFile(name: string, content: string, type = 'application/json'): void {
  try {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch {
    // ignorado
  }
}

export function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ''));
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });
}

export function uuid(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
}
