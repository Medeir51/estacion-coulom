# Decisiones

Registro de lo que la especificación no definía o que hubo que adaptar (regla 8 de la sección 0).

| Fecha | Sección | Decisión | Motivo |
|---|---|---|---|
| 2026-11-15 | 4 | TypeScript 6.0 en lugar de 7.0 (la plantilla actual de Vite trae 7.0). | `typescript-eslint` todavía no acepta TypeScript 7 y la especificación exige ESLint. |
| 2026-11-15 | 4 | ESLint (configuración plana con `typescript-eslint`, `react-hooks` y `react-refresh`) en lugar de oxlint, que es lo que trae ahora la plantilla. | La especificación pide `eslint .`. Se agregó una regla que prohíbe `eval` y `new Function`. |
| 2026-11-15 | 21.3 | Versiones de las acciones: checkout v7, setup-node v7, configure-pages v6, upload-pages-artifact v5, deploy-pages v5. | Se verificaron con las etiquetas publicadas en GitHub; coinciden con las de la especificación. |
| 2026-11-15 | 10.5 | En las pruebas con consola, un guion vacío o con solo comentarios se ejecuta como «sin guion». El intérprete sigue dando E-ESTR (prueba S33) si se analiza directamente o con «Verificar». | Las tablas de resultados verificados incluyen intentos «sin guion» (2-3 y 3-3). |
| 2026-11-15 | 10.5, 16.3 | Un guion con error de sintaxis no inicia la simulación, pero el intento se registra en la telemetría como `scriptError` y se muestra el informe «ERROR EN EL GUION». | Así la métrica «Errores de guion» cuenta también los errores de sintaxis. |
| 2026-11-15 | 9.6 | En el 2-2 el `Ciclo` (opcional) se ejecuta cada 1 × 10⁻⁷ s (100 pasos). | La tabla solo dice «solo Inicio» y la sección 13.2 permite un `Ciclo`. |
| 2026-11-15 | 13.3 | La perilla \|B\| del 2-3 empieza en 0 mT. | La especificación no da un valor por defecto; así no se regala la solución. |
| 2026-11-15 | 13.3 | Antes de barajar, los iones del 2-3 están en el orden 5 × ²⁰Ne⁺ y luego 5 × ²²Ne⁺. | Es el orden que reproduce exactamente la secuencia de la prueba N19 con la semilla 12345. |
| 2026-11-15 | 14.1, 14.2 | Resistencia de la lámpara del 3-1: 14,4 Ω; rack del 3-2: 3 servidores en paralelo (4,8 Ω), igual que el 3-3. | La especificación solo define la carga del 3-3; la resistencia solo afecta a las lecturas de corriente y potencia. |
| 2026-11-15 | 11.5 | Los retos «en N intentos o menos» cuentan los intentos físicos (éxito o fallo). Los errores de guion y los intentos detenidos no cuentan. | La sección 10.5 dice que un error de guion «no cuenta como intento físico fallido». |
| 2026-11-15 | 8.6, 16.2 | Detener un intento lo descarta y lo registra en la telemetría con resultado `aborted`, que no entra en ninguna métrica. El número de intento de la cabecera cuenta todos los registros del nivel. | El modelo de datos incluye `aborted`. |
| 2026-11-15 | 11.1 | La ventana de hipótesis también aparece antes de «Resultado inmediato». | La prueba E2 dice «pulsar Resultado inmediato (saltando la hipótesis)». |
| 2026-11-15 | 16.2 | `hypothesisMatched` compara la opción rápida con una categoría de resultado definida por nivel (por ejemplo, en 1-3: llega, pared exterior, pared interior, carga). | La especificación da el ejemplo «Llega al receptor» ↔ éxito sin definir las demás opciones. |
| 2026-11-15 | 15.5 | En la Cámara de Pruebas el límite de 200 partículas se aplica al total de disparos de una ejecución. | Equivale al límite de partículas en vuelo en el peor caso y es más simple de explicar. |
| 2026-11-15 | 15.2 | En la Cámara de Pruebas, un clic en la paleta agrega el componente en el centro del mundo (imantado); luego se arrastra o se edita en el panel de propiedades. | Funciona igual con mouse, pantalla táctil y teclado. |
| 2026-11-15 | 15.2 | Tiempo máximo de vuelo en la Cámara de Pruebas: 20 veces lo que tarda la partícula más lenta en recorrer la diagonal del mundo (con un tope de 2 millones de pasos). Las trayectorias se guardan submuestreadas para no pasar de unos 20 000 puntos. | No estaba definido. |
| 2026-11-15 | 6.3, 19.1 | Las ventanas modales enfocan la propia ventana al abrirse (no su primer botón). | Sin esto, la misma tecla Enter que ejecuta el intento desde la hipótesis activaba el primer botón de la ventana «Nivel superado» y la cerraba. |
| 2026-11-15 | 8.3 | Si el trazado de líneas de campo tarda más de 30 ms, las líneas por carga se reducen un 30 % en el siguiente cálculo (mínimo 4). | La especificación pide reducirlas sin decir cuánto. |
| 2026-11-15 | 14 | Los servidores y la lámpara se encienden durante el intento cuando el voltaje del último ciclo está en rango; al final quedan encendidos solo si se superó la prueba. | Retroalimentación visual inmediata. |
| 2026-11-15 | 16.1 | Las sesiones guardan como máximo las 200 más recientes. | Evita que `localStorage` crezca sin límite. |
| 2026-11-15 | 22.10 | E2 y E3 están en una misma prueba de Playwright (E3 recarga después de superar el 1-1 en E2). La configuración acepta `PW_CHANNEL=msedge` para usar el Edge instalado si no se descargó Chromium. | E3 depende del estado que deja E2. |
| 2026-11-15 | 21.2 | Los íconos PNG de la PWA se generan con `npm run icons` (`scripts/make-icons.mjs`), sin dependencias. | La especificación pide un átomo estilizado sobre `--fondo`. |
