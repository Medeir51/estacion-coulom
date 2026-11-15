import { expect, test, type Page } from '@playwright/test';

/** Posición en pantalla de un punto del mundo (m), con la misma cámara que src/render/scene.ts. */
async function worldToClient(page: Page, world: { w: number; h: number }, x: number, y: number) {
  const box = (await page.locator('.canvas-wrap canvas').boundingBox())!;
  const pad = 22;
  const scale = Math.min((box.width - 2 * pad) / world.w, (box.height - 2 * pad) / world.h);
  const ox = (box.width - world.w * scale) / 2;
  const oy = (box.height + world.h * scale) / 2;
  return { x: box.x + ox + x * scale, y: box.y + oy - y * scale };
}

async function skipWelcome(page: Page) {
  await page.goto('./');
  await page.keyboard.press('Space');
  await expect(page.getByRole('heading', { name: 'ESTACIÓN COULOMB' })).toBeVisible();
}

async function closeBriefing(page: Page) {
  const start = page.getByRole('button', { name: 'Comenzar' });
  if (await start.isVisible().catch(() => false)) await start.click();
}

test('E1: arranque y Centro de Comando', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByText('ESTACIÓN COULOMB · SISTEMA DE CONTROL v1.0')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'ESTACIÓN COULOMB' })).toBeVisible({ timeout: 5000 });
  await expect(page.getByRole('button', { name: /LABORATORIOS DE PRUEBAS/ })).toBeVisible();
  await expect(page.getByText('Estado: Generador OFF · Colisionador OFF · Red OFF')).toBeVisible();
});

test('E2 y E3: 1-1 arrastrando +1 nC a A1, y el progreso se conserva al recargar', async ({ page }) => {
  await skipWelcome(page);
  await page.getByRole('button', { name: 'Empezar por el Laboratorio 1' }).click();
  await closeBriefing(page);
  const item = page.getByRole('button', { name: /Tomar \+1 nC/ });
  const ib = (await item.boundingBox())!;
  const a1 = await worldToClient(page, { w: 0.4, h: 0.25 }, 0.2, 0.13);
  await page.mouse.move(ib.x + 20, ib.y + ib.height / 2);
  await page.mouse.down();
  await page.mouse.move((ib.x + a1.x) / 2, (ib.y + a1.y) / 2, { steps: 5 });
  await page.mouse.move(a1.x, a1.y, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByText('+1 nC · A1')).toBeVisible();
  await page.getByRole('button', { name: 'Resultado inmediato' }).click();
  await page.getByRole('button', { name: 'Saltar', exact: true }).click();
  await expect(page.getByRole('heading', { name: /NIVEL SUPERADO/ })).toBeVisible();
  await expect(page.getByText('★ Superaste la prueba')).toBeVisible();
  // E3
  await page.reload();
  await page.goto('./#/campana');
  await expect(page.getByRole('button', { name: /Prueba 1-1, Primer destello, Superada/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Prueba 1-2, Placas de deflexión, Disponible/ })).toBeVisible();
});

test('E4: modo docente, 2-2 con el guion de referencia', async ({ page }) => {
  await skipWelcome(page);
  await page.goto('./#/ajustes');
  await page.getByRole('switch', { name: /Modo docente/ }).click();
  await page.getByRole('button', { name: 'Activar' }).click();
  await page.goto('./#/nivel/2-2');
  await closeBriefing(page);
  const script = `Inicio
fijarVoltaje("C1", 5e5 * 0.10 * 0.02)
placaPositiva("C1", "inferior")
FinInicio`;
  await page.getByRole('tab', { name: 'Guion' }).click();
  await page.getByRole('textbox', { name: 'Editor del guion' }).fill(script);
  await page.getByRole('button', { name: 'Resultado inmediato' }).click();
  await page.getByRole('button', { name: 'Saltar', exact: true }).click();
  await expect(page.getByRole('heading', { name: /NIVEL SUPERADO/ })).toBeVisible();
});

test('E5: funciona sin conexión después de la primera visita', async ({ page, context }) => {
  await page.goto('./');
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    return !!reg.active;
  });
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await page.reload();
  await page.keyboard.press('Space');
  await expect(page.getByRole('heading', { name: 'ESTACIÓN COULOMB' })).toBeVisible();
  await context.setOffline(false);
});

test('E6: 1-1 solo con teclado (−1 nC en A2)', async ({ page }) => {
  await skipWelcome(page);
  await page.getByRole('button', { name: 'Empezar por el Laboratorio 1' }).click();
  await closeBriefing(page);
  await page.getByRole('button', { name: /Tomar −1 nC/ }).focus();
  await page.keyboard.press('Enter');
  const listbox = page.getByRole('listbox');
  await expect(listbox).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('option', { name: /Anclaje A2/ })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByText('−1 nC · A2')).toBeVisible();
  await page.locator('body').focus();
  await page.keyboard.press('Shift+Space');
  await expect(page.getByRole('heading', { name: '¿Qué crees que va a pasar?' })).toBeVisible();
  // Tab hasta el campo de texto de la hipótesis y Enter para ejecutar.
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab');
    if (await page.evaluate(() => document.activeElement?.id === 'hyp-text')) break;
  }
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: /NIVEL SUPERADO/ })).toBeVisible();
});
