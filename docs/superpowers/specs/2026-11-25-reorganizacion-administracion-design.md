# Reorganización de Administración por dominio — Diseño

## Motivación

Hoy el módulo "Administración" (`/administracion/:tab`) junta 5 pestañas de dominios muy distintos: Choferes, Vehículos/Tractores, Clientes, Rutas Frecuentes y Usuarios. Las primeras 4 son datos maestros que en realidad pertenecen a otras áreas de la empresa (RRHH, Mantenimiento de flota, Comercial) y hoy solo las puede tocar un usuario con rol Administrador — no hay forma de delegarlas a un operador puntual (ej. que alguien de RRHH gestione Choferes sin ser admin de todo el sistema).

El pedido del usuario: mover cada pestaña al módulo que le corresponde por dominio, dejando Administración solo con lo que es realmente transversal a toda la aplicación (Usuarios).

## Alcance

- Choferes → nueva sub-pestaña dentro de **Personal** (RRHH).
- Vehículos/Tractores → módulo propio nuevo dentro de **Mantenimiento**.
- Rutas Frecuentes → módulo propio nuevo dentro de **Mantenimiento**.
- Clientes → módulo propio nuevo dentro de **Comercial**.
- Administración → queda solo con Usuarios, sin menú de pestañas.

Fuera de alcance: no se tocan los datos de esas colecciones, no se agregan campos nuevos, no se cambia ninguna lógica de negocio de Choferes/Vehículos/Rutas/Clientes — es pura reorganización de dónde vive la pantalla y quién puede entrar.

## Estado actual (confirmado leyendo el código)

- `web/src/pages/admin/AdminPage.tsx` define 5 tabs (`choferes`, `vehiculos`, `clientes`, `rutas`, `usuarios`) montados en la ruta `/administracion/:tab`, protegida en `App.tsx` con `<RequireAdmin>` — exige rol Administrador, sin granularidad por módulo.
- El resto de la app ya tiene un sistema de permisos por módulo: `web/src/types.ts` exporta `MODULES: ModuleDef[]` (cada entrada: `id`, `label`, `group`, `path`); `App.tsx` protege cada ruta de módulo con `<RequireModule moduleId="...">`; `AuthContext.tsx` resuelve `canAccessModule(id)` como `isAdmin || usuario.modulos.includes(id)`; `UsuariosTab.tsx` y `HomePage.tsx` ya iteran `MODULES` genéricamente (checklist de permisos y tarjetas de Inicio) — agregar una entrada a `MODULES` alcanza para que aparezca en ambos lugares, sin tocarlos.
- El grupo **MANTENIMIENTO** ya existe en `MODULES` (`consumo_combustible`, `panel_cubiertas`, `flota_posicion`, todas bajo rutas `/flota/*`, cada una su página standalone). El grupo **COMERCIAL** ya existe (`bot_tarifas`, `cuadro_tarifario`, `cotizador`, bajo `/comercial/*`). El grupo **RRHH** incluye `personal` (`/rrhh/personal`, `PersonalPage.tsx`), que ya tiene sub-pestañas propias (`SUB_TABS`: Empleados, Horario Personal, Horas Fijas, Plantillas, Áreas).
- Permisos a nivel de PocketBase (verificado en `pb_migrations/1787937728_updated_{choferes,vehiculos,clientes,rutas}.js`, estado actualmente aplicado):
  - `listRule` / `viewRule` de las 4 colecciones: `@request.auth.id != ""` — **cualquier usuario logueado ya puede leerlas**, sin exigir rol admin ni módulo. Esto es necesario porque otras pantallas de módulos distintos ya dependen de leerlas: `PlanillaChoferesPage.tsx` lee `choferes`, `vehiculos`, `rutas`, `clientes`; `CotizadorPage.tsx`/`CotizacionImprimirPage.tsx` leen `vehiculos`, `rutas`, `clientes`. No se tocan estas reglas.
  - `createRule` / `updateRule` / `deleteRule` de las 4: `@request.auth.rol = "admin"` — esto es lo único que hoy bloquea a un no-admin, y es lo único que cambia.
- Patrón ya usado en el proyecto para reglas por módulo (ej. `pb_migrations/1788470000_created_cheques.js`): `@request.auth.id != "" && (@request.auth.rol = "admin" || @request.auth.modulos ?= "<module_id>")`.

## Diseño

### 1. Choferes → pestaña dentro de Personal

- `ChoferesTab.tsx` se muda de `web/src/pages/admin/` a `web/src/pages/personal/` (mismo componente, sin cambios de lógica interna — ya recibe `version`/`onChanged`, igual que las otras sub-pantallas de Personal).
- `PersonalPage.tsx`: se agrega `{ id: 'choferes', label: 'Choferes' }` a `SUB_TABS`, y el render condicional `{subTab === 'choferes' && <ChoferesTab version={refrescar...} onChanged={...} />}` siguiendo el mismo patrón que las demás.
- No se agrega módulo nuevo a `MODULES`: Choferes queda cubierto por el permiso `personal` ya existente.
- PocketBase: `createRule`/`updateRule`/`deleteRule` de `choferes` pasan de `@request.auth.rol = "admin"` a `@request.auth.id != "" && (@request.auth.rol = "admin" || @request.auth.modulos ?= "personal")`.

### 2. Vehículos/Tractores y Rutas Frecuentes → módulos propios en Mantenimiento

- Se crean dos páginas standalone nuevas (mismo patrón que `ReporteCombustiblePage.tsx`/`PanelCubiertasPage.tsx`: un `<main>` con `<div className="card">` de título y el contenido del Tab debajo):
  - `web/src/pages/flota/VehiculosPage.tsx`, envolviendo el contenido actual de `VehiculosTab.tsx` (que se muda de `admin/` a `flota/`).
  - `web/src/pages/flota/RutasFrecuentesPage.tsx`, envolviendo `RutasTab.tsx` (mudado igual a `flota/`).
- `types.ts`: se agregan a `MODULES`:
  - `{ id: 'vehiculos', label: 'Vehículos / Tractores', group: 'MANTENIMIENTO', path: 'flota/vehiculos' }`
  - `{ id: 'rutas_frecuentes', label: 'Rutas Frecuentes', group: 'MANTENIMIENTO', path: 'flota/rutas-frecuentes' }`
- `App.tsx`: se agregan las rutas `/flota/vehiculos` y `/flota/rutas-frecuentes`, cada una envuelta en `<RequireModule moduleId="vehiculos">` / `<RequireModule moduleId="rutas_frecuentes">`.
- PocketBase: `createRule`/`updateRule`/`deleteRule` de `vehiculos` pasan a exigir `@request.auth.rol = "admin" || @request.auth.modulos ?= "vehiculos"`; las de `rutas` pasan a exigir `@request.auth.rol = "admin" || @request.auth.modulos ?= "rutas_frecuentes"`.

### 3. Clientes → módulo propio en Comercial

- Página nueva `web/src/pages/tarifas/ClientesPage.tsx` (se agrupa junto a las otras páginas de Comercial, que hoy viven en `pages/tarifas/` pese a navegar bajo `/comercial/*` — mismo criterio que `CotizadorPage.tsx`), envolviendo `ClientesTab.tsx` (mudado de `admin/` a `tarifas/`).
- `types.ts`: se agrega `{ id: 'clientes', label: 'Clientes', group: 'COMERCIAL', path: 'comercial/clientes' }`.
- `App.tsx`: ruta `/comercial/clientes` envuelta en `<RequireModule moduleId="clientes">`.
- PocketBase: `createRule`/`updateRule`/`deleteRule` de `clientes` pasan a exigir `@request.auth.rol = "admin" || @request.auth.modulos ?= "clientes"`.

### 4. Administración → solo Usuarios, sin pestañas

- `AdminPage.tsx` se simplifica: elimina `TABS`, el `useParams`/`useNavigate` de pestaña y el render condicional de las 4 pestañas movidas; queda un `<main>` con el título "Administración" y `<UsuariosTab version={...} onChanged={...} />` directo.
- `App.tsx`: la ruta pasa de `/administracion/:tab` a `/administracion` (sin parámetro), sigue envuelta en `<RequireAdmin>`. Se agrega un redirect de `/administracion/*` viejo (con cualquier `:tab`) a `/administracion`, para no romper favoritos/links guardados del propio usuario.
- Se borran del repo: `web/src/pages/admin/ChoferesTab.tsx`, `VehiculosTab.tsx`, `RutasTab.tsx`, `ClientesTab.tsx` (ya mudados a sus nuevas carpetas en los puntos 1-3) — en `admin/` solo queda `AdminPage.tsx`, `UsuariosTab.tsx` y `AdminSimpleTab.tsx` (este último seguirá usándose desde los Tabs mudados, se queda donde está e importado por su ruta relativa nueva).

## Migraciones de PocketBase

Una migración nueva (`pb_migrations/<timestamp>_permisos_por_modulo_vehiculos_rutas_clientes_choferes.js`) que, para las 4 colecciones, cambia solo `createRule`/`updateRule`/`deleteRule` al patrón `@request.auth.id != "" && (@request.auth.rol = "admin" || @request.auth.modulos ?= "<id>")`, usando `personal` para choferes y los 3 ids nuevos para el resto. `listRule`/`viewRule` no se tocan (quedan abiertas a cualquier autenticado, como ya están, porque otros módulos dependen de leerlas).

## Impacto en usuarios existentes

- Ningún Administrador pierde acceso a nada (sigue viendo todos los módulos).
- Ningún operador pierde acceso a algo que ya tuviera (hoy ningún operador podía tocar estas 4 cosas).
- Para que un operador pueda gestionar Choferes/Vehículos/Rutas/Clientes, un admin tiene que asignarle el módulo correspondiente desde Usuarios — exactamente igual que con cualquier otro módulo del sistema hoy.

## Fuera de alcance / no afectado

- No se modifica ninguna lógica de negocio de `ChoferesTab`, `VehiculosTab`, `RutasTab`, `ClientesTab`, `UsuariosTab` ni `AdminSimpleTab` — son mudanzas de archivo + reglas de acceso, sin tocar su comportamiento interno.
- No se modifican `PlanillaChoferesPage.tsx`, `CotizadorPage.tsx` ni `CotizacionImprimirPage.tsx` (siguen leyendo las 4 colecciones con `listRule` sin cambios).
