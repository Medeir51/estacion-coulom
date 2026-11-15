/** Enrutador propio basado en location.hash (sección 5.3). */
import { useSyncExternalStore } from 'react';

export interface Route {
  path: string;
  query: URLSearchParams;
}

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#/, '') || '/';
  const [p, q = ''] = raw.split('?');
  const path = p.startsWith('/') ? p : `/${p}`;
  return { path: path.length > 1 ? path.replace(/\/$/, '') : path, query: new URLSearchParams(q) };
}

function subscribe(cb: () => void): () => void {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
}

export function useHash(): string {
  return useSyncExternalStore(subscribe, () => window.location.hash);
}

export function useRoute(): Route {
  return parseHash(useHash());
}

export function navigate(path: string): void {
  const target = `#${path}`;
  if (window.location.hash !== target) window.location.hash = target;
}

export function replaceRoute(path: string): void {
  const url = `${window.location.pathname}${window.location.search}#${path}`;
  window.history.replaceState(null, '', url);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}
