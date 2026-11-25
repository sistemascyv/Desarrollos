# Reorganización de Administración por dominio — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mover Choferes, Vehículos/Tractores, Rutas Frecuentes y Clientes desde el módulo "Administración" (admin-only) a Personal, Mantenimiento y Comercial respectivamente, cada uno con permiso por módulo asignable a cualquier usuario; Administración queda solo con Usuarios.

**Architecture:** Reutilizar el sistema de permisos por módulo ya existente (`MODULES` en `types.ts` + `RequireModule` + checklist en `UsuariosTab`) en vez de crear nada nuevo. Las 4 pantallas (`ChoferesTab`, `VehiculosTab`, `RutasTab`, `ClientesTab`) se mudan de carpeta sin tocar su lógica interna; solo cambian dónde viven y qué regla de PocketBase las protege.

**Tech Stack:** React 19 + TypeScript + React Router 7 (frontend), PocketBase 0.28 (reglas de acceso vía migración ALTER).

## Global Constraints

- No se modifica la lógica interna de `ChoferesTab.tsx`, `VehiculosTab.tsx`, `RutasTab.tsx`, `ClientesTab.tsx`, `UsuariosTab.tsx` ni `AdminSimpleTab.tsx` — solo mudanza de archivo e imports relativos.
- `listRule`/`viewRule` de las 4 colecciones (`choferes`, `vehiculos`, `rutas`, `clientes`) NO se tocan — quedan en `@request.auth.id != ""` (cualquier autenticado), porque `PlanillaChoferesPage.tsx` y `CotizadorPage.tsx`/`CotizacionImprimirPage.tsx` dependen de leerlas sin tener el módulo nuevo.
- Solo `createRule`/`updateRule`/`deleteRule` de esas 4 colecciones cambian, de `@request.auth.rol = "admin"` a `@request.auth.id != "" && (@request.auth.rol = "admin" || @request.auth.modulos ?= "<id>")`, usando `personal` para choferes y `vehiculos`/`rutas_frecuentes`/`clientes` para el resto.
- Sin tests automatizados de frontend en este proyecto — cada tarea de frontend termina con `cd web && npm run build` limpio.
- Un commit como mínimo por tarea.

---

## Task 1: Migración de PocketBase — permisos por módulo

**Files:**
- Create: `pb_migrations/1789580000_permisos_modulo_choferes_vehiculos_rutas_clientes.js`

**Interfaces:**
- Consumes: nada de tareas anteriores.
- Produces: las 4 colecciones (`choferes` id `henbj40l3bk5gl8`, `vehiculos` id `drkysi4dr66cl89`, `rutas` id `kerhtv3kxuoku1q`, `clientes` id `ao9eo8ib8n0a6cp`) quedan con `createRule`/`updateRule`/`deleteRule` gateadas por módulo — las tareas siguientes (frontend) asumen que esto ya está aplicado en staging/producción antes de que un operador sin rol admin intente crear/editar/borrar desde las pantallas nuevas.

- [ ] **Step 1: Escribir la migración**

Valores actuales confirmados leyendo `pb_migrations/1787937728_updated_{choferes,vehiculos,clientes,rutas}.js` (estado ya aplicado): las 4 colecciones tienen hoy `createRule`/`updateRule`/`deleteRule` = `"@request.auth.rol = \"admin\""`, y `listRule`/`viewRule` = `"@request.auth.id != \"\""` (sin cambios).

```js
/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db);

  const reglas = [
    { id: 'henbj40l3bk5gl8', modulo: 'personal' },         // choferes
    { id: 'drkysi4dr66cl89', modulo: 'vehiculos' },         // vehiculos
    { id: 'kerhtv3kxuoku1q', modulo: 'rutas_frecuentes' },  // rutas
    { id: 'ao9eo8ib8n0a6cp', modulo: 'clientes' },          // clientes
  ];

  for (const { id, modulo } of reglas) {
    const collection = dao.findCollectionByNameOrId(id);
    const regla = '@request.auth.id != "" && (@request.auth.rol = "admin" || @request.auth.modulos ?= "' + modulo + '")';
    collection.createRule = regla;
    collection.updateRule = regla;
    collection.deleteRule = regla;
    dao.saveCollection(collection);
  }

  return null;
}, (db) => {
  const dao = new Dao(db);
  const ids = ['henbj40l3bk5gl8', 'drkysi4dr66cl89', 'kerhtv3kxuoku1q', 'ao9eo8ib8n0a6cp'];

  for (const id of ids) {
    const collection = dao.findCollectionByNameOrId(id);
    collection.createRule = '@request.auth.rol = "admin"';
    collection.updateRule = '@request.auth.rol = "admin"';
    collection.deleteRule = '@request.auth.rol = "admin"';
    dao.saveCollection(collection);
  }

  return null;
})
```

- [ ] **Step 2: Verificar en vivo contra una instancia de PocketBase de prueba**

```bash
mkdir -p /tmp/pb-test-permisos && cd /tmp/pb-test-permisos
cp "$(find /c/Users/SISTEMAS/AppData/Local/Temp/claude -name pocketbase.exe | head -1)" ./pocketbase.exe
cp -r /c/Users/SISTEMAS/Desarrollos/pb_migrations ./pb_migrations
cp -r /c/Users/SISTEMAS/Desarrollos/pb_hooks ./pb_hooks
./pocketbase.exe migrate up
```

Expected: el log muestra `1789580000_permisos_modulo_choferes_vehiculos_rutas_clientes.js` aplicada sin error, junto con todas las anteriores.

```bash
sqlite3 pb_data/data.db "SELECT id, name, createRule, updateRule, deleteRule FROM _collections WHERE id IN ('henbj40l3bk5gl8','drkysi4dr66cl89','kerhtv3kxuoku1q','ao9eo8ib8n0a6cp');"
```

Expected: las 4 filas muestran `createRule`/`updateRule`/`deleteRule` con el patrón `@request.auth.id != "" && (@request.auth.rol = "admin" || @request.auth.modulos ?= "...")`, cada una con su módulo correspondiente (`personal` para choferes, `vehiculos`, `rutas_frecuentes`, `clientes`), y `listRule`/`viewRule` sin cambios (`@request.auth.id != ""`).

- [ ] **Step 3: Commit**

```bash
git add pb_migrations/1789580000_permisos_modulo_choferes_vehiculos_rutas_clientes.js
git commit -m "feat(permisos): choferes/vehiculos/rutas/clientes editables por modulo, no solo admin"
```

---

## Task 2: `types.ts` — agregar los 3 módulos nuevos

**Files:**
- Modify: `web/src/types.ts:395-412` (array `MODULES`)

**Interfaces:**
- Consumes: nada.
- Produces: `MODULES` incluye `vehiculos`, `rutas_frecuentes`, `clientes` — `HomePage.tsx` y `UsuariosTab.tsx` los recogen automáticamente (iteran `MODULES`, no requieren cambios). Las tareas 4 y 5 asumen que estos 3 ids ya existen en `MODULES` antes de usarlos en `RequireModule`.

- [ ] **Step 1: Editar el array `MODULES`**

Reemplazar el array completo (agrega `vehiculos` y `rutas_frecuentes` junto a las otras entradas `MANTENIMIENTO`, y `clientes` al final junto a las otras `COMERCIAL`):

```ts
export const MODULES: ModuleDef[] = [
  { id: 'planilla_choferes', label: 'Planilla Choferes', group: 'RRHH', path: 'liquidacion/planilla-choferes' },
  { id: 'control_cheques', label: 'Control de Cheques', group: 'TESORERIA', path: 'finanzas/control-cheques' },
  { id: 'central_deudores', label: 'Central de Deudores', group: 'TESORERIA', path: 'finanzas/central-deudores' },
  { id: 'vale_caja', label: 'Vale de Caja', group: 'TESORERIA', path: 'finanzas/vale-de-caja' },
  { id: 'recibos', label: 'Recibos', group: 'TESORERIA', path: 'finanzas/recibos' },
  { id: 'consumo_combustible', label: 'Consumo de Combustible', group: 'MANTENIMIENTO', path: 'flota/consumo-combustible' },
  { id: 'panel_cubiertas', label: 'Panel de Cubiertas', group: 'MANTENIMIENTO', path: 'flota/panel-cubiertas' },
  { id: 'flota_posicion', label: 'Posición de Flota', group: 'MANTENIMIENTO', path: 'flota/posicion' },
  { id: 'vehiculos', label: 'Vehículos / Tractores', group: 'MANTENIMIENTO', path: 'flota/vehiculos' },
  { id: 'rutas_frecuentes', label: 'Rutas Frecuentes', group: 'MANTENIMIENTO', path: 'flota/rutas-frecuentes' },
  { id: 'fichadas', label: 'Fichadas', group: 'RRHH', path: 'rrhh/fichadas' },
  { id: 'personal', label: 'Personal', group: 'RRHH', path: 'rrhh/personal' },
  { id: 'sueldos', label: 'Sueldos', group: 'RRHH', path: 'rrhh/sueldos' },
  { id: 'vacaciones', label: 'Vacaciones', group: 'RRHH', path: 'rrhh/vacaciones' },
  { id: 'reportes', label: 'Reportes', group: 'RRHH', path: 'rrhh/reportes' },
  { id: 'bot_tarifas', label: 'Actualizar Tarifas', group: 'COMERCIAL', path: 'comercial/bot-tarifas' },
  { id: 'cuadro_tarifario', label: 'Tarifas', group: 'COMERCIAL', path: 'comercial/tarifas' },
  { id: 'cotizador', label: 'Cotizador', group: 'COMERCIAL', path: 'comercial/cotizador' },
  { id: 'clientes', label: 'Clientes', group: 'COMERCIAL', path: 'comercial/clientes' },
];
```

- [ ] **Step 2: Build de verificación**

```bash
cd web && npm run build
```

Expected: build limpio, sin errores de TypeScript (todavía no hay rutas para `vehiculos`/`rutas_frecuentes`/`clientes` — eso es normal, `MODULES` es solo data, no exige que exista la ruta hasta que el usuario navegue).

- [ ] **Step 3: Commit**

```bash
git add web/src/types.ts
git commit -m "feat(permisos): agregar modulos vehiculos, rutas_frecuentes y clientes"
```

---

## Task 3: Choferes → pestaña dentro de Personal

**Files:**
- Move: `web/src/pages/admin/ChoferesTab.tsx` → `web/src/pages/personal/ChoferesTab.tsx`
- Modify: `web/src/pages/personal/PersonalPage.tsx:1-18` (imports y `SUB_TABS`), `:58-62` (render condicional)

**Interfaces:**
- Consumes: `MODULES` ya tiene `personal` (sin cambios, Task 2 no lo tocó).
- Produces: nada que otra tarea necesite — Choferes queda resuelto en este task.

- [ ] **Step 1: Mover el archivo y corregir el import de `AdminSimpleTab`**

```bash
git mv web/src/pages/admin/ChoferesTab.tsx web/src/pages/personal/ChoferesTab.tsx
```

`AdminSimpleTab` se queda en `pages/admin/` — corregir el import relativo (`personal/` y `admin/` están al mismo nivel bajo `pages/`, antes era `./AdminSimpleTab` desde `admin/`, ahora es `../admin/AdminSimpleTab` desde `personal/`):

En `web/src/pages/personal/ChoferesTab.tsx`, cambiar:

```ts
import { AdminSimpleTab } from './AdminSimpleTab';
```

por:

```ts
import { AdminSimpleTab } from '../admin/AdminSimpleTab';
```

El resto de los imports del archivo (`'../../lib/pb'`, `'../../lib/ToastContext'`, `'../../types'`) no cambian — misma profundidad de carpeta.

- [ ] **Step 2: Agregar la pestaña en `PersonalPage.tsx`**

En `web/src/pages/personal/PersonalPage.tsx`, agregar el import (junto a los demás imports del archivo, al principio):

```ts
import { ChoferesTab } from './ChoferesTab';
```

Cambiar el array `SUB_TABS` (línea 11-17) de:

```ts
const SUB_TABS = [
  { id: 'empleados', label: 'Empleados' },
  { id: 'horario_personal', label: 'Horario personalizado' },
  { id: 'horas_fijas', label: 'Horas extra fijas' },
  { id: 'plantillas', label: 'Plantillas de horario' },
  { id: 'areas', label: 'Áreas' },
] as const;
```

a:

```ts
const SUB_TABS = [
  { id: 'empleados', label: 'Empleados' },
  { id: 'choferes', label: 'Choferes' },
  { id: 'horario_personal', label: 'Horario personalizado' },
  { id: 'horas_fijas', label: 'Horas extra fijas' },
  { id: 'plantillas', label: 'Plantillas de horario' },
  { id: 'areas', label: 'Áreas' },
] as const;
```

Y agregar el render condicional (línea 58-62), de:

```tsx
          {subTab === 'empleados' && <EmpleadosSub empresas={empresas} horarios={horarios} legajos={legajos} categorias={categorias} onChanged={refrescar} />}
          {subTab === 'horario_personal' && <HorarioPersonalSub legajos={legajos} onChanged={refrescar} />}
```

a:

```tsx
          {subTab === 'empleados' && <EmpleadosSub empresas={empresas} horarios={horarios} legajos={legajos} categorias={categorias} onChanged={refrescar} />}
          {subTab === 'choferes' && <ChoferesTab version={tick} onChanged={refrescar} />}
          {subTab === 'horario_personal' && <HorarioPersonalSub legajos={legajos} onChanged={refrescar} />}
```

(`tick`/`refrescar` ya existen en `PersonalPage` — son el mismo par que `AdminPage.tsx` le pasaba como `refreshTick`/`bump`.)

- [ ] **Step 3: Build de verificación**

```bash
cd web && npm run build
```

Expected: build limpio.

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/personal/ChoferesTab.tsx web/src/pages/personal/PersonalPage.tsx
git commit -m "feat(personal): mover Choferes de Administracion a una pestana de Personal"
```

---

## Task 4: Vehículos/Tractores y Rutas Frecuentes → Mantenimiento

**Files:**
- Move: `web/src/pages/admin/VehiculosTab.tsx` → `web/src/pages/flota/VehiculosTab.tsx`
- Move: `web/src/pages/admin/RutasTab.tsx` → `web/src/pages/flota/RutasTab.tsx`
- Create: `web/src/pages/flota/VehiculosPage.tsx`
- Create: `web/src/pages/flota/RutasFrecuentesPage.tsx`
- Modify: `web/src/App.tsx` (imports + rutas)

**Interfaces:**
- Consumes: `MODULES` ya tiene `vehiculos`/`rutas_frecuentes` (Task 2).
- Produces: rutas `/flota/vehiculos` y `/flota/rutas-frecuentes` montadas y protegidas — nada de lo que dependa otra tarea.

- [ ] **Step 1: Mover los 2 archivos y corregir sus imports de `AdminSimpleTab`**

```bash
git mv web/src/pages/admin/VehiculosTab.tsx web/src/pages/flota/VehiculosTab.tsx
git mv web/src/pages/admin/RutasTab.tsx web/src/pages/flota/RutasTab.tsx
```

En `web/src/pages/flota/VehiculosTab.tsx`, cambiar:

```ts
import { AdminSimpleTab } from './AdminSimpleTab';
```

por:

```ts
import { AdminSimpleTab } from '../admin/AdminSimpleTab';
```

En `web/src/pages/flota/RutasTab.tsx`, el mismo cambio:

```ts
import { AdminSimpleTab } from './AdminSimpleTab';
```

por:

```ts
import { AdminSimpleTab } from '../admin/AdminSimpleTab';
```

- [ ] **Step 2: Crear las 2 páginas standalone**

`VehiculosTab`/`RutasTab` ya renderizan su propia `<div className="card"><h2>{title}</h2>...` por dentro de `AdminSimpleTab` — la página solo necesita el `<main>` de afuera y el estado `version`/`onChanged` (mismo patrón que `AdminPage.tsx` les pasaba con `refreshTick`/`bump`).

Crear `web/src/pages/flota/VehiculosPage.tsx`:

```tsx
import { useState } from 'react';
import { VehiculosTab } from './VehiculosTab';

export function VehiculosPage() {
  const [version, setVersion] = useState(0);
  const bump = () => setVersion((n) => n + 1);

  return (
    <main>
      <VehiculosTab version={version} onChanged={bump} />
    </main>
  );
}
```

Crear `web/src/pages/flota/RutasFrecuentesPage.tsx`:

```tsx
import { useState } from 'react';
import { RutasTab } from './RutasTab';

export function RutasFrecuentesPage() {
  const [version, setVersion] = useState(0);
  const bump = () => setVersion((n) => n + 1);

  return (
    <main>
      <RutasTab version={version} onChanged={bump} />
    </main>
  );
}
```

- [ ] **Step 3: Agregar las rutas en `App.tsx`**

Agregar los imports lazy (junto a los demás imports lazy de `flota/`, después de `PosicionFlotaPage`):

```ts
const VehiculosPage = lazy(() =>
  import('./pages/flota/VehiculosPage').then((m) => ({ default: m.VehiculosPage }))
);
const RutasFrecuentesPage = lazy(() =>
  import('./pages/flota/RutasFrecuentesPage').then((m) => ({ default: m.RutasFrecuentesPage }))
);
```

Agregar las rutas (después de la ruta `/flota/posicion/:tab`, antes de `/rrhh/fichadas`):

```tsx
        <Route
          path="/flota/vehiculos"
          element={
            <RequireModule moduleId="vehiculos">
              <VehiculosPage />
            </RequireModule>
          }
        />
        <Route
          path="/flota/rutas-frecuentes"
          element={
            <RequireModule moduleId="rutas_frecuentes">
              <RutasFrecuentesPage />
            </RequireModule>
          }
        />
```

- [ ] **Step 4: Build de verificación**

```bash
cd web && npm run build
```

Expected: build limpio.

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/flota/VehiculosTab.tsx web/src/pages/flota/RutasTab.tsx web/src/pages/flota/VehiculosPage.tsx web/src/pages/flota/RutasFrecuentesPage.tsx web/src/App.tsx
git commit -m "feat(mantenimiento): mover Vehiculos y Rutas Frecuentes de Administracion a modulos propios"
```

---

## Task 5: Clientes → Comercial

**Files:**
- Move: `web/src/pages/admin/ClientesTab.tsx` → `web/src/pages/tarifas/ClientesTab.tsx`
- Create: `web/src/pages/tarifas/ClientesPage.tsx`
- Modify: `web/src/App.tsx` (import + ruta)

**Interfaces:**
- Consumes: `MODULES` ya tiene `clientes` (Task 2).
- Produces: ruta `/comercial/clientes` montada y protegida.

- [ ] **Step 1: Mover el archivo y corregir su import de `AdminSimpleTab`**

```bash
git mv web/src/pages/admin/ClientesTab.tsx web/src/pages/tarifas/ClientesTab.tsx
```

En `web/src/pages/tarifas/ClientesTab.tsx`, cambiar:

```ts
import { AdminSimpleTab } from './AdminSimpleTab';
```

por:

```ts
import { AdminSimpleTab } from '../admin/AdminSimpleTab';
```

- [ ] **Step 2: Crear la página standalone**

Crear `web/src/pages/tarifas/ClientesPage.tsx`:

```tsx
import { useState } from 'react';
import { ClientesTab } from './ClientesTab';

export function ClientesPage() {
  const [version, setVersion] = useState(0);
  const bump = () => setVersion((n) => n + 1);

  return (
    <main>
      <ClientesTab version={version} onChanged={bump} />
    </main>
  );
}
```

- [ ] **Step 3: Agregar la ruta en `App.tsx`**

Agregar el import lazy (junto a los demás imports lazy de `tarifas/`, después de `CotizacionImprimirPage`):

```ts
const ClientesPage = lazy(() =>
  import('./pages/tarifas/ClientesPage').then((m) => ({ default: m.ClientesPage }))
);
```

Agregar la ruta (después de `/comercial/cotizador/:id/imprimir`, antes de `/administracion`):

```tsx
        <Route
          path="/comercial/clientes"
          element={
            <RequireModule moduleId="clientes">
              <ClientesPage />
            </RequireModule>
          }
        />
```

- [ ] **Step 4: Build de verificación**

```bash
cd web && npm run build
```

Expected: build limpio.

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/tarifas/ClientesTab.tsx web/src/pages/tarifas/ClientesPage.tsx web/src/App.tsx
git commit -m "feat(comercial): mover Clientes de Administracion a modulo propio"
```

---

## Task 6: Simplificar Administración (solo Usuarios) + limpieza final

**Files:**
- Modify: `web/src/pages/admin/AdminPage.tsx` (reescritura completa)
- Modify: `web/src/App.tsx` (ruta `/administracion`)

**Interfaces:**
- Consumes: ninguna pieza nueva — este task cierra el proyecto quitando lo que ya quedó huérfano (los 4 `*Tab.tsx` viejos de `admin/` ya fueron movidos en los Tasks 3-5, así que a esta altura `pages/admin/` ya NO los tiene; este task solo limpia `AdminPage.tsx` y la ruta).
- Produces: nada — última tarea del plan.

- [ ] **Step 1: Reescribir `AdminPage.tsx` sin tabs**

Reemplazar todo el contenido de `web/src/pages/admin/AdminPage.tsx`:

```tsx
import { UsuariosTab } from './UsuariosTab';
import { useState } from 'react';

export function AdminPage() {
  const [refreshTick, setRefreshTick] = useState(0);
  const bump = () => setRefreshTick((n) => n + 1);

  return (
    <main>
      <UsuariosTab version={refreshTick} onChanged={bump} />
    </main>
  );
}
```

(`UsuariosTab` ya renderiza su propio `<div className="card"><h2>Usuarios</h2>...` por dentro — ver `web/src/pages/admin/UsuariosTab.tsx:152-153` — así que no hace falta un `<h2>Administración</h2>` extra aquí; el título visible de la pantalla pasa a ser "Usuarios", igual que cualquier otro módulo.)

- [ ] **Step 2: Cambiar la ruta en `App.tsx`**

Reemplazar:

```tsx
        <Route path="/administracion" element={<Navigate to="/administracion/choferes" replace />} />
        <Route
          path="/administracion/:tab"
          element={
            <RequireAdmin>
              <AdminPage />
            </RequireAdmin>
          }
        />
```

por:

```tsx
        <Route
          path="/administracion"
          element={
            <RequireAdmin>
              <AdminPage />
            </RequireAdmin>
          }
        />
        <Route path="/administracion/:tab" element={<Navigate to="/administracion" replace />} />
```

(El segundo `Route` es el redirect de compatibilidad: cualquier link viejo guardado a `/administracion/choferes`, `/administracion/vehiculos`, etc. sigue funcionando, redirigiendo a la nueva pantalla única.)

También actualizar `HomePage.tsx:11`, que hoy apunta al path viejo:

```ts
    items.push({ id: 'administracion', label: 'Administración', group: 'Sistema', path: 'administracion/choferes' });
```

cambiar `'administracion/choferes'` por `'administracion'`:

```ts
    items.push({ id: 'administracion', label: 'Administración', group: 'Sistema', path: 'administracion' });
```

- [ ] **Step 3: Confirmar que no queda ningún import roto hacia los 4 archivos viejos**

```bash
grep -rn "admin/ChoferesTab\|admin/VehiculosTab\|admin/RutasTab\|admin/ClientesTab" web/src/
```

Expected: sin resultados (los 4 archivos ya fueron movidos fuera de `admin/` en los Tasks 3-5, y `AdminPage.tsx` ya no los importa tras el Step 1 de este task).

```bash
ls web/src/pages/admin/
```

Expected: solo quedan `AdminPage.tsx`, `UsuariosTab.tsx`, `AdminSimpleTab.tsx`.

- [ ] **Step 4: Build final**

```bash
cd web && npm run build
```

Expected: build limpio.

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/admin/AdminPage.tsx web/src/App.tsx web/src/pages/HomePage.tsx
git commit -m "refactor(administracion): dejar solo Usuarios, sin menu de pestanas"
```

- [ ] **Step 6: Verificación manual completa (en staging, después de desplegar)**

Pasos a correr en el navegador contra staging, documentados para que el usuario (o el que haga la verificación final) los siga:

1. Entrar como Administrador → Inicio: deben aparecer 3 tarjetas nuevas — "Vehículos / Tractores" y "Rutas Frecuentes" bajo el grupo MANTENIMIENTO, "Clientes" bajo COMERCIAL — y la tarjeta "Administración" sigue estando bajo "Sistema".
2. Entrar a Personal (RRHH) → debe aparecer una pestaña nueva "Choferes" al lado de "Empleados", con la misma pantalla de antes (lista de choferes + choferes sin legajo vinculado).
3. Entrar a cada una de las 3 páginas nuevas (Vehículos, Rutas Frecuentes, Clientes desde sus tarjetas de Inicio) y confirmar que cargan la tabla con los datos ya existentes (no deberían aparecer vacías — son las mismas colecciones de siempre).
4. Entrar a Administración → debe mostrar directamente "Usuarios", sin ningún menú de pestañas arriba.
5. Ir a Usuarios → Módulos de un usuario operador (no admin) → confirmar que aparecen los 3 checkboxes nuevos ("Vehículos / Tractores", "Rutas Frecuentes", "Clientes") en el grupo correspondiente.
6. Asignarle a un usuario operador (no admin) el módulo "Personal" (si no lo tiene) y loguearse como ese usuario: debe poder entrar a Personal → Choferes y editar un registro (antes esto solo lo podía hacer un Administrador).
7. Repetir el paso 6 con un operador y el módulo "Vehículos / Tractores": debe poder editar un vehículo sin ser admin.
8. Probar un link viejo guardado como `.../administracion/vehiculos`: debe redirigir automáticamente a `/administracion` (pantalla de Usuarios) sin error.

---

## Fuera de alcance (confirmado en el spec, no se tocan en este plan)

- Contenido de ayuda contextual (`web/src/lib/ayudaContenido.ts`, `AyudaFlotante.tsx`): sigue funcionando porque matchea por prefijo de ruta (`administracion*`), sin romperse, pero no se le agregó contenido de ayuda específico para las 3 pantallas nuevas — si el usuario lo pide, es un plan aparte.
- Ninguna lógica de negocio de las colecciones `choferes`, `vehiculos`, `rutas`, `clientes` cambia.

---

## Opciones de ejecución

**1. Subagent-Driven (recomendado)** — despacho un subagente fresco por tarea, reviso entre tareas, iteración rápida.

**2. Inline Execution** — ejecuto las tareas en esta misma sesión usando executing-plans, con checkpoints de revisión en bloque.

¿Cuál preferís?
