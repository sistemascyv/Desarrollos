# Segmentación por sucursal: Cotizador, Vale de Caja y Recibos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un usuario no-admin solo ve los registros de Cotizador/Vale de Caja/Recibos creados por alguien de su misma sucursal; admin sigue viendo todo.

**Architecture:** Se agrega un campo `sucursal` (select, 4 valores) a `cotizaciones`, `vales_caja` y `recibos`, seteado server-side por cada hook desde la sucursal del usuario autenticado (nunca por el cliente). `listRule`/`viewRule` de las 4 colecciones afectadas (las 3 de arriba + `cotizacion_items`) pasan a exigir `sucursal = @request.auth.sucursal` además del chequeo de módulo que ya tenían, salvo para admin (sin filtro) y para quien tenga el módulo `planilla_choferes` en `vales_caja` (ve todos los vales sin filtrar, ya que siempre se cargan en San Francisco y Planilla Choferes necesita conciliarlos todos).

**Tech Stack:** PocketBase (migraciones JS + hooks JS). Proyecto 100% backend — no hay cambios de frontend en este plan.

## Global Constraints

- La sucursal de un registro es la del usuario que lo creó — no es editable, no se permite elegir "crear para otra sucursal".
- Admin (`rol = "admin"`) nunca queda filtrado por sucursal en ninguna de las 4 colecciones.
- `vales_caja`: cualquiera con el módulo `planilla_choferes` ve TODOS los vales sin filtrar por sucursal (decisión de negocio confirmada: los vales siempre se cargan en San Francisco, Planilla Choferes tiene que poder conciliarlos todos).
- `cotizacion_items` no tiene su propio campo `sucursal` — filtra a través de la relación con su `cotizacion` padre (`cotizacion.sucursal`).
- El campo `sucursal` se setea SIEMPRE server-side, en el hook `onRecordBeforeCreateRequest` de cada colección, nunca confiando en lo que mande el cliente.
- `vales_caja` y `recibos` pasan a exigir que el usuario tenga `sucursal` cargada para poder crear un registro (`ForbiddenError` si no), igualando el criterio que `cotizaciones` ya tiene hoy.
- Build/test: no hay PocketBase local en este entorno. Cada tarea se verifica con `node --check <archivo>` (sintaxis) + revisión manual descripta paso a paso. El sistema está en producción real — prohibido escribir datos de prueba contra PocketBase en cualquier entorno.
- El deploy real (push → CI/CD aplica migraciones/hooks y reinicia PocketBase solo) y su verificación en producción quedan a cargo del controller, fuera de las tareas de este plan.

---

## File Structure

- **Create:** `pb_migrations/1789330000_sucursal_en_cotizaciones_vales_recibos.js` — agrega el campo `sucursal` a `cotizaciones01`, `vales_caja`, `recibos` + backfill de los registros existentes.
- **Create:** `pb_migrations/1789340000_listrule_sucursal_cotizaciones_vales_recibos.js` — actualiza `listRule`/`viewRule` de `cotizaciones01`, `cotizacionitm1`, `vales_caja`, `recibos`.
- **Modify:** `pb_hooks/cotizaciones.pb.js` — setea `sucursal` además de `numero`/`creado_por`.
- **Modify:** `pb_hooks/vales_caja.pb.js` — exige sucursal (nuevo `ForbiddenError`) y la setea.
- **Modify:** `pb_hooks/recibos.pb.js` — exige sucursal (nuevo `ForbiddenError`) y la setea.

---

### Task 1: Migración — campo `sucursal` + backfill

**Files:**
- Create: `pb_migrations/1789330000_sucursal_en_cotizaciones_vales_recibos.js`

**Interfaces:**
- Produces: campo `sucursal` (select: `cordoba`/`san_francisco`/`rosario`/`buenos_aires`, `required: false`) en `cotizaciones01` (id de campo `cot0sucursal1`), `vales_caja` (id `vlc0sucursal1`) y `recibos` (id `rcb0sucursal1`). Las Tasks 2 y 3 lo consumen.

- [ ] **Step 1: Escribir la migración**

Crear `pb_migrations/1789330000_sucursal_en_cotizaciones_vales_recibos.js`:

```js
/// <reference path="../pb_data/types.d.ts" />
// Segmentacion por sucursal: agrega el campo `sucursal` a cotizaciones,
// vales_caja y recibos -- seteado server-side por cada hook (nunca por el
// cliente, ver pb_hooks/cotizaciones.pb.js/vales_caja.pb.js/recibos.pb.js)
// desde la sucursal del usuario que crea el registro. Esta migracion es
// solo el campo + backfill; el filtrado real por sucursal en listRule/
// viewRule va en la migracion siguiente (1789340000), para que agregar el
// campo y cambiar las reglas de visibilidad queden separados.
// Ver docs/superpowers/specs/2026-10-30-segmentacion-por-sucursal-design.md
migrate((db) => {
  const dao = new Dao(db);

  const cotizaciones = dao.findCollectionByNameOrId('cotizaciones01');
  cotizaciones.schema.addField(new SchemaField({
    system: false, id: 'cot0sucursal1', name: 'sucursal', type: 'select',
    required: false, presentable: false, unique: false,
    options: { maxSelect: 1, values: ['cordoba', 'san_francisco', 'rosario', 'buenos_aires'] },
  }));
  dao.saveCollection(cotizaciones);

  const valesCaja = dao.findCollectionByNameOrId('vales_caja');
  valesCaja.schema.addField(new SchemaField({
    system: false, id: 'vlc0sucursal1', name: 'sucursal', type: 'select',
    required: false, presentable: false, unique: false,
    options: { maxSelect: 1, values: ['cordoba', 'san_francisco', 'rosario', 'buenos_aires'] },
  }));
  dao.saveCollection(valesCaja);

  const recibos = dao.findCollectionByNameOrId('recibos');
  recibos.schema.addField(new SchemaField({
    system: false, id: 'rcb0sucursal1', name: 'sucursal', type: 'select',
    required: false, presentable: false, unique: false,
    options: { maxSelect: 1, values: ['cordoba', 'san_francisco', 'rosario', 'buenos_aires'] },
  }));
  dao.saveCollection(recibos);

  // Backfill cotizaciones: se deriva del prefijo de numero (COR-/SAN-/
  // ROS-/BUE-), que ya codifica la sucursal de quien la creo.
  const PREFIJO_A_SUCURSAL = { COR: 'cordoba', SAN: 'san_francisco', ROS: 'rosario', BUE: 'buenos_aires' };
  dao.findRecordsByFilter('cotizaciones', "sucursal = ''", '', 500, 0).forEach((c) => {
    const prefijo = String(c.get('numero')).split('-')[0];
    const sucursal = PREFIJO_A_SUCURSAL[prefijo];
    if (sucursal) {
      c.set('sucursal', sucursal);
      dao.saveRecord(c);
    }
  });

  // Backfill vales_caja/recibos: sin prefijo en el numero -- todo lo
  // existente lo cargo el unico usuario real de estos 2 modulos hasta
  // ahora (San Francisco), confirmado con el usuario.
  dao.findRecordsByFilter('vales_caja', "sucursal = ''", '', 500, 0).forEach((v) => {
    v.set('sucursal', 'san_francisco');
    dao.saveRecord(v);
  });
  dao.findRecordsByFilter('recibos', "sucursal = ''", '', 500, 0).forEach((r) => {
    r.set('sucursal', 'san_francisco');
    dao.saveRecord(r);
  });

  return null;
}, (db) => {
  const dao = new Dao(db);
  const cotizaciones = dao.findCollectionByNameOrId('cotizaciones01');
  cotizaciones.schema.removeField('cot0sucursal1');
  dao.saveCollection(cotizaciones);

  const valesCaja = dao.findCollectionByNameOrId('vales_caja');
  valesCaja.schema.removeField('vlc0sucursal1');
  dao.saveCollection(valesCaja);

  const recibos = dao.findCollectionByNameOrId('recibos');
  recibos.schema.removeField('rcb0sucursal1');
  dao.saveCollection(recibos);

  return null;
})
```

- [ ] **Step 2: Verificar sintaxis**

Run: `node --check pb_migrations/1789330000_sucursal_en_cotizaciones_vales_recibos.js`
Expected: sin output (exit code 0). `Dao`/`SchemaField`/`migrate` son globals de PocketBase que no existen en Node — este check solo valida sintaxis JS, no ejecuta la migración (no hay PocketBase local en este entorno).

- [ ] **Step 3: Revisión manual**

Confirmar a mano, leyendo el archivo:
1. Los 3 ids de campo (`cot0sucursal1`, `vlc0sucursal1`, `rcb0sucursal1`) no coinciden con ningún id usado en ningún otro archivo de `pb_migrations/` (correr `grep -rn "cot0sucursal1\|vlc0sucursal1\|rcb0sucursal1" pb_migrations/*.js` — no debería haber otra coincidencia más que este archivo nuevo).
2. `dao.findCollectionByNameOrId('cotizaciones01')` usa el id real de la colección (confirmado en `pb_migrations/1789280000_created_cotizaciones.js:28`), no el nombre — mismo criterio que `pb_migrations/1789320000_cotizaciones_categoria.js`.
3. `dao.findCollectionByNameOrId('vales_caja')` y `dao.findCollectionByNameOrId('recibos')` usan el nombre de la colección — mismo criterio que `pb_migrations/1789190000_vales_caja_listrule_planilla_choferes.js`.
4. El filtro `"sucursal = ''"` en los 3 `findRecordsByFilter` es un filtro real no vacío (compara el campo contra string vacío), no el bug ya documentado de pasar `""` como filtro completo.
5. El down-migration remueve exactamente los mismos 3 ids que el up-migration agregó, nada más.

- [ ] **Step 4: Commit**

```bash
git add pb_migrations/1789330000_sucursal_en_cotizaciones_vales_recibos.js
git commit -m "feat: agregar campo sucursal a cotizaciones, vales_caja y recibos (migracion + backfill)"
```

---

### Task 2: Migración — permisos por sucursal

**Files:**
- Create: `pb_migrations/1789340000_listrule_sucursal_cotizaciones_vales_recibos.js`

**Interfaces:**
- Consumes: campo `sucursal` en `cotizaciones01`/`vales_caja`/`recibos` (Task 1).
- Produces: nada que otras tareas consuman.

- [ ] **Step 1: Escribir la migración**

Crear `pb_migrations/1789340000_listrule_sucursal_cotizaciones_vales_recibos.js`:

```js
/// <reference path="../pb_data/types.d.ts" />
// Segmentacion por sucursal, parte 2: ahora que cotizaciones/vales_caja/
// recibos tienen el campo `sucursal` (ver 1789330000), se usa en
// listRule/viewRule para que un usuario no-admin solo vea los registros
// de su propia sucursal. Admin sigue viendo todo. cotizacion_items no
// tiene su propio campo sucursal (seria redundante con el de su
// cotizacion padre) -- filtra via la relacion (cotizacion.sucursal).
// vales_caja ademas de "admin" y "vale_caja+misma sucursal" deja pasar a
// cualquiera con "planilla_choferes" SIN filtrar por sucursal: los vales
// siempre se cargan en San Francisco, asi que quien concilia anticipos de
// choferes (Planilla Choferes) tiene que poder ver todos, sea de la
// sucursal que sea (confirmado con el usuario).
// Ver docs/superpowers/specs/2026-10-30-segmentacion-por-sucursal-design.md
migrate((db) => {
  const dao = new Dao(db);

  const reglaCotizador = '@request.auth.id != "" && (@request.auth.rol = "admin" || (@request.auth.modulos ~ "cotizador" && sucursal = @request.auth.sucursal))';
  const cotizaciones = dao.findCollectionByNameOrId('cotizaciones01');
  cotizaciones.listRule = reglaCotizador;
  cotizaciones.viewRule = reglaCotizador;
  dao.saveCollection(cotizaciones);

  const reglaItems = '@request.auth.id != "" && (@request.auth.rol = "admin" || (@request.auth.modulos ~ "cotizador" && cotizacion.sucursal = @request.auth.sucursal))';
  const items = dao.findCollectionByNameOrId('cotizacionitm1');
  items.listRule = reglaItems;
  items.viewRule = reglaItems;
  dao.saveCollection(items);

  const reglaValesCaja = '@request.auth.id != "" && (@request.auth.rol = "admin" || @request.auth.modulos ~ "planilla_choferes" || (@request.auth.modulos ~ "vale_caja" && sucursal = @request.auth.sucursal))';
  const valesCaja = dao.findCollectionByNameOrId('vales_caja');
  valesCaja.listRule = reglaValesCaja;
  valesCaja.viewRule = reglaValesCaja;
  dao.saveCollection(valesCaja);

  const reglaRecibos = '@request.auth.id != "" && (@request.auth.rol = "admin" || (@request.auth.modulos ~ "recibos" && sucursal = @request.auth.sucursal))';
  const recibos = dao.findCollectionByNameOrId('recibos');
  recibos.listRule = reglaRecibos;
  recibos.viewRule = reglaRecibos;
  dao.saveCollection(recibos);

  return null;
}, (db) => {
  const dao = new Dao(db);

  const reglaCotizadorVieja = '@request.auth.id != "" && (@request.auth.rol = "admin" || @request.auth.modulos ~ "cotizador")';
  const cotizaciones = dao.findCollectionByNameOrId('cotizaciones01');
  cotizaciones.listRule = reglaCotizadorVieja;
  cotizaciones.viewRule = reglaCotizadorVieja;
  dao.saveCollection(cotizaciones);

  const items = dao.findCollectionByNameOrId('cotizacionitm1');
  items.listRule = reglaCotizadorVieja;
  items.viewRule = reglaCotizadorVieja;
  dao.saveCollection(items);

  const reglaValesCajaVieja = '@request.auth.id != "" && (@request.auth.rol = "admin" || @request.auth.modulos ~ "vale_caja" || @request.auth.modulos ~ "planilla_choferes")';
  const valesCaja = dao.findCollectionByNameOrId('vales_caja');
  valesCaja.listRule = reglaValesCajaVieja;
  valesCaja.viewRule = reglaValesCajaVieja;
  dao.saveCollection(valesCaja);

  const reglaRecibosVieja = '@request.auth.id != "" && (@request.auth.rol = "admin" || @request.auth.modulos ~ "recibos")';
  const recibos = dao.findCollectionByNameOrId('recibos');
  recibos.listRule = reglaRecibosVieja;
  recibos.viewRule = reglaRecibosVieja;
  dao.saveCollection(recibos);

  return null;
})
```

- [ ] **Step 2: Verificar sintaxis**

Run: `node --check pb_migrations/1789340000_listrule_sucursal_cotizaciones_vales_recibos.js`
Expected: sin output (exit code 0).

- [ ] **Step 3: Revisión manual**

Confirmar a mano, leyendo el archivo:
1. `dao.findCollectionByNameOrId('cotizacionitm1')` usa el id real de `cotizacion_items` (confirmado en `pb_migrations/1789280000_created_cotizaciones.js:164`), no el nombre.
2. La regla de `cotizacion_items` usa `cotizacion.sucursal` (a través de la relación), NO `sucursal` a secas — `cotizacion_items` no tiene ese campo propio.
3. La regla de `vales_caja` tiene 3 condiciones con `||` en el orden correcto: admin, luego `planilla_choferes` SIN ningún chequeo de sucursal adicional, luego `vale_caja` CON chequeo de sucursal. Si el orden de evaluación estuviera mal (por ejemplo, agregando la condición de sucursal también a la rama de `planilla_choferes`), Planilla Choferes dejaría de ver vales de otra sucursal, que es exactamente lo que no tiene que pasar.
4. Las 3 reglas "viejas" del down-migration son carácter por carácter las que ya están hoy en el código real — comparar contra `pb_migrations/1789300000_cotizador_modulo_propio.js:13` (cotizaciones/cotizacion_items), `pb_migrations/1789190000_vales_caja_listrule_planilla_choferes.js:13` (vales_caja) y `pb_migrations/1789130000_created_recibos.js:53` (recibos).
5. Ninguna de las 4 reglas toca `createRule`/`updateRule`/`deleteRule` — esta migración es solo `listRule`/`viewRule`.

- [ ] **Step 4: Commit**

```bash
git add pb_migrations/1789340000_listrule_sucursal_cotizaciones_vales_recibos.js
git commit -m "feat: filtrar cotizaciones/cotizacion_items/vales_caja/recibos por sucursal en listRule/viewRule"
```

---

### Task 3: Hooks — setear `sucursal` server-side al crear

**Files:**
- Modify: `pb_hooks/cotizaciones.pb.js`
- Modify: `pb_hooks/vales_caja.pb.js`
- Modify: `pb_hooks/recibos.pb.js`

**Interfaces:**
- Consumes: campo `sucursal` en las 3 colecciones (Task 1). No depende de la Task 2.
- Produces: nada que otras tareas consuman.

- [ ] **Step 1: `pb_hooks/cotizaciones.pb.js`**

El contenido completo actual es:

```js
/// <reference path="../pb_data/types.d.ts" />
// Cotizador: numeracion correlativa por sucursal (PREFIJO-00000001),
// asignada por el servidor -- nunca por el cliente, mismo criterio que
// vales_caja.pb.js/recibos.pb.js. El prefijo sale de la sucursal del
// usuario autenticado (fichadas: ver pb_migrations/1789270000_usuarios_sucursal.js);
// sin sucursal cargada no se puede crear una cotizacion.
onRecordBeforeCreateRequest((e) => {
  const dao = e.dao || $app.dao();
  const auth = $apis.requestInfo(e.httpContext).authRecord;
  if (!auth) {
    throw new ForbiddenError("No tenés permiso para esto.");
  }
  const sucursal = auth.get("sucursal");
  const PREFIJOS = { cordoba: "COR", san_francisco: "SAN", rosario: "ROS", buenos_aires: "BUE" };
  const prefijo = PREFIJOS[sucursal];
  if (!prefijo) {
    throw new ForbiddenError("Tu usuario no tiene sucursal asignada -- pedile a un administrador que te la cargue en Administración → Usuarios.");
  }

  const ultimos = dao.findRecordsByFilter("cotizaciones", "numero ~ {:prefijo}", "-numero", 1, 0, { prefijo: prefijo + "-" });
  let siguiente = 1;
  if (ultimos.length) {
    const partes = ultimos[0].get("numero").split("-");
    siguiente = parseInt(partes[partes.length - 1], 10) + 1;
  }
  e.record.set("numero", prefijo + "-" + String(siguiente).padStart(8, "0"));
  e.record.set("creado_por", auth.get("nombre") || auth.get("username") || auth.id);
}, "cotizaciones");
```

Reemplazarlo por (una sola línea nueva, `e.record.set("sucursal", sucursal);`, justo antes de la línea de `creado_por`):

```js
/// <reference path="../pb_data/types.d.ts" />
// Cotizador: numeracion correlativa por sucursal (PREFIJO-00000001),
// asignada por el servidor -- nunca por el cliente, mismo criterio que
// vales_caja.pb.js/recibos.pb.js. El prefijo sale de la sucursal del
// usuario autenticado (fichadas: ver pb_migrations/1789270000_usuarios_sucursal.js);
// sin sucursal cargada no se puede crear una cotizacion.
onRecordBeforeCreateRequest((e) => {
  const dao = e.dao || $app.dao();
  const auth = $apis.requestInfo(e.httpContext).authRecord;
  if (!auth) {
    throw new ForbiddenError("No tenés permiso para esto.");
  }
  const sucursal = auth.get("sucursal");
  const PREFIJOS = { cordoba: "COR", san_francisco: "SAN", rosario: "ROS", buenos_aires: "BUE" };
  const prefijo = PREFIJOS[sucursal];
  if (!prefijo) {
    throw new ForbiddenError("Tu usuario no tiene sucursal asignada -- pedile a un administrador que te la cargue en Administración → Usuarios.");
  }

  const ultimos = dao.findRecordsByFilter("cotizaciones", "numero ~ {:prefijo}", "-numero", 1, 0, { prefijo: prefijo + "-" });
  let siguiente = 1;
  if (ultimos.length) {
    const partes = ultimos[0].get("numero").split("-");
    siguiente = parseInt(partes[partes.length - 1], 10) + 1;
  }
  e.record.set("numero", prefijo + "-" + String(siguiente).padStart(8, "0"));
  e.record.set("sucursal", sucursal);
  e.record.set("creado_por", auth.get("nombre") || auth.get("username") || auth.id);
}, "cotizaciones");
```

- [ ] **Step 2: `pb_hooks/vales_caja.pb.js`**

El contenido completo actual (solo la parte de `onRecordBeforeCreateRequest` — las 2 rutas `routerAdd` de abajo, `/api/vales-caja/:id/usar` y `/api/vales-caja/:id/liberar`, NO se tocan en esta tarea) es:

```js
/// <reference path="../pb_data/types.d.ts" />
// Vale de Caja: numeración correlativa asignada por el servidor (nunca
// por el cliente) y creado_por desde el usuario autenticado. Ver
// docs/superpowers/specs/2026-09-23-vale-de-caja-design.md.
onRecordBeforeCreateRequest((e) => {
  const dao = e.dao || $app.dao();
  // Filtro real, no vacío -- un filtro "" rompe findRecordsByFilter en
  // esta versión de PocketBase (ya confirmado varias veces en este
  // proyecto).
  const ultimos = dao.findRecordsByFilter("vales_caja", "numero >= 0", "-numero", 1, 0);
  const siguiente = ultimos.length ? ultimos[0].getInt("numero") + 1 : 1;
  e.record.set("numero", siguiente);
  e.record.set("usado", false);

  const auth = $apis.requestInfo(e.httpContext).authRecord;
  if (auth) {
    e.record.set("creado_por", auth.get("nombre") || auth.get("username") || auth.id);
  }
}, "vales_caja");
```

Reemplazar el bloque `onRecordBeforeCreateRequest` (el resto del archivo, las 2 rutas `routerAdd`, queda exactamente igual) por:

```js
onRecordBeforeCreateRequest((e) => {
  const dao = e.dao || $app.dao();
  const auth = $apis.requestInfo(e.httpContext).authRecord;
  if (!auth) {
    throw new ForbiddenError("No tenés permiso para esto.");
  }
  const sucursal = auth.get("sucursal");
  if (!sucursal) {
    throw new ForbiddenError("Tu usuario no tiene sucursal asignada -- pedile a un administrador que te la cargue en Administración → Usuarios.");
  }

  // Filtro real, no vacío -- un filtro "" rompe findRecordsByFilter en
  // esta versión de PocketBase (ya confirmado varias veces en este
  // proyecto).
  const ultimos = dao.findRecordsByFilter("vales_caja", "numero >= 0", "-numero", 1, 0);
  const siguiente = ultimos.length ? ultimos[0].getInt("numero") + 1 : 1;
  e.record.set("numero", siguiente);
  e.record.set("usado", false);
  e.record.set("sucursal", sucursal);
  e.record.set("creado_por", auth.get("nombre") || auth.get("username") || auth.id);
}, "vales_caja");
```

Actualizar también el comentario de cabecera del archivo (línea 2-4), que hoy dice "creado_por desde el usuario autenticado" sin mencionar que ahora también exige sucursal:

```js
/// <reference path="../pb_data/types.d.ts" />
// Vale de Caja: numeración correlativa asignada por el servidor (nunca
// por el cliente), creado_por y sucursal desde el usuario autenticado
// (sin sucursal cargada no se puede crear un vale -- mismo criterio que
// cotizaciones.pb.js). Ver docs/superpowers/specs/2026-09-23-vale-de-caja-design.md
// y docs/superpowers/specs/2026-10-30-segmentacion-por-sucursal-design.md.
```

- [ ] **Step 3: `pb_hooks/recibos.pb.js`**

El contenido completo actual es:

```js
/// <reference path="../pb_data/types.d.ts" />
// Recibos: numeración correlativa asignada por el servidor (nunca por el
// cliente) y creado_por desde el usuario autenticado -- mismo patrón que
// pb_hooks/vales_caja.pb.js. Sin /usar ni /liberar: un recibo no se
// consume, solo se registra.
onRecordBeforeCreateRequest((e) => {
  const dao = e.dao || $app.dao();
  // Filtro real, no vacío -- un filtro "" rompe findRecordsByFilter en
  // esta versión de PocketBase (ya confirmado varias veces en este
  // proyecto).
  const ultimos = dao.findRecordsByFilter("recibos", "numero >= 0", "-numero", 1, 0);
  const siguiente = ultimos.length ? ultimos[0].getInt("numero") + 1 : 1;
  e.record.set("numero", siguiente);

  const auth = $apis.requestInfo(e.httpContext).authRecord;
  if (auth) {
    e.record.set("creado_por", auth.get("nombre") || auth.get("username") || auth.id);
  }
}, "recibos");
```

Reemplazarlo por:

```js
/// <reference path="../pb_data/types.d.ts" />
// Recibos: numeración correlativa asignada por el servidor (nunca por el
// cliente), creado_por y sucursal desde el usuario autenticado (sin
// sucursal cargada no se puede crear un recibo) -- mismo patrón que
// pb_hooks/vales_caja.pb.js. Sin /usar ni /liberar: un recibo no se
// consume, solo se registra.
onRecordBeforeCreateRequest((e) => {
  const dao = e.dao || $app.dao();
  const auth = $apis.requestInfo(e.httpContext).authRecord;
  if (!auth) {
    throw new ForbiddenError("No tenés permiso para esto.");
  }
  const sucursal = auth.get("sucursal");
  if (!sucursal) {
    throw new ForbiddenError("Tu usuario no tiene sucursal asignada -- pedile a un administrador que te la cargue en Administración → Usuarios.");
  }

  // Filtro real, no vacío -- un filtro "" rompe findRecordsByFilter en
  // esta versión de PocketBase (ya confirmado varias veces en este
  // proyecto).
  const ultimos = dao.findRecordsByFilter("recibos", "numero >= 0", "-numero", 1, 0);
  const siguiente = ultimos.length ? ultimos[0].getInt("numero") + 1 : 1;
  e.record.set("numero", siguiente);
  e.record.set("sucursal", sucursal);
  e.record.set("creado_por", auth.get("nombre") || auth.get("username") || auth.id);
}, "recibos");
```

- [ ] **Step 4: Verificar sintaxis**

Run: `node --check pb_hooks/cotizaciones.pb.js && node --check pb_hooks/vales_caja.pb.js && node --check pb_hooks/recibos.pb.js`
Expected: sin output (exit code 0). `onRecordBeforeCreateRequest`/`$apis`/`ForbiddenError`/`routerAdd` son globals de PocketBase que no existen en Node — este check solo valida sintaxis JS.

- [ ] **Step 5: Revisión manual**

Confirmar a mano, leyendo los 3 archivos:
1. `cotizaciones.pb.js`: la única línea nueva es `e.record.set("sucursal", sucursal);` — todo lo demás (numeración, `creado_por`, el `ForbiddenError` ya existente) queda igual.
2. `vales_caja.pb.js` y `recibos.pb.js`: el nuevo bloque de validación (`if (!auth) {...}` + `if (!sucursal) {...}`) usa EXACTAMENTE el mismo mensaje de error que ya usa `cotizaciones.pb.js` ("Tu usuario no tiene sucursal asignada...") — consistencia de UX entre los 3 módulos.
3. En `vales_caja.pb.js`, las 2 rutas `routerAdd` (`/usar` y `/liberar`) no cambiaron ni una línea — esta tarea solo toca `onRecordBeforeCreateRequest`.
4. Ninguno de los 3 hooks lee `e.record.get("sucursal")` del request entrante en ningún punto — el valor siempre sale de `auth.get("sucursal")`, nunca de lo que mandó el cliente.

- [ ] **Step 6: Commit**

```bash
git add pb_hooks/cotizaciones.pb.js pb_hooks/vales_caja.pb.js pb_hooks/recibos.pb.js
git commit -m "feat: setear sucursal server-side al crear cotizaciones/vales_caja/recibos"
```
