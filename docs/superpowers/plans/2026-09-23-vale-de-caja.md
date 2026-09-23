# Vale de Caja (Tesorería) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the manual "Aplicacion Impresion Recibo" Windows app with a Vale de Caja module in Sistema CyV's Tesorería area, and wire it into Planilla Choferes so vales tilded there feed the "Total Vales" of a chofer's rendición.

**Architecture:** New PocketBase collection `vales_caja` with a server-side numbering hook and two narrow-purpose endpoints (`/usar`, `/liberar`) that toggle a single `usado` flag without opening general edit access. New React page under `web/src/pages/tesoreria/` for creating/listing/printing vales. `PlanillaChoferesPage.tsx` gets a new panel that lists a chofer's unused vales and folds tilded ones into the existing `summary.totalVales` calculation.

**Tech Stack:** PocketBase (JSVM migrations/hooks), React + TypeScript (Vite), same patterns as the rest of this codebase (`pb.filter`, `useToast`/`useConfirm`, print-only CSS blocks).

## Global Constraints

- Module permission checks against `usuarios.modulos` (a `json` field) MUST use the `~` operator, never `?=` — `?=` silently never matches for non-admins on this field type. Confirmed and fixed for this exact bug three times already in this project (Fichadas, Cheques, Reportes de Flota).
- Server-assigned fields (`numero`, `creado_por`) are set inside hooks from `auth`/prior records — never trust a client-supplied value for them.
- `dao.findRecordsByFilter(...)` must always get a real filter condition, never `""` — an empty filter crashes this PocketBase version.
- Every backend change must be verified against a local PocketBase instance running the real migrations/hooks before considering the task done (this project's established practice) — not just "the migration file looks right."
- Follow existing UI conventions exactly: `money()` from `lib/format.ts` for currency display, `useToast()`/`useConfirm()` for feedback, `pb.filter()` for any interpolated filter string, `RequireModule` for route gating.

---

## File Structure

- `pb_migrations/1789060000_created_vales_caja.js` — new collection + rules (new file)
- `pb_hooks/vales_caja.pb.js` — numbering hook + `/usar`/`/liberar` endpoints (new file)
- `web/src/lib/numeroEnLetras.ts` — Spanish number-to-words, ported from `Conversion.cs` (new file)
- `web/src/types.ts` — `ValeCaja` interface + module catalog entry (modify)
- `web/src/App.tsx` — new route (modify)
- `web/src/pages/tesoreria/ValeCajaPage.tsx` — the Tesorería page: form, historial, print (new file)
- `web/src/pages/planilla/PlanillaChoferesPage.tsx` — vales-disponibles panel + `totalVales` formula update (modify)
- `web/src/index.css` — print rules for the vale layout + small panel styles (modify)

---

## Task 1: Backend — `vales_caja` collection

**Files:**
- Create: `pb_migrations/1789060000_created_vales_caja.js`

**Interfaces:**
- Produces: collection `vales_caja` with fields `numero` (number), `fecha` (date), `chofer` (relation → `choferes`), `nombre_firma` (text), `importe` (number), `moneda` (select `ARS`/`BRL`), `observacion1` (text), `observacion2` (text), `usado` (bool), `creado_por` (text). Rules: list/view/create = admin or `modulos ~ "vale_caja"`; update = `null`; delete = admin only.

- [ ] **Step 1: Find the `choferes` collection id to reference in the relation field**

Run: `grep -n '"id":' "C:/Users/SISTEMAS/Desarrollos/pb_migrations/1787856517_created_choferes.js" | head -3`

Expected: prints the collection's own `"id"` line (a string like `"a1b2c3..."`, or `choferes` itself if the id equals the name — either way, copy the exact 15-character id used in that file's `Collection({...})` call, it's what `options.collectionId` must reference below).

- [ ] **Step 2: Write the migration**

```javascript
/// <reference path="../pb_data/types.d.ts" />
// Vale de Caja: reemplaza el ejecutable manual "Aplicacion Impresion
// Recibo" (captura de pantalla, sin guardar nada) por un registro real.
// Ver docs/superpowers/specs/2026-09-23-vale-de-caja-design.md.
migrate((db) => {
  const collection = new Collection({
    "id": "valcaja0001reg",
    "name": "vales_caja",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false, "id": "vlc0numero01", "name": "numero", "type": "number",
        "required": true, "presentable": true, "unique": true,
        "options": { "min": 1, "max": null, "noDecimal": true },
      },
      {
        "system": false, "id": "vlc0fecha001", "name": "fecha", "type": "date",
        "required": true, "presentable": true, "unique": false,
        "options": { "min": "", "max": "" },
      },
      {
        "system": false, "id": "vlc0chofer01", "name": "chofer", "type": "relation",
        "required": true, "presentable": true, "unique": false,
        "options": { "collectionId": "CHOFERES_COLLECTION_ID", "cascadeDelete": false, "minSelect": null, "maxSelect": 1, "displayFields": ["nombre"] },
      },
      {
        "system": false, "id": "vlc0nomfirm1", "name": "nombre_firma", "type": "text",
        "required": true, "presentable": true, "unique": false,
        "options": { "min": null, "max": null, "pattern": "" },
      },
      {
        "system": false, "id": "vlc0importe1", "name": "importe", "type": "number",
        "required": true, "presentable": true, "unique": false,
        "options": { "min": 0, "max": null, "noDecimal": false },
      },
      {
        "system": false, "id": "vlc0moneda01", "name": "moneda", "type": "select",
        "required": true, "presentable": false, "unique": false,
        "options": { "maxSelect": 1, "values": ["ARS", "BRL"] },
      },
      {
        "system": false, "id": "vlc0observa1", "name": "observacion1", "type": "text",
        "required": false, "presentable": false, "unique": false,
        "options": { "min": null, "max": null, "pattern": "" },
      },
      {
        "system": false, "id": "vlc0observa2", "name": "observacion2", "type": "text",
        "required": false, "presentable": false, "unique": false,
        "options": { "min": null, "max": null, "pattern": "" },
      },
      {
        "system": false, "id": "vlc0usado001", "name": "usado", "type": "bool",
        "required": false, "presentable": true, "unique": false, "options": {},
      },
      {
        "system": false, "id": "vlc0creapor1", "name": "creado_por", "type": "text",
        "required": false, "presentable": true, "unique": false,
        "options": { "min": null, "max": null, "pattern": "" },
      },
    ],
    "indexes": [],
    "listRule": "@request.auth.id != \"\" && (@request.auth.rol = \"admin\" || @request.auth.modulos ~ \"vale_caja\")",
    "viewRule": "@request.auth.id != \"\" && (@request.auth.rol = \"admin\" || @request.auth.modulos ~ \"vale_caja\")",
    "createRule": "@request.auth.id != \"\" && (@request.auth.rol = \"admin\" || @request.auth.modulos ~ \"vale_caja\")",
    "updateRule": null,
    "deleteRule": "@request.auth.rol = \"admin\"",
    "options": {},
  });
  return Dao(db).saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  return dao.deleteCollection(dao.findCollectionByNameOrId("valcaja0001reg"));
})
```

Replace `CHOFERES_COLLECTION_ID` with the exact id found in Step 1.

- [ ] **Step 3: Set up a local PocketBase test instance (if you don't already have one for this project)**

```bash
mkdir -p /tmp/pb-test && cd /tmp/pb-test
curl -L -o pb.zip https://github.com/pocketbase/pocketbase/releases/download/v0.22.55/pocketbase_0.22.55_linux_amd64.zip
unzip -o pb.zip pocketbase
chmod +x pocketbase
mkdir -p mig hooks
cp "C:/Users/SISTEMAS/Desarrollos/pb_migrations/"*.js mig/
cp "C:/Users/SISTEMAS/Desarrollos/pb_hooks/"*.js hooks/
```

(On Windows, download the `windows_amd64.zip` asset instead and adjust paths/`.exe` accordingly — this project's established practice, see other migrations' test notes.)

- [ ] **Step 4: Apply the migration and verify the collection was created with the right rules**

Run: `./pocketbase migrate up --dir=./data --migrationsDir=./mig`
Expected: last line is `Applied 1789060000_created_vales_caja.js`, no errors.

Run:
```bash
node -e "
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('./data/data.db', { readOnly: true });
const row = db.prepare(\"SELECT listRule, updateRule, deleteRule, schema FROM _collections WHERE name='vales_caja'\").get();
console.log(row);
"
```
Expected: `listRule` contains `modulos ~ "vale_caja"` (not `?=`), `updateRule` is `null`, `deleteRule` is `'@request.auth.rol = "admin"'`, `schema` includes all 10 fields from Step 2.

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/SISTEMAS/Desarrollos"
git add pb_migrations/1789060000_created_vales_caja.js
git commit -m "Vale de Caja: crear colección vales_caja"
```

---

## Task 2: Backend — numbering + `creado_por` hook

**Files:**
- Create: `pb_hooks/vales_caja.pb.js`

**Interfaces:**
- Consumes: collection `vales_caja` from Task 1.
- Produces: on any `POST /api/collections/vales_caja/records`, the saved record has `numero` = (max existing `numero`) + 1 (ignoring any client-supplied value) and `creado_por` set from the authenticated user.

- [ ] **Step 1: Write the hook**

```javascript
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

  const auth = e.httpContext.get("authRecord");
  if (auth) {
    e.record.set("creado_por", auth.get("nombre") || auth.get("username") || auth.id);
  }
}, "vales_caja");
```

- [ ] **Step 2: Copy the hook into the local test instance and restart the server**

```bash
cp "C:/Users/SISTEMAS/Desarrollos/pb_hooks/vales_caja.pb.js" /tmp/pb-test/hooks/
cd /tmp/pb-test
./pocketbase serve --dir=./data --hooksDir=./hooks --http=127.0.0.1:8099 &
sleep 2
```

- [ ] **Step 3: Create a test admin and a test user with the `vale_caja` module, then create two vales via the API and confirm sequential numbering**

```bash
./pocketbase superuser upsert admin@test.com Passw0rd!Admin --dir=./data
ADMIN_TOKEN=$(curl -s -X POST http://127.0.0.1:8099/api/admins/auth-with-password \
  -H "Content-Type: application/json" \
  -d '{"identity":"admin@test.com","password":"Passw0rd!Admin"}' | node -pe "JSON.parse(require('fs').readFileSync(0)).token")

CHOFER_ID=$(curl -s "http://127.0.0.1:8099/api/collections/choferes/records?perPage=1" \
  -H "Authorization: $ADMIN_TOKEN" | node -pe "JSON.parse(require('fs').readFileSync(0)).items[0].id")

for i in 1 2; do
curl -s -X POST http://127.0.0.1:8099/api/collections/vales_caja/records \
  -H "Authorization: $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d "{\"numero\": 9999, \"fecha\": \"2026-09-23\", \"chofer\": \"$CHOFER_ID\", \"nombre_firma\": \"Test Chofer\", \"importe\": 1000, \"moneda\": \"ARS\"}"
echo ""
done
```

Expected: both responses show `"numero": 1` and `"numero": 2` respectively — **not** `9999` — proving the client-supplied `numero` was ignored and replaced. Both show `"creado_por"` filled with something (the admin's identity), not empty.

- [ ] **Step 4: Commit**

```bash
cd "C:/Users/SISTEMAS/Desarrollos"
git add pb_hooks/vales_caja.pb.js
git commit -m "Vale de Caja: numeración correlativa y creado_por por hook"
```

---

## Task 3: Backend — `/usar` and `/liberar` endpoints

**Files:**
- Modify: `pb_hooks/vales_caja.pb.js`

**Interfaces:**
- Produces: `POST /api/vales-caja/:id/usar` and `POST /api/vales-caja/:id/liberar`, each requiring the caller to be admin or have `planilla_choferes` or `vale_caja` in `modulos`; toggles `usado` on the given `vales_caja` record; returns `{"usado": true|false}` on success, 401/403 on auth failure, 404 if the id doesn't exist.

- [ ] **Step 1: Add the two routes to the hook file**

**Critical constraint, copied verbatim from the top-of-file comment in
`pb_hooks/pressa.pb.js`:** *"Toda la lógica vive DENTRO del callback de
routerAdd (nada de funciones/variables sueltas arriba del archivo):
PocketBase corre ese callback en un contexto que en producción no
siempre ve lo declarado afuera ('ReferenceError: ... is not defined')
— ya nos pasó una vez con este hook nuevo."* This is not a style
preference — it has caused a real production crash before. Do **not**
factor the checks below into a shared top-level function. Each
`routerAdd` callback must be fully self-contained, duplicating the
access check inline, exactly like the three routes in
`pb_hooks/pressa.pb.js` each do.

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

Append this below the `onRecordBeforeCreateRequest` block already in `pb_hooks/vales_caja.pb.js` from Task 2. The duplication between the two routes is intentional — see the constraint above.

- [ ] **Step 2: Restart the local server with the updated hook and test the happy path**

```bash
kill %1 2>/dev/null
cp "C:/Users/SISTEMAS/Desarrollos/pb_hooks/vales_caja.pb.js" /tmp/pb-test/hooks/
cd /tmp/pb-test
./pocketbase serve --dir=./data --hooksDir=./hooks --http=127.0.0.1:8099 &
sleep 2

VALE_ID=$(curl -s "http://127.0.0.1:8099/api/collections/vales_caja/records?perPage=1&filter=usado=false" \
  -H "Authorization: $ADMIN_TOKEN" | node -pe "JSON.parse(require('fs').readFileSync(0)).items[0].id")

curl -s -X POST "http://127.0.0.1:8099/api/vales-caja/$VALE_ID/usar" -H "Authorization: $ADMIN_TOKEN"
echo ""
curl -s "http://127.0.0.1:8099/api/collections/vales_caja/records/$VALE_ID" -H "Authorization: $ADMIN_TOKEN" | node -pe "JSON.parse(require('fs').readFileSync(0)).usado"
```

Expected: first call returns `{"usado":true}`, second call prints `true`.

- [ ] **Step 3: Test that an unauthenticated request is rejected**

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST "http://127.0.0.1:8099/api/vales-caja/$VALE_ID/liberar"
```

Expected: `403` (or `401`) — not `200`.

- [ ] **Step 4: Test that a user without `planilla_choferes` or `vale_caja` is rejected**

```bash
curl -s -X POST http://127.0.0.1:8099/api/collections/usuarios/records \
  -H "Authorization: $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"username":"sin_modulo","email":"sinmodulo@test.com","password":"Passw0rd!User","passwordConfirm":"Passw0rd!User","rol":"operador","modulos":[]}'

USER_TOKEN=$(curl -s -X POST http://127.0.0.1:8099/api/collections/usuarios/auth-with-password \
  -H "Content-Type: application/json" \
  -d '{"identity":"sin_modulo","password":"Passw0rd!User"}' | node -pe "JSON.parse(require('fs').readFileSync(0)).token")

curl -s -o /dev/null -w "%{http_code}\n" -X POST "http://127.0.0.1:8099/api/vales-caja/$VALE_ID/usar" -H "Authorization: $USER_TOKEN"
```

Expected: `403`.

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/SISTEMAS/Desarrollos"
git add pb_hooks/vales_caja.pb.js
git commit -m "Vale de Caja: endpoints /usar y /liberar"
```

---

## Task 4: Frontend — número en letras utility

**Files:**
- Create: `web/src/lib/numeroEnLetras.ts`

**Interfaces:**
- Produces: `export function importeEnLetras(importe: number): string` — returns the integer part spelled out in Spanish uppercase, plus `" CON NN/100"` if there are cents. Matches the exact wording of `Conversion.cs` (`Aplicacion Impresion Recibo/v3.../Conversion.cs`), which the current manual receipt app uses.

- [ ] **Step 1: Write the file**

```typescript
// Port directo de Conversion.cs (Aplicacion Impresion Recibo v3), la
// misma redacción en mayúsculas que ya usa el recibo manual.
function numeroATexto(valorEntrada: number): string {
  const valor = Math.trunc(valorEntrada);
  if (valor === 0) return 'CERO';
  if (valor === 1) return 'UNO';
  if (valor === 2) return 'DOS';
  if (valor === 3) return 'TRES';
  if (valor === 4) return 'CUATRO';
  if (valor === 5) return 'CINCO';
  if (valor === 6) return 'SEIS';
  if (valor === 7) return 'SIETE';
  if (valor === 8) return 'OCHO';
  if (valor === 9) return 'NUEVE';
  if (valor === 10) return 'DIEZ';
  if (valor === 11) return 'ONCE';
  if (valor === 12) return 'DOCE';
  if (valor === 13) return 'TRECE';
  if (valor === 14) return 'CATORCE';
  if (valor === 15) return 'QUINCE';
  if (valor < 20) return 'DIECI' + numeroATexto(valor - 10);
  if (valor === 20) return 'VEINTE';
  if (valor < 30) return 'VEINTI' + numeroATexto(valor - 20);
  if (valor === 30) return 'TREINTA';
  if (valor === 40) return 'CUARENTA';
  if (valor === 50) return 'CINCUENTA';
  if (valor === 60) return 'SESENTA';
  if (valor === 70) return 'SETENTA';
  if (valor === 80) return 'OCHENTA';
  if (valor === 90) return 'NOVENTA';
  if (valor < 100) return numeroATexto(Math.trunc(valor / 10) * 10) + ' Y ' + numeroATexto(valor % 10);
  if (valor === 100) return 'CIEN';
  if (valor < 200) return 'CIENTO ' + numeroATexto(valor - 100);
  if ([200, 300, 400, 600, 800].includes(valor)) return numeroATexto(Math.trunc(valor / 100)) + 'CIENTOS';
  if (valor === 500) return 'QUINIENTOS';
  if (valor === 700) return 'SETECIENTOS';
  if (valor === 900) return 'NOVECIENTOS';
  if (valor < 1000) return numeroATexto(Math.trunc(valor / 100) * 100) + ' ' + numeroATexto(valor % 100);
  if (valor === 1000) return 'MIL';
  if (valor < 2000) return 'MIL ' + numeroATexto(valor % 1000);
  if (valor < 1000000) {
    let texto = numeroATexto(Math.trunc(valor / 1000)) + ' MIL';
    if (valor % 1000 > 0) texto += ' ' + numeroATexto(valor % 1000);
    return texto;
  }
  if (valor === 1000000) return 'UN MILLON';
  if (valor < 2000000) return 'UN MILLON ' + numeroATexto(valor % 1000000);
  if (valor < 1000000000000) {
    const resto = valor - Math.trunc(valor / 1000000) * 1000000;
    let texto = numeroATexto(Math.trunc(valor / 1000000)) + ' MILLONES';
    if (resto > 0) texto += ' ' + numeroATexto(resto);
    return texto;
  }
  if (valor === 1000000000000) return 'UN BILLON';
  if (valor < 2000000000000) return 'UN BILLON ' + numeroATexto(valor - Math.trunc(valor / 1000000000000) * 1000000000000);
  const resto = valor - Math.trunc(valor / 1000000000000) * 1000000000000;
  let texto = numeroATexto(Math.trunc(valor / 1000000000000)) + ' BILLONES';
  if (resto > 0) texto += ' ' + numeroATexto(resto);
  return texto;
}

export function importeEnLetras(importe: number): string {
  const entero = Math.trunc(importe);
  const centavos = Math.round((importe - entero) * 100);
  const dec = centavos > 0 ? ` CON ${centavos}/100` : '';
  return numeroATexto(entero) + dec;
}
```

- [ ] **Step 2: Write a quick manual check (this is a pure function with no framework dependency — a throwaway node script is enough, this project doesn't have a JS test runner configured)**

```bash
cd "C:/Users/SISTEMAS/Desarrollos/web"
npx tsx -e "
import { importeEnLetras } from './src/lib/numeroEnLetras';
const casos: [number, string][] = [
  [0, 'CERO'],
  [15, 'QUINCE'],
  [21, 'VEINTIUNO'],
  [100, 'CIEN'],
  [101, 'CIENTO UNO'],
  [500, 'QUINIENTOS'],
  [1000, 'MIL'],
  [1500, 'MIL QUINIENTOS'],
  [2000, 'DOS MIL'],
  [1000000, 'UN MILLON'],
  [2500000, 'DOS MILLONES QUINIENTOS MIL'],
  [1234.56, 'MIL DOSCIENTOS TREINTA Y CUATRO CON 56/100'],
];
let ok = 0, fail = 0;
for (const [n, esperado] of casos) {
  const real = importeEnLetras(n);
  if (real === esperado) { ok++; console.log('OK  ', n, '->', real); }
  else { fail++; console.log('FALLA', n, '-> obtuvo:', real, '| esperaba:', esperado); }
}
console.log(ok + ' ok, ' + fail + ' fallas');
process.exit(fail ? 1 : 0);
"
```

Expected: `12 ok, 0 fallas`. If `npx tsx` isn't available, install it once with `npm install -D tsx` in `web/` (dev dependency, not shipped to production) before running the check.

- [ ] **Step 3: Commit**

```bash
cd "C:/Users/SISTEMAS/Desarrollos"
git add web/src/lib/numeroEnLetras.ts
git commit -m "Vale de Caja: utilidad de número en letras (port de Conversion.cs)"
```

---

## Task 5: Frontend — types, module registration, empty route

**Files:**
- Modify: `web/src/types.ts:9-13` (near `Chofer`) and `web/src/types.ts:247-256` (`MODULES`)
- Modify: `web/src/App.tsx`
- Create: `web/src/pages/tesoreria/ValeCajaPage.tsx` (stub for now, filled in Task 6-8)

**Interfaces:**
- Produces: `export interface ValeCaja extends BaseRecord { numero: number; fecha: string; chofer: string; nombre_firma: string; importe: number; moneda: 'ARS' | 'BRL'; observacion1?: string; observacion2?: string; usado: boolean; creado_por?: string; }`, module id `vale_caja` routed to `/finanzas/vale-de-caja`, gated by `RequireModule`.

- [ ] **Step 1: Add the `ValeCaja` type**

In `web/src/types.ts`, right after the `Chofer` interface (after line 13), add:

```typescript
export interface ValeCaja extends BaseRecord {
  numero: number;
  fecha: string;
  chofer: string;
  nombre_firma: string;
  importe: number;
  moneda: 'ARS' | 'BRL';
  observacion1?: string;
  observacion2?: string;
  usado: boolean;
  creado_por?: string;
}
```

- [ ] **Step 2: Register the module**

In `web/src/types.ts`, in the `MODULES` array, add a new entry right after `central_deudores` (currently line 250):

```typescript
  { id: 'vale_caja', label: 'Vale de Caja', group: 'TESORERIA', path: 'finanzas/vale-de-caja' },
```

- [ ] **Step 3: Create the page stub**

```typescript
// web/src/pages/tesoreria/ValeCajaPage.tsx
export function ValeCajaPage() {
  return (
    <main>
      <div className="card">
        <h2 style={{ margin: 0 }}>Vale de Caja</h2>
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Wire the route**

In `web/src/App.tsx`, add the import near the other page imports (after `CentralDeudoresPage`):

```typescript
import { ValeCajaPage } from './pages/tesoreria/ValeCajaPage';
```

Add the route right after the `/finanzas/central-deudores` route block:

```tsx
        <Route
          path="/finanzas/vale-de-caja"
          element={
            <RequireModule moduleId="vale_caja">
              <ValeCajaPage />
            </RequireModule>
          }
        />
```

- [ ] **Step 5: Build and confirm it type-checks**

Run: `cd "C:/Users/SISTEMAS/Desarrollos/web" && npm run build`
Expected: build succeeds, no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
cd "C:/Users/SISTEMAS/Desarrollos"
git add web/src/types.ts web/src/App.tsx web/src/pages/tesoreria/ValeCajaPage.tsx
git commit -m "Vale de Caja: tipo, módulo y ruta (pantalla vacía)"
```

---

## Task 6: Frontend — Vale de Caja creation form

**Files:**
- Modify: `web/src/pages/tesoreria/ValeCajaPage.tsx`

**Interfaces:**
- Consumes: `ValeCaja`, `Chofer` from `types.ts`; `pb` from `lib/pb`; `useToast` from `lib/ToastContext`; `importeEnLetras` from `lib/numeroEnLetras`.
- Produces: a working create form. After a successful save, the created `ValeCaja` record is held in local state as `ultimoCreado` for Task 8 (print) to consume.

- [ ] **Step 1: Replace the stub with the full component skeleton + form**

```tsx
import { useEffect, useState } from 'react';
import { pb } from '../../lib/pb';
import { useToast } from '../../lib/ToastContext';
import { isoDate } from '../../lib/format';
import type { Chofer, ValeCaja } from '../../types';

export function ValeCajaPage() {
  const toast = useToast();

  const [choferes, setChoferes] = useState<Chofer[]>([]);
  const [choferId, setChoferId] = useState('');
  const [fecha, setFecha] = useState(() => isoDate(new Date()));
  const [importe, setImporte] = useState('');
  const [moneda, setMoneda] = useState<'ARS' | 'BRL'>('ARS');
  const [observacion1, setObservacion1] = useState('');
  const [observacion2, setObservacion2] = useState('');
  const [nombreFirma, setNombreFirma] = useState('');
  const [nombreFirmaTocado, setNombreFirmaTocado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [ultimoCreado, setUltimoCreado] = useState<ValeCaja | null>(null);

  useEffect(() => {
    pb.collection('choferes').getFullList<Chofer>({ filter: 'activo=true', sort: 'nombre' })
      .then(setChoferes)
      .catch((e) => toast('No se pudieron cargar los choferes: ' + (e instanceof Error ? e.message : ''), 'err'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function elegirChofer(id: string) {
    setChoferId(id);
    if (!nombreFirmaTocado) {
      const c = choferes.find((x) => x.id === id);
      if (c) setNombreFirma(c.nombre);
    }
  }

  function limpiar() {
    setChoferId('');
    setFecha(isoDate(new Date()));
    setImporte('');
    setMoneda('ARS');
    setObservacion1('');
    setObservacion2('');
    setNombreFirma('');
    setNombreFirmaTocado(false);
    setUltimoCreado(null);
  }

  async function guardar() {
    const valor = Number(importe.replace(',', '.'));
    if (!choferId) { toast('Elegí un chofer.', 'warn'); return; }
    if (!fecha) { toast('Elegí una fecha.', 'warn'); return; }
    if (!valor || valor <= 0) { toast('El importe tiene que ser mayor a cero.', 'warn'); return; }
    if (!nombreFirma.trim()) { toast('Falta el nombre de quien firma.', 'warn'); return; }

    setGuardando(true);
    try {
      const creado = await pb.collection('vales_caja').create<ValeCaja>({
        fecha, chofer: choferId, importe: valor, moneda,
        observacion1: observacion1.trim() || undefined,
        observacion2: observacion2.trim() || undefined,
        nombre_firma: nombreFirma.trim(),
      });
      setUltimoCreado(creado);
      toast(`Vale de Caja N° ${creado.numero} guardado.`, 'ok');
    } catch (e) {
      toast('No se pudo guardar el vale: ' + (e instanceof Error ? e.message : ''), 'err');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <main>
      <div className="card">
        <h2 style={{ margin: 0 }}>Vale de Caja</h2>
        <div className="hint">Pago en efectivo a un chofer. Recibí de Carossio Vairolatti y Cía SRL.</div>

        <div className="row" style={{ marginTop: 14, flexWrap: 'wrap' }}>
          <div className="field">
            <label>Chofer</label>
            <select value={choferId} onChange={(e) => elegirChofer(e.target.value)} disabled={!!ultimoCreado}>
              <option value="">Elegir...</option>
              {choferes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Fecha</label>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} disabled={!!ultimoCreado} />
          </div>
          <div className="field">
            <label>Importe</label>
            <input inputMode="decimal" placeholder="ej: 50000" value={importe} onChange={(e) => setImporte(e.target.value)} disabled={!!ultimoCreado} style={{ width: 120 }} />
          </div>
          <div className="field">
            <label>Moneda</label>
            <select value={moneda} onChange={(e) => setMoneda(e.target.value as 'ARS' | 'BRL')} disabled={!!ultimoCreado}>
              <option value="ARS">Pesos Argentinos</option>
              <option value="BRL">Reales</option>
            </select>
          </div>
        </div>

        <div className="row" style={{ marginTop: 10, flexWrap: 'wrap' }}>
          <div className="field" style={{ flex: 1, minWidth: 260 }}>
            <label>Observación 1</label>
            <input value={observacion1} onChange={(e) => setObservacion1(e.target.value)} disabled={!!ultimoCreado} />
          </div>
          <div className="field" style={{ flex: 1, minWidth: 260 }}>
            <label>Observación 2</label>
            <input value={observacion2} onChange={(e) => setObservacion2(e.target.value)} disabled={!!ultimoCreado} />
          </div>
        </div>

        <div className="row" style={{ marginTop: 10 }}>
          <div className="field" style={{ flex: 1, minWidth: 260 }}>
            <label>Nombre y Firma</label>
            <input
              value={nombreFirma}
              onChange={(e) => { setNombreFirma(e.target.value); setNombreFirmaTocado(true); }}
              disabled={!!ultimoCreado}
            />
          </div>
        </div>

        <div className="row" style={{ marginTop: 14 }}>
          {!ultimoCreado ? (
            <button onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
          ) : (
            <>
              <span className="hint">Vale N° {ultimoCreado.numero} guardado.</span>
              <button onClick={limpiar} className="secondary">Cargar otro</button>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Build**

Run: `cd "C:/Users/SISTEMAS/Desarrollos/web" && npm run build`
Expected: build succeeds.

- [ ] **Step 3: Manual smoke test against the local PocketBase from Task 1-3**

With the local server from Task 3 still running (or restarted the same way), copy `dist/` into a `publicDir` and serve, or simpler: run `npm run dev` pointed at `VITE_PB_URL=http://127.0.0.1:8099` (check `web/src/lib/pb.ts` for how the base URL is read) and in a browser:
1. Log in as the test admin.
2. Go to `/finanzas/vale-de-caja`.
3. Pick a chofer — confirm "Nombre y Firma" autofills with that chofer's name.
4. Type over "Nombre y Firma" — confirm it stops auto-updating if you change chofer again (manual edit wins).
5. Leave importe empty and click Guardar — confirm a warning toast, no record created.
6. Fill everything and Guardar — confirm a success toast with a vale number, fields become disabled, "Cargar otro" appears.

Expected: all six behaviors match.

- [ ] **Step 4: Commit**

```bash
cd "C:/Users/SISTEMAS/Desarrollos"
git add web/src/pages/tesoreria/ValeCajaPage.tsx
git commit -m "Vale de Caja: formulario de carga"
```

---

## Task 7: Frontend — historial table

**Files:**
- Modify: `web/src/pages/tesoreria/ValeCajaPage.tsx`

**Interfaces:**
- Consumes: `ValeCaja`, `Chofer` (already imported); `useConfirm` from `lib/ConfirmContext`; `useAuth` from `lib/AuthContext`; `money`/`fechaHora`-style date formatting from `lib/format.ts` (use the existing `fechaHora` if it already covers a date-only field — check first: `fechaHora` in `lib/format.ts` calls `.toLocaleString`, appropriate for a `fecha` field too since it's still a PocketBase date string).

- [ ] **Step 1: Add state, loading, filter-by-chofer, and the table**

Add these imports at the top of `ValeCajaPage.tsx`:

```typescript
import { useAuth } from '../../lib/AuthContext';
import { useConfirm } from '../../lib/ConfirmContext';
import { money, fechaHora } from '../../lib/format';
```

Add inside the component, alongside the other `useState` calls:

```typescript
  const { isAdmin } = useAuth();
  const confirm = useConfirm();
  const [historial, setHistorial] = useState<(ValeCaja & { expand?: { chofer?: Chofer } })[]>([]);
  const [filtroChofer, setFiltroChofer] = useState('');
```

Add a `cargarHistorial` function and call it after a successful save and on filter change:

```typescript
  async function cargarHistorial() {
    try {
      const filtro = filtroChofer ? pb.filter('chofer = {:c}', { c: filtroChofer }) : '';
      const items = await pb.collection('vales_caja').getList<ValeCaja & { expand?: { chofer?: Chofer } }>(1, 50, {
        filter: filtro, sort: '-numero', expand: 'chofer',
      });
      setHistorial(items.items);
    } catch (e) {
      toast('No se pudo cargar el historial: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }

  useEffect(() => {
    cargarHistorial();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroChofer]);
```

In the `guardar()` function's success branch (after `setUltimoCreado(creado)`), add a call to refresh the list:

```typescript
      cargarHistorial();
```

Add a delete handler:

```typescript
  async function eliminar(id: string, numero: number) {
    const ok = await confirm(`¿Eliminar el Vale de Caja N° ${numero}? No se puede deshacer.`, 'Eliminar vale');
    if (!ok) return;
    try {
      await pb.collection('vales_caja').delete(id);
      toast('Vale eliminado.', 'ok');
      cargarHistorial();
    } catch (e) {
      toast('No se pudo eliminar: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }
```

Add the historial markup right before the closing `</main>` tag:

```tsx
      <div className="card" style={{ marginTop: 16 }}>
        <h2 style={{ margin: 0 }}>Historial</h2>
        <div className="row" style={{ marginTop: 10 }}>
          <div className="field">
            <label>Filtrar por chofer</label>
            <select value={filtroChofer} onChange={(e) => setFiltroChofer(e.target.value)}>
              <option value="">Todos</option>
              {choferes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
        </div>
        <div className="table-wrap" style={{ marginTop: 10 }}>
          <table>
            <thead>
              <tr>
                <th className="num">N°</th><th>Fecha</th><th>Chofer</th><th className="num">Importe</th>
                <th>Moneda</th><th>Usado</th><th>Emitido por</th><th></th>
              </tr>
            </thead>
            <tbody>
              {historial.map((v) => (
                <tr key={v.id}>
                  <td className="num">{v.numero}</td>
                  <td>{fechaHora(v.fecha)}</td>
                  <td>{v.expand?.chofer?.nombre || '—'}</td>
                  <td className="num">{money(v.importe)}</td>
                  <td>{v.moneda}</td>
                  <td>{v.usado ? 'Sí' : 'No'}</td>
                  <td>{v.creado_por || '—'}</td>
                  <td>{isAdmin && <button className="small danger" onClick={() => eliminar(v.id, v.numero)}>Eliminar</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {historial.length === 0 && <div className="empty">Todavía no se cargó ningún vale.</div>}
        </div>
      </div>
```

- [ ] **Step 2: Build**

Run: `cd "C:/Users/SISTEMAS/Desarrollos/web" && npm run build`
Expected: build succeeds.

- [ ] **Step 3: Manual smoke test**

1. Create two vales for different choferes (Task 6's form).
2. Confirm both appear in Historial, newest number first.
3. Filter by one chofer — confirm only that chofer's vale shows.
4. As admin, click Eliminar on one — confirm it disappears and a non-admin login (if you have one handy) does not see the Eliminar button at all.

Expected: all four match.

- [ ] **Step 4: Commit**

```bash
cd "C:/Users/SISTEMAS/Desarrollos"
git add web/src/pages/tesoreria/ValeCajaPage.tsx
git commit -m "Vale de Caja: historial con filtro por chofer y borrado (admin)"
```

---

## Task 8: Frontend — print view (media A4)

**Files:**
- Modify: `web/src/pages/tesoreria/ValeCajaPage.tsx`
- Modify: `web/src/index.css`

**Interfaces:**
- Consumes: `importeEnLetras` from `lib/numeroEnLetras.ts` (Task 4).
- Produces: an "Imprimir" button that appears once a vale is created or selected from history, printing a 210mm×148mm block via the browser's print dialog.

- [ ] **Step 1: Add the print CSS**

In `web/src/index.css`, inside the existing `@media print { ... }` block (the one that already has `#print-header`), add:

```css
  #vale-imprimible {
    display: none;
  }
```

Right after the closing `}` of that `@media print` block, add a second, separate print rule that hides everything else when a vale is actively being printed (guarded by a body class so it doesn't affect other pages' printing):

```css
body.imprimiendo-vale * {
  visibility: hidden;
}
body.imprimiendo-vale #vale-imprimible,
body.imprimiendo-vale #vale-imprimible * {
  visibility: visible;
}
body.imprimiendo-vale #vale-imprimible {
  display: block !important;
  position: absolute;
  top: 0;
  left: 0;
  width: 210mm;
  height: 148mm;
  padding: 14mm;
  box-sizing: border-box;
  font-family: Arial, sans-serif;
  font-size: 13px;
}
@media print {
  @page {
    size: A4;
    margin: 0;
  }
}
```

- [ ] **Step 2: Add the print markup and trigger**

In `ValeCajaPage.tsx`, add a `paraImprimir` state that holds whichever vale (just-created or picked from history) should print, and an `imprimir()` function:

```typescript
  const [paraImprimir, setParaImprimir] = useState<(ValeCaja & { expand?: { chofer?: Chofer } }) | null>(null);

  function imprimir(v: ValeCaja & { expand?: { chofer?: Chofer } }) {
    setParaImprimir(v);
    document.body.classList.add('imprimiendo-vale');
    setTimeout(() => {
      window.print();
      document.body.classList.remove('imprimiendo-vale');
    }, 50);
  }
```

Add an "Imprimir" button next to "Cargar otro" in the just-saved state (replace that block from Task 6):

```tsx
            <>
              <span className="hint">Vale N° {ultimoCreado.numero} guardado.</span>
              <button onClick={() => imprimir(ultimoCreado)}>Imprimir</button>
              <button onClick={limpiar} className="secondary">Cargar otro</button>
            </>
```

Add a "Ver/Reimprimir" action to each historial row (in the actions `<td>` from Task 7, next to Eliminar):

```tsx
                  <td>
                    <button className="small" onClick={() => imprimir(v)}>Reimprimir</button>
                    {' '}
                    {isAdmin && <button className="small danger" onClick={() => eliminar(v.id, v.numero)}>Eliminar</button>}
                  </td>
```

Add the printable block itself, right before the closing `</main>`:

```tsx
      {paraImprimir && (
        <div id="vale-imprimible">
          <div style={{ textAlign: 'right', fontWeight: 700, marginBottom: 20 }}>
            VALE DE CAJA N° {String(paraImprimir.numero).padStart(4, '0')}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div>Recibí de Carossio Vairolatti y Cía SRL</div>
            <div>{fechaHora(paraImprimir.fecha)}</div>
          </div>
          <div style={{ marginTop: 16 }}>
            la cantidad de {paraImprimir.moneda === 'BRL' ? 'reales' : 'pesos argentinos'}{' '}
            {importeEnLetras(paraImprimir.importe).toLowerCase()}
          </div>
          <div style={{ borderBottom: '1px solid #000', marginTop: 24, paddingBottom: 2 }}>{paraImprimir.observacion1}</div>
          <div style={{ borderBottom: '1px solid #000', marginTop: 20, paddingBottom: 2 }}>{paraImprimir.observacion2}</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 30 }}>
            <div>{paraImprimir.moneda === 'BRL' ? 'Son R$' : 'Son $'} {money(paraImprimir.importe)}</div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ borderBottom: '1px solid #000', width: 200 }}>&nbsp;</div>
              {paraImprimir.nombre_firma}
            </div>
          </div>
        </div>
      )}
```

Add the import at the top:

```typescript
import { importeEnLetras } from '../../lib/numeroEnLetras';
```

- [ ] **Step 3: Build**

Run: `cd "C:/Users/SISTEMAS/Desarrollos/web" && npm run build`
Expected: build succeeds.

- [ ] **Step 4: Manual test in a real browser**

1. Create a vale with importe `1234.56`, ARS.
2. Click Imprimir — the browser's print preview should open showing only the vale block (no sidebar, no rest of the page), sized to roughly the top half of an A4 sheet.
3. Confirm the text reads "...la cantidad de pesos argentinos mil doscientos treinta y cuatro con 56/100" and "Son $ 1.234,56".
4. Cancel the print dialog, click Reimprimir from a Historial row for a different vale — confirm the print preview shows that vale's own data, not the first one's.

Expected: all four match.

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/SISTEMAS/Desarrollos"
git add web/src/pages/tesoreria/ValeCajaPage.tsx web/src/index.css
git commit -m "Vale de Caja: impresión en media hoja A4"
```

---

## Task 9: Frontend — Planilla Choferes integration

**Files:**
- Modify: `web/src/pages/planilla/PlanillaChoferesPage.tsx`

**Interfaces:**
- Consumes: `ValeCaja` from `types.ts`; the `/api/vales-caja/:id/usar` and `/liberar` endpoints from Task 3.
- Produces: a "Vales de caja disponibles" panel, and `summary.totalVales` now includes tilded vales' `importe` on top of the existing `tramo.vale_importe` sum.

- [ ] **Step 1: Add state for available vales and which are checked**

On line 8, change the existing type import from:

```typescript
import type { Chofer, Cliente, PeriodoCerrado, Ruta, Tarifa, Tramo, Vehiculo } from '../../types';
```

to:

```typescript
import type { Chofer, Cliente, PeriodoCerrado, Ruta, Tarifa, Tramo, Vehiculo, ValeCaja } from '../../types';
```

Add state near the other `choferId`-driven state (after line 60, near `tramos`):

```typescript
  const [valesDisponibles, setValesDisponibles] = useState<ValeCaja[]>([]);
  const [valesTildados, setValesTildados] = useState<Set<string>>(new Set());
```

- [ ] **Step 2: Load available vales whenever the chofer changes**

Add a function alongside `loadTramos` (find it via `grep -n "async function loadTramos" web/src/pages/planilla/PlanillaChoferesPage.tsx` to place this right after it):

```typescript
  async function loadValesDisponibles() {
    if (!choferId) { setValesDisponibles([]); setValesTildados(new Set()); return; }
    try {
      const items = await pb.collection('vales_caja').getFullList<ValeCaja>({
        filter: pb.filter('chofer = {:c} && usado = false', { c: choferId }),
        sort: 'fecha',
      });
      setValesDisponibles(items);
      setValesTildados(new Set());
    } catch (e) {
      toast('No se pudieron cargar los vales de caja: ' + mensajeDeError(e), 'err');
    }
  }
```

In the existing `useEffect` that calls `loadTramos()` when `choferId` changes (around line 94-97), add the new call alongside it:

```typescript
  useEffect(() => {
    if (choferId) { loadTramos(); loadValesDisponibles(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [choferId]);
```

- [ ] **Step 3: Toggle handler that calls the backend and updates local state**

Add near `loadValesDisponibles`:

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

- [ ] **Step 4: Fold tilded vales into `summary.totalVales`**

Modify the `summary` useMemo (currently starting at line 363). Change the first line and the dependency array:

```typescript
  const summary = useMemo(() => {
    const totalValesTramos = tramos.reduce((s, t) => s + (Number(t.vale_importe) || 0), 0);
    const totalValesCaja = valesDisponibles
      .filter((v) => valesTildados.has(v.id))
      .reduce((s, v) => s + (Number(v.importe) || 0), 0);
    const totalVales = totalValesTramos + totalValesCaja;
```

(leave everything else in the function body exactly as-is — `totalVales` is still the name every later line in that function reads from, so `saldo`, `totalALiquidar`, and the returned object all keep working unchanged.)

Update the dependency array at the end of the same `useMemo`:

```typescript
  }, [tramos, tarifasCache, valesDisponibles, valesTildados]);
```

- [ ] **Step 5: Render the panel**

The "Resumen" card currently ends like this (find it by searching for `Total a liquidar = monto alargue`):

```tsx
        <div className="hint" style={{ marginTop: 8 }}>
          Total a liquidar = monto alargue + viáticos + total gastos − total vales. Positivo: la empresa le debe al chofer; negativo: el chofer tiene que rendir la diferencia.
        </div>
      </div>

      <div className="card">
        <h2>Tramos</h2>
```

Insert the new panel between the "Resumen" card's closing `</div>` and the "Tramos" card's opening `<div className="card">`, so the result reads:

```tsx
        <div className="hint" style={{ marginTop: 8 }}>
          Total a liquidar = monto alargue + viáticos + total gastos − total vales. Positivo: la empresa le debe al chofer; negativo: el chofer tiene que rendir la diferencia.
        </div>
      </div>

      {valesDisponibles.length > 0 && (
        <div className="card" style={{ background: 'var(--panel2)' }}>
          <h3 style={{ margin: '0 0 8px' }}>Vales de caja disponibles</h3>
          <div className="detail-grid">
            {valesDisponibles.map((v) => (
              <label key={v.id} className="d-item" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={valesTildados.has(v.id)} onChange={() => toggleVale(v)} />
                <div>
                  <div className="lbl">{fechaCorta(v.fecha)}</div>
                  <div className="val">{money(v.importe)}</div>
                </div>
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <h2>Tramos</h2>
```

Concretely, the block to insert is:

```tsx
        {valesDisponibles.length > 0 && (
          <div className="card" style={{ marginTop: 10, background: 'var(--panel2)' }}>
            <h3 style={{ margin: '0 0 8px' }}>Vales de caja disponibles</h3>
            <div className="detail-grid">
              {valesDisponibles.map((v) => (
                <label key={v.id} className="d-item" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={valesTildados.has(v.id)} onChange={() => toggleVale(v)} />
                  <div>
                    <div className="lbl">{fechaCorta(v.fecha)}</div>
                    <div className="val">{money(v.importe)}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}
```

(`fechaCorta` is already defined at the top of this file, line 41 — reused as-is.)

- [ ] **Step 6: Build**

Run: `cd "C:/Users/SISTEMAS/Desarrollos/web" && npm run build`
Expected: build succeeds.

- [ ] **Step 7: Manual test end-to-end against the local PocketBase**

1. In Tesorería, create a Vale de Caja for a chofer, importe 20000.
2. Go to Planilla Choferes, select that same chofer — confirm the new "Vales de caja disponibles" panel shows that vale, unchecked, and "Total vales" in the summary does **not** yet include it.
3. Tick the checkbox — confirm "Total vales" (and "Total a liquidar") update immediately by 20000.
4. Reload the whole page, re-select the same chofer — confirm the vale is now gone from "Vales de caja disponibles" (it's `usado=true` now) but the summary total from tramos-only stays correct (the vale's amount is not silently re-added from anywhere).
5. In Tesorería's Historial, confirm that vale now shows "Usado: Sí".

Expected: all five match — this is the core anti-double-counting behavior from the spec, worth being strict about.

- [ ] **Step 8: Commit**

```bash
cd "C:/Users/SISTEMAS/Desarrollos"
git add web/src/pages/planilla/PlanillaChoferesPage.tsx
git commit -m "Vale de Caja: panel de vales disponibles en Planilla Choferes"
```

---

## Deploy

After all 9 tasks are committed, push the branch, wait for the GitHub Actions deploy to finish (same pattern used throughout this project: poll `https://api.github.com/repos/sistemascyv/Desarrollos/actions/runs?branch=<branch>&per_page=1` until `status: completed`), and confirm production health before telling the user it's live.
