# Liquidación de sueldos mensual — Choferes — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vincular cada chofer con su legajo de Personal, completar los 2 campos de Tramo que faltan, y construir la vista de liquidación mensual (básico + variable − descuentos = neto) por chofer y mes, usando las Tarifas de viaje de Sueldos.

**Architecture:** Backend: 1 migración que agrega `choferes.legajo` (relation), 2 campos nuevos a `tramos`, y permisos de lectura cruzados para el módulo `sueldos`. Frontend: ampliar `AdminSimpleTab` para soportar columnas tipo `select`, usarlo en `ChoferesTab.tsx` para vincular el legajo, agregar los 2 campos nuevos a `TramoModal.tsx`, y una pantalla nueva `LiquidacionChoferesSub.tsx` como 3ª pestaña de Sueldos.

**Tech Stack:** React 19 + TypeScript + Vite, PocketBase (migraciones JS a mano). Sin tests automatizados de frontend.

## Global Constraints

- `cyd_manual` de cada tramo **se suma directo**, nunca se multiplica por ninguna tarifa — ya es un monto final calculado a mano.
- "Feriados trabajados" se cuentan comparando `tramo.dia_salida` contra las fechas de `fichadas_feriados` — **no se agrega ningún campo nuevo para esto**.
- La liquidación mensual **NO incluye antigüedad** (1% por año) — queda afuera a propósito, sin fórmula confirmada para el cálculo mensual.
- `legajo.basico` y `legajo.categoria` (con sus 6 `pct_*` y vía `categoria`) son los datos reales a usar — no inventar un básico si el legajo no lo tiene cargado, mostrar un aviso en su lugar.
- Sin tests automatizados de frontend — cada tarea termina con `cd web && npm run build` limpio + verificación manual paso a paso. La verificación de que el NÚMERO final de la liquidación es correcto solo se puede confirmar en staging con datos reales de 1-2 choferes conocidos — no hay forma de simular esto localmente con certeza.

---

### Task 1: Migración — vincular choferes con legajo, completar Tramo, permisos

**Files:**
- Create: `pb_migrations/1789490000_liquidacion_choferes.js`

**Interfaces:**
- Produces: `choferes.legajo` (relation → `fichadas_legajos`, maxSelect 1, opcional), `tramos.es_aguas_gaseosas` (bool), `tramos.km_zona_120` (number).

- [ ] **Step 1: Confirmar el estado actual de permisos antes de escribir la migración**

Correr:
```bash
grep -n "R_LECTURA\s*=\|R_ESCRITURA\s*=\|const BASE" pb_migrations/1789020000_planilla_permisos_auditoria_cierre.js
```
Expected: `BASE = '@request.auth.id != "" && (@request.auth.rol = "admin" || @request.auth.modulos ~ "planilla_choferes"'`, `R_ESCRITURA = BASE + ')'`, `R_LECTURA = BASE + ' || @request.auth.modulos ~ "consumo_combustible")'`. Esta es la regla ACTUAL de `tramos` (list/view = R_LECTURA, create/update/delete = R_ESCRITURA) — si no coincide, parar y revisar qué migración posterior la cambió antes de seguir.

```bash
grep -n "reglaLecturaConPersonal\s*=" pb_migrations/1789470000_personal_modulo_propio.js
```
Expected: `'@request.auth.id != "" && (@request.auth.rol = "admin" || @request.auth.modulos ~ "fichadas" || @request.auth.modulos ~ "reportes" || @request.auth.modulos ~ "vacaciones" || @request.auth.modulos ~ "personal")'` — esta es la regla ACTUAL de `fichadas_legajos` (list/view).

`fichadas_feriados` (list/view) está en `admin || fichadas || reportes || vacaciones` (mismo patrón, agregado por `1789460000_liquidacion_permisos_cruzados.js`).

`choferes` tiene las 5 reglas vacías (`""`) desde su creación — abierto a cualquier request autenticado, nadie lo cambió después. No se toca en esta migración (fuera de alcance, no lo rompe ni lo arregla).

- [ ] **Step 2: Escribir la migración**

Crear `pb_migrations/1789490000_liquidacion_choferes.js`:

```javascript
/// <reference path="../pb_data/types.d.ts" />
// Liquidación de sueldos mensual de choferes (sub-proyectos 3+4 fusionados,
// ver docs/superpowers/specs/2026-11-13-liquidacion-sueldos-choferes-design.md).
// Vincula cada chofer con su legajo de Personal (categoría/básico reales),
// agrega a Tramo los 2 datos que faltaban para el cálculo (aguas y gaseosas,
// km zona 1,20 -- "feriados trabajados" se deriva comparando dia_salida
// contra fichadas_feriados, sin campo nuevo), y abre lectura cruzada al
// módulo "sueldos" sobre tramos/fichadas_legajos/fichadas_feriados (no
// escritura -- la liquidación solo lee).
migrate((db) => {
  const dao = new Dao(db);

  // --- 1) choferes.legajo ---
  const choferes = dao.findCollectionByNameOrId('choferes');
  choferes.schema.addField(new SchemaField({
    system: false, id: 'chf0legajo001', name: 'legajo', type: 'relation',
    required: false, presentable: false, unique: false,
    options: {
      collectionId: dao.findCollectionByNameOrId('fichadas_legajos').id,
      cascadeDelete: false, minSelect: null, maxSelect: 1, displayFields: ['nombre'],
    },
  }));
  dao.saveCollection(choferes);

  // --- 2) tramos: 2 campos nuevos ---
  const tramos = dao.findCollectionByNameOrId('tramos');
  tramos.schema.addField(new SchemaField({
    system: false, id: 'trm0aguasga1', name: 'es_aguas_gaseosas', type: 'bool',
    required: false, presentable: false, unique: false, options: {},
  }));
  tramos.schema.addField(new SchemaField({
    system: false, id: 'trm0kmzona12', name: 'km_zona_120', type: 'number',
    required: false, presentable: false, unique: false,
    options: { min: 0, max: null, noDecimal: false },
  }));

  // --- 3) permisos: "sueldos" lee tramos/fichadas_legajos/fichadas_feriados ---
  const reglaLecturaTramosConSueldos = '@request.auth.id != "" && (@request.auth.rol = "admin" || @request.auth.modulos ~ "planilla_choferes" || @request.auth.modulos ~ "consumo_combustible" || @request.auth.modulos ~ "sueldos")';
  tramos.listRule = reglaLecturaTramosConSueldos;
  tramos.viewRule = reglaLecturaTramosConSueldos;
  dao.saveCollection(tramos);

  const reglaLecturaLegajosConSueldos = '@request.auth.id != "" && (@request.auth.rol = "admin" || @request.auth.modulos ~ "fichadas" || @request.auth.modulos ~ "reportes" || @request.auth.modulos ~ "vacaciones" || @request.auth.modulos ~ "personal" || @request.auth.modulos ~ "sueldos")';
  const legajos = dao.findCollectionByNameOrId('fichadas_legajos');
  legajos.listRule = reglaLecturaLegajosConSueldos;
  legajos.viewRule = reglaLecturaLegajosConSueldos;
  dao.saveCollection(legajos);

  const reglaLecturaFeriadosConSueldos = '@request.auth.id != "" && (@request.auth.rol = "admin" || @request.auth.modulos ~ "fichadas" || @request.auth.modulos ~ "reportes" || @request.auth.modulos ~ "vacaciones" || @request.auth.modulos ~ "sueldos")';
  const feriados = dao.findCollectionByNameOrId('fichadas_feriados');
  feriados.listRule = reglaLecturaFeriadosConSueldos;
  feriados.viewRule = reglaLecturaFeriadosConSueldos;
  dao.saveCollection(feriados);

  // --- 4) auto-vincular choferes con su legajo por nombre exacto (sin mayúsc./espacios extra) ---
  const normalizar = (s) => (s || '').trim().toUpperCase().replace(/\s+/g, ' ');
  const todosLosChoferes = dao.findRecordsByFilter(choferes.id, '', '', 500, 0);
  const todosLosLegajos = dao.findRecordsByFilter(legajos.id, '', '', 2000, 0);
  const legajoPorNombre = new Map();
  for (const l of todosLosLegajos) {
    legajoPorNombre.set(normalizar(l.getString('nombre')), l.id);
  }
  for (const c of todosLosChoferes) {
    if (c.get('legajo')) continue; // ya vinculado, no pisar
    const legajoId = legajoPorNombre.get(normalizar(c.getString('nombre')));
    if (legajoId) {
      c.set('legajo', legajoId);
      dao.saveRecord(c);
    }
  }

  return null;
}, (db) => {
  const dao = new Dao(db);

  const reglaLecturaTramosOriginal = '@request.auth.id != "" && (@request.auth.rol = "admin" || @request.auth.modulos ~ "planilla_choferes" || @request.auth.modulos ~ "consumo_combustible")';
  const tramos = dao.findCollectionByNameOrId('tramos');
  tramos.listRule = reglaLecturaTramosOriginal;
  tramos.viewRule = reglaLecturaTramosOriginal;
  tramos.schema.removeField('trm0aguasga1');
  tramos.schema.removeField('trm0kmzona12');
  dao.saveCollection(tramos);

  const reglaLecturaLegajosOriginal = '@request.auth.id != "" && (@request.auth.rol = "admin" || @request.auth.modulos ~ "fichadas" || @request.auth.modulos ~ "reportes" || @request.auth.modulos ~ "vacaciones" || @request.auth.modulos ~ "personal")';
  const legajos = dao.findCollectionByNameOrId('fichadas_legajos');
  legajos.listRule = reglaLecturaLegajosOriginal;
  legajos.viewRule = reglaLecturaLegajosOriginal;
  dao.saveCollection(legajos);

  const reglaLecturaFeriadosOriginal = '@request.auth.id != "" && (@request.auth.rol = "admin" || @request.auth.modulos ~ "fichadas" || @request.auth.modulos ~ "reportes" || @request.auth.modulos ~ "vacaciones")';
  const feriados = dao.findCollectionByNameOrId('fichadas_feriados');
  feriados.listRule = reglaLecturaFeriadosOriginal;
  feriados.viewRule = reglaLecturaFeriadosOriginal;
  dao.saveCollection(feriados);

  const choferes = dao.findCollectionByNameOrId('choferes');
  choferes.schema.removeField('chf0legajo001');
  dao.saveCollection(choferes);

  return null;
})
```

- [ ] **Step 3: Verificar sintaxis**

```bash
node -c pb_migrations/1789490000_liquidacion_choferes.js
```
Expected: sin salida (sintaxis válida).

- [ ] **Step 4: Levantar una instancia de PocketBase de prueba y correr la migración**

Reusar o crear una instancia de prueba (bajar `pocketbase.exe` si hace falta), copiar todos los `pb_migrations/*.js` y `pb_hooks/*.js` actuales, correr:
```bash
./pocketbase.exe migrate up
```
Expected: corre limpio, termina con "Applied 1789490000_liquidacion_choferes.js migration" (o el total de migraciones del repo en ese momento).

- [ ] **Step 5: Verificar los campos y el auto-vinculado**

```bash
python3 -c "
import sqlite3
con = sqlite3.connect('pb_data/data.db')
cur = con.cursor()
cur.execute('SELECT nombre, legajo FROM choferes LIMIT 10')
for row in cur.fetchall(): print(row)
cur.execute('PRAGMA table_info(tramos)')
cols = [r[1] for r in cur.fetchall()]
print('tiene es_aguas_gaseosas:', 'es_aguas_gaseosas' in cols)
print('tiene km_zona_120:', 'km_zona_120' in cols)
"
```
Expected: `tramos` tiene las 2 columnas nuevas; algunas filas de `choferes` tienen `legajo` no-nulo si había un `fichadas_legajos.nombre` que coincidía exactamente (puede que ninguna coincida en una base de prueba vacía/sin datos reales — eso está bien para esta verificación, el auto-match real se confirma en staging).

- [ ] **Step 6: Probar en vivo los permisos de lectura**

Crear un usuario de prueba no-admin con `modulos: ["sueldos"]` solamente, autenticarlo, y confirmar con curl que puede LEER `tramos`, `fichadas_legajos` y `fichadas_feriados` (GET a cada colección con su token, esperar 200 y datos, no una lista vacía por falta de permiso). Confirmar también que NO puede crear/editar tramos (`createRule`/`updateRule` de `tramos` no cambiaron, siguen siendo solo `planilla_choferes`) — un POST a `/api/collections/tramos/records` con ese token debe fallar.

- [ ] **Step 7: Commit**

```bash
git add pb_migrations/1789490000_liquidacion_choferes.js
git commit -m "feat(sueldos): vincular choferes con legajo, completar Tramo, permisos de liquidacion"
```

---

### Task 2: Columna "Legajo" en Administración → Choferes

**Files:**
- Modify: `web/src/pages/admin/AdminSimpleTab.tsx`
- Modify: `web/src/pages/admin/ChoferesTab.tsx`

**Interfaces:**
- Consumes: `choferes.legajo` (Task 1), colección `fichadas_legajos` (ya existe).
- Produces: `ColumnDef<T>` gana un tipo `'select'` reusable por cualquier otra pestaña de Administración que lo necesite a futuro.

- [ ] **Step 1: Ampliar `ColumnDef` y el render de edición en `AdminSimpleTab.tsx`**

En `web/src/pages/admin/AdminSimpleTab.tsx`, reemplazar la interfaz `ColumnDef`:

```typescript
export interface ColumnDef<T> {
  field: keyof T;
  label: string;
  type?: 'text' | 'number' | 'select'; // default 'text' — controla el input al editar
  options?: { value: string; label: string }[]; // requerido si type === 'select'
  render?: (value: unknown) => string; // cómo mostrar el valor en modo lectura (default: String(value))
}
```

Reemplazar el bloque de la celda editable (dentro del `.map` de `columns`, el `<td>` con el `input`) por:

```tsx
                  {columns.map((c, i) => (
                    <td key={String(c.field)} className={i === 0 ? 'admin-name' : ''}>
                      {editing ? (
                        c.type === 'select' ? (
                          <select
                            value={draft[String(c.field)] ?? ''}
                            onChange={(e) => setDraft((d) => ({ ...d, [String(c.field)]: e.target.value }))}
                          >
                            <option value="">—</option>
                            {(c.options || []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        ) : (
                          <input
                            type={c.type === 'number' ? 'number' : 'text'}
                            value={draft[String(c.field)] ?? ''}
                            onChange={(e) => setDraft((d) => ({ ...d, [String(c.field)]: e.target.value }))}
                          />
                        )
                      ) : (
                        c.render ? c.render(item[c.field]) : (String(item[c.field] ?? '') || (i === 0 ? '—' : ''))
                      )}
                    </td>
                  ))}
```

`saveEdit` ya envía `draft[String(c.field)]` tal cual para cualquier columna que no sea `type: 'number'` (texto plano) — un `select` con `value` = id de PocketBase funciona igual que un campo de texto para ese propósito, no hace falta tocar `saveEdit`.

- [ ] **Step 2: Agregar la columna "Legajo" en `ChoferesTab.tsx`**

En `web/src/pages/admin/ChoferesTab.tsx`, agregar la carga de legajos y la columna. Reemplazar el archivo completo por:

```tsx
import { useEffect, useState } from 'react';
import { pb } from '../../lib/pb';
import { useToast } from '../../lib/ToastContext';
import { AdminSimpleTab } from './AdminSimpleTab';
import type { Chofer, FichadasLegajo } from '../../types';

export function ChoferesTab({ version, onChanged }: { version: number; onChanged: () => void }) {
  const toast = useToast();
  const [nombre, setNombre] = useState('');
  const [localidad, setLocalidad] = useState('');
  const [legajos, setLegajos] = useState<FichadasLegajo[]>([]);

  useEffect(() => {
    pb.collection('fichadas_legajos').getFullList<FichadasLegajo>({ sort: 'nombre' })
      .then(setLegajos)
      .catch((e) => toast('No se pudieron cargar los legajos: ' + (e instanceof Error ? e.message : ''), 'err'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const legajoPorId = new Map(legajos.map((l) => [l.id, l]));

  async function create() {
    if (!nombre.trim()) { toast('Falta el nombre.', 'warn'); return; }
    try {
      await pb.collection('choferes').create({ nombre: nombre.trim(), localidad: localidad.trim(), activo: true });
      setNombre('');
      setLocalidad('');
      onChanged();
      toast('Chofer agregado.', 'ok');
    } catch (e) {
      toast('Error: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }

  return (
    <AdminSimpleTab<Chofer>
      title="Choferes"
      collection="choferes"
      columns={[
        { field: 'nombre', label: 'Nombre' },
        { field: 'localidad', label: 'Localidad' },
        {
          field: 'legajo', label: 'Legajo', type: 'select',
          options: legajos.map((l) => ({ value: l.id, label: l.nombre + (l.nro_legajo ? ' (' + l.nro_legajo + ')' : '') })),
          render: (v) => { const l = legajoPorId.get(String(v || '')); return l ? l.nombre : '—'; },
        },
      ]}
      searchFields={['nombre', 'localidad']}
      version={version}
      onChanged={onChanged}
      form={
        <div className="row">
          <div className="field" style={{ flex: 1 }}><label>Nombre</label><input value={nombre} onChange={(e) => setNombre(e.target.value)} /></div>
          <div className="field"><label>Localidad</label><input value={localidad} onChange={(e) => setLocalidad(e.target.value)} /></div>
          <button onClick={create}>+ Agregar</button>
        </div>
      }
    />
  );
}
```

(El alta de un chofer nuevo sigue sin pedir legajo — se vincula después editando la fila, igual que cualquier otro campo de esta pantalla.)

- [ ] **Step 3: Build**

```bash
cd web && npm run build
```
Expected: limpio.

- [ ] **Step 4: Verificación manual**

En Administración → Choferes, confirmar que aparece la columna "Legajo", que en modo lectura muestra el nombre del legajo vinculado (o "—"), y que al editar aparece un desplegable con todos los legajos (nombre + nro_legajo entre paréntesis si lo tiene) que guarda correctamente.

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/admin/AdminSimpleTab.tsx web/src/pages/admin/ChoferesTab.tsx
git commit -m "feat(admin): columna Legajo (vinculo) en Choferes, soporte select en AdminSimpleTab"
```

---

### Task 3: Campos nuevos en TramoModal

**Files:**
- Modify: `web/src/pages/planilla/TramoModal.tsx`

**Interfaces:**
- Consumes: `tramos.es_aguas_gaseosas`, `tramos.km_zona_120` (Task 1).

- [ ] **Step 1: Agregar los campos al `FormState`, `NUM_LABELS`, `EMPTY` y `fromTramo`**

En `web/src/pages/planilla/TramoModal.tsx`:

En la interfaz `FormState` (antes de la línea `control: boolean;`), agregar:
```typescript
  es_aguas_gaseosas: boolean;
  km_zona_120: number;
```

En `NUM_LABELS` (dentro del objeto, en cualquier posición), agregar:
```typescript
  km_zona_120: 'Km zona 1,20',
```

En `EMPTY` (dentro del objeto), agregar:
```typescript
  km_zona_120: 0, es_aguas_gaseosas: false,
```

En `fromTramo` (la función que arma el `FormState` desde un `Tramo` existente, cerca de `es_posicionamiento: !!t.es_posicionamiento,`), agregar:
```typescript
    km_zona_120: t.km_zona_120 || 0,
    es_aguas_gaseosas: !!t.es_aguas_gaseosas,
```

- [ ] **Step 2: Agregar los inputs al formulario**

En la fieldset "Viaje", en la misma fila que los checkboxes de `es_posicionamiento`/`control` (buscar `Es posicionamiento (Carga = "T")` para ubicarla), agregar un tercer checkbox:

```tsx
                <div className="field"><label><input type="checkbox" checked={form.es_aguas_gaseosas} onChange={(e) => set('es_aguas_gaseosas', e.target.checked)} /> Aguas y Gaseosas</label></div>
```

En la fieldset "Km y estadía", en la fila que ya tiene "Cruce frontera" (buscar `Cruce frontera`), agregar al lado:

```tsx
                <Num label="Km zona 1,20" value={form.km_zona_120} onChange={(n) => set('km_zona_120', n)} />
```

- [ ] **Step 3: Agregar las 2 columnas a la exportación Excel**

En `web/src/pages/planilla/PlanillaChoferesPage.tsx`, en el array `COLUMNAS_EXCEL` (buscar `const COLUMNAS_EXCEL`), agregar al final del array:

```typescript
  ['km_zona_120', 'Km zona 1,20', false, true], ['es_aguas_gaseosas', 'Aguas y Gaseosas', false, false],
```

- [ ] **Step 4: Build**

```bash
cd web && npm run build
```
Expected: limpio.

- [ ] **Step 5: Verificación manual**

Abrir Planilla Choferes, crear o editar un tramo, confirmar que aparecen el checkbox "Aguas y Gaseosas" y el campo "Km zona 1,20", que se guardan correctamente (recargar y confirmar que el valor persiste), y que "Exportar Excel" incluye las 2 columnas nuevas.

- [ ] **Step 6: Commit**

```bash
git add web/src/pages/planilla/TramoModal.tsx web/src/pages/planilla/PlanillaChoferesPage.tsx
git commit -m "feat(planilla-choferes): agregar Aguas y Gaseosas y Km zona 1,20 a Tramo"
```

---

### Task 4: Pantalla "Liquidación mensual" (Sueldos)

**Files:**
- Create: `web/src/pages/sueldos/LiquidacionChoferesSub.tsx`
- Modify: `web/src/pages/sueldos/SueldosPage.tsx`

**Interfaces:**
- Consumes: `choferes` (con `expand: 'legajo,legajo.categoria'`), `tramos` (filtrados por `chofer` + `mes`), `sueldos_tarifas_viaje`, `fichadas_feriados`, tipos `Chofer`, `FichadasLegajo`, `FichadasCategoria`, `Tramo`, `SueldosTarifaViaje`, `FichadasFeriado` (todos ya en `web/src/types.ts`).
- Produces: pestaña nueva en `SueldosPage.tsx`.

- [ ] **Step 1: Agregar `legajo` y `expand` al tipo `Chofer`**

`Chofer` en `web/src/types.ts` (líneas 9-13) todavía no tiene el campo `legajo` que agregó la Task 1 ni una `expand`. Reemplazar:

```typescript
export interface Chofer extends BaseRecord {
  nombre: string;
  localidad?: string;
  activo: boolean;
}
```

por:

```typescript
export interface Chofer extends BaseRecord {
  nombre: string;
  localidad?: string;
  activo: boolean;
  legajo?: string;
  expand?: { legajo?: FichadasLegajo };
}
```

(`FichadasLegajo` ya está definido en el mismo archivo, no hace falta importarlo.) `FichadasLegajo` a su vez ya tiene `expand?: { ...; categoria?: FichadasCategoria }` desde antes (línea 297) — el expand anidado `'legajo.categoria'` que usa esta pantalla llega ahí sin tocar nada más.

- [ ] **Step 2: Crear `LiquidacionChoferesSub.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react';
import { pb } from '../../lib/pb';
import { useToast } from '../../lib/ToastContext';
import { NOMBRES_MESES } from '../../lib/format';
import type { Chofer, Tramo, SueldosTarifaViaje, FichadasFeriado } from '../../types';

const NOMBRE_TARIFA_KM = 'Kilometros recorridos (por km)';
const NOMBRE_TARIFA_KM120 = 'Kilometros zona 1,20 (por km)';
const NOMBRE_TARIFA_PERM_REMUN = 'Permanencia remunerativa (por dia y persona)';
const NOMBRE_TARIFA_PERM_VIAT = 'Permanencia viaticos (por dia y persona)';
const NOMBRE_TARIFA_CRUCE = 'Cruce de frontera (por cada cruce)';
const NOMBRE_TARIFA_AGUAS = 'Aguas y Gaseosas (FALTA CONFIRMAR VALOR)';
const NOMBRE_TARIFA_FERIADOS = 'Feriados (FALTA CONFIRMAR VALOR)';

interface ItemVariable {
  concepto: string;
  cantidad: number;
  tarifa: number | null; // null = tarifa no encontrada por nombre
  monto: number;
}

interface Resultado {
  basico: number;
  categoriaNombre: string;
  items: ItemVariable[];
  cydManual: number;
  variable: number;
  bruto: number;
  descuentos: { label: string; pct: number; monto: number }[];
  totalDescuentos: number;
  neto: number;
}

export function LiquidacionChoferesSub() {
  const toast = useToast();
  const now = useRef(new Date());
  const [choferes, setChoferes] = useState<Chofer[]>([]);
  const [choferId, setChoferId] = useState('');
  const [anio, setAnio] = useState(String(now.current.getFullYear()));
  const [mes, setMes] = useState(String(now.current.getMonth() + 1).padStart(2, '0'));
  const [calculando, setCalculando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [aviso, setAviso] = useState('');

  useEffect(() => {
    pb.collection('choferes').getFullList<Chofer>({ filter: 'activo = true', sort: 'nombre' })
      .then(setChoferes)
      .catch((e) => toast('No se pudieron cargar los choferes: ' + (e instanceof Error ? e.message : ''), 'err'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function calcular() {
    if (!choferId) { toast('Elegí un chofer.', 'warn'); return; }
    setCalculando(true);
    setResultado(null);
    setAviso('');
    try {
      const mesStr = anio + '-' + mes;
      const chofer = await pb.collection('choferes').getOne<Chofer>(choferId, { expand: 'legajo,legajo.categoria' });
      const legajo = chofer.expand?.legajo;
      if (!legajo) { setAviso('Este chofer todavía no tiene un legajo vinculado (Administración → Choferes).'); return; }
      const categoria = legajo.expand?.categoria;
      if (!legajo.basico) { setAviso('El legajo vinculado no tiene un básico cargado (Personal → Empleados).'); return; }
      if (!categoria) { setAviso('El legajo vinculado no tiene una categoría de convenio asignada (Personal → Empleados).'); return; }

      const [tarifas, feriados, tramos] = await Promise.all([
        pb.collection('sueldos_tarifas_viaje').getFullList<SueldosTarifaViaje>(),
        pb.collection('fichadas_feriados').getFullList<FichadasFeriado>(),
        pb.collection('tramos').getFullList<Tramo>({ filter: pb.filter('chofer = {:chofer} && mes = {:mes}', { chofer: choferId, mes: mesStr }) }),
      ]);

      const tarifaPorNombre = new Map(tarifas.map((t) => [t.nombre, t.valor]));
      const fechasFeriado = new Set(feriados.map((f) => f.fecha));

      const sumar = (campo: 'km_recorridos' | 'km_alargue' | 'km_zona_120' | 'permanencia' | 'cruce_frontera' | 'cyd_manual') =>
        tramos.reduce((acc, t) => acc + (t[campo] || 0), 0);

      const kmTotal = sumar('km_recorridos') + sumar('km_alargue');
      const km120Total = sumar('km_zona_120');
      const permanenciaTotal = sumar('permanencia');
      const cruceTotal = sumar('cruce_frontera');
      const aguasGaseosasCant = tramos.filter((t) => t.es_aguas_gaseosas).length;
      const feriadosCant = tramos.filter((t) => fechasFeriado.has(t.dia_salida)).length;
      const cydManual = sumar('cyd_manual');

      function item(concepto: string, cantidad: number, nombreTarifa: string): ItemVariable {
        const tarifa = tarifaPorNombre.has(nombreTarifa) ? tarifaPorNombre.get(nombreTarifa)! : null;
        return { concepto, cantidad, tarifa, monto: tarifa !== null ? cantidad * tarifa : 0 };
      }

      const items: ItemVariable[] = [
        item('Kilómetros recorridos', kmTotal, NOMBRE_TARIFA_KM),
        item('Kilómetros zona 1,20', km120Total, NOMBRE_TARIFA_KM120),
        item('Permanencia (remunerativa)', permanenciaTotal, NOMBRE_TARIFA_PERM_REMUN),
        item('Permanencia (viáticos)', permanenciaTotal, NOMBRE_TARIFA_PERM_VIAT),
        item('Cruce de frontera', cruceTotal, NOMBRE_TARIFA_CRUCE),
        item('Aguas y Gaseosas', aguasGaseosasCant, NOMBRE_TARIFA_AGUAS),
        item('Feriados trabajados', feriadosCant, NOMBRE_TARIFA_FERIADOS),
      ];
      const tarifasFaltantes = items.filter((i) => i.tarifa === null).map((i) => i.concepto);
      if (tarifasFaltantes.length) {
        toast('No se encontró la tarifa de: ' + tarifasFaltantes.join(', ') + ' (revisá los nombres en Sueldos → Tarifas de viaje).', 'warn');
      }

      const variable = items.reduce((acc, i) => acc + i.monto, 0) + cydManual;
      const basico = legajo.basico;
      const bruto = basico + variable;

      const descuentosDef: { label: string; pct: number }[] = [
        { label: 'Jubilación', pct: categoria.pct_jubilacion },
        { label: 'Ley 19032', pct: categoria.pct_ley19032 },
        { label: 'Obra Social', pct: categoria.pct_obra_social },
        { label: 'ANSSAL', pct: categoria.pct_ansal },
        { label: 'Cuota Sindical', pct: categoria.pct_cuota_sindical },
        { label: 'Seguro de Sepelio', pct: categoria.pct_seguro_sepelio },
      ];
      const descuentos = descuentosDef.map((d) => ({ ...d, monto: bruto * (d.pct / 100) }));
      const totalDescuentos = descuentos.reduce((acc, d) => acc + d.monto, 0);
      const neto = bruto - totalDescuentos;

      setResultado({ basico, categoriaNombre: categoria.nombre, items, cydManual, variable, bruto, descuentos, totalDescuentos, neto });
    } catch (e) {
      toast('No se pudo calcular la liquidación: ' + (e instanceof Error ? e.message : ''), 'err');
    } finally {
      setCalculando(false);
    }
  }

  return (
    <div className="card">
      <div className="hint">
        Básico + variable (km, permanencia, cruce de frontera, Aguas y Gaseosas, feriados trabajados, CyD manual) − descuentos = neto.
        No incluye antigüedad todavía.
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <div className="field" style={{ minWidth: 220 }}>
          <label>Chofer</label>
          <select value={choferId} onChange={(e) => setChoferId(e.target.value)}>
            <option value="">— elegir —</option>
            {choferes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Mes</label>
          <select value={mes} onChange={(e) => setMes(e.target.value)}>
            {NOMBRES_MESES.map((label, i) => <option key={label} value={String(i + 1).padStart(2, '0')}>{label}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Año</label>
          <input type="number" value={anio} onChange={(e) => setAnio(e.target.value)} style={{ width: 90 }} />
        </div>
        <button onClick={calcular} disabled={calculando || !choferId}>{calculando ? 'Calculando…' : 'Calcular'}</button>
      </div>

      {aviso && <div className="hint" style={{ marginTop: 14, color: 'var(--warn)' }}>{aviso}</div>}

      {resultado && (
        <div style={{ marginTop: 16 }}>
          <div className="summary-grid summary-grid-compact" style={{ marginBottom: 14 }}>
            <div className="stat"><div className="lbl">Básico ({resultado.categoriaNombre})</div><div className="val">{resultado.basico.toLocaleString('es-AR')}</div></div>
            <div className="stat"><div className="lbl">Variable</div><div className="val">{resultado.variable.toLocaleString('es-AR')}</div></div>
            <div className="stat"><div className="lbl">Bruto</div><div className="val">{resultado.bruto.toLocaleString('es-AR')}</div></div>
            <div className="stat"><div className="lbl">Neto</div><div className="val">{resultado.neto.toLocaleString('es-AR')}</div></div>
          </div>

          <h3 style={{ fontSize: 13, color: 'var(--navy)' }}>Variable del mes</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Concepto</th><th className="num">Cantidad</th><th className="num">Tarifa</th><th className="num">Monto</th></tr></thead>
              <tbody>
                {resultado.items.map((i) => (
                  <tr key={i.concepto}>
                    <td>{i.concepto}</td>
                    <td className="num">{i.cantidad.toLocaleString('es-AR')}</td>
                    <td className="num">{i.tarifa !== null ? i.tarifa.toLocaleString('es-AR') : 'Sin tarifa'}</td>
                    <td className="num">{i.monto.toLocaleString('es-AR')}</td>
                  </tr>
                ))}
                <tr><td>CyD manual (ya cargado por tramo)</td><td></td><td></td><td className="num">{resultado.cydManual.toLocaleString('es-AR')}</td></tr>
              </tbody>
            </table>
          </div>

          <h3 style={{ fontSize: 13, color: 'var(--navy)', marginTop: 14 }}>Descuentos</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Concepto</th><th className="num">%</th><th className="num">Monto</th></tr></thead>
              <tbody>
                {resultado.descuentos.map((d) => (
                  <tr key={d.label}>
                    <td>{d.label}</td>
                    <td className="num">{d.pct}%</td>
                    <td className="num">{d.monto.toLocaleString('es-AR')}</td>
                  </tr>
                ))}
                <tr><td><strong>Total descuentos</strong></td><td></td><td className="num"><strong>{resultado.totalDescuentos.toLocaleString('es-AR')}</strong></td></tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Conectar la pestaña en `SueldosPage.tsx`**

En `web/src/pages/sueldos/SueldosPage.tsx`:

```tsx
import { useState } from 'react';
import { CategoriasSub } from './CategoriasSub';
import { TarifasViajeSub } from './TarifasViajeSub';
import { LiquidacionChoferesSub } from './LiquidacionChoferesSub';

type Vista = 'categorias' | 'tarifas' | 'liquidacion';

export function SueldosPage() {
  const [vista, setVista] = useState<Vista>('categorias');

  return (
    <main>
      <div className="card">
        <h2 style={{ margin: 0 }}>Sueldos</h2>
        <div className="hint">Categorías de convenio, tarifas de viaje y liquidación mensual de choferes.</div>
        <div className="row" style={{ marginTop: 14 }}>
          <button type="button" className={vista === 'categorias' ? 'small' : 'small secondary'} onClick={() => setVista('categorias')}>Categorías de convenio</button>
          <button type="button" className={vista === 'tarifas' ? 'small' : 'small secondary'} onClick={() => setVista('tarifas')}>Tarifas de viaje</button>
          <button type="button" className={vista === 'liquidacion' ? 'small' : 'small secondary'} onClick={() => setVista('liquidacion')}>Liquidación mensual</button>
        </div>
      </div>

      {vista === 'categorias' && <CategoriasSub />}
      {vista === 'tarifas' && <TarifasViajeSub />}
      {vista === 'liquidacion' && <LiquidacionChoferesSub />}
    </main>
  );
}
```

- [ ] **Step 4: Build**

```bash
cd web && npm run build
```
Expected: limpio.

- [ ] **Step 5: Verificación manual con datos reales (staging)**

Elegir un chofer con legajo vinculado (Task 2) y básico/categoría cargados, y un mes con tramos reales. Confirmar que "Calcular" muestra básico, cada ítem del variable con su cantidad/tarifa/monto, bruto, los 6 descuentos y el neto. Hacer la cuenta a mano para 1 chofer de un mes chico (pocos tramos) y confirmar que el número final coincide. Probar también un chofer SIN legajo vinculado y confirmar que aparece el aviso correspondiente en vez de calcular con básico 0.

- [ ] **Step 6: Commit**

```bash
git add web/src/pages/sueldos/LiquidacionChoferesSub.tsx web/src/pages/sueldos/SueldosPage.tsx web/src/types.ts
git commit -m "feat(sueldos): pantalla de liquidacion mensual de choferes"
```

## Self-Review

**1. Cobertura del spec:** vínculo choferes↔legajo con auto-match ✅ (Task 1), campos nuevos de Tramo ✅ (Task 1 + 3), feriados derivados de `fichadas_feriados` sin campo nuevo ✅ (Task 4), `cyd_manual` sumado sin multiplicar ✅ (Task 4), fórmula completa básico+variable−descuentos=neto ✅ (Task 4), antigüedad explícitamente excluida ✅ (nota en pantalla), permisos de lectura cruzada para `sueldos` ✅ (Task 1), columna Legajo editable ✅ (Task 2).

**2. Placeholders:** ninguno.

**3. Consistencia de tipos:** `Resultado`/`ItemVariable` se definen y usan una sola vez en `LiquidacionChoferesSub.tsx`; `ColumnDef` ampliado en Task 2 se usa igual en `ChoferesTab.tsx`; nombres de tarifas (`NOMBRE_TARIFA_*`) coinciden carácter por carácter con los nombres sembrados en `pb_migrations/1789480000_sueldos_categorias_tarifas.js`.

## Ejecución

Plan completo y guardado en `docs/superpowers/plans/2026-11-13-liquidacion-sueldos-choferes.md`.

**1. Subagent-Driven (recomendado)** - despacho un subagente por tarea, reviso entre tareas.

**2. Inline Execution** - lo ejecuto yo mismo en esta sesión.

¿Cuál preferís?
