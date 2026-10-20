# Vale de Caja: vincular vale usado a su rendición Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un vale de caja marcado "usado" quede vinculado al rango de fechas de la rendición que lo consumió, para que la pantalla de Planilla Choferes pueda reconstruir el total aunque se recargue, y que el Excel exportado incluya el detalle de esos vales.

**Architecture:** Dos campos nuevos de texto (`periodo_desde`/`periodo_hasta`) en `vales_caja`, completados por los endpoints existentes `/usar` y `/liberar` (`pb_hooks/vales_caja.pb.js`). La pantalla de Planilla Choferes pasa a traer, además de los vales libres, los que ya están usados en el rango exacto que se está viendo, y los muestra pre-tildados.

**Tech Stack:** React + TypeScript (Vite), PocketBase (migraciones + hooks JSVM), librería `xlsx` ya en uso en el mismo archivo.

## Global Constraints

- `periodo_desde`/`periodo_hasta` son texto plano `YYYY-MM-DD` (no el tipo `date` nativo de PocketBase) — mismo formato exacto que ya usan los estados `desde`/`hasta` del componente, para que la comparación `=` sea una igualdad de string simple y predecible, sin depender de cómo PocketBase normalice un tipo `date`.
- El campo `chofer` que ya tiene cada vale NO se toca — alcanza para filtrar, no hace falta ninguno nuevo para eso.
- La reconstrucción es por coincidencia EXACTA de `periodo_desde`/`periodo_hasta` contra el rango actualmente elegido en pantalla — no por solapamiento parcial (confirmado fuera de alcance en el spec).
- `createRule`/`deleteRule`/`listRule`/`viewRule` de `vales_caja` no cambian en este plan (el `listRule` para `planilla_choferes` ya se arregló en un commit anterior, `e77934e`).

---

## Task 1: Migración — campos periodo_desde/periodo_hasta en vales_caja

**Files:**
- Create: `pb_migrations/1789200000_vales_caja_periodo_rendicion.js`
- Modify: `web/src/types.ts`

**Interfaces:**
- Produces: campos `periodo_desde` (text, opcional), `periodo_hasta` (text, opcional) en `vales_caja`; `ValeCaja.periodo_desde?: string`, `ValeCaja.periodo_hasta?: string`.

- [ ] **Step 1: Escribir la migración**

```javascript
/// <reference path="../pb_data/types.d.ts" />
// Vale de Caja: periodo_desde/periodo_hasta registran el rango de fechas
// de la rendición que marcó este vale como "usado" (completados por los
// endpoints /usar y /liberar en pb_hooks/vales_caja.pb.js, no se cargan a
// mano) -- permiten reconstruir, al recargar la pantalla de Planilla
// Choferes, cuáles vales formaban el total de una rendición ya armada.
// Texto plano YYYY-MM-DD, igual formato que los estados desde/hasta del
// componente -- comparación de igualdad simple, sin usar el tipo date
// nativo. Ver docs/superpowers/specs/2026-10-20-vale-caja-vinculo-rendicion-design.md.
migrate((db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId('vales_caja');
  collection.schema.addField(new SchemaField({
    system: false, id: 'vlc0perdesde1', name: 'periodo_desde', type: 'text',
    required: false, presentable: false, unique: false,
    options: { min: null, max: null, pattern: '' },
  }));
  collection.schema.addField(new SchemaField({
    system: false, id: 'vlc0perhasta1', name: 'periodo_hasta', type: 'text',
    required: false, presentable: false, unique: false,
    options: { min: null, max: null, pattern: '' },
  }));
  return dao.saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId('vales_caja');
  collection.schema.removeField('vlc0perdesde1');
  collection.schema.removeField('vlc0perhasta1');
  return dao.saveCollection(collection);
})
```

- [ ] **Step 2: Probar contra una PocketBase local real**

```bash
mkdir -p /tmp/pb-test && cd /tmp/pb-test
curl -sL -o pb.zip "https://github.com/pocketbase/pocketbase/releases/download/v0.22.55/pocketbase_0.22.55_linux_amd64.zip"
unzip -o pb.zip
rm -rf data mig hooks
mkdir -p mig hooks
cp /ruta/al/repo/pb_migrations/*.js mig/
cp /ruta/al/repo/pb_hooks/*.js hooks/
./pocketbase migrate up --migrationsDir mig --hooksDir hooks --dir data
```

Expected: `Applied 1789200000_vales_caja_periodo_rendicion.js` sin errores.

- [ ] **Step 3: Verificar los 2 campos quedaron bien definidos**

```bash
python3 -c "
import sqlite3, json
con = sqlite3.connect('data/data.db')
row = con.execute(\"SELECT schema FROM _collections WHERE name='vales_caja'\").fetchone()
data = json.loads(row[0])
por_nombre = {f['name']: f for f in data}
assert por_nombre['periodo_desde']['required'] is False
assert por_nombre['periodo_hasta']['required'] is False
assert por_nombre['periodo_desde']['type'] == 'text'
print('OK: periodo_desde/periodo_hasta presentes, opcionales, tipo text')
"
```

Expected: imprime `OK: periodo_desde/periodo_hasta presentes...` sin error en los asserts.

- [ ] **Step 4: Agregar los campos en `web/src/types.ts`**

Buscar:

```typescript
export interface ValeCaja extends BaseRecord {
  numero: number;
  fecha: string;
  chofer: string;
  nombre_firma?: string;
  importe: number;
  moneda: 'ARS' | 'BRL' | 'USD';
  observacion1?: string;
  observacion2?: string;
  usado: boolean;
  creado_por?: string;
}
```

Reemplazar por:

```typescript
export interface ValeCaja extends BaseRecord {
  numero: number;
  fecha: string;
  chofer: string;
  nombre_firma?: string;
  importe: number;
  moneda: 'ARS' | 'BRL' | 'USD';
  observacion1?: string;
  observacion2?: string;
  usado: boolean;
  periodo_desde?: string; // "YYYY-MM-DD", rango de la rendición que lo usó -- vacío si no está usado
  periodo_hasta?: string;
  creado_por?: string;
}
```

- [ ] **Step 5: Commit**

```bash
git add pb_migrations/1789200000_vales_caja_periodo_rendicion.js web/src/types.ts
git commit -m "Vale de Caja: campos periodo_desde/periodo_hasta para vincular un vale usado a su rendición"
```

(Incluir `Co-Authored-By: Claude <noreply@anthropic.com>`.)

---

## Task 2: Endpoints /usar y /liberar — completar y limpiar el período

**Files:**
- Modify: `pb_hooks/vales_caja.pb.js`

**Interfaces:**
- Consumes: campos `periodo_desde`/`periodo_hasta` (Task 1).
- Produces: `/api/vales-caja/:id/usar` ahora acepta `{ desde: string, hasta: string }` en el body y los guarda; `/api/vales-caja/:id/liberar` los limpia.

- [ ] **Step 1: Modificar `/usar` para leer el body y guardar el período**

Buscar:

```javascript
routerAdd("POST", "/api/vales-caja/:id/usar", (c) => {
  const info = $apis.requestInfo(c);
  const auth = info.authRecord;
  if (!auth) {
    throw new ForbiddenError("No tenés permiso para esto.");
  }
  const rawModulos = auth.get("modulos");
  const modulosTexto = (Array.isArray(rawModulos) ? String.fromCharCode.apply(null, rawModulos) : JSON.stringify(rawModulos || [])).toLowerCase();
  const tieneAcceso = auth.get("rol") === "admin" || modulosTexto.indexOf("planilla_choferes") !== -1 || modulosTexto.indexOf("vale_caja") !== -1;
  if (!tieneAcceso) {
    throw new ForbiddenError("No tenés permiso para esto.");
  }
  const dao = $app.dao();
  const id = c.pathParam("id");
  let record;
  try {
    record = dao.findRecordById("vales_caja", id);
  } catch (err) {
    throw new NotFoundError("Vale de caja no encontrado.");
  }
  record.set("usado", true);
  dao.saveRecord(record);
  return c.json(200, { usado: true });
});
```

Reemplazar por:

```javascript
routerAdd("POST", "/api/vales-caja/:id/usar", (c) => {
  const info = $apis.requestInfo(c);
  const auth = info.authRecord;
  if (!auth) {
    throw new ForbiddenError("No tenés permiso para esto.");
  }
  const rawModulos = auth.get("modulos");
  const modulosTexto = (Array.isArray(rawModulos) ? String.fromCharCode.apply(null, rawModulos) : JSON.stringify(rawModulos || [])).toLowerCase();
  const tieneAcceso = auth.get("rol") === "admin" || modulosTexto.indexOf("planilla_choferes") !== -1 || modulosTexto.indexOf("vale_caja") !== -1;
  if (!tieneAcceso) {
    throw new ForbiddenError("No tenés permiso para esto.");
  }
  const dao = $app.dao();
  const id = c.pathParam("id");
  let record;
  try {
    record = dao.findRecordById("vales_caja", id);
  } catch (err) {
    throw new NotFoundError("Vale de caja no encontrado.");
  }
  const body = info.data || {};
  record.set("usado", true);
  record.set("periodo_desde", body.desde || "");
  record.set("periodo_hasta", body.hasta || "");
  dao.saveRecord(record);
  return c.json(200, { usado: true });
});
```

- [ ] **Step 2: Modificar `/liberar` para limpiar el período**

Buscar:

```javascript
routerAdd("POST", "/api/vales-caja/:id/liberar", (c) => {
  const info = $apis.requestInfo(c);
  const auth = info.authRecord;
  if (!auth) {
    throw new ForbiddenError("No tenés permiso para esto.");
  }
  const rawModulos = auth.get("modulos");
  const modulosTexto = (Array.isArray(rawModulos) ? String.fromCharCode.apply(null, rawModulos) : JSON.stringify(rawModulos || [])).toLowerCase();
  const tieneAcceso = auth.get("rol") === "admin" || modulosTexto.indexOf("planilla_choferes") !== -1 || modulosTexto.indexOf("vale_caja") !== -1;
  if (!tieneAcceso) {
    throw new ForbiddenError("No tenés permiso para esto.");
  }
  const dao = $app.dao();
  const id = c.pathParam("id");
  let record;
  try {
    record = dao.findRecordById("vales_caja", id);
  } catch (err) {
    throw new NotFoundError("Vale de caja no encontrado.");
  }
  record.set("usado", false);
  dao.saveRecord(record);
  return c.json(200, { usado: false });
});
```

Reemplazar por:

```javascript
routerAdd("POST", "/api/vales-caja/:id/liberar", (c) => {
  const info = $apis.requestInfo(c);
  const auth = info.authRecord;
  if (!auth) {
    throw new ForbiddenError("No tenés permiso para esto.");
  }
  const rawModulos = auth.get("modulos");
  const modulosTexto = (Array.isArray(rawModulos) ? String.fromCharCode.apply(null, rawModulos) : JSON.stringify(rawModulos || [])).toLowerCase();
  const tieneAcceso = auth.get("rol") === "admin" || modulosTexto.indexOf("planilla_choferes") !== -1 || modulosTexto.indexOf("vale_caja") !== -1;
  if (!tieneAcceso) {
    throw new ForbiddenError("No tenés permiso para esto.");
  }
  const dao = $app.dao();
  const id = c.pathParam("id");
  let record;
  try {
    record = dao.findRecordById("vales_caja", id);
  } catch (err) {
    throw new NotFoundError("Vale de caja no encontrado.");
  }
  record.set("usado", false);
  record.set("periodo_desde", "");
  record.set("periodo_hasta", "");
  dao.saveRecord(record);
  return c.json(200, { usado: false });
});
```

- [ ] **Step 3: Probar contra un servidor local real con curl**

Primero levantar el servidor y crear un admin de prueba (reusa la base de datos ya migrada del Task 1, directorio `/tmp/pb-test`):

```bash
cd /tmp/pb-test
./pocketbase admin create test@test.com testpass12345 --dir data
./pocketbase serve --http=127.0.0.1:8094 --migrationsDir mig --hooksDir hooks --dir data &
sleep 2
```

Autenticar y crear un chofer + un vale de prueba para poder probar los endpoints:

```bash
TOKEN=$(curl -s -X POST http://127.0.0.1:8094/api/admins/auth-with-password \
  -H "Content-Type: application/json" \
  -d '{"identity":"test@test.com","password":"testpass12345"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

CHOFER_ID=$(curl -s -X POST http://127.0.0.1:8094/api/collections/choferes/records \
  -H "Authorization: $TOKEN" -H "Content-Type: application/json" \
  -d '{"nombre":"CHOFER DE PRUEBA","activo":true}' | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

VALE_ID=$(curl -s -X POST http://127.0.0.1:8094/api/collections/vales_caja/records \
  -H "Authorization: $TOKEN" -H "Content-Type: application/json" \
  -d "{\"numero\":1,\"fecha\":\"2026-10-15\",\"chofer\":\"$CHOFER_ID\",\"nombre_firma\":\"Prueba\",\"importe\":1000,\"moneda\":\"ARS\"}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "VALE_ID=$VALE_ID"
```

Marcar usado con un período y verificar:

```bash
curl -s -X POST http://127.0.0.1:8094/api/vales-caja/$VALE_ID/usar \
  -H "Authorization: $TOKEN" -H "Content-Type: application/json" \
  -d '{"desde":"2026-10-01","hasta":"2026-10-31"}'
curl -s -H "Authorization: $TOKEN" http://127.0.0.1:8094/api/collections/vales_caja/records/$VALE_ID
```

Expected: la segunda respuesta muestra `"usado":true, "periodo_desde":"2026-10-01", "periodo_hasta":"2026-10-31"`.

```bash
curl -s -X POST http://127.0.0.1:8094/api/vales-caja/$VALE_ID/liberar -H "Authorization: $TOKEN"
curl -s -H "Authorization: $TOKEN" http://127.0.0.1:8094/api/collections/vales_caja/records/$VALE_ID
```

Expected: el vale vuelve a `"usado":false, "periodo_desde":"", "periodo_hasta":""`. Al terminar, parar el servidor (`kill %1` o `taskkill //F //IM pocketbase.exe` en Windows).

- [ ] **Step 4: Commit**

```bash
git add pb_hooks/vales_caja.pb.js
git commit -m "Vale de Caja: /usar y /liberar completan y limpian periodo_desde/periodo_hasta"
```

---

## Task 3: Planilla Choferes — reconstruir el tildado y exportar el detalle

**Files:**
- Modify: `web/src/pages/planilla/PlanillaChoferesPage.tsx`

**Interfaces:**
- Consumes: campos `periodo_desde`/`periodo_hasta` (Task 1), endpoints `/usar`/`/liberar` con body (Task 2).
- No produce nada consumido por otras tareas.

- [ ] **Step 1: `loadValesDisponibles` trae también los ya usados en este rango exacto**

Buscar:

```typescript
  async function loadValesDisponibles() {
    if (!choferId) { setValesDisponibles([]); setValesTildados(new Set()); return; }
    const mi = ++valesReq.current;
    try {
      const items = await pb.collection('vales_caja').getFullList<ValeCaja>({
        filter: pb.filter('chofer = {:c} && usado = false && moneda = {:m}', { c: choferId, m: 'ARS' }),
        sort: 'fecha',
      });
      if (mi !== valesReq.current) return;
      setValesDisponibles(items);
      setValesTildados(new Set());
    } catch (e) {
      if (mi !== valesReq.current) return;
      toast('No se pudieron cargar los vales de caja: ' + mensajeDeError(e), 'err');
    }
  }
```

Reemplazar por:

```typescript
  async function loadValesDisponibles() {
    if (!choferId) { setValesDisponibles([]); setValesTildados(new Set()); return; }
    const mi = ++valesReq.current;
    try {
      // trae los libres MÁS los que ya están usados en este rango exacto
      // (periodo_desde/periodo_hasta coinciden) -- así se reconstruye el
      // tildado aunque se recargue la pantalla.
      const items = await pb.collection('vales_caja').getFullList<ValeCaja>({
        filter: pb.filter(
          'chofer = {:c} && moneda = {:m} && (usado = false || (periodo_desde = {:d} && periodo_hasta = {:h}))',
          { c: choferId, m: 'ARS', d: desde, h: hasta }
        ),
        sort: 'fecha',
      });
      if (mi !== valesReq.current) return;
      setValesDisponibles(items);
      setValesTildados(new Set(items.filter((v) => v.usado).map((v) => v.id)));
    } catch (e) {
      if (mi !== valesReq.current) return;
      toast('No se pudieron cargar los vales de caja: ' + mensajeDeError(e), 'err');
    }
  }
```

- [ ] **Step 2: `toggleVale` manda el rango de fechas al marcar como usado**

Buscar:

```typescript
  async function toggleVale(v: ValeCaja) {
    const marcando = !valesTildados.has(v.id);
    try {
      await pb.send(`/api/vales-caja/${v.id}/${marcando ? 'usar' : 'liberar'}`, { method: 'POST' });
      setValesTildados((cur) => {
        const next = new Set(cur);
        if (marcando) next.add(v.id); else next.delete(v.id);
        return next;
      });
    } catch (e) {
      toast('No se pudo actualizar el vale: ' + mensajeDeError(e), 'err');
    }
  }
```

Reemplazar por:

```typescript
  async function toggleVale(v: ValeCaja) {
    const marcando = !valesTildados.has(v.id);
    try {
      if (marcando) {
        await pb.send(`/api/vales-caja/${v.id}/usar`, { method: 'POST', body: { desde, hasta } });
      } else {
        await pb.send(`/api/vales-caja/${v.id}/liberar`, { method: 'POST' });
      }
      setValesTildados((cur) => {
        const next = new Set(cur);
        if (marcando) next.add(v.id); else next.delete(v.id);
        return next;
      });
    } catch (e) {
      toast('No se pudo actualizar el vale: ' + mensajeDeError(e), 'err');
    }
  }
```

- [ ] **Step 3: El botón "Buscar" también recarga los vales (hoy solo recarga tramos)**

Buscar:

```tsx
          <button onClick={loadTramos} disabled={cargando}>{cargando ? 'Buscando…' : 'Buscar'}</button>
```

Reemplazar por:

```tsx
          <button onClick={() => { loadTramos(); loadValesDisponibles(); }} disabled={cargando}>{cargando ? 'Buscando…' : 'Buscar'}</button>
```

- [ ] **Step 4: Agregar la hoja "Vales de Caja" al Excel exportado**

Buscar:

```typescript
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen');
    XLSX.utils.book_append_sheet(wb, wsTramos, 'Tramos');
    XLSX.writeFile(wb, `rendicion_${(choferNombre || 'chofer').replace(/[^a-z0-9]+/gi, '_')}_${desde}_a_${hasta}.xlsx`);
```

Reemplazar por:

```typescript
    const valesUsados = valesDisponibles.filter((v) => valesTildados.has(v.id));
    const aoaVales: (string | number)[][] = [
      ['N° Vale', 'Fecha', 'Importe', 'Observación'],
      ...valesUsados.map((v) => [v.numero, fechaCorta(v.fecha), v.importe, v.observacion1 || '']),
      ['TOTAL', '', valesUsados.reduce((s, v) => s + (Number(v.importe) || 0), 0), ''],
    ];
    const wsVales = XLSX.utils.aoa_to_sheet(aoaVales);
    wsVales['!cols'] = [{ wch: 11 }, { wch: 13 }, { wch: 13 }, { wch: 40 }];
    for (let r = 1; r <= valesUsados.length + 1; r++) {
      const celda = wsVales[XLSX.utils.encode_cell({ r, c: 2 })];
      if (celda && typeof celda.v === 'number') celda.z = '#,##0.00';
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen');
    XLSX.utils.book_append_sheet(wb, wsTramos, 'Tramos');
    XLSX.utils.book_append_sheet(wb, wsVales, 'Vales de Caja');
    XLSX.writeFile(wb, `rendicion_${(choferNombre || 'chofer').replace(/[^a-z0-9]+/gi, '_')}_${desde}_a_${hasta}.xlsx`);
```

- [ ] **Step 5: Build**

Run: `cd web && npm run build`
Expected: build exitoso, sin errores de TypeScript.

- [ ] **Step 6: Commit**

```bash
git add web/src/pages/planilla/PlanillaChoferesPage.tsx
git commit -m "Vale de Caja: reconstruir tildado al recargar y exportar detalle de vales usados"
```

---

## Task 4: Desplegar y verificar

**Files:** (ninguno nuevo — solo push y verificación)

- [ ] **Step 1: Push**

```bash
git push origin claude/cyv-driver-renditions-form-h4l5fu
```

- [ ] **Step 2: Esperar el deploy y confirmar**

Sondear `https://api.github.com/repos/sistemascyv/Desarrollos/actions/runs?branch=claude/cyv-driver-renditions-form-h4l5fu&per_page=1` hasta `status: completed` (o confirmar directamente que el hash del bundle JS cambió en `https://app.carossiovairolatti.com.ar/`).

- [ ] **Step 3: Verificación final en producción**

Entrar a Planilla Choferes, elegir un chofer con vales disponibles, tildar uno, recargar la página con el mismo chofer y el mismo rango de fechas, y confirmar que aparece pre-tildado y el total se reconstruye igual que antes de recargar. Exportar a Excel y confirmar que aparece la hoja "Vales de Caja" con el detalle.
