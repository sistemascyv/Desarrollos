# Code-splitting por ruta (frontend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dividir el bundle de frontend de ~1MB en chunks separados por página usando `React.lazy()` + `Suspense`, con un indicador de carga y un error boundary para fallos de carga de chunk tras un deploy.

**Architecture:** 13 de las 15 páginas del router pasan de import estático a `React.lazy()` (Login y Home quedan eager, son la pantalla de entrada de cada sesión). Un `<Suspense>` + un error boundary de clase envuelven únicamente el `<Outlet/>` dentro de `AppLayout.tsx`, así el menú/header no se recargan al navegar. No hay framework de testing de componentes React en este proyecto — la verificación es build + lint + test (de `lib/`, ya existentes) + verificación manual.

**Tech Stack:** React 19 (`lazy`, `Suspense`, error boundary de clase), Vite 8 (code-splitting automático de `import()`, sin configuración adicional).

## Global Constraints

- Páginas que quedan eager (sin tocar su import): `LoginPage`, `HomePage`.
- Páginas que pasan a `React.lazy()`: `PlanillaChoferesPage`, `ControlChequesPage`, `CentralDeudoresPage`, `ValeCajaPage`, `RecibosPage`, `ReporteCombustiblePage`, `PanelCubiertasPage`, `PosicionFlotaPage`, `FichadasPage`, `BotTarifasPage`, `CuadroTarifarioPage`, `CotizadorPage`, `CotizacionImprimirPage`, `AdminPage`. Todas tienen export nombrado (no default), así que cada `lazy()` usa el patrón `lazy(() => import('...').then((m) => ({ default: m.X })))`.
- El `<Suspense>` + error boundary envuelven únicamente el `<Outlet/>` dentro de `AppLayout.tsx`, nunca `<StatusBanner/>` ni el resto del layout.
- No se modifica `web/vite.config.ts` ni se sube `build.chunkSizeWarningLimit`.
- `web/tsconfig.app.json` tiene `verbatimModuleSyntax: true` — los imports de solo-tipo van inline (`import { Component, type ReactNode } from 'react'`), no como `import type` aparte.
- El botón de recarga del error boundary es un `<button type="button">` sin clases extra (hereda el estilo primario por defecto ya definido en `index.css`).
- No se agrega ningún test automatizado de componentes React (fuera de alcance, decidido en el eje de tests automáticos anterior). `npm run build`, `npm run lint` y `npm run test` deben salir en 0/48-passing en cada tarea.

---

### Task 1: Componentes de carga/error + wiring en AppLayout (sin lazy todavía)

**Files:**
- Create: `web/src/components/PageLoading.tsx`
- Create: `web/src/components/ChunkErrorBoundary.tsx`
- Modify: `web/src/index.css` (agregar al final del archivo)
- Modify: `web/src/components/AppLayout.tsx:1-6` (imports) y `web/src/components/AppLayout.tsx:75-78` (envolver `<Outlet/>`)

**Interfaces:**
- Produces: `PageLoading` (componente, sin props) — usado como `fallback` de `Suspense` en este mismo task y consumido tal cual en Task 2 si hiciera falta en otro lugar (no lo hace).
- Produces: `ChunkErrorBoundary` (componente, prop `children: ReactNode`) — envuelve el `Suspense` en este mismo task.
- Esta tarea no deja nada lazy todavía: ningún comportamiento visible debería cambiar.

- [ ] **Step 1: Crear `web/src/components/PageLoading.tsx`**

```tsx
export function PageLoading() {
  return (
    <div className="page-loading">
      <div className="page-loading-spinner" />
    </div>
  );
}
```

- [ ] **Step 2: Crear `web/src/components/ChunkErrorBoundary.tsx`**

```tsx
import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ChunkErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="page-load-error">
          <p>Hubo un problema cargando esta sección. Recargá la página.</p>
          <button type="button" onClick={() => window.location.reload()}>
            Recargar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
```

- [ ] **Step 3: Agregar el CSS nuevo al final de `web/src/index.css`**

Abrir `web/src/index.css`, ir al final del archivo, y agregar:

```css

/* ---------- carga diferida de páginas (code-splitting) ---------- */
.page-loading {
  display: flex;
  justify-content: center;
  padding: 60px 20px;
}
.page-loading-spinner {
  width: 28px;
  height: 28px;
  border: 3px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: page-loading-spin 0.8s linear infinite;
}
@keyframes page-loading-spin {
  to {
    transform: rotate(360deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .page-loading-spinner {
    animation: none;
  }
}
.page-load-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 60px 20px;
  text-align: center;
  color: var(--muted);
}
```

- [ ] **Step 4: Envolver el `<Outlet/>` en `web/src/components/AppLayout.tsx`**

El archivo hoy empieza así (primeras 6 líneas):

```tsx
import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { MODULES } from '../types';
import { ThemeToggle } from './ThemeToggle';
import { StatusBanner } from './StatusBanner';
```

Agregar dos imports nuevos, quedando:

```tsx
import { Suspense, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { MODULES } from '../types';
import { ThemeToggle } from './ThemeToggle';
import { StatusBanner } from './StatusBanner';
import { PageLoading } from './PageLoading';
import { ChunkErrorBoundary } from './ChunkErrorBoundary';
```

Más abajo, el contenido hoy es (líneas 75-78):

```tsx
        <div id="content-area">
          <StatusBanner />
          <Outlet />
        </div>
```

Reemplazar por:

```tsx
        <div id="content-area">
          <StatusBanner />
          <ChunkErrorBoundary>
            <Suspense fallback={<PageLoading />}>
              <Outlet />
            </Suspense>
          </ChunkErrorBoundary>
        </div>
```

- [ ] **Step 5: Verificar build y lint**

Run: `cd web && npm run build`
Expected: exit code 0, sin errores de TypeScript. Nota: el bundle sigue siendo un único archivo de ~1MB en este paso — recién en Task 2 aparecen los chunks separados, porque todavía ninguna página es `lazy()`.

Run: `cd web && npm run lint`
Expected: exit code 0 (solo los warnings preexistentes de siempre, ninguno nuevo).

- [ ] **Step 6: Verificación manual — nada debería haber cambiado visualmente**

Run: `cd web && npm run dev`, abrir el sistema en el navegador, loguearse, y navegar entre 2-3 páginas cualquiera (por ejemplo Inicio → Vale de Caja → Inicio).
Expected: la app se ve y se comporta exactamente igual que antes de este cambio — no debería aparecer ningún spinner ni ningún mensaje de error, porque `Suspense` solo se activa cuando hay un componente `lazy()` cargando, y todavía no existe ninguno.

- [ ] **Step 7: Commit**

```bash
git add web/src/components/PageLoading.tsx web/src/components/ChunkErrorBoundary.tsx web/src/components/AppLayout.tsx web/src/index.css
git commit -m "Code-splitting: componentes de carga/error + Suspense en AppLayout"
```

---

### Task 2: Convertir las 13 páginas a `React.lazy()` + verificación de code-splitting

**Files:**
- Modify: `web/src/App.tsx` (todo el bloque de imports, líneas 1-20)

**Interfaces:**
- Consumes: ninguna interfaz nueva de Task 1 — este task no importa `PageLoading` ni `ChunkErrorBoundary` directamente, solo se beneficia del `Suspense`/error boundary ya cableados en `AppLayout.tsx`.
- No produce ninguna interfaz nueva para tareas posteriores (es la última tarea del plan).

- [ ] **Step 1: Reemplazar el bloque de imports de `web/src/App.tsx`**

El archivo hoy empieza así (líneas 1-20):

```tsx
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/AuthContext';
import { LoginPage } from './pages/LoginPage';
import { HomePage } from './pages/HomePage';
import { PlanillaChoferesPage } from './pages/planilla/PlanillaChoferesPage';
import { ControlChequesPage } from './pages/cheques/ControlChequesPage';
import { CentralDeudoresPage } from './pages/deudores/CentralDeudoresPage';
import { ValeCajaPage } from './pages/tesoreria/ValeCajaPage';
import { RecibosPage } from './pages/tesoreria/RecibosPage';
import { ReporteCombustiblePage } from './pages/flota/ReporteCombustiblePage';
import { PanelCubiertasPage } from './pages/flota/PanelCubiertasPage';
import { PosicionFlotaPage } from './pages/flota/satelital/PosicionFlotaPage';
import { FichadasPage } from './pages/fichadas/FichadasPage';
import { BotTarifasPage } from './pages/tarifas/BotTarifasPage';
import { CuadroTarifarioPage } from './pages/tarifas/CuadroTarifarioPage';
import { CotizadorPage } from './pages/tarifas/CotizadorPage';
import { CotizacionImprimirPage } from './pages/tarifas/CotizacionImprimirPage';
import { AdminPage } from './pages/admin/AdminPage';
import { AppLayout } from './components/AppLayout';
import { RequireAuth, RequireAdmin, RequireModule } from './components/RequireAuth';
```

Reemplazar por:

```tsx
import { lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/AuthContext';
import { LoginPage } from './pages/LoginPage';
import { HomePage } from './pages/HomePage';
import { AppLayout } from './components/AppLayout';
import { RequireAuth, RequireAdmin, RequireModule } from './components/RequireAuth';

const PlanillaChoferesPage = lazy(() =>
  import('./pages/planilla/PlanillaChoferesPage').then((m) => ({ default: m.PlanillaChoferesPage }))
);
const ControlChequesPage = lazy(() =>
  import('./pages/cheques/ControlChequesPage').then((m) => ({ default: m.ControlChequesPage }))
);
const CentralDeudoresPage = lazy(() =>
  import('./pages/deudores/CentralDeudoresPage').then((m) => ({ default: m.CentralDeudoresPage }))
);
const ValeCajaPage = lazy(() =>
  import('./pages/tesoreria/ValeCajaPage').then((m) => ({ default: m.ValeCajaPage }))
);
const RecibosPage = lazy(() =>
  import('./pages/tesoreria/RecibosPage').then((m) => ({ default: m.RecibosPage }))
);
const ReporteCombustiblePage = lazy(() =>
  import('./pages/flota/ReporteCombustiblePage').then((m) => ({ default: m.ReporteCombustiblePage }))
);
const PanelCubiertasPage = lazy(() =>
  import('./pages/flota/PanelCubiertasPage').then((m) => ({ default: m.PanelCubiertasPage }))
);
const PosicionFlotaPage = lazy(() =>
  import('./pages/flota/satelital/PosicionFlotaPage').then((m) => ({ default: m.PosicionFlotaPage }))
);
const FichadasPage = lazy(() =>
  import('./pages/fichadas/FichadasPage').then((m) => ({ default: m.FichadasPage }))
);
const BotTarifasPage = lazy(() =>
  import('./pages/tarifas/BotTarifasPage').then((m) => ({ default: m.BotTarifasPage }))
);
const CuadroTarifarioPage = lazy(() =>
  import('./pages/tarifas/CuadroTarifarioPage').then((m) => ({ default: m.CuadroTarifarioPage }))
);
const CotizadorPage = lazy(() =>
  import('./pages/tarifas/CotizadorPage').then((m) => ({ default: m.CotizadorPage }))
);
const CotizacionImprimirPage = lazy(() =>
  import('./pages/tarifas/CotizacionImprimirPage').then((m) => ({ default: m.CotizacionImprimirPage }))
);
const AdminPage = lazy(() => import('./pages/admin/AdminPage').then((m) => ({ default: m.AdminPage })));
```

El resto del archivo (el componente `LoginOrRedirect`, el componente `App` con todas sus rutas, el `export default App`) queda exactamente igual — ninguna línea dentro de `<Routes>` cambia, porque las rutas usan los mismos nombres de componente (`PlanillaChoferesPage`, `ControlChequesPage`, etc.), solo que ahora esos nombres apuntan a un componente `lazy` en vez de un import estático.

- [ ] **Step 2: Verificar build y confirmar los chunks separados**

Run: `cd web && npm run build`
Expected: exit code 0. En el output de Vite deberían aparecer múltiples archivos nuevos bajo `dist/assets/` (uno por cada página convertida a `lazy()`, con nombres tipo `PlanillaChoferesPage-<hash>.js`, `ControlChequesPage-<hash>.js`, etc.) en vez de un único `index-<hash>.js` de ~1MB. La advertencia "Some chunks are larger than 500 kB after minification" no debería aparecer más (o, si aparece, debe ser para un chunk puntual muy por debajo de los ~1MB de antes — en ese caso evaluar con el usuario, pero no se espera que pase dado el tamaño de las dependencias identificadas en el spec).

- [ ] **Step 3: Verificar lint y la suite de tests existente**

Run: `cd web && npm run lint`
Expected: exit code 0 (mismos warnings preexistentes de siempre, ninguno nuevo).

Run: `cd web && npm run test`
Expected: `Test Files 3 passed (3)`, `Tests 48 passed (48)` — sin cambios, porque esta tarea no toca `web/src/lib/`.

- [ ] **Step 4: Click-through manual de las 13 páginas**

Run: `cd web && npm run dev`, loguearse, y visitar cada una de las 13 rutas convertidas a lazy (Planilla de choferes, Control de cheques, Central de deudores, Vale de caja, Recibos, Consumo de combustible, Panel de cubiertas, Posición de flota, Fichadas, Bot de tarifas, Cuadro tarifario, Cotizador, y alguna cotización para probar "Cotización/imprimir", y Administración).
Expected: cada página carga y funciona igual que antes del cambio. Al entrar por primera vez a cada una en esa sesión del navegador debería verse brevemente el spinner de `PageLoading` (puede ser casi imperceptible en localhost); al volver a una página ya visitada no debería volver a aparecer (React cachea el chunk ya cargado).

- [ ] **Step 5: Probar el error boundary y revertir la prueba**

Editar temporalmente una sola línea de `web/src/App.tsx` para romper un import, por ejemplo cambiar:

```tsx
const AdminPage = lazy(() => import('./pages/admin/AdminPage').then((m) => ({ default: m.AdminPage })));
```

por una ruta inexistente:

```tsx
const AdminPage = lazy(() => import('./pages/admin/AdminPageXXX').then((m) => ({ default: m.AdminPage })));
```

Run: `cd web && npm run dev`, loguearse como admin, y navegar a `/administracion/choferes`.
Expected: en vez de una pantalla rota o una excepción sin manejar en la consola, se ve el mensaje "Hubo un problema cargando esta sección. Recargá la página." con el botón "Recargar" (definidos en `ChunkErrorBoundary.tsx` en Task 1).

Revertir el cambio temporal antes de seguir:

```tsx
const AdminPage = lazy(() => import('./pages/admin/AdminPage').then((m) => ({ default: m.AdminPage })));
```

Confirmar con `git diff web/src/App.tsx` que no quedó ningún rastro de la ruta rota antes del commit.

- [ ] **Step 6: Commit**

```bash
git add web/src/App.tsx
git commit -m "Code-splitting: convertir las 13 paginas pesadas a React.lazy()"
```

---

## Self-Review

**1. Cobertura del spec:** la lista de 13 páginas lazy + 2 eager (Login/Home) del spec está completa en Task 2. El `Suspense`/error boundary envolviendo solo el `Outlet` (no `StatusBanner`) está en Task 1 Step 4, con las líneas exactas del archivo actual citadas. El CSS (`.page-loading`, `.page-loading-spinner`, `@keyframes`, `prefers-reduced-motion`, `.page-load-error`) está completo en Task 1 Step 3, igual que en el spec. La verificación manual del error boundary (romper un import, confirmar el mensaje, revertir) está en Task 2 Step 5. La exclusión de cambios en `vite.config.ts` y `chunkSizeWarningLimit` no tiene ninguna tarea que los toque — correcto, son exclusiones explícitas del spec.

**2. Placeholders:** ninguno — todo el código de los componentes nuevos, el CSS, y el bloque completo de imports de `App.tsx` están escritos enteros, no resumidos.

**3. Consistencia de tipos:** `ChunkErrorBoundary` expone `children: ReactNode` (Task 1) y se usa en Task 1 Step 4 envolviendo el `Suspense` — no se vuelve a referenciar en Task 2, así que no hay riesgo de firma inconsistente entre tareas. Los 13 nombres de componente lazy en Task 2 coinciden exactamente (mismo nombre, mismo path relativo) con los usados más abajo en las rutas de `App.tsx`, que el plan no reescribe porque no necesitan cambiar.
