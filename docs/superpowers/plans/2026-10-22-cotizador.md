# Cotizador Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cotizador de fletes para carga Seca (categoría "General por Tipo
de Carga"), que calcula precio + recargo de mínimo por sucursal + seguro +
IVA, guarda la cotización, y la imprime en A4 con marca de agua.

**Architecture:** Dos colecciones nuevas (`cotizaciones` + sus
`cotizacion_items`), un campo `sucursal` nuevo en `usuarios` (para numerar
por sucursal), un hook server-side que asigna el número y `creado_por` al
crear, un módulo TS puro con toda la lógica de cálculo (probado con `tsx`),
una pantalla (lista + formulario) y una vista de impresión — todo bajo el
módulo de permiso `cuadro_tarifario` que ya existe.

**Tech Stack:** PocketBase (Go hooks JS/goja), React + TypeScript, Vite.

## Global Constraints

- Solo carga Seca (`categoria = 'seco'` en `cuadro_tarifario`) — sin
  Frío/Congelado, sin tarifas por Cliente, sin Acuerdos Especiales.
- Sin cargo por "Cambio de Zona".
- Redondeo a 2 decimales en cada paso del cálculo.
- Las 10 claves de zona válidas son exactamente:
  `CC, CS, CR, CB, RR, RS, RB, SS, SB, BB` — el orden de un par no es
  predecible por una regla simple (no es ni alfabético ni por precedencia
  fija), así que el mapeo origen/destino → clave debe probar ambos
  órdenes (`origen+destino` y `destino+origen`) contra ese set, nunca
  asumir un orden.
- Una cotización guardada NO se puede editar (`updateRule: null` en ambas
  colecciones nuevas) — los montos quedan congelados.
- Spec completo: `docs/superpowers/specs/2026-10-22-cotizador-design.md`.

---

### Task 1: Campo `sucursal` en usuarios

**Files:**
- Create: `pb_migrations/1789270000_usuarios_sucursal.js`
- Modify: `web/src/types.ts` (interfaz `Usuario`)
- Modify: `web/src/lib/AuthContext.tsx:16-30` (`recordToUsuario`)
- Modify: `web/src/pages/admin/UsuariosTab.tsx`

**Interfaces:**
- Produces: `usuarios.sucursal` (select, opcional, valores
  `cordoba`/`san_francisco`/`rosario`/`buenos_aires`).
- Produces: `Usuario.sucursal?: 'cordoba' | 'san_francisco' | 'rosario' |
  'buenos_aires'` en `types.ts`, disponible vía `useAuth().usuario`.
- Consumes: ninguna (primer task del plan).

- [ ] **Step 1: Migración del campo + backfill**

Archivo completo `pb_migrations/1789270000_usuarios_sucursal.js`:

```js
/// <reference path="../pb_data/types.d.ts" />
// Sucursal del usuario -- base minima para que el Cotizador numere cada
// cotizacion con el prefijo de la sucursal de quien la crea (SAN/COR/ROS/
// BUE). NO implica ninguna restriccion de permisos ni visibilidad por
// sucursal (eso queda fuera de alcance, ver spec del Cotizador). Backfill:
// los usuarios admin existentes quedan con san_francisco (confirmado por
// el usuario).
migrate((db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId('usuarios');
  collection.schema.addField(new SchemaField({
    system: false, id: 'usr0sucursal01', name: 'sucursal', type: 'select',
    required: false, presentable: false, unique: false,
    options: { maxSelect: 1, values: ['cordoba', 'san_francisco', 'rosario', 'buenos_aires'] },
  }));
  dao.saveCollection(collection);

  dao.findRecordsByFilter('usuarios', "rol = 'admin'", '', 200, 0).forEach((u) => {
    if (!u.get('sucursal')) {
      u.set('sucursal', 'san_francisco');
      dao.saveRecord(u);
    }
  });

  return null;
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId('usuarios');
  collection.schema.removeField('usr0sucursal01');
  return dao.saveCollection(collection);
})
```

- [ ] **Step 2: Agregar `sucursal` a la interfaz `Usuario` en `types.ts`**

Ubicar (cerca de la línea 113):

```ts
export interface Usuario extends BaseRecord {
  username: string;
  email?: string;
  nombre?: string;
  rol: Rol;
  activo: boolean;
  modulos?: string[];
}
```

Reemplazar por:

```ts
export interface Usuario extends BaseRecord {
  username: string;
  email?: string;
  nombre?: string;
  rol: Rol;
  activo: boolean;
  modulos?: string[];
  sucursal?: 'cordoba' | 'san_francisco' | 'rosario' | 'buenos_aires';
}
```

- [ ] **Step 3: Propagar `sucursal` en `recordToUsuario` (`AuthContext.tsx`)**

Ubicar (líneas 16-30):

```ts
function recordToUsuario(): Usuario | null {
  const model = pb.authStore.record;
  if (!model) return null;
  return {
    id: model.id,
    created: model.created,
    updated: model.updated,
    username: model.username,
    email: model.email,
    nombre: model.nombre,
    rol: model.rol as Rol,
    activo: model.activo,
    modulos: model.modulos || [],
  };
}
```

Agregar `sucursal: model.sucursal,` después de `modulos: model.modulos ||
[],`:

```ts
function recordToUsuario(): Usuario | null {
  const model = pb.authStore.record;
  if (!model) return null;
  return {
    id: model.id,
    created: model.created,
    updated: model.updated,
    username: model.username,
    email: model.email,
    nombre: model.nombre,
    rol: model.rol as Rol,
    activo: model.activo,
    modulos: model.modulos || [],
    sucursal: model.sucursal,
  };
}
```

- [ ] **Step 4: Agregar el selector de Sucursal en `UsuariosTab.tsx`**

4a. Nuevo estado para el formulario de alta, junto a los demás `useState`
(cerca de la línea 21):

```ts
  const [sucursal, setSucursal] = useState<Usuario['sucursal'] | ''>('');
```

4b. En `create()` (líneas 44-60), agregar `sucursal` al body y resetear el
estado al terminar:

```ts
  async function create() {
    if (!username.trim() || !password) { toast('Faltan usuario y/o contraseña.', 'warn'); return; }
    if (password.length < 8) { toast('La contraseña debe tener al menos 8 caracteres.', 'warn'); return; }
    try {
      const body: Record<string, unknown> = {
        username: username.trim(), password, passwordConfirm: password,
        nombre: nombre.trim(), rol, activo: true, emailVisibility: true, modulos,
        sucursal: sucursal || null,
      };
      if (email.trim()) body.email = email.trim();
      await pb.collection('usuarios').create(body);
      setNombre(''); setUsername(''); setEmail(''); setPassword(''); setRol('operador'); setModulos([]); setSucursal('');
      onChanged();
      toast('Usuario creado.', 'ok');
    } catch (e) {
      toast('Error: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }
```

4c. Nueva función para editar la sucursal de un usuario ya creado (inline,
mismo criterio que `toggleRol`/`toggleActivo` — líneas 62-81), agregarla
después de `toggleActivo`:

```ts
  async function cambiarSucursal(id: string, nueva: string) {
    try {
      await pb.collection('usuarios').update(id, { sucursal: nueva || null });
      await load();
    } catch (e) {
      toast('Error: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }
```

4d. En el formulario de alta (fila `<div className="row">` que contiene
Nombre/Usuario/Email/Contraseña/Rol, líneas 121-133), agregar un campo más
antes del cierre del `</div>`:

```tsx
        <div className="field">
          <label>Sucursal</label>
          <select value={sucursal} onChange={(e) => setSucursal(e.target.value as Usuario['sucursal'] | '')}>
            <option value="">Sin asignar</option>
            <option value="cordoba">Córdoba</option>
            <option value="san_francisco">San Francisco</option>
            <option value="rosario">Rosario</option>
            <option value="buenos_aires">Buenos Aires</option>
          </select>
        </div>
```

4e. En la tabla de usuarios, agregar una columna "Sucursal" — en el
`<thead>` (línea 158), después de `<th>Rol</th>`:

```tsx
            <tr><th>Usuario</th><th>Nombre</th><th>Email</th><th>Rol</th><th>Sucursal</th><th>Módulos</th><th>Estado</th><th></th></tr>
```

Y en el `<tbody>` (dentro del `.map`, después de la celda de Rol en la
línea 174), agregar la celda con el selector inline:

```tsx
                  <td>
                    <select value={u.sucursal || ''} onChange={(e) => cambiarSucursal(u.id, e.target.value)}>
                      <option value="">Sin asignar</option>
                      <option value="cordoba">Córdoba</option>
                      <option value="san_francisco">San Francisco</option>
                      <option value="rosario">Rosario</option>
                      <option value="buenos_aires">Buenos Aires</option>
                    </select>
                  </td>
```

Ajustar los `colSpan={7}` de las filas vacías (líneas 161-162) a
`colSpan={8}` (una columna más).

- [ ] **Step 5: Probar la migración contra una PocketBase local real**

Descargar (si no está ya) el binario de PocketBase v0.22.55 en un
directorio de scratch, copiar `pb_migrations`/`pb_hooks`, correr
`./pocketbase migrate up`, y verificar:

```bash
sqlite3 pb_data/data.db "SELECT username, rol, sucursal FROM usuarios WHERE rol='admin';"
```

Esperado: el/los usuario(s) admin existentes con `sucursal = san_francisco`.

- [ ] **Step 6: Verificar que el build de TypeScript compila**

```bash
cd web && npm run build
```

Esperado: build exitoso, sin errores de tipos.

- [ ] **Step 7: Commit**

```bash
git add pb_migrations/1789270000_usuarios_sucursal.js web/src/types.ts web/src/lib/AuthContext.tsx web/src/pages/admin/UsuariosTab.tsx
git commit -m "Cotizador: agregar sucursal a usuarios (base para numeracion)"
```

---

### Task 2: Colecciones `cotizaciones` y `cotizacion_items`

**Files:**
- Create: `pb_migrations/1789280000_created_cotizaciones.js`
- Modify: `web/src/types.ts` (interfaces `Cotizacion`, `CotizacionItem`)

**Interfaces:**
- Produces: colección `cotizaciones` (id `cotizaciones01`) con los campos
  listados abajo.
- Produces: colección `cotizacion_items` (id `cotizacionitm1`), relación
  `cotizacion` → `cotizaciones01`, `cascadeDelete: true`.
- Produces: interfaces TS `Cotizacion` y `CotizacionItem` en `types.ts`.
- Consumes: colección `clientes` (id `ao9eo8ib8n0a6cp`, ya existe) para la
  relation `cliente`.

- [ ] **Step 1: Migración completa**

Archivo completo `pb_migrations/1789280000_created_cotizaciones.js`:

```js
/// <reference path="../pb_data/types.d.ts" />
// Cotizador: encabezado (cotizaciones) + items (cotizacion_items). Los
// montos se calculan en el frontend y se guardan ya resueltos -- no se
// recalculan solos si cambia despues el Cuadro Tarifario. No son
// editables despues de creadas (updateRule null en las 2) -- ver
// docs/superpowers/specs/2026-10-22-cotizador-design.md.
//
// Todos los campos number calculados (sub_total/recargo/seguro/
// neto_gravado/iva/total, precio/total de los items) son "required: false"
// a proposito, aunque la aplicacion siempre los manda: confirmado contra
// una PocketBase real que un campo number "required: true" RECHAZA el
// valor 0 por la API REST ("Missing required value") -- y 0 es un valor
// perfectamente legitimo para varios de estos (recargo=0 cuando el flete
// ya supera el minimo, seguro=0 sin seguro activo, etc).
migrate((db) => {
  const dao = new Dao(db);

  const cotizaciones = new Collection({
    "id": "cotizaciones01",
    "name": "cotizaciones",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false, "id": "cot0numero0001", "name": "numero", "type": "text",
        "required": true, "presentable": true, "unique": true,
        "options": { "min": null, "max": null, "pattern": "" },
      },
      {
        "system": false, "id": "cot0fecha00001", "name": "fecha", "type": "text",
        "required": true, "presentable": true, "unique": false,
        "options": { "min": null, "max": null, "pattern": "" },
      },
      {
        "system": false, "id": "cot0trfcorig01", "name": "trafico_origen", "type": "select",
        "required": true, "presentable": true, "unique": false,
        "options": { "maxSelect": 1, "values": ["cordoba", "san_francisco", "rosario", "buenos_aires"] },
      },
      {
        "system": false, "id": "cot0trfcdest1", "name": "trafico_destino", "type": "select",
        "required": true, "presentable": true, "unique": false,
        "options": { "maxSelect": 1, "values": ["cordoba", "san_francisco", "rosario", "buenos_aires"] },
      },
      {
        "system": false, "id": "cot0pagaen0001", "name": "paga_en", "type": "select",
        "required": true, "presentable": false, "unique": false,
        "options": { "maxSelect": 1, "values": ["origen", "destino"] },
      },
      {
        "system": false, "id": "cot0cliente001", "name": "cliente", "type": "relation",
        "required": false, "presentable": true, "unique": false,
        "options": { "collectionId": "ao9eo8ib8n0a6cp", "cascadeDelete": false, "minSelect": null, "maxSelect": 1, "displayFields": ["nombre"] },
      },
      {
        "system": false, "id": "cot0solicpor01", "name": "solicitado_por", "type": "text",
        "required": false, "presentable": false, "unique": false,
        "options": { "min": null, "max": null, "pattern": "" },
      },
      {
        "system": false, "id": "cot0telefono01", "name": "telefono", "type": "text",
        "required": false, "presentable": false, "unique": false,
        "options": { "min": null, "max": null, "pattern": "" },
      },
      {
        "system": false, "id": "cot0email00001", "name": "email", "type": "text",
        "required": false, "presentable": false, "unique": false,
        "options": { "min": null, "max": null, "pattern": "" },
      },
      {
        "system": false, "id": "cot0lugcarga01", "name": "lugar_carga", "type": "text",
        "required": false, "presentable": false, "unique": false,
        "options": { "min": null, "max": null, "pattern": "" },
      },
      {
        "system": false, "id": "cot0lugdescar1", "name": "lugar_descarga", "type": "text",
        "required": false, "presentable": false, "unique": false,
        "options": { "min": null, "max": null, "pattern": "" },
      },
      {
        "system": false, "id": "cot0tipomerc01", "name": "tipo_mercaderia", "type": "text",
        "required": false, "presentable": false, "unique": false,
        "options": { "min": null, "max": null, "pattern": "" },
      },
      {
        "system": false, "id": "cot0observac01", "name": "observacion", "type": "text",
        "required": false, "presentable": false, "unique": false,
        "options": { "min": null, "max": null, "pattern": "" },
      },
      {
        "system": false, "id": "cot0segactivo1", "name": "seguro_activo", "type": "bool",
        "required": false, "presentable": false, "unique": false, "options": {},
      },
      {
        "system": false, "id": "cot0segporc001", "name": "seguro_porcentaje", "type": "number",
        "required": false, "presentable": false, "unique": false,
        "options": { "min": 0, "max": null, "noDecimal": false },
      },
      {
        "system": false, "id": "cot0contraree1", "name": "contra_reembolso", "type": "number",
        "required": false, "presentable": false, "unique": false,
        "options": { "min": 0, "max": null, "noDecimal": false },
      },
      {
        "system": false, "id": "cot0taxiflet01", "name": "taxi_flet", "type": "number",
        "required": false, "presentable": false, "unique": false,
        "options": { "min": 0, "max": null, "noDecimal": false },
      },
      {
        "system": false, "id": "cot0subtotal01", "name": "sub_total", "type": "number",
        "required": false, "presentable": false, "unique": false,
        "options": { "min": 0, "max": null, "noDecimal": false },
      },
      {
        "system": false, "id": "cot0recargo001", "name": "recargo", "type": "number",
        "required": false, "presentable": false, "unique": false,
        "options": { "min": 0, "max": null, "noDecimal": false },
      },
      {
        "system": false, "id": "cot0seguro0001", "name": "seguro", "type": "number",
        "required": false, "presentable": false, "unique": false,
        "options": { "min": 0, "max": null, "noDecimal": false },
      },
      {
        "system": false, "id": "cot0netograva1", "name": "neto_gravado", "type": "number",
        "required": false, "presentable": false, "unique": false,
        "options": { "min": 0, "max": null, "noDecimal": false },
      },
      {
        "system": false, "id": "cot0iva0000001", "name": "iva", "type": "number",
        "required": false, "presentable": false, "unique": false,
        "options": { "min": 0, "max": null, "noDecimal": false },
      },
      {
        "system": false, "id": "cot0total00001", "name": "total", "type": "number",
        "required": false, "presentable": true, "unique": false,
        "options": { "min": 0, "max": null, "noDecimal": false },
      },
      {
        "system": false, "id": "cot0creadopor1", "name": "creado_por", "type": "text",
        "required": false, "presentable": true, "unique": false,
        "options": { "min": null, "max": null, "pattern": "" },
      },
    ],
    "indexes": [],
    "listRule": "@request.auth.id != \"\" && (@request.auth.rol = \"admin\" || @request.auth.modulos ~ \"cuadro_tarifario\")",
    "viewRule": "@request.auth.id != \"\" && (@request.auth.rol = \"admin\" || @request.auth.modulos ~ \"cuadro_tarifario\")",
    "createRule": "@request.auth.id != \"\" && (@request.auth.rol = \"admin\" || @request.auth.modulos ~ \"cuadro_tarifario\")",
    "updateRule": null,
    "deleteRule": "@request.auth.rol = \"admin\"",
    "options": {},
  });
  dao.saveCollection(cotizaciones);

  const items = new Collection({
    "id": "cotizacionitm1",
    "name": "cotizacion_items",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false, "id": "cit0cotizacio1", "name": "cotizacion", "type": "relation",
        "required": true, "presentable": true, "unique": false,
        "options": { "collectionId": "cotizaciones01", "cascadeDelete": true, "minSelect": null, "maxSelect": 1, "displayFields": ["numero"] },
      },
      {
        "system": false, "id": "cit0kilos00001", "name": "kilos", "type": "number",
        "required": false, "presentable": false, "unique": false,
        "options": { "min": 0, "max": null, "noDecimal": false },
      },
      {
        "system": false, "id": "cit0m300000001", "name": "m3", "type": "number",
        "required": false, "presentable": false, "unique": false,
        "options": { "min": 0, "max": null, "noDecimal": false },
      },
      {
        "system": false, "id": "cit0bultos0001", "name": "bultos", "type": "number",
        "required": false, "presentable": false, "unique": false,
        "options": { "min": 0, "max": null, "noDecimal": false },
      },
      {
        "system": false, "id": "cit0valordecl1", "name": "valor_declarado", "type": "number",
        "required": false, "presentable": false, "unique": false,
        "options": { "min": 0, "max": null, "noDecimal": false },
      },
      {
        "system": false, "id": "cit0precio0001", "name": "precio", "type": "number",
        "required": false, "presentable": false, "unique": false,
        "options": { "min": 0, "max": null, "noDecimal": false },
      },
      {
        "system": false, "id": "cit0total00001", "name": "total", "type": "number",
        "required": false, "presentable": false, "unique": false,
        "options": { "min": 0, "max": null, "noDecimal": false },
      },
    ],
    "indexes": [],
    "listRule": "@request.auth.id != \"\" && (@request.auth.rol = \"admin\" || @request.auth.modulos ~ \"cuadro_tarifario\")",
    "viewRule": "@request.auth.id != \"\" && (@request.auth.rol = \"admin\" || @request.auth.modulos ~ \"cuadro_tarifario\")",
    "createRule": "@request.auth.id != \"\" && (@request.auth.rol = \"admin\" || @request.auth.modulos ~ \"cuadro_tarifario\")",
    "updateRule": null,
    "deleteRule": "@request.auth.rol = \"admin\"",
    "options": {},
  });
  return dao.saveCollection(items);
}, (db) => {
  const dao = new Dao(db);
  try { dao.deleteCollection(dao.findCollectionByNameOrId('cotizacionitm1')); } catch (e) { /* no existía */ }
  try { dao.deleteCollection(dao.findCollectionByNameOrId('cotizaciones01')); } catch (e) { /* no existía */ }
  return null;
})
```

- [ ] **Step 2: Interfaces TS en `types.ts`**

Agregar, junto a las demás interfaces de colecciones:

```ts
export type Sucursal = 'cordoba' | 'san_francisco' | 'rosario' | 'buenos_aires';

export interface Cotizacion extends BaseRecord {
  numero: string;
  fecha: string;
  trafico_origen: Sucursal;
  trafico_destino: Sucursal;
  paga_en: 'origen' | 'destino';
  cliente?: string;
  solicitado_por?: string;
  telefono?: string;
  email?: string;
  lugar_carga?: string;
  lugar_descarga?: string;
  tipo_mercaderia?: string;
  observacion?: string;
  seguro_activo: boolean;
  seguro_porcentaje: number;
  contra_reembolso: number;
  taxi_flet: number;
  sub_total: number;
  recargo: number;
  seguro: number;
  neto_gravado: number;
  iva: number;
  total: number;
  creado_por?: string;
}

export interface CotizacionItem extends BaseRecord {
  cotizacion: string;
  kilos: number;
  m3: number;
  bultos: number;
  valor_declarado: number;
  precio: number;
  total: number;
}
```

(Nota: `Usuario['sucursal']` del Task 1 usa el mismo set de valores que
`Sucursal` acá — quedan como dos declaraciones separadas porque
`Usuario.sucursal` es opcional y específico de esa interfaz; no hace falta
unificarlas.)

- [ ] **Step 3: Probar la migración contra una PocketBase local real**

```bash
sqlite3 pb_data/data.db "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('cotizaciones','cotizacion_items');"
```

Esperado: las 2 tablas existen.

- [ ] **Step 4: Verificar que el build de TypeScript compila**

```bash
cd web && npm run build
```

- [ ] **Step 5: Commit**

```bash
git add pb_migrations/1789280000_created_cotizaciones.js web/src/types.ts
git commit -m "Cotizador: colecciones cotizaciones + cotizacion_items"
```

---

### Task 3: Numeración server-side (`pb_hooks/cotizaciones.pb.js`)

**Files:**
- Create: `pb_hooks/cotizaciones.pb.js`

**Interfaces:**
- Consumes: colección `cotizaciones` (Task 2) — campo `numero`.
  `usuarios.sucursal` (Task 1).
- Produces: en cada `POST` a `/api/collections/cotizaciones/records`
  (create nativo de PocketBase, sin endpoint custom), el servidor
  sobrescribe `numero` y `creado_por` antes de guardar.

- [ ] **Step 1: Escribir el hook completo**

Archivo completo `pb_hooks/cotizaciones.pb.js`:

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
    throw new Error("No tenés permiso para esto.");
  }
  const sucursal = auth.get("sucursal");
  const PREFIJOS = { cordoba: "COR", san_francisco: "SAN", rosario: "ROS", buenos_aires: "BUE" };
  const prefijo = PREFIJOS[sucursal];
  if (!prefijo) {
    throw new Error("Tu usuario no tiene sucursal asignada -- pedile a un administrador que te la cargue en Administración → Usuarios.");
  }

  // Filtro real, no vacío -- un filtro "" rompe findRecordsByFilter en
  // esta versión de PocketBase (ya confirmado varias veces en este
  // proyecto). "~" alcanza porque los 4 prefijos (COR/SAN/ROS/BUE) son
  // todos distintos entre sí, ninguno substring de otro.
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

- [ ] **Step 2: Probar el hook contra una PocketBase local real**

Con la PocketBase local de los tasks anteriores (ya con `usuarios.sucursal`
y las colecciones de `cotizaciones` migradas), levantar el servidor:

```bash
./pocketbase serve --http=127.0.0.1:8098
```

Crear un admin de PocketBase (si no hay uno ya en este directorio de
prueba):

```bash
./pocketbase admin create test@test.com test12345678 --dir pb_data
```

Autenticarse como ese admin para poder crear usuarios de prueba vía la
API:

```bash
ADMINTOK=$(curl -s -X POST http://127.0.0.1:8098/api/admins/auth-with-password \
  -H "Content-Type: application/json" \
  -d '{"identity":"test@test.com","password":"test12345678"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
```

Crear un usuario de prueba con `sucursal: "san_francisco"`:

```bash
curl -s -X POST http://127.0.0.1:8098/api/collections/usuarios/records \
  -H "Authorization: $ADMINTOK" -H "Content-Type: application/json" \
  -d '{"username":"usersan","password":"test12345678","passwordConfirm":"test12345678","nombre":"User San","rol":"operador","activo":true,"sucursal":"san_francisco"}'
```

Autenticarse como ese usuario (no como el admin) y usar SU token (no el de
admin) para crear la cotización — el hook lee `sucursal` del
`authRecord`, que solo existe cuando quien llama es un registro de
`usuarios`, no un admin de PocketBase:

```bash
USERTOK=$(curl -s -X POST http://127.0.0.1:8098/api/collections/usuarios/auth-with-password \
  -H "Content-Type: application/json" \
  -d '{"identity":"usersan","password":"test12345678"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

curl -s -X POST http://127.0.0.1:8098/api/collections/cotizaciones/records \
  -H "Authorization: $USERTOK" -H "Content-Type: application/json" \
  -d '{"fecha":"2026-10-22","trafico_origen":"san_francisco","trafico_destino":"san_francisco","paga_en":"origen","sub_total":0,"recargo":0,"seguro":0,"neto_gravado":0,"iva":0,"total":0}'
```

Esperado: la respuesta trae `"numero": "SAN-00000001"` y `"creado_por":
"User San"`. Repetir la última llamada (misma cotización mínima) y
confirmar que da `"SAN-00000002"`.

Crear un segundo usuario de prueba con `sucursal: "cordoba"` (mismo
`curl` de creación de usuario de arriba, cambiando `username` y
`sucursal`), autenticarse como ese usuario, y confirmar que crear una
cotización da `"COR-00000001"` (numeración separada por prefijo, no
sigue la de San Francisco).

Crear un tercer usuario de prueba SIN `sucursal` (mismo `curl`, sin el
campo `sucursal`), autenticarse como ese usuario, y confirmar que la
creación de una cotización falla (no da 200, no se crea el registro) con
un mensaje que menciona la falta de sucursal.

- [ ] **Step 3: Commit**

```bash
git add pb_hooks/cotizaciones.pb.js
git commit -m "Cotizador: numeracion server-side por sucursal"
```

---

### Task 4: Módulo de cálculo puro (`cotizadorMotor.ts`)

**Files:**
- Create: `web/src/pages/tarifas/cotizadorMotor.ts`
- Test: script `tsx` temporal (no se commitea — mismo criterio que el
  resto de este proyecto para funciones puras).

**Interfaces:**
- Consumes: `CuadroTarifarioFila`, `CuadroTarifarioMinimos` (ya existen en
  `types.ts`).
- Produces: `claveZona`, `calcularItem`, `calcularTotales`,
  `minimoDeSucursal`, `fechaVencimiento`, `redondear2` — firmas exactas
  abajo, usadas por el Task 5 (pantalla) y Task 6 (impresión). La
  numeración (`PREFIJO-00000001`) la resuelve enteramente el servidor
  (Task 3) — el frontend nunca necesita calcular el prefijo, solo lee
  `numero` de la respuesta del `create()`.

- [ ] **Step 1: Escribir el módulo completo**

Archivo completo `web/src/pages/tarifas/cotizadorMotor.ts`:

```ts
import type { CuadroTarifarioFila, CuadroTarifarioMinimos, Sucursal } from '../../types';
import { isoDate } from '../../lib/format';

// Mismo orden/criterio que CuadroTarifarioPage.tsx: C=Cordoba, S=San
// Francisco, R=Rosario, B=Buenos Aires.
const LETRA_SUCURSAL: Record<Sucursal, string> = {
  cordoba: 'C', rosario: 'R', san_francisco: 'S', buenos_aires: 'B',
};

// Las 10 claves no siguen una regla de orden simple (no es alfabetico ni
// por precedencia fija -- ver Global Constraints del plan), asi que se
// prue({ba ambos ordenes contra este set en vez de intentar derivarlo.
const CLAVES_ZONA_VALIDAS = ['CC', 'CS', 'CR', 'CB', 'RR', 'RS', 'RB', 'SS', 'SB', 'BB'];

export function claveZona(origen: Sucursal, destino: Sucursal): string | null {
  const a = LETRA_SUCURSAL[origen];
  const b = LETRA_SUCURSAL[destino];
  if (CLAVES_ZONA_VALIDAS.includes(a + b)) return a + b;
  if (CLAVES_ZONA_VALIDAS.includes(b + a)) return b + a;
  return null;
}

export function redondear2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface ItemCalculado {
  precio: number;
  total: number;
  porUnidad: boolean;
}

// null = no se pudo calcular: ni kilos ni m3 cargados, ninguno cae en una
// banda de la tabla, o la banda que ganó es "por Kg" (>=1101 Kg) sin
// kilos cargados (no se inventa un peso a partir del volumen).
export function calcularItem(filasSeco: CuadroTarifarioFila[], kilos: number, m3: number, clave: string): ItemCalculado | null {
  const filaKg = kilos > 0 ? filasSeco.find((f) => kilos >= f.rango_kg_desde && kilos <= f.rango_kg_hasta) : undefined;
  const filaM3 = m3 > 0 ? filasSeco.find((f) => f.rango_m3_desde != null && f.rango_m3_hasta != null && m3 >= f.rango_m3_desde && m3 <= f.rango_m3_hasta) : undefined;

  const candidatos: { fila: CuadroTarifarioFila; precio: number }[] = [];
  if (filaKg) candidatos.push({ fila: filaKg, precio: filaKg.valores?.[clave] ?? 0 });
  if (filaM3) candidatos.push({ fila: filaM3, precio: filaM3.valores?.[clave] ?? 0 });
  if (candidatos.length === 0) return null;

  const elegido = candidatos.reduce((a, b) => (b.precio > a.precio ? b : a));
  const porUnidad = !!elegido.fila.por_unidad;
  if (porUnidad && kilos <= 0) return null;

  const total = porUnidad ? redondear2(elegido.precio * kilos) : elegido.precio;
  return { precio: elegido.precio, total, porUnidad };
}

export function minimoDeSucursal(minimos: CuadroTarifarioMinimos, sucursal: Sucursal): number {
  return minimos[sucursal];
}

export interface TotalesCotizacion {
  subTotal: number;
  recargo: number;
  seguro: number;
  netoGravado: number;
  iva: number;
  total: number;
}

export function calcularTotales(params: {
  totalesItems: number[];
  valorDeclaradoTotal: number;
  minimoAplicable: number;
  seguroActivo: boolean;
  seguroPorcentaje: number;
  contraReembolso: number;
  taxiFlet: number;
}): TotalesCotizacion {
  const subTotal = redondear2(params.totalesItems.reduce((a, b) => a + b, 0));
  const recargo = redondear2(Math.max(0, params.minimoAplicable - subTotal));
  const seguro = redondear2(params.seguroActivo ? params.valorDeclaradoTotal * (params.seguroPorcentaje / 100) : 0);
  const netoGravado = redondear2(subTotal + recargo + seguro + params.contraReembolso + params.taxiFlet);
  const iva = redondear2(netoGravado * 0.21);
  const total = redondear2(netoGravado + iva);
  return { subTotal, recargo, seguro, netoGravado, iva, total };
}

export function fechaVencimiento(fecha: string): string {
  const d = new Date(fecha + 'T00:00:00');
  d.setDate(d.getDate() + 10);
  return isoDate(d);
}
```

- [ ] **Step 2: Probar con `tsx` contra los 2 casos del spec**

Crear un script temporal (no se commitea, se borra al terminar) en el
scratchpad de la sesión, por ejemplo `test-cotizador-motor.ts`:

```ts
import { claveZona, calcularItem, calcularTotales, minimoDeSucursal } from './web/src/pages/tarifas/cotizadorMotor';
import type { CuadroTarifarioFila, CuadroTarifarioMinimos } from './web/src/types';

const filaBanda0 = {
  id: '1', created: '', updated: '', categoria: 'seco', rango_kg_desde: 0, rango_kg_hasta: 30,
  rango_m3_desde: 0, rango_m3_hasta: 0.1, por_unidad: false,
  valores: { CC: 13264.34, CS: 13264.34, CR: 16580.42, CB: 16580.42, RR: 16580.42, RS: 16580.42, RB: 16580.42, SS: 13264.34, SB: 16580.42, BB: 16580.42 },
} as CuadroTarifarioFila;

const filaBanda250 = {
  id: '2', created: '', updated: '', categoria: 'seco', rango_kg_desde: 251, rango_kg_hasta: 300,
  rango_m3_desde: 0.834, rango_m3_hasta: 1.0, por_unidad: false,
  valores: { CC: 65790.87, CS: 65790.87, CR: 82238.59, CB: 82238.59, RR: 82238.59, RS: 82238.59, RB: 82238.59, SS: 65790.87, SB: 82238.59, BB: 82238.59 },
} as CuadroTarifarioFila;

const filas = [filaBanda0, filaBanda250];
const minimos = { id: 'm', created: '', updated: '', cordoba: 33543.05, san_francisco: 25157.30, rosario: 33543.05, buenos_aires: 33543.05 } as CuadroTarifarioMinimos;

// Caso 1: Kilos=1, San Francisco-San Francisco
console.log('clave SS esperada:', claveZona('san_francisco', 'san_francisco')); // 'SS'
const item1 = calcularItem(filas, 1, 0, 'SS')!;
console.log('item1.total esperado 13264.34:', item1.total);
const totales1 = calcularTotales({
  totalesItems: [item1.total], valorDeclaradoTotal: 0,
  minimoAplicable: minimoDeSucursal(minimos, 'san_francisco'),
  seguroActivo: false, seguroPorcentaje: 0.7, contraReembolso: 0, taxiFlet: 0,
});
console.log('recargo esperado 11892.96:', totales1.recargo);
console.log('neto_gravado esperado 25157.30:', totales1.netoGravado);
console.log('iva esperado 5283.03:', totales1.iva);
console.log('total esperado 30440.33:', totales1.total);

// Caso 2: Mts3=1, San Francisco-San Francisco, Valor Declarado=2000000
const item2 = calcularItem(filas, 0, 1, 'SS')!;
console.log('item2.total esperado 65790.87:', item2.total);
const totales2 = calcularTotales({
  totalesItems: [item2.total], valorDeclaradoTotal: 2000000,
  minimoAplicable: minimoDeSucursal(minimos, 'san_francisco'),
  seguroActivo: true, seguroPorcentaje: 0.7, contraReembolso: 0, taxiFlet: 0,
});
console.log('seguro esperado 14000:', totales2.seguro);
console.log('neto_gravado esperado 79790.87:', totales2.netoGravado);
console.log('iva esperado 16756.08:', totales2.iva);
console.log('total esperado 96546.95:', totales2.total);

// Caso borde: banda "por Kg" sin kilos
const filaPorUnidad = {
  id: '3', created: '', updated: '', categoria: 'seco', rango_kg_desde: 1101, rango_kg_hasta: 1400,
  rango_m3_desde: 3.667, rango_m3_hasta: 4.667, por_unidad: true,
  valores: { CC: 112.18, CS: 112.18, CR: 140.23, CB: 140.23, RR: 140.23, RS: 140.23, RB: 140.23, SS: 112.18, SB: 140.23, BB: 140.23 },
} as CuadroTarifarioFila;
const itemBorde = calcularItem([filaPorUnidad], 0, 4, 'SS');
console.log('itemBorde esperado null (por_unidad sin kilos):', itemBorde);
```

Correr: `npx tsx test-cotizador-motor.ts` (desde la raíz del repo). Esperado:
los 9 valores impresos coinciden exactamente con lo que dice cada
comentario "esperado", y el caso borde imprime `null`. Borrar el script
temporal al terminar.

- [ ] **Step 3: Verificar que el build de TypeScript compila**

```bash
cd web && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/tarifas/cotizadorMotor.ts
git commit -m "Cotizador: modulo de calculo (precio, recargo de minimo, seguro, IVA)"
```

---

### Task 5: Pantalla `CotizadorPage.tsx` (lista + formulario)

**Files:**
- Create: `web/src/pages/tarifas/CotizadorPage.tsx`
- Modify: `web/src/App.tsx` (import + ruta nueva)
- Modify: `web/src/pages/tarifas/CuadroTarifarioPage.tsx` (link cruzado)

**Interfaces:**
- Consumes: `cotizadorMotor.ts` (Task 4) — `claveZona`, `calcularItem`,
  `calcularTotales`, `minimoDeSucursal`. `Cotizacion`/`CotizacionItem`
  (Task 2). `CuadroTarifarioFila`/`CuadroTarifarioMinimos` (ya existen).
  `money()`/`isoDate()` de `lib/format.ts`. `useAuth()`, `useToast()`,
  `useConfirm()`, `pb`.
- Produces: ruta `/comercial/cotizador`, gateada con
  `<RequireModule moduleId="cuadro_tarifario">`.

- [ ] **Step 1: Escribir la página completa**

Archivo completo `web/src/pages/tarifas/CotizadorPage.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { pb } from '../../lib/pb';
import { useAuth } from '../../lib/AuthContext';
import { useToast } from '../../lib/ToastContext';
import { money, isoDate } from '../../lib/format';
import type { Cliente, Cotizacion, CotizacionItem, CuadroTarifarioFila, CuadroTarifarioMinimos, Sucursal } from '../../types';
import { claveZona, calcularItem, calcularTotales, minimoDeSucursal } from './cotizadorMotor';

const SUCURSALES: { id: Sucursal; label: string }[] = [
  { id: 'cordoba', label: 'Córdoba' },
  { id: 'san_francisco', label: 'San Francisco' },
  { id: 'rosario', label: 'Rosario' },
  { id: 'buenos_aires', label: 'Buenos Aires' },
];

interface ItemForm {
  kilos: string;
  m3: string;
  bultos: string;
  valorDeclarado: string;
}

function itemVacio(): ItemForm {
  return { kilos: '', m3: '', bultos: '', valorDeclarado: '' };
}

export function CotizadorPage() {
  const { usuario } = useAuth();
  const toast = useToast();

  const [vista, setVista] = useState<'lista' | 'form'>('lista');
  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [filasSeco, setFilasSeco] = useState<CuadroTarifarioFila[]>([]);
  const [minimos, setMinimos] = useState<CuadroTarifarioMinimos | null>(null);

  const [fecha, setFecha] = useState(() => isoDate(new Date()));
  const [traficoOrigen, setTraficoOrigen] = useState<Sucursal>('san_francisco');
  const [traficoDestino, setTraficoDestino] = useState<Sucursal>('san_francisco');
  const [pagaEn, setPagaEn] = useState<'origen' | 'destino'>('origen');
  const [cliente, setCliente] = useState('');
  const [solicitadoPor, setSolicitadoPor] = useState('');
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [lugarCarga, setLugarCarga] = useState('');
  const [lugarDescarga, setLugarDescarga] = useState('');
  const [tipoMercaderia, setTipoMercaderia] = useState('');
  const [observacion, setObservacion] = useState('');
  const [items, setItems] = useState<ItemForm[]>([itemVacio()]);
  const [seguroActivo, setSeguroActivo] = useState(true);
  const [seguroPorcentaje, setSeguroPorcentaje] = useState('0.7');
  const [contraReembolso, setContraReembolso] = useState('0');
  const [taxiFlet, setTaxiFlet] = useState('0');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => { cargarListaYDatos(); }, []);

  async function cargarListaYDatos() {
    try {
      const [cots, clis, cuadro, mins] = await Promise.all([
        pb.collection('cotizaciones').getFullList<Cotizacion>({ sort: '-created' }),
        pb.collection('clientes').getFullList<Cliente>({ filter: 'activo = true', sort: 'nombre' }),
        pb.collection('cuadro_tarifario').getFullList<CuadroTarifarioFila>({ filter: "categoria = 'seco'", sort: 'rango_kg_desde' }),
        pb.collection('cuadro_tarifario_minimos').getFullList<CuadroTarifarioMinimos>(),
      ]);
      setCotizaciones(cots);
      setClientes(clis);
      setFilasSeco(cuadro);
      setMinimos(mins[0] || null);
    } catch (e) {
      toast('No se pudo cargar: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }

  function abrirNueva() {
    setFecha(isoDate(new Date()));
    setTraficoOrigen('san_francisco'); setTraficoDestino('san_francisco'); setPagaEn('origen');
    setCliente(''); setSolicitadoPor(''); setTelefono(''); setEmail('');
    setLugarCarga(''); setLugarDescarga(''); setTipoMercaderia(''); setObservacion('');
    setItems([itemVacio()]);
    setSeguroActivo(true); setSeguroPorcentaje('0.7'); setContraReembolso('0'); setTaxiFlet('0');
    setVista('form');
  }

  function actualizarItem(idx: number, campo: keyof ItemForm, valor: string) {
    setItems((cur) => cur.map((it, i) => (i === idx ? { ...it, [campo]: valor } : it)));
  }

  function agregarItem() {
    setItems((cur) => [...cur, itemVacio()]);
  }

  function quitarItem(idx: number) {
    setItems((cur) => (cur.length > 1 ? cur.filter((_, i) => i !== idx) : cur));
  }

  const clave = claveZona(traficoOrigen, traficoDestino);
  const itemsCalculados = items.map((it) => {
    const kilos = Number(it.kilos.replace(',', '.')) || 0;
    const m3 = Number(it.m3.replace(',', '.')) || 0;
    if (!clave || (kilos <= 0 && m3 <= 0)) return null;
    return calcularItem(filasSeco, kilos, m3, clave);
  });
  const hayItemInvalido = items.some((it, i) => {
    const kilos = Number(it.kilos.replace(',', '.')) || 0;
    const m3 = Number(it.m3.replace(',', '.')) || 0;
    if (kilos <= 0 && m3 <= 0) return false; // fila vacía, se ignora
    return itemsCalculados[i] === null;
  });
  const valorDeclaradoTotal = items.reduce((a, it) => a + (Number(it.valorDeclarado.replace(',', '.')) || 0), 0);
  const sucursalQuePaga = pagaEn === 'origen' ? traficoOrigen : traficoDestino;
  const totales = minimos
    ? calcularTotales({
        totalesItems: itemsCalculados.filter((x): x is NonNullable<typeof x> => x !== null).map((x) => x.total),
        valorDeclaradoTotal,
        minimoAplicable: minimoDeSucursal(minimos, sucursalQuePaga),
        seguroActivo,
        seguroPorcentaje: Number(seguroPorcentaje.replace(',', '.')) || 0,
        contraReembolso: Number(contraReembolso.replace(',', '.')) || 0,
        taxiFlet: Number(taxiFlet.replace(',', '.')) || 0,
      })
    : null;

  async function guardar() {
    if (!usuario?.sucursal) {
      toast('Tu usuario no tiene sucursal asignada -- pedile a un administrador que te la cargue en Administración → Usuarios.', 'err');
      return;
    }
    if (!clave) { toast('Ese tráfico no tiene una combinación de zona válida.', 'warn'); return; }
    if (hayItemInvalido) { toast('Hay un ítem en una banda "Por Kg" sin Kilos cargados -- completá el peso real.', 'warn'); return; }
    const itemsValidos = items
      .map((it, i) => ({ it, calc: itemsCalculados[i] }))
      .filter((x): x is { it: ItemForm; calc: NonNullable<typeof x.calc> } => x.calc !== null);
    if (itemsValidos.length === 0) { toast('Cargá al menos un ítem con Kilos o Mts³.', 'warn'); return; }
    if (!totales) return;

    setGuardando(true);
    try {
      const cot = await pb.collection('cotizaciones').create<Cotizacion>({
        fecha, trafico_origen: traficoOrigen, trafico_destino: traficoDestino, paga_en: pagaEn,
        cliente: cliente || null, solicitado_por: solicitadoPor.trim(), telefono: telefono.trim(), email: email.trim(),
        lugar_carga: lugarCarga.trim(), lugar_descarga: lugarDescarga.trim(),
        tipo_mercaderia: tipoMercaderia.trim(), observacion: observacion.trim(),
        seguro_activo: seguroActivo, seguro_porcentaje: Number(seguroPorcentaje.replace(',', '.')) || 0,
        contra_reembolso: Number(contraReembolso.replace(',', '.')) || 0, taxi_flet: Number(taxiFlet.replace(',', '.')) || 0,
        sub_total: totales.subTotal, recargo: totales.recargo, seguro: totales.seguro,
        neto_gravado: totales.netoGravado, iva: totales.iva, total: totales.total,
      });
      for (const { it, calc } of itemsValidos) {
        await pb.collection('cotizacion_items').create<CotizacionItem>({
          cotizacion: cot.id,
          kilos: Number(it.kilos.replace(',', '.')) || 0,
          m3: Number(it.m3.replace(',', '.')) || 0,
          bultos: Number(it.bultos.replace(',', '.')) || 0,
          valor_declarado: Number(it.valorDeclarado.replace(',', '.')) || 0,
          precio: calc.precio, total: calc.total,
        });
      }
      toast(`Cotización ${cot.numero} guardada.`, 'ok');
      setVista('lista');
      cargarListaYDatos();
    } catch (e) {
      toast('Error al guardar: ' + (e instanceof Error ? e.message : ''), 'err');
    } finally {
      setGuardando(false);
    }
  }

  if (vista === 'lista') {
    return (
      <main>
        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div>
              <h2>Cotizador</h2>
              <div className="hint">Cotizaciones de carga Seca — <Link to="/comercial/tarifas">ver Cuadro Tarifario</Link>.</div>
            </div>
            <button onClick={abrirNueva}>+ Nueva Cotización</button>
          </div>
          <div className="table-wrap" style={{ marginTop: 10 }}>
            <table>
              <thead><tr><th>Número</th><th>Fecha</th><th>Tráfico</th><th className="num">Total</th><th></th></tr></thead>
              <tbody>
                {cotizaciones.map((c) => (
                  <tr key={c.id}>
                    <td>{c.numero}</td>
                    <td>{c.fecha}</td>
                    <td>{c.trafico_origen} → {c.trafico_destino}</td>
                    <td className="num">{money(c.total)}</td>
                    <td><Link to={`/comercial/cotizador/${c.id}/imprimir`} target="_blank">Imprimir</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {cotizaciones.length === 0 && <div className="empty">Todavía no se cargó ninguna cotización.</div>}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main>
      <div className="card">
        <h2>Nueva Cotización</h2>
        <div className="row">
          <div className="field"><label>Fecha</label><input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></div>
          <div className="field">
            <label>Tráfico Origen</label>
            <select value={traficoOrigen} onChange={(e) => setTraficoOrigen(e.target.value as Sucursal)}>
              {SUCURSALES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Tráfico Destino</label>
            <select value={traficoDestino} onChange={(e) => setTraficoDestino(e.target.value as Sucursal)}>
              {SUCURSALES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Paga en</label>
            <select value={pagaEn} onChange={(e) => setPagaEn(e.target.value as 'origen' | 'destino')}>
              <option value="origen">Origen</option>
              <option value="destino">Destino</option>
            </select>
          </div>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <div className="field">
            <label>Cliente</label>
            <select value={cliente} onChange={(e) => setCliente(e.target.value)}>
              <option value="">Seleccione…</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
          <div className="field"><label>Solicitado Por</label><input value={solicitadoPor} onChange={(e) => setSolicitadoPor(e.target.value)} /></div>
          <div className="field"><label>Teléfono</label><input value={telefono} onChange={(e) => setTelefono(e.target.value)} /></div>
          <div className="field" style={{ flex: 1 }}><label>Email</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <div className="field" style={{ flex: 1 }}><label>Lugar de Carga</label><input value={lugarCarga} onChange={(e) => setLugarCarga(e.target.value)} /></div>
          <div className="field" style={{ flex: 1 }}><label>Lugar de Descarga</label><input value={lugarDescarga} onChange={(e) => setLugarDescarga(e.target.value)} /></div>
          <div className="field"><label>Tipo de Mercadería</label><input value={tipoMercaderia} onChange={(e) => setTipoMercaderia(e.target.value)} /></div>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <div className="field" style={{ flex: 1 }}><label>Observación</label><textarea value={observacion} onChange={(e) => setObservacion(e.target.value)} /></div>
        </div>

        <h3 style={{ marginTop: 18 }}>Items</h3>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Kilos</th><th>Mts³</th><th>Bultos</th><th>Valor Declarado</th><th className="num">Precio</th><th className="num">Total</th><th></th></tr></thead>
            <tbody>
              {items.map((it, i) => {
                const calc = itemsCalculados[i];
                const kilos = Number(it.kilos.replace(',', '.')) || 0;
                const m3 = Number(it.m3.replace(',', '.')) || 0;
                const tieneCarga = kilos > 0 || m3 > 0;
                return (
                  <tr key={i}>
                    <td><input inputMode="decimal" value={it.kilos} onChange={(e) => actualizarItem(i, 'kilos', e.target.value)} style={{ width: 80 }} /></td>
                    <td><input inputMode="decimal" value={it.m3} onChange={(e) => actualizarItem(i, 'm3', e.target.value)} style={{ width: 80 }} /></td>
                    <td><input inputMode="decimal" value={it.bultos} onChange={(e) => actualizarItem(i, 'bultos', e.target.value)} style={{ width: 70 }} /></td>
                    <td><input inputMode="decimal" value={it.valorDeclarado} onChange={(e) => actualizarItem(i, 'valorDeclarado', e.target.value)} style={{ width: 110 }} /></td>
                    <td className="num">{calc ? money(calc.precio) : (tieneCarga ? '—' : '')}</td>
                    <td className="num">{calc ? money(calc.total) : (tieneCarga ? '—' : '')}</td>
                    <td><button className="small danger" onClick={() => quitarItem(i)} disabled={items.length === 1}>Quitar</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <button className="small secondary" onClick={agregarItem} style={{ marginTop: 6 }}>+ Agregar ítem</button>

        <div className="row" style={{ marginTop: 16, alignItems: 'flex-start' }}>
          <div>
            <label><input type="checkbox" checked={seguroActivo} onChange={(e) => setSeguroActivo(e.target.checked)} /> Seguro</label>
            {' '}
            <input inputMode="decimal" value={seguroPorcentaje} onChange={(e) => setSeguroPorcentaje(e.target.value)} style={{ width: 70 }} disabled={!seguroActivo} /> %
          </div>
          <div className="field"><label>Contra Reembolso</label><input inputMode="decimal" value={contraReembolso} onChange={(e) => setContraReembolso(e.target.value)} style={{ width: 110 }} /></div>
          <div className="field"><label>Taxi-Flet</label><input inputMode="decimal" value={taxiFlet} onChange={(e) => setTaxiFlet(e.target.value)} style={{ width: 110 }} /></div>
        </div>

        {totales && (
          <div style={{ marginTop: 16, maxWidth: 320 }}>
            <div className="row" style={{ justifyContent: 'space-between' }}><span>Sub-Total</span><span>{money(totales.subTotal)}</span></div>
            <div className="row" style={{ justifyContent: 'space-between' }}><span>Recargo</span><span>{money(totales.recargo)}</span></div>
            <div className="row" style={{ justifyContent: 'space-between' }}><span>Seguro</span><span>{money(totales.seguro)}</span></div>
            <div className="row" style={{ justifyContent: 'space-between' }}><span>Neto Gravado</span><span>{money(totales.netoGravado)}</span></div>
            <div className="row" style={{ justifyContent: 'space-between' }}><span>IVA 21%</span><span>{money(totales.iva)}</span></div>
            <div className="row" style={{ justifyContent: 'space-between', fontWeight: 700 }}><span>Total</span><span>{money(totales.total)}</span></div>
          </div>
        )}

        <div className="row" style={{ marginTop: 16 }}>
          <button onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
          <button className="secondary" onClick={() => setVista('lista')}>Cancelar</button>
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Agregar la ruta en `App.tsx`**

Agregar el import junto a `CuadroTarifarioPage`:

```tsx
import { CotizadorPage } from './pages/tarifas/CotizadorPage';
```

Agregar la ruta, justo después del bloque de la ruta
`/comercial/tarifas`:

```tsx
        <Route
          path="/comercial/cotizador"
          element={
            <RequireModule moduleId="cuadro_tarifario">
              <CotizadorPage />
            </RequireModule>
          }
        />
```

- [ ] **Step 3: Link cruzado desde `CuadroTarifarioPage.tsx`**

En `web/src/pages/tarifas/CuadroTarifarioPage.tsx`, agregar el import de
`Link` (`import { Link } from 'react-router-dom';`) y, en el `<div
className="hint">` del encabezado (línea 90), agregar el link:

```tsx
            <div className="hint">Valores de referencia propios de Sistema CyV — no modifica el sistema de ventas de terceros. <Link to="/comercial/cotizador">Ir al Cotizador →</Link></div>
```

- [ ] **Step 4: Verificar que el build de TypeScript compila**

```bash
cd web && npm run build
```

- [ ] **Step 5: Dar el módulo y crear un usuario con sucursal, verificar en el navegador**

Con el dev server corriendo (`npm run dev` en `web/`) contra la PocketBase
local ya migrada (con los hooks de Task 3 copiados), loguearse como admin
(ya tiene `sucursal = san_francisco` por el backfill), entrar a
`/comercial/cotizador`, crear una cotización con un ítem (ej: Kilos=1,
Tráfico San Francisco-San Francisco) y confirmar que:
- Precio/Total del ítem se actualizan en vivo al tipear.
- El resumen de totales (Sub-Total/Recargo/Seguro/Neto/IVA/Total)
  coincide con el caso del Task 4 (Kilos=1 → Total $30.440,33).
- Al Guardar, aparece en la lista con el número `SAN-00000001`.
- Un segundo guardado da `SAN-00000002`.
- El link "Ir al Cotizador →" desde Cuadro Tarifario, y "ver Cuadro
  Tarifario" desde el Cotizador, funcionan los dos.

- [ ] **Step 6: Commit**

```bash
git add web/src/pages/tarifas/CotizadorPage.tsx web/src/App.tsx web/src/pages/tarifas/CuadroTarifarioPage.tsx
git commit -m "Cotizador: pantalla de lista y formulario"
```

---

### Task 6: Impresión (`CotizacionImprimirPage.tsx`)

**Files:**
- Create: `web/src/pages/tarifas/CotizacionImprimirPage.tsx`
- Modify: `web/src/App.tsx` (import + ruta nueva)
- Modify: `web/src/index.css` (bloque de impresión nuevo)
- Create: `web/public/cotizador-logo.jpg` (copia de `logo.jpg`, ya está en
  la raíz del repo)

**Interfaces:**
- Consumes: `Cotizacion`/`CotizacionItem` (Task 2), `money()`/`fechaVencimiento()`
  (Task 4), `pb`, `useParams` de `react-router-dom`.
- Produces: ruta `/comercial/cotizador/:id/imprimir`, gateada con
  `<RequireModule moduleId="cuadro_tarifario">`.

- [ ] **Step 1: Copiar el logo a `web/public/`**

```bash
cp logo.jpg web/public/cotizador-logo.jpg
```

- [ ] **Step 2: Escribir la página completa**

Archivo completo `web/src/pages/tarifas/CotizacionImprimirPage.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { pb } from '../../lib/pb';
import { useToast } from '../../lib/ToastContext';
import { money } from '../../lib/format';
import type { Cliente, Cotizacion, CotizacionItem } from '../../types';
import { fechaVencimiento } from './cotizadorMotor';

// Precarga el logo apenas carga el módulo -- mismo motivo que
// RecibosPage.tsx: window.print() puede dispararse antes de que el
// navegador termine de pedir una imagen recién referenciada.
new Image().src = '/cotizador-logo.jpg';

const NOMBRE_SUCURSAL: Record<string, string> = {
  cordoba: 'Córdoba', san_francisco: 'San Francisco', rosario: 'Rosario', buenos_aires: 'Buenos Aires',
};

export function CotizacionImprimirPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const [cot, setCot] = useState<Cotizacion | null>(null);
  const [items, setItems] = useState<CotizacionItem[]>([]);
  const [clienteNombre, setClienteNombre] = useState('');

  useEffect(() => { cargar(); }, [id]);

  async function cargar() {
    if (!id) return;
    try {
      const [c, its] = await Promise.all([
        pb.collection('cotizaciones').getOne<Cotizacion>(id),
        pb.collection('cotizacion_items').getFullList<CotizacionItem>({ filter: `cotizacion = "${id}"` }),
      ]);
      setCot(c);
      setItems(its);
      if (c.cliente) {
        try {
          const cli = await pb.collection('clientes').getOne<Cliente>(c.cliente);
          setClienteNombre(cli.nombre);
        } catch { /* cliente borrado -- queda sin nombre */ }
      }
    } catch (e) {
      toast('No se pudo cargar la cotización: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }

  if (!cot) return <main><div className="card">Cargando…</div></main>;

  const vencimiento = fechaVencimiento(cot.fecha);
  const hoy = new Date().toISOString().slice(0, 10);
  const estado = hoy > vencimiento ? 'Vencido' : 'Vigente';

  return (
    <main>
      <div className="card">
        <button onClick={() => {
          document.body.classList.add('imprimiendo-cotizacion');
          setTimeout(() => {
            window.print();
            document.body.classList.remove('imprimiendo-cotizacion');
          }, 50);
        }}>Imprimir</button>
      </div>
      <div id="cotizacion-imprimible">
        <div style={{ textAlign: 'right', fontSize: 11 }}>
          <div>Carossio, Vairolatti &amp; Cía S.R.L.</div>
          <div>San Lorenzo 31</div>
          <div>San Francisco</div>
          <div>CUIT: 30-54057342-1 - Ing. Brutos: 904-249209-7</div>
        </div>
        <hr />
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <div>Cotización: <strong>{cot.numero}</strong></div>
            <div>Fecha: {cot.fecha}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div>Estado: {estado}</div>
            <div>Vencimiento: {vencimiento} (salvo incremento tarifario)</div>
          </div>
        </div>
        <hr />
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <div>Señor(es): {clienteNombre || '—'}</div>
            <div>Atento: {clienteNombre || '—'}</div>
          </div>
          <div>Remitente: {cot.solicitado_por || '—'}</div>
        </div>
        <hr />
        <table style={{ width: '100%', marginTop: 10 }}>
          <thead><tr><th>Kilos</th><th>Metros Cúbicos</th><th>Bultos</th><th>Valor Declarado</th><th>Observación</th><th>Precio</th><th>Total</th></tr></thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id}>
                <td>{it.kilos.toFixed(2)}</td>
                <td>{it.m3.toFixed(2)}</td>
                <td>{it.bultos.toFixed(2)}</td>
                <td>{it.valor_declarado.toFixed(2)}</td>
                <td></td>
                <td>{money(it.precio)}</td>
                <td>{money(it.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginTop: 16, maxWidth: 320 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}><span>SubTotal:</span><span>{money(cot.sub_total)}</span></div>
          <div className="row" style={{ justifyContent: 'space-between' }}><span>Seguro:</span><span>{money(cot.seguro)}</span></div>
          <div className="row" style={{ justifyContent: 'space-between' }}><span>Taxi-Flet:</span><span>{money(cot.taxi_flet)}</span></div>
          <hr />
          <div className="row" style={{ justifyContent: 'space-between' }}><span>Neto:</span><span>{money(cot.neto_gravado)}</span></div>
          <div className="row" style={{ justifyContent: 'space-between' }}><span>IVA:</span><span>{money(cot.iva)}</span></div>
          <hr />
          <div className="row" style={{ justifyContent: 'space-between', fontWeight: 700 }}><span>Total:</span><span>{money(cot.total)}</span></div>
        </div>
        <div style={{ marginTop: 16 }}>
          <div>Lugar de Carga: {cot.lugar_carga || '—'}</div>
          <div>Lugar de Descarga: {cot.lugar_descarga || '—'}</div>
          <div>Tipo de Mercadería: {cot.tipo_mercaderia || '—'}</div>
          <div>Observación: {cot.observacion || '—'}</div>
        </div>
        <div style={{ marginTop: 20, fontSize: 10, fontStyle: 'italic' }}>
          En caso de que los datos informados por el cliente difieran de los datos reales, se procederá a realizar un ajuste en la tarifa.
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Ruta en `App.tsx`**

Import:

```tsx
import { CotizacionImprimirPage } from './pages/tarifas/CotizacionImprimirPage';
```

Ruta, después de la de `/comercial/cotizador`:

```tsx
        <Route
          path="/comercial/cotizador/:id/imprimir"
          element={
            <RequireModule moduleId="cuadro_tarifario">
              <CotizacionImprimirPage />
            </RequireModule>
          }
        />
```

- [ ] **Step 4: CSS de impresión en `web/src/index.css`**

Agregar al final del archivo (mismo patrón que `#recibo-imprimible`,
líneas 1026-1060, pero A4 completa en vez de media hoja, y con la marca de
agua):

```css
#cotizacion-imprimible {
  display: none;
}

body.imprimiendo-cotizacion * {
  visibility: hidden;
}
body.imprimiendo-cotizacion #cotizacion-imprimible,
body.imprimiendo-cotizacion #cotizacion-imprimible * {
  visibility: visible;
}
body.imprimiendo-cotizacion #cotizacion-imprimible {
  display: block !important;
  position: absolute;
  top: 0;
  left: 0;
  width: 210mm;
  min-height: 297mm;
  padding: 14mm;
  box-sizing: border-box;
  font-family: Arial, sans-serif;
  font-size: 12px;
  print-color-adjust: exact;
  -webkit-print-color-adjust: exact;
}
#cotizacion-imprimible {
  position: relative;
}
#cotizacion-imprimible::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background-image: url('/cotizador-logo.jpg');
  background-repeat: no-repeat;
  background-position: center;
  background-size: 60% auto;
  opacity: 0.08;
  z-index: 0;
}
#cotizacion-imprimible > * {
  position: relative;
  z-index: 1;
}
```

- [ ] **Step 5: Verificar que el build de TypeScript compila**

```bash
cd web && npm run build
```

- [ ] **Step 6: Verificar en el navegador**

Con el dev server corriendo, abrir una cotización guardada y hacer clic en
"Imprimir" desde la lista (Task 5), confirmar que la vista de impresión
muestra: encabezado de la empresa, número/fecha/estado/vencimiento,
cliente, tabla de ítems, exactamente las 6 líneas de totales (sin Recargo
ni Contra Reembolso), lugares, tipo de mercadería, observación, la
leyenda, y el logo como marca de agua de fondo (tenue, no tapa el texto).
Probar `window.print()` (Ctrl+P / el botón) y confirmar que la vista
previa de impresión del navegador muestra solo esa hoja A4, sin el resto
de la pantalla.

- [ ] **Step 7: Commit**

```bash
git add web/src/pages/tarifas/CotizacionImprimirPage.tsx web/src/App.tsx web/src/index.css web/public/cotizador-logo.jpg
git commit -m "Cotizador: vista de impresion A4 con marca de agua"
```

---

### Task 7: Deploy

**Files:** ninguno (solo build + push + verificación en producción).

**Interfaces:**
- Consumes: Tasks 1-6 completos y revisados.

- [ ] **Step 1: Build final**

```bash
cd web && npm run build
```

Anotar el hash del bundle generado (`dist/assets/index-XXXXXXXX.js`).

- [ ] **Step 2: Push**

```bash
git push
```

- [ ] **Step 3: Verificar el deploy en producción**

```bash
until curl -s https://app.carossiovairolatti.com.ar/ | grep -q "index-XXXXXXXX"; do sleep 15; done
```

(reemplazar `index-XXXXXXXX` por el hash real del Step 1).

- [ ] **Step 4: Verificar la migración en producción**

```bash
ssh -i ~/.ssh/cyv_deploy_new -o StrictHostKeyChecking=no ubuntu@44.204.212.111 "sqlite3 /home/ubuntu/pocketbase/pb_data/data.db \"SELECT name FROM sqlite_master WHERE type='table' AND name IN ('cotizaciones','cotizacion_items');\""
```

Esperado: las 2 tablas existen en producción.
