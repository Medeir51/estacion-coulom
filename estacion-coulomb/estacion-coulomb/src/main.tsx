import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/orbitron/500.css';
import '@fontsource/orbitron/700.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/600.css';
import './ui/theme.css';
import App from './App';
import { registerSW } from 'virtual:pwa-register';
import { useStore } from './store';
import { es } from './i18n/es';

try {
  registerSW({
    immediate: true,
    onNeedRefresh() {
      useStore.getState().toast(es.ui.app.newVersion);
    },
    onOfflineReady() {
      useStore.getState().toast(es.ui.app.offlineReady);
    },
  });
} catch {
  // Sin service worker (por ejemplo en desarrollo): la app funciona igual.
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
