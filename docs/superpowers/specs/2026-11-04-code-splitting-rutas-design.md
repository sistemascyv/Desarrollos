# Code-splitting por ruta (frontend) — Diseño

**Contexto:** Tercer y último de los 3 ejes acordados con el usuario (seguridad del CI/CD, tests automáticos, arquitectura), después de completar los dos anteriores. Cada build del frontend emite un único bundle de ~1MB (`dist/assets/index-*.js`) y Vite advierte "Some chunks are larger than 500 kB after minification". No hay ningún reporte de lentitud real por parte de los usuarios del sistema — es una mejora preventiva, pedida explícitamente con el criterio de "lo más profesional" en vez de el parche más chico posible.

## Decisión de alcance

Se confirmó, antes de proponer nada, que el router (`web/src/App.tsx`) es plano (sin rutas anidadas complejas) y que ninguna página usa hoy `React.lazy()` — este sería el primer uso del patrón en el proyecto. Se identificaron 4 dependencias pesadas, cada una acotada a 1-3 páginas: `leaflet` (mapa de flota), `tesseract.js` (OCR de cheques), `xlsx` (exportación a Excel, en 3 archivos de 2 módulos distintos) y `html-to-image` (exportación de imagen del cuadro tarifario).

Se evaluaron 3 enfoques:
- **Code-splitting solo en las páginas con dependencias pesadas** — el diff más chico, pero deja el router con páginas "de primera" (lazy) y "de segunda" (no lazy) sin un criterio consistente, y cualquier página nueva que se agregue pesada en el futuro no queda cubierta a menos que alguien se acuerde de aplicarlo.
- **Code-splitting en todas las rutas (elegido):** aplicar `React.lazy()` de forma uniforme a todas las páginas del router, con la única excepción de `LoginPage` y `HomePage` (las dos pantallas de entrada de cada sesión — volverlas lazy solo agregaría un parpadeo de carga sin ningún beneficio, ya que se necesitan de entrada en casi toda visita). Es el patrón estándar en aplicaciones React/Vite en producción, y cualquier página pesada que se agregue después queda cubierta automáticamente.
- **Lo anterior + separar vendors (`react`, `react-dom`, `react-router-dom`, `pocketbase`) en su propio chunk cacheable vía `manualChunks`** — mejora el cacheo entre deploys, pero agrega configuración para un beneficio marginal en una app interna de este tamaño, sin ningún problema de cacheo detectado hoy. **Queda explícitamente fuera de este spec**, como posible mejora futura si alguna vez se justifica.

## Qué páginas quedan lazy

Import normal (sin cambios), porque son la pantalla de entrada de cada sesión:
- `LoginPage` (vía `LoginOrRedirect` en la ruta `/`)
- `HomePage` (ruta `/inicio`)

Pasan a `React.lazy()` (las 13 páginas restantes del router en `web/src/App.tsx`):
`PlanillaChoferesPage`, `ControlChequesPage`, `CentralDeudoresPage`, `ValeCajaPage`, `RecibosPage`, `ReporteCombustiblePage`, `PanelCubiertasPage`, `PosicionFlotaPage`, `FichadasPage`, `BotTarifasPage`, `CuadroTarifarioPage`, `CotizadorPage`, `CotizacionImprimirPage`, `AdminPage`.

## Indicador de carga

Un `<Suspense>` envolviendo el `<Outlet/>` dentro de `web/src/components/AppLayout.tsx` (no envolviendo todo `<Routes>` en `App.tsx`) — así el menú lateral y el header de `AppLayout` quedan fijos durante la navegación entre módulos, y solo el área de contenido muestra el indicador de carga mientras llega el código de esa página.

El `fallback` es un componente nuevo y chico, `web/src/components/PageLoading.tsx`, que sigue la paleta de colores existente del sistema (usa las variables CSS ya definidas en `index.css`, nada de librerías de spinners nuevas).

## Manejo de error: falla de carga de un chunk tras un deploy

Al separar por rutas, el código de cada página pesada se descarga del servidor en el momento en que se visita esa ruta, no de entrada. Si una pestaña queda abierta mucho tiempo y en el medio se hace un deploy nuevo, el archivo de una página todavía no visitada puede haber cambiado de nombre en el servidor (los nombres incluyen un hash de contenido) — navegar ahí dispara un error de carga del chunk. Hoy esto no puede pasar porque todo está en un único archivo descargado una sola vez al entrar.

Se agrega un componente nuevo, `web/src/components/ChunkErrorBoundary.tsx` (error boundary de React, clase, ya que los error boundaries no tienen equivalente en hooks), envolviendo el mismo `<Suspense>` dentro de `AppLayout.tsx`. Captura cualquier error lanzado por sus hijos (sin intentar distinguir el tipo de error — más simple y suficientemente correcto) y muestra un mensaje fijo: "Hubo un problema cargando esta sección. Recargá la página." con un botón que ejecuta `window.location.reload()`.

## Qué no cambia

- `web/vite.config.ts`: no requiere ningún cambio. Vite separa automáticamente cada `import()` dinámico en su propio archivo de salida; no hace falta configurar `build.rollupOptions.output.manualChunks` ni nada equivalente para este alcance.
- No se sube `build.chunkSizeWarningLimit`. Subir el límite silenciaría la advertencia sin resolver el problema real; con el split, se espera que el chunk principal quede bien por debajo del límite de 500kB por defecto y la advertencia desaparezca sola.
- No se toca el servidor ni el pipeline de deploy. El build sigue publicándose igual (`rsync` a `pb_public/`, sin `--delete` ahí, igual que hoy) — ahora son más archivos pero cada uno más chico; el total de datos sigue siendo comparable o menor, servidos de la misma forma (archivos estáticos). Impacto de recursos en el servidor: ninguno.

## Verificación

Este proyecto no tiene tests automatizados de componentes React (excluido a propósito en el eje de tests automáticos anterior). La verificación es:
1. `cd web && npm run build` y confirmar que la salida muestra varios archivos de chunk en vez de un único bundle de ~1MB, y que la advertencia de "chunks larger than 500 kB" ya no aparece (o que el chunk principal de entrada quedó muy por debajo de ese límite).
2. Pasada manual por las 13 páginas que pasan a lazy en staging, confirmando que cada una carga y funciona igual que antes, y que el indicador de carga se ve brevemente al navegar a una que no se visitó todavía en esa sesión.
3. Verificación manual del error boundary: forzar temporalmente un fallo de import en una página (ej. una ruta de import rota) para confirmar que se muestra el mensaje de error con el botón de recarga en vez de una pantalla rota, y revertir ese cambio antes de commitear.
