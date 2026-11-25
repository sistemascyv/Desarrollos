# Choferes vinculados a Personal + Planificación de Vacaciones Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (A) Todo chofer queda siempre vinculado a un legajo de Personal, con su `activo` sincronizado automáticamente desde el estado real de ese legajo — el alta/baja de un chofer pasa a manejarse 100% en Personal. (B) Nueva pestaña "Planificación" en Vacaciones: un cuadro día por día (Administrativos / Choferes) de quién está de vacaciones, con una nota operativa editable por día, igual que la "PLANILLA DE COMUNICADOS" que armaba RRHH a mano.

**Architecture:** (A) Migración de backfill por nombre (reintenta vincular cualquier chofer sin legajo) + dos hooks de PocketBase que mantienen `choferes.activo` como espejo del `estado` del legajo vinculado, en ambas direcciones. (B) Colección nueva `fichadas_vacaciones_notas` (una nota de texto por día+grupo) + un componente nuevo que deriva el cuadro día por día de `fichadas_vacaciones` ya existente, sin ningún cálculo nuevo de solapamiento/antigüedad.

**Tech Stack:** PocketBase 0.22 (migraciones JS a mano + pb_hooks JSVM), React 19 + TypeScript + Vite, sin tests automatizados de frontend.

## Global Constraints

- Specs completos: `docs/superpowers/specs/2026-11-25-choferes-vinculo-legajo-design.md` y `docs/superpowers/specs/2026-11-25-vacaciones-planificacion-design.md` — leerlos antes de empezar.
- Sin tests automatizados de frontend — cada tarea termina con `cd web && npm run build` limpio + verificación manual paso a paso.
- Migraciones de PocketBase a mano en `pb_migrations/*.js`, patrón Dao/Collection/Record. Próximos timestamps libres: `1789550000` y `1789560000`.
- `choferes` ya tiene `listRule`/`viewRule` vacíos (lectura pública, sin restricción) desde su creación — no hace falta ninguna migración de permisos para leer `choferes` desde Vacaciones.
- No se prorratea ni se inventa ningún número de plata en ninguna tarea de este plan.

---

### Task 1: Migración de backfill — vincular choferes sin legajo por nombre

**Files:**
- Create: `pb_migrations/1789550000_choferes_backfill_legajo.js`

**Interfaces:**
- No produce ninguna interfaz nueva de código — solo completa el campo `legajo` (ya existente en `choferes`, agregado en `1789490000_liquidacion_choferes.js`) para los registros que todavía lo tengan vacío.

- [ ] **Step 1: Crear la migración**

```js
/// <reference path="../pb_data/types.d.ts" />
// Choferes vinculados a Personal (ver
// docs/superpowers/specs/2026-11-25-choferes-vinculo-legajo-design.md).
// Reintenta vincular por nombre cualquier chofer que todavía tenga
// `legajo` vacío -- mismo criterio normalizarNombre ya usado en
// 1789360000/1789370000/1789490000. Solo toca choferes sin legajo, y
// solo contra legajos que ningún otro chofer tenga ya vinculado -- no
// pisa ningún vínculo ya hecho a mano. Los que no matcheen quedan para
// vincular a mano desde Administración → Choferes (el selector de
// Legajo ya existe hoy).
function normalizarNombre(nombre) {
  return (nombre || '').toUpperCase()
    .replace(/[ÁÀÂÄ]/g, 'A').replace(/[ÉÈÊË]/g, 'E').replace(/[ÍÌÎÏ]/g, 'I')
    .replace(/[ÓÒÔÖ]/g, 'O').replace(/[ÚÙÛÜ]/g, 'U').replace(/Ñ/g, 'N')
    .replace(/[,.]/g, ' ').replace(/\s+/g, ' ').trim()
    .split(' ').filter(Boolean).sort().join(' ');
}
migrate((db) => {
  const dao = new Dao(db);
  const choferesCol = dao.findCollectionByNameOrId('choferes');
  const legajosCol = dao.findCollectionByNameOrId('fichadas_legajos');

  let choferesSinLegajo = [];
  try { choferesSinLegajo = dao.findRecordsByFilter(choferesCol.id, "legajo = ''", '', 500, 0); } catch (e) { /* ninguno */ }

  let choferesConLegajo = [];
  try { choferesConLegajo = dao.findRecordsByFilter(choferesCol.id, "legajo != ''", '', 500, 0); } catch (e) { /* ninguno */ }
  const legajosYaVinculados = new Set(choferesConLegajo.map((c) => c.get('legajo')));

  const todosLosLegajos = dao.findRecordsByFilter(legajosCol.id, "id != ''", '', 2000, 0);
  const legajoPorNombre = new Map();
  todosLosLegajos.forEach((l) => {
    const key = normalizarNombre(l.get('nombre'));
    if (!legajoPorNombre.has(key)) legajoPorNombre.set(key, []);
    legajoPorNombre.get(key).push(l);
  });

  let vinculados = 0, sinMatch = 0;
  choferesSinLegajo.forEach((c) => {
    const key = normalizarNombre(c.get('nombre'));
    const candidatos = (legajoPorNombre.get(key) || []).filter((l) => !legajosYaVinculados.has(l.id));
    if (candidatos.length !== 1) { sinMatch++; return; }
    c.set('legajo', candidatos[0].id);
    dao.saveRecord(c);
    legajosYaVinculados.add(candidatos[0].id);
    vinculados++;
  });
  console.log('choferes_backfill_legajo: ' + vinculados + ' vinculados por nombre, ' + sinMatch + ' sin match (quedan para vincular a mano en Administración → Choferes).');

  return null;
}, (db) => {
  // No se revierte: volver a dejar `legajo` en blanco perdería el vínculo
  // real recuperado, sin ningún beneficio (mismo criterio que
  // 1789180000_backfill_fecha_alta_desde_cintia.js y
  // 1789360000_backfill_fecha_alta_desde_ingreso.js).
  return null;
})
```

- [ ] **Step 2: Build**

Run: `cd web && npm run build`
Expected: compila limpio (esta tarea no toca TypeScript, el build solo confirma que nada más se rompió).

- [ ] **Step 3: Verificar en vivo**

Levantar una instancia de PocketBase de prueba (copiar `pb_migrations/` y `pb_hooks/` actuales), correr `migrate up`, y si hay datos reales de prueba disponibles (de sesiones anteriores) confirmar con sqlite que los `choferes` con nombre coincidente a un `fichadas_legajos` sin vincular quedaron con `legajo` completado, y que los que ya tenían legajo no se tocaron.

- [ ] **Step 4: Commit**

```bash
git add pb_migrations/1789550000_choferes_backfill_legajo.js
git commit -m "feat(choferes): backfill de vinculo legajo por nombre"
```

---

### Task 2: pb_hooks — sincronizar `choferes.activo` con el estado del legajo vinculado

**Files:**
- Modify: `pb_hooks/fichadas.pb.js`

**Interfaces:**
- No produce ninguna interfaz de código nueva — es lógica de backend transparente para el frontend (Task 3 depende de que esto exista para que ocultar el toggle manual tenga sentido).

- [ ] **Step 1: Agregar los dos hooks al final de `pb_hooks/fichadas.pb.js`**

Agregar, después del hook `onRecordBeforeUpdateRequest` existente sobre `"fichadas_legajos"` (línea 26-28) y antes del `routerAdd`:

```js
// Choferes vinculados a Personal (ver
// docs/superpowers/specs/2026-11-25-choferes-vinculo-legajo-design.md): el
// "activo" de un chofer deja de ser un dato propio y pasa a ser un espejo
// del estado del legajo vinculado -- un solo lugar (Personal) para dar de
// alta/baja. Dos direcciones:
// 1) cuando se actualiza un legajo, empuja su estado al chofer vinculado
//    (si hay uno) -- se calcula directo desde fecha_baja, no desde
//    e.record.get("estado"), para no depender del orden en que corran los
//    hooks de "fichadas_legajos" entre sí.
// 2) cuando se crea/edita un chofer (por ej. al vincularlo a un legajo por
//    primera vez, o al cambiarle el legajo), trae el estado actual de ESE
//    legajo -- así vincular o revincular refleja la realidad al instante,
//    y de paso es defensa en profundidad por si alguien edita "activo" a
//    mano por la API sin pasar por la UI.
// Un chofer sin legajo vinculado no se toca en ningún lado -- queda con su
// activo manual (caso legado, ver spec).
onRecordBeforeUpdateRequest((e) => {
  try {
    const dao = $app.dao();
    const chofer = dao.findFirstRecordByFilter("choferes", "legajo = {:legajo}", { legajo: e.record.id });
    const estadoNuevo = !e.record.get("fecha_baja");
    if (chofer.get("activo") !== estadoNuevo) {
      chofer.set("activo", estadoNuevo);
      dao.saveRecord(chofer);
    }
  } catch (err) { /* ningún chofer vinculado a este legajo */ }
}, "fichadas_legajos");

function sincronizarActivoDesdeLegajo(e) {
  const legajoId = e.record.get("legajo");
  if (!legajoId) return;
  try {
    const dao = $app.dao();
    const legajo = dao.findRecordById("fichadas_legajos", legajoId);
    e.record.set("activo", !!legajo.get("estado"));
  } catch (err) { /* legajo no encontrado */ }
}
onRecordBeforeCreateRequest(sincronizarActivoDesdeLegajo, "choferes");
onRecordBeforeUpdateRequest(sincronizarActivoDesdeLegajo, "choferes");
```

- [ ] **Step 2: Build**

Run: `cd web && npm run build`
Expected: compila limpio (este archivo no es TypeScript, el build solo confirma que nada del frontend se rompió).

- [ ] **Step 3: Verificar en vivo contra PocketBase de prueba**

Con una instancia de prueba corriendo (copiar `pb_hooks/` actual): crear un legajo de prueba con `estado=true`, crear un chofer vinculado a ese legajo (confirmar que `activo` queda `true` solo), después actualizar el legajo con `fecha_baja` cargada (confirmar que el chofer vinculado pasa a `activo=false` sin tocarlo directamente), y confirmar que un chofer SIN legajo vinculado no se ve afectado por ningún update de legajos.

- [ ] **Step 4: Commit**

```bash
git add pb_hooks/fichadas.pb.js
git commit -m "feat(choferes): sincronizar activo con el estado del legajo vinculado"
```

---

### Task 3: `ChoferesTab.tsx` — exigir legajo al crear, ocultar el toggle manual de activo

**Files:**
- Modify: `web/src/pages/admin/AdminSimpleTab.tsx`
- Modify: `web/src/pages/admin/ChoferesTab.tsx`

**Interfaces:**
- Consumes: nada nuevo de tareas anteriores (es un cambio de UI puro).
- Produces: prop nueva `activoReadOnly?: boolean` en `AdminSimpleTab<T>` — si otra pantalla de Administración necesitara el mismo patrón después, ya queda disponible.

- [ ] **Step 1: `AdminSimpleTab.tsx` — agregar el prop `activoReadOnly`**

En la interfaz `Props<T>` (línea 15-23), agregar:

```tsx
interface Props<T extends BaseRecord & { activo: boolean }> {
  title: string;
  collection: string;
  columns: ColumnDef<T>[];
  searchFields: (keyof T)[];
  form: ReactNode;
  version: number;
  onChanged: () => void;
  activoReadOnly?: boolean; // si true, no se puede Desactivar/Reactivar a mano (el activo lo controla otro lado, ej. un legajo vinculado)
}
```

En la firma de la función (línea 27-29), agregar el default:

```tsx
export function AdminSimpleTab<T extends BaseRecord & { activo: boolean }>({
  title, collection, columns, searchFields, form, version, onChanged, activoReadOnly = false,
}: Props<T>) {
```

En la celda de acciones (línea 187-199), envolver el botón de Desactivar/Reactivar:

```tsx
<td className="actions-cell">
  {editing ? (
    <>
      <button className="small" onClick={() => saveEdit(item.id)}>Guardar</button>
      <button className="small secondary" onClick={() => setEditingId(null)}>Cancelar</button>
    </>
  ) : (
    <>
      <button className="small secondary" onClick={() => startEdit(item)}>Editar</button>
      {!activoReadOnly && (
        <button className="small secondary" onClick={() => toggleActivo(item.id, !inactivo)}>{inactivo ? 'Reactivar' : 'Desactivar'}</button>
      )}
      <button className="small danger" onClick={() => remove(item.id)}>Borrar</button>
    </>
  )}
</td>
```

- [ ] **Step 2: `ChoferesTab.tsx` completo (reemplazar el archivo entero)**

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
  const [legajoCreando, setLegajoCreando] = useState('');
  const [legajos, setLegajos] = useState<FichadasLegajo[]>([]);
  const [choferes, setChoferes] = useState<Chofer[]>([]);

  useEffect(() => {
    Promise.all([
      pb.collection('fichadas_legajos').getFullList<FichadasLegajo>({ sort: 'nombre' }),
      pb.collection('choferes').getFullList<Chofer>(),
    ]).then(([l, c]) => { setLegajos(l); setChoferes(c); })
      .catch((e) => toast('No se pudieron cargar los legajos: ' + (e instanceof Error ? e.message : ''), 'err'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  const legajoPorId = new Map(legajos.map((l) => [l.id, l]));
  const legajosOcupados = new Set(choferes.map((c) => c.legajo).filter(Boolean));
  const legajosLibres = legajos.filter((l) => !legajosOcupados.has(l.id));

  async function create() {
    if (!nombre.trim()) { toast('Falta el nombre.', 'warn'); return; }
    if (!legajoCreando) { toast('Elegí un legajo de Personal para vincular (si no existe todavía, creálo primero en Personal → Empleados).', 'warn'); return; }
    try {
      await pb.collection('choferes').create({ nombre: nombre.trim(), localidad: localidad.trim(), activo: true, legajo: legajoCreando });
      setNombre('');
      setLocalidad('');
      setLegajoCreando('');
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
      activoReadOnly
      columns={[
        { field: 'nombre', label: 'Nombre' },
        { field: 'localidad', label: 'Localidad' },
        {
          field: 'legajo', label: 'Legajo', type: 'select',
          options: legajos.map((l) => ({ value: l.id, label: l.nombre + (l.nro_legajo ? ' (' + l.nro_legajo + ')' : '') })),
          render: (v) => { const l = legajoPorId.get(String(v || '')); return l ? l.nombre : '⚠ Sin legajo vinculado'; },
        },
      ]}
      searchFields={['nombre', 'localidad']}
      version={version}
      onChanged={onChanged}
      form={
        <div className="row">
          <div className="field" style={{ flex: 1 }}><label>Nombre</label><input value={nombre} onChange={(e) => setNombre(e.target.value)} /></div>
          <div className="field"><label>Localidad</label><input value={localidad} onChange={(e) => setLocalidad(e.target.value)} /></div>
          <div className="field" style={{ flex: 1 }}>
            <label>Legajo (Personal)</label>
            <select value={legajoCreando} onChange={(e) => setLegajoCreando(e.target.value)}>
              <option value="">Elegir…</option>
              {legajosLibres.map((l) => <option key={l.id} value={l.id}>{l.nombre}{l.nro_legajo ? ' (' + l.nro_legajo + ')' : ''}</option>)}
            </select>
          </div>
          <button onClick={create}>+ Agregar</button>
        </div>
      }
    />
  );
}
```

Nota: el selector de "Legajo" DENTRO de la fila editable (columna `legajo` de `AdminSimpleTab`, para corregir el vínculo de un chofer ya existente) sigue mostrando TODOS los legajos, sin filtrar por "libres" — el filtrado a libres solo aplica al crear uno nuevo (alcance del spec). Si se quisiera filtrar ahí también haría falta que `AdminSimpleTab` soporte opciones de columna distintas por fila, que hoy no soporta — no se agrega en este plan.

- [ ] **Step 3: Build**

Run: `cd web && npm run build`
Expected: compila limpio.

- [ ] **Step 4: Verificación manual**

Contra la instancia de prueba, en Administración → Choferes: confirmar que "+ Agregar" sin elegir legajo bloquea con el aviso; que el selector de legajo al crear solo lista los que no están vinculados a otro chofer; que un chofer sin legajo (si lo hay) muestra "⚠ Sin legajo vinculado" en la columna; y que la fila de un chofer YA NO tiene botón "Desactivar"/"Reactivar" (el Estado se sigue viendo, pero ya no se edita a mano ahí).

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/admin/AdminSimpleTab.tsx web/src/pages/admin/ChoferesTab.tsx
git commit -m "feat(choferes): exigir legajo vinculado al crear, ocultar toggle manual de activo"
```

---

### Task 4: Colección `fichadas_vacaciones_notas` + tipo TypeScript

**Files:**
- Create: `pb_migrations/1789560000_fichadas_vacaciones_notas.js`
- Modify: `web/src/types.ts` (agregar `FichadasVacacionNota`, después de `FichadasGrupoRestriccion`, línea ~354)

**Interfaces:**
- Produce: colección PocketBase `fichadas_vacaciones_notas` (campos `fecha`, `grupo`, `texto`) y tipo `FichadasVacacionNota` — usados por la Tarea 5.

- [ ] **Step 1: Crear la migración**

```js
/// <reference path="../pb_data/types.d.ts" />
// Planificación de vacaciones (ver
// docs/superpowers/specs/2026-11-25-vacaciones-planificacion-design.md):
// notas operativas libres por día+grupo para el cuadro de planificación,
// equivalente a la columna de comentarios de "PLANILLA DE COMUNICADOS"
// (LIC-CHOF.xls, hoja "DETALLE 2026 (3)"). No se liga a ningún legajo
// puntual -- es una nota del día en general (ej: "2 abiertos 2 furgones").
migrate((db) => {
  const dao = new Dao(db);
  dao.saveCollection(new Collection({
    "id": "fvn0notas001",
    "name": "fichadas_vacaciones_notas",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false, "id": "fvn0fecha0001", "name": "fecha", "type": "text",
        "required": true, "presentable": true, "unique": false,
        "options": { "min": 10, "max": 10, "pattern": "" }
      },
      {
        "system": false, "id": "fvn0grupo0001", "name": "grupo", "type": "select",
        "required": true, "presentable": true, "unique": false,
        "options": { "maxSelect": 1, "values": ["administrativos", "choferes"] }
      },
      {
        "system": false, "id": "fvn0texto0001", "name": "texto", "type": "text",
        "required": true, "presentable": false, "unique": false,
        "options": { "min": null, "max": null, "pattern": "" }
      }
    ],
    "indexes": [],
    "listRule": "@request.auth.id != \"\" && (@request.auth.rol = \"admin\" || @request.auth.modulos ~ \"vacaciones\")",
    "viewRule": "@request.auth.id != \"\" && (@request.auth.rol = \"admin\" || @request.auth.modulos ~ \"vacaciones\")",
    "createRule": "@request.auth.id != \"\" && (@request.auth.rol = \"admin\" || @request.auth.modulos ~ \"vacaciones\")",
    "updateRule": "@request.auth.id != \"\" && (@request.auth.rol = \"admin\" || @request.auth.modulos ~ \"vacaciones\")",
    "deleteRule": "@request.auth.rol = \"admin\"",
    "options": {}
  }));
  return null;
}, (db) => {
  const dao = new Dao(db);
  try { dao.deleteCollection(dao.findCollectionByNameOrId('fichadas_vacaciones_notas')); } catch (e) { /* no existía */ }
  return null;
})
```

- [ ] **Step 2: Agregar el tipo en `web/src/types.ts`**

Agregar después de la interface `FichadasGrupoRestriccion`:

```ts
export interface FichadasVacacionNota extends BaseRecord {
  fecha: string; // "YYYY-MM-DD"
  grupo: 'administrativos' | 'choferes';
  texto: string;
}
```

- [ ] **Step 3: Build**

Run: `cd web && npm run build`
Expected: compila limpio.

- [ ] **Step 4: Verificar en vivo**

Contra PocketBase de prueba: confirmar que la migración aplica sin errores y la colección queda con los 3 campos y las reglas correctas (sqlite: `SELECT listRule, createRule FROM _collections WHERE name='fichadas_vacaciones_notas'`).

- [ ] **Step 5: Commit**

```bash
git add pb_migrations/1789560000_fichadas_vacaciones_notas.js web/src/types.ts
git commit -m "feat(vacaciones): coleccion fichadas_vacaciones_notas para planificacion"
```

---

### Task 5: `PlanificacionSub.tsx` (nuevo) + pestaña en `VacacionesPage.tsx`

**Files:**
- Create: `web/src/pages/vacaciones/PlanificacionSub.tsx`
- Modify: `web/src/pages/vacaciones/VacacionesPage.tsx`

**Interfaces:**
- Consumes: tipo `FichadasVacacionNota` y colección `fichadas_vacaciones_notas` (Task 4); tipos `Chofer`, `FichadasLegajo`, `FichadasVacacion` ya existentes.

- [ ] **Step 1: Crear `web/src/pages/vacaciones/PlanificacionSub.tsx`**

```tsx
import { useMemo, useState } from 'react';
import { pb } from '../../lib/pb';
import { useToast } from '../../lib/ToastContext';
import { isoDate } from '../../lib/format';
import type { Chofer, FichadasLegajo, FichadasVacacion, FichadasVacacionNota } from '../../types';

type Grupo = 'administrativos' | 'choferes';

function nombreDiaCorto(fecha: string): string {
  const [y, m, d] = fecha.split('-').map(Number);
  return ['DOM', 'LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB'][new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

function primerDiaDelMes(): string {
  const n = new Date();
  return isoDate(new Date(n.getFullYear(), n.getMonth(), 1));
}
function ultimoDiaDelMes(): string {
  const n = new Date();
  return isoDate(new Date(n.getFullYear(), n.getMonth() + 1, 0));
}

export function PlanificacionSub() {
  const toast = useToast();
  const [grupo, setGrupo] = useState<Grupo>('administrativos');
  const [desde, setDesde] = useState(primerDiaDelMes);
  const [hasta, setHasta] = useState(ultimoDiaDelMes);
  const [legajos, setLegajos] = useState<FichadasLegajo[]>([]);
  const [choferes, setChoferes] = useState<Chofer[]>([]);
  const [vacaciones, setVacaciones] = useState<FichadasVacacion[]>([]);
  const [notas, setNotas] = useState<FichadasVacacionNota[]>([]);
  const [cargando, setCargando] = useState(false);
  const [generado, setGenerado] = useState(false);
  const [editandoNota, setEditandoNota] = useState<string | null>(null);
  const [textoNota, setTextoNota] = useState('');

  async function generar() {
    if (!desde || !hasta) { toast('Elegí el rango de fechas.', 'warn'); return; }
    if (hasta < desde) { toast('"Hasta" no puede ser anterior a "Desde".', 'warn'); return; }
    setCargando(true);
    try {
      const [l, c, v, n] = await Promise.all([
        pb.collection('fichadas_legajos').getFullList<FichadasLegajo>({ filter: 'estado = true' }),
        pb.collection('choferes').getFullList<Chofer>({ filter: 'activo = true' }),
        pb.collection('fichadas_vacaciones').getFullList<FichadasVacacion>({ filter: pb.filter('desde <= {:h} && hasta >= {:d}', { d: desde, h: hasta }) }),
        pb.collection('fichadas_vacaciones_notas').getFullList<FichadasVacacionNota>({ filter: pb.filter('fecha >= {:d} && fecha <= {:h}', { d: desde, h: hasta }) }),
      ]);
      setLegajos(l); setChoferes(c); setVacaciones(v); setNotas(n);
      setGenerado(true);
    } catch (e) {
      toast('No se pudo generar el cuadro: ' + (e instanceof Error ? e.message : ''), 'err');
    } finally {
      setCargando(false);
    }
  }

  const legajosDeChofer = useMemo(() => new Set(choferes.map((c) => c.legajo).filter(Boolean)), [choferes]);
  const legajoPorId = useMemo(() => new Map(legajos.map((l) => [l.id, l])), [legajos]);
  const notaPorFecha = useMemo(() => new Map(notas.map((n) => [n.fecha, n])), [notas]);

  const idsDelGrupo = useMemo(() => {
    const filtrados = grupo === 'choferes'
      ? legajos.filter((l) => legajosDeChofer.has(l.id))
      : legajos.filter((l) => !legajosDeChofer.has(l.id));
    return new Set(filtrados.map((l) => l.id));
  }, [legajos, legajosDeChofer, grupo]);

  const dias = useMemo(() => {
    if (!generado) return [];
    const out: string[] = [];
    const finMs = new Date(hasta + 'T00:00:00Z').getTime();
    for (let cur = new Date(desde + 'T00:00:00Z').getTime(); cur <= finMs; cur += 86400000) {
      out.push(new Date(cur).toISOString().slice(0, 10));
    }
    return out;
  }, [generado, desde, hasta]);

  function nombresDelDia(fecha: string): string {
    const nombres = vacaciones
      .filter((v) => v.desde <= fecha && v.hasta >= fecha && idsDelGrupo.has(v.legajo))
      .map((v) => legajoPorId.get(v.legajo)?.nombre || '—');
    return nombres.length ? nombres.join(', ') : '—';
  }

  function abrirNota(fecha: string) {
    setEditandoNota(fecha);
    setTextoNota(notaPorFecha.get(fecha)?.texto || '');
  }

  async function guardarNota(fecha: string) {
    try {
      const existente = notaPorFecha.get(fecha);
      const texto = textoNota.trim();
      if (existente && !texto) {
        await pb.collection('fichadas_vacaciones_notas').delete(existente.id);
        setNotas((ns) => ns.filter((n) => n.id !== existente.id));
      } else if (existente) {
        await pb.collection('fichadas_vacaciones_notas').update(existente.id, { texto });
        setNotas((ns) => ns.map((n) => (n.id === existente.id ? { ...n, texto } : n)));
      } else if (texto) {
        const creada = await pb.collection('fichadas_vacaciones_notas').create<FichadasVacacionNota>({ fecha, grupo, texto });
        setNotas((ns) => [...ns, creada]);
      }
      setEditandoNota(null);
    } catch (e) {
      toast('No se pudo guardar la nota: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }

  return (
    <div className="card">
      <div className="hint">Cuadro día por día de quién está de vacaciones, armado con los períodos ya cargados en "Vacaciones" — agregá una nota operativa por día si hace falta, igual que la planilla de comunicados.</div>
      <div className="row" style={{ marginTop: 10 }}>
        <div className="field">
          <label>Ver</label>
          <select value={grupo} onChange={(e) => { setGrupo(e.target.value as Grupo); setGenerado(false); }}>
            <option value="administrativos">Administrativos</option>
            <option value="choferes">Choferes</option>
          </select>
        </div>
        <div className="field"><label>Desde</label><input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></div>
        <div className="field"><label>Hasta</label><input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></div>
        <button onClick={generar} disabled={cargando}>{cargando ? 'Generando…' : 'Generar'}</button>
      </div>

      {generado && (
        <div className="table-wrap" style={{ marginTop: 14 }}>
          <table>
            <thead><tr><th>Día</th><th>De vacaciones</th><th>Nota</th></tr></thead>
            <tbody>
              {dias.map((fecha) => (
                <tr key={fecha}>
                  <td>{nombreDiaCorto(fecha)} {fecha.split('-').reverse().join('/')}</td>
                  <td>{nombresDelDia(fecha)}</td>
                  <td>
                    {editandoNota === fecha ? (
                      <div className="row" style={{ gap: 6 }}>
                        <input value={textoNota} onChange={(e) => setTextoNota(e.target.value)} style={{ flex: 1 }} autoFocus />
                        <button className="small" onClick={() => guardarNota(fecha)}>Guardar</button>
                        <button className="small secondary" onClick={() => setEditandoNota(null)}>Cancelar</button>
                      </div>
                    ) : (
                      <span onClick={() => abrirNota(fecha)} style={{ cursor: 'pointer' }}>
                        {notaPorFecha.get(fecha)?.texto || <span style={{ color: 'var(--suave)' }}>+ agregar nota</span>}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Agregar la pestaña en `web/src/pages/vacaciones/VacacionesPage.tsx` (reemplazar el archivo entero)**

```tsx
import { useState } from 'react';
import { AsignarVacacionesSub } from './AsignarVacacionesSub';
import { PlanificacionSub } from './PlanificacionSub';
import { GruposRestriccionSub } from './GruposRestriccionSub';

type Vista = 'vacaciones' | 'planificacion' | 'grupos';

export function VacacionesPage() {
  const [vista, setVista] = useState<Vista>('vacaciones');

  return (
    <main>
      <div className="card">
        <h2 style={{ margin: 0 }}>Vacaciones</h2>
        <div className="hint">Días por antigüedad, asignación de períodos, liquidación, planificación y grupos de restricción — reemplaza los Excel de licencias que arma RRHH a mano.</div>
        <div className="row" style={{ marginTop: 14 }}>
          <button type="button" className={vista === 'vacaciones' ? 'small' : 'small secondary'} onClick={() => setVista('vacaciones')}>Vacaciones</button>
          <button type="button" className={vista === 'planificacion' ? 'small' : 'small secondary'} onClick={() => setVista('planificacion')}>Planificación</button>
          <button type="button" className={vista === 'grupos' ? 'small' : 'small secondary'} onClick={() => setVista('grupos')}>Grupos de restricción</button>
        </div>
      </div>

      {vista === 'vacaciones' && <AsignarVacacionesSub />}
      {vista === 'planificacion' && <PlanificacionSub />}
      {vista === 'grupos' && <GruposRestriccionSub />}
    </main>
  );
}
```

- [ ] **Step 3: Build**

Run: `cd web && npm run build`
Expected: compila limpio.

- [ ] **Step 4: Verificación manual**

Contra datos de prueba con al menos un administrativo y un chofer de vacaciones en fechas superpuestas: elegir "Ver: Administrativos", generar un rango que cubra esas fechas, confirmar que aparece el administrativo (no el chofer) en los días correspondientes; cambiar a "Ver: Choferes" y confirmar lo inverso. Escribir una nota en un día, confirmar que persiste al volver a generar el cuadro; vaciarla y confirmar que se borra (no queda una nota vacía guardada).

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/vacaciones/PlanificacionSub.tsx web/src/pages/vacaciones/VacacionesPage.tsx
git commit -m "feat(vacaciones): pestaña Planificación con cuadro dia por dia y notas"
```

---

## Self-Review

**Cobertura del spec A (choferes-vinculo-legajo):** backfill por nombre → Task 1. Crear chofer exige legajo libre → Task 3. Sincronización automática de `activo` en ambas direcciones → Task 2. Alta/baja sigue haciéndose en Personal (ya existe, sin cambios) → confirmado, no requiere tarea propia. Aviso visible de "sin legajo vinculado" → Task 3.

**Cobertura del spec B (vacaciones-planificacion):** colección de notas → Task 4. Pestaña Planificación con las 2 vistas (Administrativos/Choferes), rango de fechas, cuadro día por día derivado de `fichadas_vacaciones`, nota editable por día → Task 5.

**Placeholders:** ninguno — todo el código de cada paso está completo.

**Consistencia de tipos:** `FichadasVacacionNota` (Task 4) se usa con los mismos 3 campos (`fecha`, `grupo`, `texto`) en `PlanificacionSub.tsx` (Task 5). `activoReadOnly` (Task 3) tiene el mismo nombre y tipo en la interfaz `Props<T>` y en su uso en `ChoferesTab.tsx`.

---

## Execution Handoff

Plan completo y guardado en `docs/superpowers/plans/2026-11-25-choferes-vinculo-y-planificacion-vacaciones.md`. Dos opciones de ejecución:

**1. Subagent-Driven (recomendado)** — despacho un subagente nuevo por tarea, reviso entre tareas, iteración rápida.

**2. Inline Execution** — ejecuto las tareas en esta misma sesión con executing-plans, en bloque con checkpoints.

¿Cuál preferís?
