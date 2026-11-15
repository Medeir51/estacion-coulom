import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { getLevel } from '../data/levels';
import { defaultConfig } from '../core/level';
import { useStore } from '../store';
import { ConfirmButton, Knob } from './components/base';
import { Inventory, Mission } from './hud/Panels';
import Command from './screens/Command';
import { highlight } from './components/CodeEditor';

afterEach(cleanup);

describe('Componentes', () => {
  it('Centro de Comando muestra la línea de estado y las cuatro tarjetas', () => {
    useStore.setState((s) => ({ progress: { ...s.progress, welcomed: true } }));
    render(<Command />);
    expect(screen.getByText('Estado: Generador OFF · Colisionador OFF · Red OFF')).toBeTruthy();
    for (const t of ['LABORATORIOS DE PRUEBAS', 'CÁMARA DE PRUEBAS', 'PANEL DE TELEMETRÍA', 'ARCHIVO TÉCNICO']) {
      expect(screen.getByRole('heading', { name: t })).toBeTruthy();
    }
  });

  it('la perilla acepta un valor escrito y lo limita al rango', () => {
    let v = 0;
    render(<Knob label="Voltaje" unit="V" min={0} max={100} step={0.5} value={0} onChange={(x) => (v = x)} />);
    const input = screen.getByLabelText(/Voltaje \(V\)/);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '45,3' } });
    fireEvent.blur(input);
    expect(v).toBe(45.5);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '500' } });
    fireEvent.blur(input);
    expect(v).toBe(100);
  });

  it('la confirmación en la página pide un segundo clic', () => {
    let done = 0;
    render(<ConfirmButton label="Reiniciar todo" confirmLabel="Confirmar: borrar todo" onConfirm={() => done++} />);
    fireEvent.click(screen.getByText('Reiniciar todo'));
    expect(done).toBe(0);
    fireEvent.click(screen.getByText('Confirmar: borrar todo'));
    expect(done).toBe(1);
  });

  it('inventario: colocación con teclado anuncia los anclajes libres', () => {
    const level = getLevel('1-1');
    let placed = '';
    render(
      <Inventory
        level={level}
        cfg={defaultConfig(level)}
        locked={false}
        targets={[
          { id: 'A1', label: 'Anclaje A1, en (20,0; 13,0) cm, libre', free: true },
          { id: 'A2', label: 'Anclaje A2, en (20,0; 3,0) cm, libre', free: true },
        ]}
        placing="n1"
        focusTarget="A2"
        onPointerPick={() => {}}
        onKeyPick={() => {}}
        onFocusTarget={() => {}}
        onPlace={(t) => (placed = t)}
        onCancel={() => {}}
        onRemove={() => {}}
      />,
    );
    const opt = screen.getByRole('option', { name: 'Anclaje A2, en (20,0; 3,0) cm, libre' });
    fireEvent.keyDown(opt, { key: 'Enter' });
    expect(placed).toBe('A2');
  });

  it('misión: avisa antes de abrir la primera pista', () => {
    let opened = 0;
    render(
      <Mission
        level={getLevel('1-3')}
        conditions={null}
        hintsUsed={0}
        onHint={() => opened++}
        log={[]}
        onLogClick={() => {}}
        teacher={false}
        onReference={() => {}}
        onResetDraft={() => {}}
      />,
    );
    fireEvent.click(screen.getAllByText('Ver pista 1')[0]);
    expect(opened).toBe(0);
    expect(screen.getByText(/Usar pistas puede costarte estrellas/)).toBeTruthy();
  });

  it('resaltado de sintaxis marca palabras clave, números, textos y comentarios', () => {
    const { container } = render(<pre>{highlight('Si x > 1.5 Entonces // c\n Escribir "a"')}</pre>);
    expect(container.querySelector('.tok-kw')?.textContent).toBe('Si');
    expect(container.querySelector('.tok-num')?.textContent).toBe('1.5');
    expect(container.querySelector('.tok-com')?.textContent).toBe('// c');
    expect(container.querySelector('.tok-str')?.textContent).toBe('"a"');
  });
});
