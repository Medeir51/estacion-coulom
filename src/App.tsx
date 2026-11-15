import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { configureAudio, unlockAudio } from './audio/sfx';
import { isLevelId } from './core/level';
import { es } from './i18n/es';
import { navigate, replaceRoute, useRoute } from './router';
import { isUnlocked, prefersReducedMotion, useStore } from './store';
import { ToastHost } from './ui/components/base';
import Boot from './ui/screens/Boot';
import Campaign from './ui/screens/Campaign';
import Command from './ui/screens/Command';
import LevelScreen from './ui/screens/LevelScreen';
import Manual from './ui/screens/Manual';
import Profile from './ui/screens/Profile';
import Settings from './ui/screens/Settings';
import Telemetry from './ui/screens/Telemetry';

const Archive = lazy(() => import('./ui/screens/Archive'));
const Sandbox = lazy(() => import('./ui/screens/Sandbox'));

class ErrorBoundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  componentDidCatch(err: unknown) {
    console.error(err);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="screen">
          <h2 className="bad">{es.ui.app.errorBoundary}</h2>
          <p>
            <button
              className="btn primary"
              type="button"
              onClick={() => {
                this.setState({ error: false });
                navigate('/');
              }}
            >
              {es.ui.app.backToCommand}
            </button>
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

let booted = false;

/** Aplica los ajustes visuales y lleva la cuenta del tiempo activo (sección 16.1). */
function useGlobalEffects(levelId: string | null) {
  const settings = useStore((s) => s.settings);
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.contrast = settings.highContrast ? 'high' : 'normal';
    root.dataset.effects = settings.effects ? 'on' : 'off';
    if (prefersReducedMotion(settings)) root.dataset.motion = 'reduce';
    else delete root.dataset.motion;
    root.style.setProperty('--base-size', `${settings.textSize}px`);
    configureAudio(settings.soundOn, settings.volume);
  }, [settings]);

  useEffect(() => {
    const touch = () => {
      useStore.getState().touch();
      unlockAudio();
    };
    window.addEventListener('pointerdown', touch);
    window.addEventListener('keydown', touch);
    return () => {
      window.removeEventListener('pointerdown', touch);
      window.removeEventListener('keydown', touch);
    };
  }, []);

  useEffect(() => {
    const start = new Date().toISOString();
    let active = 0;
    const iv = setInterval(() => {
      const S = useStore.getState();
      const isActive = !document.hidden && Date.now() - S.lastInteraction < 120000;
      if (!isActive) return;
      active++;
      if (levelId && isLevelId(levelId)) S.addThinking(levelId, 1);
      if (active % 10 === 0) {
        const sessions = S.telemetry.sessions.filter((x) => x.start !== start);
        S.setSessions([...sessions, { start, end: new Date().toISOString(), activeSeconds: active }].slice(-200));
      }
    }, 1000);
    return () => clearInterval(iv);
  }, [levelId]);
}

export default function App() {
  const route = useRoute();
  const [showBoot, setShowBoot] = useState(!booted && route.path === '/');
  const progress = useStore((s) => s.progress);
  const teacher = useStore((s) => s.settings.teacherMode);
  const levelMatch = /^\/nivel\/([123]-[123])$/.exec(route.path);
  const levelId = levelMatch?.[1] ?? null;
  useGlobalEffects(levelId);

  const known = ['/', '/campana', '/sandbox', '/telemetria', '/manual', '/archivo', '/ajustes', '/perfil'];
  const invalid = !known.includes(route.path) && !(levelId && isLevelId(levelId) && isUnlocked(levelId, progress, teacher));
  useEffect(() => {
    if (invalid) {
      useStore.getState().toast(es.ui.app.unknownRoute, 'warn');
      replaceRoute('/');
    }
  }, [invalid]);

  let screen: ReactNode;
  if (showBoot) {
    screen = (
      <Boot
        onDone={() => {
          booted = true;
          setShowBoot(false);
        }}
      />
    );
  } else if (levelId && isLevelId(levelId) && !invalid) {
    screen = <LevelScreen key={levelId} id={levelId} />;
  } else {
    switch (route.path) {
      case '/campana':
        screen = <Campaign />;
        break;
      case '/sandbox':
        screen = <Sandbox />;
        break;
      case '/telemetria':
        screen = <Telemetry />;
        break;
      case '/manual':
        screen = <Manual />;
        break;
      case '/archivo':
        screen = <Archive />;
        break;
      case '/ajustes':
        screen = <Settings />;
        break;
      case '/perfil':
        screen = <Profile />;
        break;
      default:
        screen = <Command />;
    }
  }
  return (
    <ErrorBoundary>
      <a className="skip-link" href="#main">
        {es.ui.app.skipLink}
      </a>
      <div className="mobile-warning" role="note">
        {es.ui.app.mobileWarning}
      </div>
      <Suspense fallback={<p className="screen">{es.ui.app.loading}</p>}>{screen}</Suspense>
      <ToastHost />
    </ErrorBoundary>
  );
}
