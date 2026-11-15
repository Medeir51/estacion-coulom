/** Ajustes (sección 18.1). */
import { useRef, useState } from 'react';
import { es } from '../../i18n/es';
import { navigate } from '../../router';
import { useStore, type Settings as S } from '../../store';
import { downloadFile, readFileText } from '../../store/persist';
import { Button, ConfirmButton, Modal, NumberField, Panel, Select, Toggle } from '../components/base';

export default function Settings() {
  const T = es.ui.settings;
  const settings = useStore((s) => s.settings);
  const set = useStore((s) => s.setSettings);
  const [teacherAsk, setTeacherAsk] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const opt = <V extends string | number>(values: V[], label: (v: V) => string) =>
    values.map((v) => ({ value: String(v), label: label(v) }));
  return (
    <div className="screen" id="main">
      <div className="screen-head">
        <Button onClick={() => (window.history.length > 1 ? window.history.back() : navigate('/'))}>{es.ui.campaign.back}</Button>
        <h1>{T.title}</h1>
      </div>
      <div className="cards">
        <Panel title={T.sound}>
          <div className="stack">
            <Toggle label={T.sound} checked={settings.soundOn} onChange={(v) => set({ soundOn: v })} />
            <div className="field">
              <label htmlFor="vol">
                {T.volume}: {settings.volume} %
              </label>
              <input
                id="vol"
                type="range"
                min={0}
                max={100}
                value={settings.volume}
                onChange={(e) => set({ volume: Number(e.target.value) })}
              />
            </div>
          </div>
        </Panel>
        <Panel title={T.effects}>
          <div className="stack">
            <Toggle label={T.effects} checked={settings.effects} onChange={(v) => set({ effects: v })} />
            <Select
              label={T.reduceMotion}
              value={settings.reduceMotion}
              options={(['auto', 'yes', 'no'] as const).map((v) => ({ value: v, label: T.reduceMotionOptions[v] }))}
              onChange={(v) => set({ reduceMotion: v })}
            />
            <Toggle label={T.highContrast} checked={settings.highContrast} onChange={(v) => set({ highContrast: v })} />
            <Select
              label={T.textSize}
              value={String(settings.textSize)}
              options={opt([14, 16, 18], (v) => `${v} px`)}
              onChange={(v) => set({ textSize: Number(v) as S['textSize'] })}
            />
          </div>
        </Panel>
        <Panel title={T.constants}>
          <div className="stack">
            <Select
              label={T.constants}
              value={settings.constants}
              options={(['codata', 'aula'] as const).map((v) => ({ value: v, label: T.constantsOptions[v] }))}
              onChange={(v) => set({ constants: v })}
            />
            <Select
              label={T.sigFigs}
              value={String(settings.sigFigs)}
              options={opt([3, 4, 5], String)}
              onChange={(v) => set({ sigFigs: Number(v) as S['sigFigs'] })}
            />
            <Toggle label={T.askHypothesis} checked={settings.askHypothesis} onChange={(v) => set({ askHypothesis: v })} />
            <Select
              label={T.initialSpeed}
              value={String(settings.initialSpeed)}
              options={opt([0.25, 0.5, 1, 2, 4], (v) => `×${String(v).replace('.', ',')}`)}
              onChange={(v) => set({ initialSpeed: Number(v) })}
            />
          </div>
        </Panel>
        <Panel title={T.teacherMode}>
          <div className="stack">
            <Toggle
              label={T.fixedSeed}
              checked={settings.fixedSeed !== null}
              onChange={(v) => set({ fixedSeed: v ? 12345 : null })}
            />
            {settings.fixedSeed !== null && (
              <NumberField
                label={T.fixedSeedNumber}
                value={settings.fixedSeed}
                min={0}
                max={4294967295}
                onChange={(v) => set({ fixedSeed: Math.round(v) >>> 0 })}
              />
            )}
            <Toggle label={T.includeScripts} checked={settings.includeScripts} onChange={(v) => set({ includeScripts: v })} />
            <Toggle
              label={T.teacherMode}
              checked={settings.teacherMode}
              onChange={(v) => (v ? setTeacherAsk(true) : set({ teacherMode: false }))}
            />
          </div>
        </Panel>
        <Panel title={T.data}>
          <div className="stack">
            <Button
              onClick={() => {
                const s = useStore.getState();
                downloadFile(
                  'estacion-coulomb-progreso.json',
                  JSON.stringify(
                    { app: 'estacion-coulomb', kind: 'progress', schemaVersion: 1, progress: s.progress, drafts: s.drafts, settings: s.settings },
                    null,
                    2,
                  ),
                );
              }}
            >
              {T.exportProgress}
            </Button>
            <Button onClick={() => fileRef.current?.click()}>{T.importProgress}</Button>
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                try {
                  const data = JSON.parse(await readFileText(f));
                  if (data?.app !== 'estacion-coulomb' || data?.kind !== 'progress' || data?.schemaVersion !== 1) throw new Error();
                  useStore.getState().importProgress(data);
                  useStore.getState().toast(T.importOk);
                } catch {
                  useStore.getState().toast(T.importBad, 'error');
                }
              }}
            />
            <ConfirmButton
              label={T.clearTelemetry}
              confirmLabel={T.clearTelemetryConfirm}
              onConfirm={() => {
                useStore.getState().clearTelemetry();
                useStore.getState().toast(es.ui.telemetry.cleared);
              }}
            />
            <ConfirmButton
              label={T.resetAll}
              confirmLabel={T.resetAllConfirm}
              onConfirm={() => {
                useStore.getState().resetAll();
                useStore.getState().toast(T.resetDone);
              }}
            />
          </div>
        </Panel>
      </div>
      {teacherAsk && (
        <Modal title={T.teacherMode} onClose={() => setTeacherAsk(false)}>
          <p>{T.teacherConfirm}</p>
          <div className="modal-actions">
            <Button onClick={() => setTeacherAsk(false)}>{es.ui.app.cancel}</Button>
            <Button
              variant="primary"
              onClick={() => {
                set({ teacherMode: true });
                setTeacherAsk(false);
              }}
            >
              {T.teacherActivate}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
