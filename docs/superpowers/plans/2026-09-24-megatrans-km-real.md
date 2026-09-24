# Megatrans en Km Real Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hacer que la pestaña "Km real" de Posición de Flota (Sistema CyV) muestre los kilómetros recorridos de toda la flota, combinando el proveedor de GPS ya integrado (Pressa) con uno nuevo (Megatrans), en una sola tabla.

**Architecture:** Un campo nuevo `codigo_megatrans` en `vehiculos` mapea cada vehículo a su identificador en Megatrans. Un endpoint nuevo (`pb_hooks/km_real.pb.js`) reemplaza al actual endpoint de distancia de Pressa: llama a Pressa (toda la flota en una sola llamada, como ya se hace) y a Megatrans (una llamada por vehículo configurado), y junta ambas listas en una sola respuesta. El frontend solo cambia la URL que consulta y saca una columna que ya no aplica a los dos proveedores.

**Tech Stack:** PocketBase (JSVM migrations/hooks, `$http.send` para llamadas salientes), React + TypeScript (Vite).

## Global Constraints

- Toda la lógica de un hook/`routerAdd` vive DENTRO de su propio callback — nada de funciones sueltas a nivel de archivo llamadas desde adentro (causó un `ReferenceError` real en producción en este proyecto; ver el comentario al inicio de `pb_hooks/pressa.pb.js`).
- `dao.findRecordsByFilter(...)` siempre necesita un filtro real, nunca `""` — un filtro vacío rompe esta versión de PocketBase.
- Megatrans espera las fechas en **hora local Argentina (UTC-3)**, no UTC — hay que restar 3 horas explícitamente al convertir el timestamp unix, sin asumir que el servidor corre en esa zona horaria (esta clase de bug de huso horario ya pasó varias veces en este proyecto).
- `Dato.KmRecorridos` en la respuesta de Megatrans es un **string** (ej. `"76.56"`), no un número — hay que parsearlo.
- Si Megatrans falla para un vehículo puntual, ese vehículo se salta — el resto del reporte se muestra igual.
- No se requiere ninguna credencial para llamar a Megatrans (confirmado con el usuario que no hay API key documentada) — si la llamada real falla por motivos de autenticación al probarlo, es un hallazgo para reportar, no algo a resolver adivinando.
- Todo cambio de backend se verifica contra una PocketBase local real (migraciones y hooks reales) antes de darlo por terminado — y en este caso además contra la API real de Megatrans con un `CodigoEntidad` real, porque no hay forma significativa de simular un proveedor externo.

---

## File Structure

- `pb_migrations/1789080000_add_codigo_megatrans_vehiculos.js` — nuevo campo + siembra de los ~66 códigos (nuevo archivo)
- `pb_hooks/km_real.pb.js` — endpoint combinado Pressa + Megatrans (nuevo archivo)
- `pb_hooks/pressa.pb.js` — se le saca la ruta `/api/flota/pressa/distancia/:desde/:hasta` (modificar)
- `web/src/pages/flota/satelital/KmRealTab.tsx` — nueva URL, se saca la columna de velocidad máxima (modificar)

---

## Task 1: Backend — campo `codigo_megatrans` y siembra

**Files:**
- Create: `pb_migrations/1789080000_add_codigo_megatrans_vehiculos.js`

**Interfaces:**
- Produces: `vehiculos.codigo_megatrans` (texto, opcional) — poblado para los códigos de flota que tienen equivalente en Megatrans.

- [ ] **Step 1: Escribir la migración**

```javascript
/// <reference path="../pb_data/types.d.ts" />
// Agrega el CodigoEntidad de Megatrans (segundo proveedor de GPS) a cada
// vehículo que lo tiene, para poder consultar sus km recorridos. Ver
// docs/superpowers/specs/2026-09-24-megatrans-km-real-design.md.
migrate((db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("vehiculos");

  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "veh0megat1",
    "name": "codigo_megatrans",
    "type": "text",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "min": null,
      "max": null,
      "pattern": ""
    }
  }));
  dao.saveCollection(collection);

  const datos = [
    { codigo: "T136", codigo_megatrans: "46401210" },
    { codigo: "T142", codigo_megatrans: "45520410" },
    { codigo: "T139", codigo_megatrans: "45511110" },
    { codigo: "T141", codigo_megatrans: "44695910" },
    { codigo: "T143", codigo_megatrans: "44643410" },
    { codigo: "T140", codigo_megatrans: "44631010" },
    { codigo: "T135", codigo_megatrans: "44619810" },
    { codigo: "T138", codigo_megatrans: "44607110" },
    { codigo: "T137", codigo_megatrans: "44603110" },
    { codigo: "T133", codigo_megatrans: "44476310" },
    { codigo: "T134", codigo_megatrans: "44476310" },
    { codigo: "T092", codigo_megatrans: "44328210" },
    { codigo: "T091", codigo_megatrans: "44312010" },
    { codigo: "T090", codigo_megatrans: "44299510" },
    { codigo: "T089", codigo_megatrans: "44285110" },
    { codigo: "T088", codigo_megatrans: "44278310" },
    { codigo: "T087", codigo_megatrans: "44212010" },
    { codigo: "T086", codigo_megatrans: "44127510" },
    { codigo: "T084", codigo_megatrans: "43718610" },
    { codigo: "T085", codigo_megatrans: "43704310" },
    { codigo: "T132", codigo_megatrans: "43123110" },
    { codigo: "T081", codigo_megatrans: "43121010" },
    { codigo: "T131", codigo_megatrans: "42756710" },
    { codigo: "T130", codigo_megatrans: "42661010" },
    { codigo: "T129", codigo_megatrans: "42660010" },
    { codigo: "T128", codigo_megatrans: "42624110" },
    { codigo: "T127", codigo_megatrans: "42617710" },
    { codigo: "T126", codigo_megatrans: "42616610" },
    { codigo: "T125", codigo_megatrans: "42485410" },
    { codigo: "T124", codigo_megatrans: "42485310" },
    { codigo: "T123", codigo_megatrans: "42480710" },
    { codigo: "T121", codigo_megatrans: "42405810" },
    { codigo: "T122", codigo_megatrans: "42405410" },
    { codigo: "T120", codigo_megatrans: "42339910" },
    { codigo: "T118", codigo_megatrans: "42337810" },
    { codigo: "T119", codigo_megatrans: "42337610" },
    { codigo: "T117", codigo_megatrans: "42315010" },
    { codigo: "T116", codigo_megatrans: "42314910" },
    { codigo: "T114", codigo_megatrans: "42313810" },
    { codigo: "T115", codigo_megatrans: "42313610" },
    { codigo: "T113", codigo_megatrans: "42266510" },
    { codigo: "T112", codigo_megatrans: "42265510" },
    { codigo: "T111", codigo_megatrans: "42170510" },
    { codigo: "T110", codigo_megatrans: "42168910" },
    { codigo: "T107", codigo_megatrans: "42072310" },
    { codigo: "T106", codigo_megatrans: "42069410" },
    { codigo: "T108", codigo_megatrans: "42051910" },
    { codigo: "T109", codigo_megatrans: "42051310" },
    { codigo: "T079", codigo_megatrans: "41688410" },
    { codigo: "ATEGO", codigo_megatrans: "41463410" },
    { codigo: "T083", codigo_megatrans: "41444410" },
    { codigo: "T082", codigo_megatrans: "41441410" },
    { codigo: "T075", codigo_megatrans: "41160810" },
    { codigo: "T099", codigo_megatrans: "40998110" },
    { codigo: "T073", codigo_megatrans: "40751710" },
    { codigo: "T098", codigo_megatrans: "40570610" },
    { codigo: "T097", codigo_megatrans: "40554910" },
    { codigo: "T102", codigo_megatrans: "40542510" },
    { codigo: "T101", codigo_megatrans: "40541510" },
    { codigo: "T096", codigo_megatrans: "40536410" },
    { codigo: "T095", codigo_megatrans: "40402910" },
    { codigo: "T104", codigo_megatrans: "40352710" },
    { codigo: "T094", codigo_megatrans: "40312110" },
    { codigo: "T093", codigo_megatrans: "40226710" },
    { codigo: "T103", codigo_megatrans: "40074010" },
    { codigo: "T105", codigo_megatrans: "40030510" },
  ];

  const fresh = dao.findCollectionByNameOrId("vehiculos");
  const noEncontrados = [];
  for (const d of datos) {
    try {
      const record = dao.findFirstRecordByFilter(fresh.id, "codigo = {:codigo}", { codigo: d.codigo });
      record.set("codigo_megatrans", d.codigo_megatrans);
      dao.saveRecord(record);
    } catch (e) {
      noEncontrados.push(d.codigo);
    }
  }
  if (noEncontrados.length) {
    console.log("codigo_megatrans: no se encontró vehiculos.codigo para: " + noEncontrados.join(", "));
  }
  console.log("codigo_megatrans: nota -- T133 y T134 comparten el mismo CodigoEntidad (44476310) en los datos de origen, revisar con Megatrans si es un error de ellos.");

  return null;
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("vehiculos");
  collection.schema.removeField("veh0megat1");
  return dao.saveCollection(collection);
})
```

- [ ] **Step 2: Preparar una PocketBase local de prueba (si no tenés una ya para este proyecto)**

```bash
mkdir -p /tmp/pb-megatrans && cd /tmp/pb-megatrans
curl -L -o pb.zip https://github.com/pocketbase/pocketbase/releases/download/v0.22.55/pocketbase_0.22.55_linux_amd64.zip
unzip -o pb.zip pocketbase
chmod +x pocketbase
mkdir -p mig hooks
cp "C:/Users/SISTEMAS/Desarrollos/pb_migrations/"*.js mig/
cp "C:/Users/SISTEMAS/Desarrollos/pb_hooks/"*.js hooks/
```

(En Windows, descargar el asset `windows_amd64.zip` y ajustar rutas/`.exe` — práctica ya establecida en este proyecto.)

- [ ] **Step 3: Aplicar la migración y verificar la siembra**

Run: `./pocketbase migrate up --dir=./data --migrationsDir=./mig`
Expected: última línea `Applied 1789080000_add_codigo_megatrans_vehiculos.js`, sin errores. En la salida debería verse la nota sobre T133/T134, y **no** debería listar ningún código como "no encontrado" (si aparece alguno, ese código no existe en `vehiculos` — reportarlo, no ignorarlo).

Run:
```bash
node -e "
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('./data/data.db', { readOnly: true });
const rows = db.prepare(\"SELECT codigo, codigo_megatrans FROM vehiculos WHERE codigo_megatrans != ''\").all();
console.log('total con codigo_megatrans:', rows.length);
console.log(rows.slice(0, 5));
"
```
Expected: `total con codigo_megatrans: 66`, y las primeras filas muestran códigos reales con su `codigo_megatrans` correspondiente.

- [ ] **Step 4: Commit**

```bash
cd "C:/Users/SISTEMAS/Desarrollos"
git add pb_migrations/1789080000_add_codigo_megatrans_vehiculos.js
git commit -m "Km real: agregar codigo_megatrans a vehiculos y sembrar los códigos"
```

---

## Task 2: Backend — endpoint combinado Pressa + Megatrans

**Files:**
- Create: `pb_hooks/km_real.pb.js`
- Modify: `pb_hooks/pressa.pb.js` (sacar la ruta `/api/flota/pressa/distancia/:desde/:hasta`)

**Interfaces:**
- Consumes: `vehiculos.codigo_megatrans` (Task 1).
- Produces: `GET /api/flota/km-real/:desde/:hasta` → `{ total: number, unidades: [{ alias: string, patente: string, distanciaKm: number }] }`.

- [ ] **Step 1: Sacar la ruta vieja de `pb_hooks/pressa.pb.js`**

Localizá el bloque que empieza en el comentario `// GET /api/flota/pressa/distancia/:desde/:hasta -> km real recorrido por` y termina en el `});` que cierra ese `routerAdd(...)` (incluyendo el tercer argumento `$apis.requireRecordAuth("usuarios")`) — borralo completo de `pb_hooks/pressa.pb.js`. El resto del archivo (`/monitor`, `/historico/...`) queda intacto.

- [ ] **Step 2: Escribir `pb_hooks/km_real.pb.js`**

```javascript
/// <reference path="../pb_data/types.d.ts" />
// Km real de toda la flota, combinando los dos proveedores de GPS:
// Pressa (toda la flota en una sola llamada, misma lógica que tenía
// pb_hooks/pressa.pb.js antes) y Megatrans (una llamada por vehículo,
// vía vehiculos.codigo_megatrans). Ver
// docs/superpowers/specs/2026-09-24-megatrans-km-real-design.md.
//
// Toda la lógica vive DENTRO del callback de routerAdd (nada de
// funciones/variables sueltas arriba del archivo) -- mismo motivo que
// pb_hooks/pressa.pb.js: PocketBase corre este callback en un contexto
// que en producción no siempre ve lo declarado afuera.
routerAdd("GET", "/api/flota/km-real/:desde/:hasta", (c) => {
  const info = $apis.requestInfo(c);
  const auth = info.authRecord;

  const rawModulos = auth.get("modulos");
  const modulosTexto = (Array.isArray(rawModulos) ? String.fromCharCode.apply(null, rawModulos) : JSON.stringify(rawModulos || [])).toLowerCase();
  const tieneAcceso = auth.get("rol") === "admin" || modulosTexto.indexOf("flota_posicion") !== -1;
  if (!tieneAcceso) {
    return c.json(403, { message: "No tenés acceso al módulo de Posición de Flota." });
  }

  const startDate = parseInt(c.pathParam("desde"), 10);
  const endDate = parseInt(c.pathParam("hasta"), 10);
  if (!startDate || !endDate) {
    return c.json(400, { message: "Faltan desde/hasta." });
  }

  const unidades = [];

  // --- Pressa: toda la flota en una sola llamada ---
  const base = "https://interno.pressacloud.com/pressa_external_backend/";
  const username = $os.getenv("PRESSA_USERNAME");
  const clientHash = $os.getenv("PRESSA_CLIENT_HASH");
  const passwordHash = $os.getenv("PRESSA_PASSWORD_HASH");
  if (!username || !clientHash || !passwordHash) {
    return c.json(502, { message: "Faltan las variables de entorno PRESSA_USERNAME / PRESSA_CLIENT_HASH / PRESSA_PASSWORD_HASH en el servidor." });
  }

  let loginRes;
  for (let intento = 1; intento <= 2 && !loginRes; intento++) {
    try {
      loginRes = $http.send({
        url: base + "ws_user_login.php",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        timeout: intento === 1 ? 20 : 35,
        body: JSON.stringify({
          clientHash: clientHash,
          password: passwordHash,
          timestamp: Math.floor(Date.now() / 1000),
          username: username,
        }),
      });
    } catch (e) {
      if (intento === 2) {
        return c.json(502, { message: "No se pudo conectar con Pressa (login): " + (e && e.message ? e.message : String(e)) });
      }
    }
  }
  const loginBody = loginRes.json || {};
  if (loginRes.statusCode !== 200 || loginBody.errorCode !== 0) {
    return c.json(502, { message: "Login a Pressa falló: " + (loginBody.displayMsg || ("HTTP " + loginRes.statusCode)) });
  }
  const sessionKey = loginBody.data.sessionKey;

  let distRes;
  try {
    distRes = $http.send({
      url: base + "ws_report_fleet_distance.php",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      timeout: 60,
      body: JSON.stringify({
        clientHash: clientHash,
        sessionKey: sessionKey,
        timestamp: Math.floor(Date.now() / 1000),
        startDate: startDate,
        endDate: endDate,
      }),
    });
  } catch (e) {
    return c.json(502, { message: "No se pudo conectar con Pressa (distancia): " + (e && e.message ? e.message : String(e)) });
  }
  const distBody = distRes.json || {};
  if (distRes.statusCode !== 200 || distBody.errorCode !== 0) {
    return c.json(502, { message: "Pressa devolvió un error: " + (distBody.displayMsg || ("HTTP " + distRes.statusCode)) });
  }
  ((distBody.data && distBody.data.vehicles) || []).forEach((v) => {
    unidades.push({
      alias: v.alias || v.name || "(sin alias)",
      patente: v.licensePlate || "",
      distanciaKm: v.distance || 0,
    });
  });

  // --- Megatrans: una llamada por vehículo con codigo_megatrans ---
  // Megatrans quiere yyyyMMddHHmm en hora LOCAL ARGENTINA (UTC-3), no UTC
  // -- restar 3 horas explícitamente antes de formatear, no asumir que
  // el servidor ya corre en esa zona horaria.
  function formatoMegatrans(unixSeconds) {
    const d = new Date((unixSeconds - 3 * 3600) * 1000);
    const pad = (n) => String(n).padStart(2, "0");
    return "" + d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + pad(d.getUTCHours()) + pad(d.getUTCMinutes());
  }
  const desdeMegatrans = formatoMegatrans(startDate);
  const hastaMegatrans = formatoMegatrans(endDate);

  const dao = $app.dao();
  const vehiculosMegatrans = dao.findRecordsByFilter("vehiculos", "codigo_megatrans != ''", "", 500, 0);
  let megatransFallidos = 0;
  vehiculosMegatrans.forEach((veh) => {
    const codigoEntidad = veh.getString("codigo_megatrans");
    try {
      // $http.send en este proyecto no tiene ningún uso confirmado de una
      // opción "query" para armar el query string -- se arma la URL a
      // mano para no depender de algo sin verificar.
      const url = "https://admws.megatrans.com.ar/services/CarossioVairolattiKmsRecorridosEntreFechasv2/AcumuladoUnidadv2"
        + "?CodigoEntidad=" + encodeURIComponent(codigoEntidad)
        + "&FechaHoraDesde=" + encodeURIComponent(desdeMegatrans)
        + "&FechaHoraHasta=" + encodeURIComponent(hastaMegatrans);
      const res = $http.send({
        url: url,
        method: "GET",
        timeout: 20,
      });
      const body = res.json || {};
      if (res.statusCode === 200 && body.Dato) {
        unidades.push({
          alias: veh.getString("codigo"),
          patente: body.Dato.Patente || "",
          distanciaKm: parseFloat(body.Dato.KmRecorridos) || 0,
        });
      } else {
        megatransFallidos++;
      }
    } catch (e) {
      megatransFallidos++;
    }
  });

  return c.json(200, { total: unidades.length, unidades: unidades, megatransFallidos: megatransFallidos });
}, $apis.requireRecordAuth("usuarios"));
```

- [ ] **Step 3: Copiar los hooks actualizados a la PocketBase local y reiniciar el servidor**

```bash
cp "C:/Users/SISTEMAS/Desarrollos/pb_hooks/pressa.pb.js" "C:/Users/SISTEMAS/Desarrollos/pb_hooks/km_real.pb.js" /tmp/pb-megatrans/hooks/
cd /tmp/pb-megatrans
./pocketbase serve --dir=./data --hooksDir=./hooks --http=127.0.0.1:8199 &
sleep 2
```

- [ ] **Step 4: Probar la conversión de fecha en aislamiento (sin pegarle a ningún servidor)**

```bash
node -e "
function formatoMegatrans(unixSeconds) {
  const d = new Date((unixSeconds - 3 * 3600) * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return '' + d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + pad(d.getUTCHours()) + pad(d.getUTCMinutes());
}
// 2026-09-24 00:00:00 hora Argentina == 2026-09-24 03:00:00 UTC == unix 1790564400
console.log(formatoMegatrans(1790564400));
"
```
Expected: `202609240000` (medianoche del 24/09/2026 en hora Argentina, no las 03:00 que daría si se usara UTC sin convertir).

- [ ] **Step 5: Probar el endpoint combinado contra la PocketBase local, con al menos un vehículo real de Megatrans**

Usá cualquier `CodigoEntidad` de la lista del Task 1 (ej. `40030510`, código de flota `T105`) para confirmar que la llamada real a Megatrans funciona desde este endpoint:

```bash
ADMIN_TOKEN=$(curl -s -X POST http://127.0.0.1:8199/api/admins/auth-with-password -H "Content-Type: application/json" -d '{"identity":"admin@test.com","password":"Passw0rd!Admin"}' | node -pe "JSON.parse(require('fs').readFileSync(0)).token")
# (si no existe ese admin todavía: ./pocketbase admin create admin@test.com Passw0rd!Admin --dir=./data)

TOKEN=$(curl -s -X POST http://127.0.0.1:8199/api/collections/usuarios/auth-with-password -H "Content-Type: application/json" -d '{"identity":"<un usuario con modulo flota_posicion>","password":"<...>"}' | node -pe "JSON.parse(require('fs').readFileSync(0)).token")

# rango de un día cualquiera reciente, en segundos unix
curl -s "http://127.0.0.1:8199/api/flota/km-real/1790478000/1790564400" -H "Authorization: $TOKEN"
```

Expected: respuesta 200 con `unidades` incluyendo tanto vehículos de Pressa como al menos uno con `alias: "T105"` (u otro código probado) de Megatrans, y `megatransFallidos` en 0 o en un número bajo y explicable (no todos fallando). Si la llamada real a Megatrans devuelve un error de autenticación o similar, es un hallazgo bloqueante — reportarlo tal cual, no asumir que se puede resolver adivinando una credencial.

- [ ] **Step 6: Commit**

```bash
cd "C:/Users/SISTEMAS/Desarrollos"
git add pb_hooks/km_real.pb.js pb_hooks/pressa.pb.js
git commit -m "Km real: endpoint combinado Pressa + Megatrans"
```

---

## Task 3: Frontend — actualizar KmRealTab

**Files:**
- Modify: `web/src/pages/flota/satelital/KmRealTab.tsx`

**Interfaces:**
- Consumes: `GET /api/flota/km-real/:desde/:hasta` (Task 2).

- [ ] **Step 1: Cambiar la URL y sacar la columna de velocidad máxima**

En `web/src/pages/flota/satelital/KmRealTab.tsx`, cambiar la interfaz `UnidadDistancia` (sacar `velocidadMin`/`velocidadMax`):

```typescript
interface UnidadDistancia {
  alias: string;
  patente: string;
  distanciaKm: number;
}
```

Cambiar la URL en `buscar()`:

```typescript
      const res = await pb.send<{ unidades: UnidadDistancia[] }>(`/api/flota/km-real/${desdeUnix}/${hastaUnix}`, { method: 'GET' });
```

Sacar la columna "Velocidad máx." de la tabla — el `<thead>` pasa de:

```tsx
<tr><th>Unidad</th><th>Patente</th><th className="num">Km recorridos</th><th className="num">Velocidad máx.</th></tr>
```

a:

```tsx
<tr><th>Unidad</th><th>Patente</th><th className="num">Km recorridos</th></tr>
```

y la fila del `<tbody>` pasa de:

```tsx
<tr key={u.alias + u.patente}>
  <td className="admin-name">{u.alias}</td>
  <td>{u.patente}</td>
  <td className="num">{num(u.distanciaKm)}</td>
  <td className="num">{num(u.velocidadMax)} km/h</td>
</tr>
```

a:

```tsx
<tr key={u.alias + u.patente}>
  <td className="admin-name">{u.alias}</td>
  <td>{u.patente}</td>
  <td className="num">{num(u.distanciaKm)}</td>
</tr>
```

y el `colSpan` de la fila de "Sin datos" pasa de `colSpan={4}` a `colSpan={3}`.

- [ ] **Step 2: Build**

Run: `cd "C:/Users/SISTEMAS/Desarrollos/web" && npm run build`
Expected: build exitoso, sin errores de TypeScript (en particular, que no queden referencias sueltas a `velocidadMin`/`velocidadMax` en este archivo).

- [ ] **Step 3: Probar en un navegador real contra la PocketBase local del Task 2**

1. Ir a Posición de Flota → Km real.
2. Elegir un rango de fechas y buscar.
3. Confirmar que aparecen vehículos de los dos proveedores en la misma tabla (identificables porque los de Megatrans muestran su código de flota como "Unidad", ej. "T105").
4. Confirmar que la tabla ya no tiene columna de velocidad.

- [ ] **Step 4: Commit**

```bash
cd "C:/Users/SISTEMAS/Desarrollos"
git add web/src/pages/flota/satelital/KmRealTab.tsx
git commit -m "Km real: consumir el endpoint combinado, sacar columna de velocidad"
```

---

## Deploy

Después de las 3 tareas, subir la rama y esperar el deploy de GitHub Actions (mismo patrón de todo este proyecto: sondear `https://api.github.com/repos/sistemascyv/Desarrollos/actions/runs?branch=<branch>&per_page=1` hasta `status: completed`), y confirmar que el sistema en producción queda sano antes de avisarle al usuario que ya está.
