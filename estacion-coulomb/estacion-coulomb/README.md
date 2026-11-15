# Estación Coulomb

Videojuego educativo de electromagnetismo para Física II y grado 11. El estudiante reactiva una estación de investigación resolviendo nueve pruebas con física real: la **Ley de Coulomb**, la **fuerza de Lorentz** y la **Ley de Faraday**. Incluye una consola de programación en pseudocódigo (PseudoCoulomb, inspirado en PSeInt), una Cámara de Pruebas libre y un Panel de Telemetría para el docente.

- Las trayectorias salen de integrar la fuerza de Lorentz con el **método de Boris** y paso de tiempo fijo, con constantes **CODATA 2022**.
- Funciona **sin conexión** (PWA) y no envía datos a ningún servidor.
- Toda la interfaz está en español de Colombia (`src/i18n/es.ts`).

**Enlace publicado:** `https://<usuario>.github.io/<repositorio>/` (ver «Publicar»).

## Instalar y ejecutar

Requiere Node.js LTS.

```bash
npm ci
npm run dev
```

Abre `http://localhost:5173/`.

## Probar

```bash
npm run lint
npm run test
npm run test:coverage
npm run build
```

- `npm run test` ejecuta las pruebas unitarias y de componentes (Vitest): formato de números, física, integrador, geometría, intérprete, los 9 niveles (incluida la búsqueda por fuerza bruta de las 1129 colocaciones del 1-3), aleatoriedad, generador y telemetría (sección 22 de la especificación).
- `npm run test:e2e` ejecuta las 6 pruebas de humo de Playwright (sección 22.10) contra `vite preview`. La primera vez instala el navegador con `npx playwright install chromium`. En Windows también puedes usar el Edge instalado: `PW_CHANNEL=msedge npm run test:e2e`.

## Publicar en GitHub Pages

La app se publica sola cada vez que se sube un cambio a `main` (flujo `.github/workflows/deploy.yml`).

1. Crea un repositorio **público** en GitHub, por ejemplo `estacion-coulomb`, y sube este proyecto a la rama `main`.
2. En el repositorio: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Después de cada `git push` a `main`, revisa la pestaña **Actions**. Cuando el flujo termina en verde, la app está en `https://<usuario>.github.io/estacion-coulomb/`.

El flujo ejecuta `npm run lint`, `npm run test` y `npm run build` con `BASE_PATH=/<repositorio>/`. Si las pruebas fallan, el sitio no se publica y sigue en línea la versión anterior.

**Verificación después de publicar:** abre la dirección (arranque y Centro de Comando), abre `#/nivel/1-1` y recarga, activa «Sin conexión» en las herramientas del navegador y recarga (la app sigue funcionando), e instálala como app.

### Problemas frecuentes

| Síntoma | Causa | Solución |
|---|---|---|
| La dirección da error 404 | Pages no está configurado con GitHub Actions | Settings → Pages → Source: GitHub Actions |
| Página en blanco y errores 404 de archivos `.js` | La ruta base no coincide con el nombre del repositorio | Revisar `BASE_PATH` en el flujo |
| El flujo falla en «Pruebas» | Alguna prueba no pasa | Ejecutar `npm run test` en local y corregir |
| Se ve una versión vieja | El *service worker* guardó la anterior | Recargar dos veces; la app avisa «Hay una versión nueva» y se actualiza sola |

## Estructura de carpetas

```
src/
  core/        física y lógica pura (sin React ni DOM): constantes, campos, integrador de Boris,
               geometría, mundo, generador, líneas de campo, formato, evaluación, telemetría,
               ejecución de intentos (attempt.ts) y modelo de la Cámara de Pruebas (sandbox.ts)
  script/      intérprete de PseudoCoulomb: lexer, parser, intérprete, funciones y errores
  data/        niveles (lab1.ts, lab2.ts, lab3.ts), plantillas de guiones y ejemplos
  i18n/es.ts   todos los textos visibles
  store/       estado global (Zustand) y persistencia en localStorage
  render/      dibujo en Canvas (escena, visor de campo, generador y osciloscopio)
  audio/       sonidos sintetizados con Web Audio
  ui/          componentes base, HUD y pantallas
tests/e2e/     pruebas de Playwright
scripts/       generación de los íconos de la PWA
```

## Cómo agregar un nivel

1. Agrega los datos en `src/data/levels/labN.ts` siguiendo el tipo `ParticleLevel` o `GeneratorLevel` de `src/core/level.ts` (mundo, paso de tiempo, anclajes, inventario, controles y `buildScene`).
2. Agrega sus textos (nombre, objetivo, pistas, sugerencias, concepto, reto e hipótesis) en `es.levels` de `src/i18n/es.ts`.
3. Si el éxito no es «la partícula llega a su receptor», agrega su evaluación en `src/core/evaluation.ts` y su reto en `challengeMet`.
4. Agrega pruebas en `src/data/levels/levels.test.ts` con una solución que funcione y configuraciones que fallen. La prueba de esquema revisa que las coordenadas estén dentro del mundo y que los anclajes no se superpongan.

## Créditos

- Constantes físicas: CODATA 2022 (NIST).
- Masas de los isótopos ²⁰Ne y ²²Ne: AME2020 (Atomic Mass Evaluation).
- Tipografías Orbitron e IBM Plex Mono (Fontsource), fórmulas con KaTeX; todo empaquetado localmente.

Las decisiones que la especificación dejó abiertas están en `DECISIONES.md`.
