# Básico derivado de categoría + histórico de vigencia Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El básico de un legajo deja de ser texto libre y pasa a derivarse de la categoría de convenio asignada, con historial por rango de fechas (`vigencia_desde`/`vigencia_hasta`) — así toda liquidación de un período pasado usa el básico que regía en ESE período, no el actual.

**Architecture:** Colección nueva `sueldos_basico_historial` (un tramo de tiempo = un básico fijo, por legajo). Dos pantallas escriben tramos nuevos (Personal al cambiar la categoría de un legajo, Sueldos → Categorías al cambiar el "Básico sugerido" de una categoría completa, con cascada automática a todos sus legajos) a través de una función compartida `cambiarBasicoLegajo`. Tres pantallas de liquidación (Administrativos, Choferes, Vacaciones) dejan de leer `legajo.basico` y resuelven el básico vigente a la fecha del período con una función pura `basicoVigente`.

**Tech Stack:** PocketBase 0.22 (migraciones JS a mano, patrón Dao/Collection/Record), React 19 + TypeScript + Vite, sin tests automatizados de frontend.

## Global Constraints

- Sin tests automatizados de frontend — cada tarea termina con `cd web && npm run build` limpio + verificación manual paso a paso (no hay step de "test" tipo TDD clásico en este proyecto, es el patrón ya establecido en los planes anteriores de Sueldos).
- "No inventar números de plata": cuando falta un dato (`basico_sugerido` vacío, `basicoVigente` devuelve `null`), bloquear con aviso en vez de calcular con 0 o con un valor actual como fallback silencioso.
- Migraciones de PocketBase a mano en `pb_migrations/*.js`, patrón `Dao`/`Collection`/`Record`, inserciones/backfills idempotentes (`findFirstRecordByFilter` + `continue` si ya existe).
- El spec completo está en `docs/superpowers/specs/2026-11-18-basico-historial-vigencia-design.md` — leerlo antes de empezar cualquier tarea.
- No hay UI para editar o borrar un tramo de `sueldos_basico_historial` ya cargado (fuera de alcance, ver spec).
- No se prorratea el básico si un cambio cae a mitad de un período de liquidación (igual que hoy).

---

### Task 1: Colección `sueldos_basico_historial` + tipos + `basicoVigente`

**Files:**
- Create: `pb_migrations/1789520000_basico_historial_vigencia.js`
- Modify: `web/src/types.ts` (agregar `SueldosBasicoHistorial`, después de `SueldosTarifaViaje` en la línea 372)
- Modify: `web/src/pages/fichadas/motor.ts` (agregar `basicoVigente` al final del archivo, después de `calcularLiquidacionSueldoMensual`, línea 920; agregar `SueldosBasicoHistorial` al import de tipos de la línea 1)

**Interfaces:**
- Produce: `SueldosBasicoHistorial` (tipo, `web/src/types.ts`) — `{ legajo: string; categoria: string; basico: number; vigencia_desde: string; vigencia_hasta?: string }`, extiende `BaseRecord`.
- Produce: `basicoVigente(historial: SueldosBasicoHistorial[], legajoId: string, fecha: string): number | null` (función, `web/src/pages/fichadas/motor.ts`) — usada por Task 4.
- Produce: colección PocketBase `sueldos_basico_historial` (campos `legajo`, `categoria`, `basico`, `vigencia_desde`, `vigencia_hasta`) — usada por Task 2, 3 y 4.

- [ ] **Step 1: Crear la migración**

Crear `pb_migrations/1789520000_basico_historial_vigencia.js`:

```js
/// <reference path="../pb_data/types.d.ts" />
// Básico derivado de categoría + histórico de vigencia (ver
// docs/superpowers/specs/2026-11-18-basico-historial-vigencia-design.md).
// Colección nueva sueldos_basico_historial: un tramo de tiempo con un
// básico fijo por legajo (vigencia_hasta vacío = tramo vigente actual).
// Incluye el backfill: cada legajo que hoy ya tiene categoria+basico
// cargados recibe un tramo "vigente desde siempre" con el valor actual,
// para no perder nada y poder liquidar períodos pasados desde ya.
migrate((db) => {
  const dao = new Dao(db);

  dao.saveCollection(new Collection({
    "id": "sbh0historial1",
    "name": "sueldos_basico_historial",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false, "id": "sbh0legajo0001", "name": "legajo", "type": "relation",
        "required": true, "presentable": true, "unique": false,
        "options": { "collectionId": "fchd0legajos001", "cascadeDelete": true, "minSelect": null, "maxSelect": 1, "displayFields": ["nombre"] }
      },
      {
        "system": false, "id": "sbh0categoria1", "name": "categoria", "type": "relation",
        "required": true, "presentable": true, "unique": false,
        "options": { "collectionId": "fchd0categor01", "cascadeDelete": false, "minSelect": null, "maxSelect": 1, "displayFields": ["nombre"] }
      },
      {
        "system": false, "id": "sbh0basico0001", "name": "basico", "type": "number",
        "required": true, "presentable": true, "unique": false,
        "options": { "min": 0, "max": null, "noDecimal": false }
      },
      {
        "system": false, "id": "sbh0vigdesde01", "name": "vigencia_desde", "type": "text",
        "required": true, "presentable": true, "unique": false,
        "options": { "min": null, "max": null, "pattern": "" }
      },
      {
        "system": false, "id": "sbh0vighasta01", "name": "vigencia_hasta", "type": "text",
        "required": false, "presentable": true, "unique": false,
        "options": { "min": null, "max": null, "pattern": "" }
      }
    ],
    "indexes": [],
    "listRule": "@request.auth.id != \"\" && (@request.auth.rol = \"admin\" || @request.auth.modulos ~ \"vacaciones\" || @request.auth.modulos ~ \"fichadas\" || @request.auth.modulos ~ \"personal\" || @request.auth.modulos ~ \"sueldos\")",
    "viewRule": "@request.auth.id != \"\" && (@request.auth.rol = \"admin\" || @request.auth.modulos ~ \"vacaciones\" || @request.auth.modulos ~ \"fichadas\" || @request.auth.modulos ~ \"personal\" || @request.auth.modulos ~ \"sueldos\")",
    "createRule": "@request.auth.id != \"\" && (@request.auth.rol = \"admin\" || @request.auth.modulos ~ \"personal\" || @request.auth.modulos ~ \"sueldos\")",
    "updateRule": "@request.auth.id != \"\" && (@request.auth.rol = \"admin\" || @request.auth.modulos ~ \"personal\" || @request.auth.modulos ~ \"sueldos\")",
    "deleteRule": "@request.auth.rol = \"admin\"",
    "options": {}
  }));

  // --- Backfill: legajos con categoria+basico ya cargados reciben un tramo "vigente desde siempre" ---
  const historial = dao.findCollectionByNameOrId('sueldos_basico_historial');
  const legajosCol = dao.findCollectionByNameOrId('fichadas_legajos');
  let legajosConDatos = [];
  try { legajosConDatos = dao.findRecordsByFilter(legajosCol.id, "categoria != '' && basico > 0", '', 2000, 0); } catch (e) { /* ninguno */ }
  let creados = 0;
  for (const l of legajosConDatos) {
    let yaExiste = null;
    try { yaExiste = dao.findFirstRecordByFilter(historial.id, "legajo = {:legajo}", { legajo: l.id }); } catch (e) { /* no existe, seguimos */ }
    if (yaExiste) continue;
    const record = new Record(historial, {
      legajo: l.id,
      categoria: l.get('categoria'),
      basico: l.get('basico'),
      vigencia_desde: l.get('fecha_alta') || '2020-01-01',
      vigencia_hasta: '',
    });
    dao.saveRecord(record);
    creados++;
  }
  console.log('basico_historial_vigencia: ' + creados + ' tramos iniciales creados.');

  return null;
}, (db) => {
  const dao = new Dao(db);
  try { dao.deleteCollection(dao.findCollectionByNameOrId('sueldos_basico_historial')); } catch (e) { /* no existía */ }
  return null;
})
```

- [ ] **Step 2: Agregar el tipo en `web/src/types.ts`**

Agregar después de la interface `SueldosTarifaViaje` (línea 372, justo antes de `export interface ModuleDef {`):

```ts
export interface SueldosBasicoHistorial extends BaseRecord {
  legajo: string;
  categoria: string;
  basico: number;
  vigencia_desde: string; // "YYYY-MM-DD"
  vigencia_hasta?: string; // "YYYY-MM-DD", vacío = tramo vigente actual
}
```

- [ ] **Step 3: Agregar `basicoVigente` en `web/src/pages/fichadas/motor.ts`**

Modificar el import de la línea 1 para agregar `SueldosBasicoHistorial`:

```ts
import type { DiaHorario, FichadasCategoria, FichadasFeriado, FichadasGrupoRestriccion, FichadasLegajo, FichadasMarca, FichadasNovedad, FichadasVacacion, HistorialLegajo, SueldosBasicoHistorial } from '../../types';
```

Agregar al final del archivo (después del cierre de `calcularLiquidacionSueldoMensual`, línea 920):

```ts

// Básico vigente de un legajo a una fecha puntual -- resuelve contra los
// tramos de sueldos_basico_historial (vigencia_desde <= fecha <=
// vigencia_hasta, o vigencia_hasta vacío = tramo todavía abierto). Si hay
// más de un tramo que la cubre (no debería pasar en uso normal), gana el de
// vigencia_desde más reciente. Devuelve null si ningún tramo cubre esa
// fecha -- las pantallas que llaman esto no deben inventar un básico, tienen
// que avisar y no calcular.
export function basicoVigente(historial: SueldosBasicoHistorial[], legajoId: string, fecha: string): number | null {
  const tramos = historial.filter((h) =>
    h.legajo === legajoId && h.vigencia_desde <= fecha && (!h.vigencia_hasta || h.vigencia_hasta >= fecha)
  );
  if (tramos.length === 0) return null;
  tramos.sort((a, b) => b.vigencia_desde.localeCompare(a.vigencia_desde));
  return tramos[0].basico;
}
```

- [ ] **Step 4: Build**

Run: `cd web && npm run build`
Expected: compila limpio (0 errores de TypeScript).

- [ ] **Step 5: Verificar la migración en vivo**

Si no hay ya una instancia de PocketBase de prueba levantada: bajar `pocketbase.exe` (misma versión que producción, 0.22.x), copiar `pb_migrations/` y `pb_hooks/` actuales a una carpeta de prueba, correr `./pocketbase.exe migrate up` contra una base nueva (o una copia de la de staging con datos reales, si está disponible, para que el backfill tenga legajos reales que procesar).

Confirmar con sqlite3:
```bash
sqlite3 pb_data/data.db "SELECT COUNT(*) FROM sueldos_basico_historial;"
sqlite3 pb_data/data.db "SELECT legajo, categoria, basico, vigencia_desde, vigencia_hasta FROM sueldos_basico_historial LIMIT 5;"
```
Expected: una fila por cada legajo que tenía categoría+básico cargados antes de la migración, con `vigencia_hasta` vacío.

- [ ] **Step 6: Commit**

```bash
git add pb_migrations/1789520000_basico_historial_vigencia.js web/src/types.ts web/src/pages/fichadas/motor.ts
git commit -m "feat(sueldos): coleccion sueldos_basico_historial + basicoVigente + backfill"
```

---

### Task 2: `cambiarBasicoLegajo` (lib compartida) + Personal → Empleados

**Files:**
- Create: `web/src/lib/basicoHistorial.ts`
- Modify: `web/src/pages/personal/PersonalPage.tsx`

**Interfaces:**
- Consumes: colección `sueldos_basico_historial` (Task 1).
- Produces: `cambiarBasicoLegajo(params: { legajoId: string; categoriaId: string; basicoSugerido: number | null | undefined; vigenciaDesde: string }): Promise<{ ok: true } | { ok: false; error: string }>` (`web/src/lib/basicoHistorial.ts`) — usada por Task 3.

- [ ] **Step 1: Crear `web/src/lib/basicoHistorial.ts`**

```ts
import { pb } from './pb';
import type { SueldosBasicoHistorial } from '../types';

// Resta 1 día a una fecha "YYYY-MM-DD" (en UTC, para no correrse por huso horario).
function diaAnterior(fecha: string): string {
  const [y, m, d] = fecha.split('-').map(Number);
  const anteriorUtc = Date.UTC(y, m - 1, d) - 86400000;
  return new Date(anteriorUtc).toISOString().slice(0, 10);
}

// Abre un nuevo tramo de vigencia de básico para un legajo (cerrando el
// tramo abierto anterior si existía) y actualiza fichadas_legajos.categoria/
// .basico como caché del valor "actual" -- usado tanto al cambiar la
// categoría de un legajo puntual (Personal → Empleados) como al propagar un
// cambio de "Básico sugerido" de una categoría a todos sus legajos (Sueldos
// → Categorías). Ver
// docs/superpowers/specs/2026-11-18-basico-historial-vigencia-design.md.
export async function cambiarBasicoLegajo(params: {
  legajoId: string;
  categoriaId: string;
  basicoSugerido: number | null | undefined;
  vigenciaDesde: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { legajoId, categoriaId, basicoSugerido, vigenciaDesde } = params;
  if (basicoSugerido == null) {
    return { ok: false, error: 'Esa categoría no tiene "Básico sugerido" cargado — completalo primero en Sueldos → Categorías.' };
  }

  let tramoAbierto: SueldosBasicoHistorial | null = null;
  try {
    tramoAbierto = await pb.collection('sueldos_basico_historial').getFirstListItem<SueldosBasicoHistorial>(
      pb.filter('legajo = {:legajo} && vigencia_hasta = ""', { legajo: legajoId })
    );
  } catch { /* no había tramo abierto */ }

  if (tramoAbierto && vigenciaDesde <= tramoAbierto.vigencia_desde) {
    return { ok: false, error: 'La fecha de vigencia no puede ser anterior o igual al inicio del tramo actual (' + tramoAbierto.vigencia_desde + ').' };
  }

  if (tramoAbierto) {
    await pb.collection('sueldos_basico_historial').update(tramoAbierto.id, { vigencia_hasta: diaAnterior(vigenciaDesde) });
  }
  await pb.collection('sueldos_basico_historial').create({
    legajo: legajoId, categoria: categoriaId, basico: basicoSugerido, vigencia_desde: vigenciaDesde, vigencia_hasta: '',
  });
  await pb.collection('fichadas_legajos').update(legajoId, { categoria: categoriaId, basico: basicoSugerido });

  return { ok: true };
}
```

- [ ] **Step 2: Importar `cambiarBasicoLegajo` en `PersonalPage.tsx`**

Modificar el import de la línea 6-7:

```tsx
import { hhmmAMinutos, fmtDur, MOTIVOS_BAJA } from '../fichadas/motor';
import { cambiarBasicoLegajo } from '../../lib/basicoHistorial';
import type { DiaHorario, FichadasCategoria, FichadasEmpresa, FichadasHorario, FichadasLegajo, HoraExtraFija } from '../../types';
```

- [ ] **Step 3: Simplificar `editar()` (ya no maneja `categoria`/`basico`)**

En `EmpleadosSub`, reemplazar la función `editar` (líneas 103-118):

```tsx
  async function editar(id: string, campo: string, valor: string | boolean) {
    if (campo === 'fecha_alta' && typeof valor === 'string' && valor) {
      const legajo = legajos.find((l) => l.id === id);
      if (legajo?.fecha_baja && valor > legajo.fecha_baja) {
        toast('La fecha de alta no puede ser posterior a la fecha de baja de este legajo.', 'warn');
        return;
      }
    }
    try {
      await pb.collection('fichadas_legajos').update(id, { [campo]: valor });
      onChanged();
    } catch (e) {
      toast('Error: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }
```

(Se quita la conversión `'' -> null` que solo aplicaba a `categoria`/`basico` — esos dos campos dejan de pasar por acá.)

- [ ] **Step 4: Agregar el estado y los handlers del modal de cambio de categoría**

Agregar junto a los demás `useState` de `EmpleadosSub` (después de la línea 83, `const [fechaAltaNueva, setFechaAltaNueva] = useState('');`):

```tsx
  const [idCambiandoCategoria, setIdCambiandoCategoria] = useState<string | null>(null);
  const [categoriaNueva, setCategoriaNueva] = useState('');
  const [vigenciaDesde, setVigenciaDesde] = useState('');
  const [guardandoCategoria, setGuardandoCategoria] = useState(false);
```

Agregar las funciones, después de `confirmarReingreso` (después de la línea 200, antes de `async function eliminar`):

```tsx
  function abrirCambioCategoria(l: FichadasLegajo) {
    setIdCambiandoCategoria(l.id);
    setCategoriaNueva(l.categoria || '');
    setVigenciaDesde(l.categoria ? '' : (l.fecha_alta || ''));
  }

  async function confirmarCambioCategoria() {
    if (!idCambiandoCategoria) return;
    if (!categoriaNueva) { toast('Elegí una categoría.', 'warn'); return; }
    if (!vigenciaDesde) { toast('Completá la fecha de vigencia.', 'warn'); return; }
    const categoria = categorias.find((c) => c.id === categoriaNueva);
    setGuardandoCategoria(true);
    try {
      const resultado = await cambiarBasicoLegajo({
        legajoId: idCambiandoCategoria, categoriaId: categoriaNueva,
        basicoSugerido: categoria?.basico_sugerido, vigenciaDesde,
      });
      if (!resultado.ok) { toast(resultado.error, 'warn'); return; }
      setIdCambiandoCategoria(null);
      onChanged();
      toast('Categoría y básico actualizados.', 'ok');
    } catch (e) {
      toast('Error: ' + (e instanceof Error ? e.message : ''), 'err');
    } finally {
      setGuardandoCategoria(false);
    }
  }
```

- [ ] **Step 5: Agregar el modal al JSX**

En el `return` de `EmpleadosSub`, agregar el bloque del modal después del bloque de "Reincorporar" (después de la línea 257, antes de `<h3 ... >Empleados cargados`):

```tsx
      {idCambiandoCategoria && (() => {
        const l = legajos.find((x) => x.id === idCambiandoCategoria);
        return (
          <>
            <h3 style={{ fontSize: 13, color: 'var(--navy)', margin: '18px 0 8px' }}>
              {l?.categoria ? 'Cambiar categoría de' : 'Asignar categoría a'} "{l?.nombre}"
            </h3>
            <div className="hint">El básico se toma automáticamente del "Básico sugerido" de la categoría elegida (Sueldos → Categorías) — ya no se edita a mano.</div>
            <div className="row" style={{ marginTop: 6 }}>
              <div className="field">
                <label>Categoría</label>
                <select value={categoriaNueva} onChange={(e) => setCategoriaNueva(e.target.value)}>
                  <option value="">Elegir…</option>
                  {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
              <div className="field"><label>Vigente desde</label><input type="date" value={vigenciaDesde} onChange={(e) => setVigenciaDesde(e.target.value)} /></div>
              <button onClick={confirmarCambioCategoria} disabled={guardandoCategoria}>{guardandoCategoria ? 'Guardando…' : 'Confirmar'}</button>
              <button className="secondary" onClick={() => setIdCambiandoCategoria(null)}>Cancelar</button>
            </div>
          </>
        );
      })()}

```

- [ ] **Step 6: Reemplazar las columnas Categoría y Básico de la tabla**

Reemplazar las celdas de categoría y básico (líneas 282-301):

```tsx
                <td>
                  {categorias.find((c) => c.id === l.categoria)?.nombre || 'Sin categoría'}{' '}
                  <button className="small secondary" onClick={() => abrirCambioCategoria(l)}>
                    {l.categoria ? 'Cambiar' : 'Asignar'}
                  </button>
                </td>
                <td className="num">{l.basico != null ? l.basico.toLocaleString('es-AR') : '—'}</td>
```

- [ ] **Step 7: Build**

Run: `cd web && npm run build`
Expected: compila limpio.

- [ ] **Step 8: Verificación manual**

Levantar el frontend contra la instancia de PocketBase de prueba del Task 1 (con el backfill ya aplicado). En Personal → Empleados:
1. Confirmar que la columna Básico ya no tiene input editable (es texto).
2. Elegir un legajo sin categoría (o uno con categoría) y clickear "Asignar"/"Cambiar categoría". Elegir una categoría con `basico_sugerido` cargado, poner una fecha de vigencia, confirmar. Verificar que la tabla actualiza el básico al valor de esa categoría.
3. Repetir el cambio una segunda vez con una fecha de vigencia posterior — confirmar en PocketBase Admin UI (o sqlite) que el tramo anterior quedó con `vigencia_hasta` = el día anterior a la nueva fecha, y hay un tramo nuevo abierto.
4. Intentar elegir una categoría sin `basico_sugerido` cargado — confirmar que bloquea con el aviso correspondiente.
5. Intentar poner una fecha de vigencia anterior o igual al tramo abierto actual — confirmar que bloquea.

- [ ] **Step 9: Commit**

```bash
git add web/src/lib/basicoHistorial.ts web/src/pages/personal/PersonalPage.tsx
git commit -m "feat(personal): basico derivado de categoria con historial de vigencia"
```

---

### Task 3: Sueldos → Categorías — cascada al cambiar el Básico sugerido

**Files:**
- Modify: `web/src/pages/sueldos/CategoriasSub.tsx`

**Interfaces:**
- Consumes: `cambiarBasicoLegajo` (Task 2, `web/src/lib/basicoHistorial.ts`).

- [ ] **Step 1: Imports**

Modificar el import de tipos de la línea 5:

```tsx
import { cambiarBasicoLegajo } from '../../lib/basicoHistorial';
import type { FichadasCategoria, FichadasLegajo } from '../../types';
```

- [ ] **Step 2: Nuevo estado**

Agregar después de `const [editandoId, setEditandoId] = useState<string | null>(null);` (línea 45):

```tsx
  const [basicoSugeridoOriginal, setBasicoSugeridoOriginal] = useState<number | null>(null);
  const [vigenciaDesde, setVigenciaDesde] = useState('');
  const [aplicandoCascada, setAplicandoCascada] = useState(false);
```

- [ ] **Step 3: `abrirEdicion` guarda el valor original**

Modificar `abrirEdicion` (líneas 91-105) agregando al final, antes del cierre de la función:

```tsx
  function abrirEdicion(c: FichadasCategoria) {
    setEditandoId(c.id);
    setForm({
      nombre: c.nombre,
      basico_sugerido: c.basico_sugerido ? String(c.basico_sugerido) : '',
      plus_vacacional: String(c.plus_vacacional),
      divisor_mensual: String(c.divisor_mensual),
      pct_jubilacion: String(c.pct_jubilacion),
      pct_ley19032: String(c.pct_ley19032),
      pct_obra_social: String(c.pct_obra_social),
      pct_ansal: String(c.pct_ansal),
      pct_cuota_sindical: String(c.pct_cuota_sindical),
      pct_seguro_sepelio: String(c.pct_seguro_sepelio),
    });
    setBasicoSugeridoOriginal(c.basico_sugerido ?? null);
    setVigenciaDesde('');
  }
```

- [ ] **Step 4: `cancelarEdicion` resetea el estado nuevo**

```tsx
  function cancelarEdicion() {
    setEditandoId(null);
    setForm(FORM_VACIO);
    setBasicoSugeridoOriginal(null);
    setVigenciaDesde('');
  }
```

- [ ] **Step 5: `guardarEdicion` con la cascada**

Reemplazar `guardarEdicion` (líneas 107-120):

```tsx
  async function guardarEdicion() {
    if (!editandoId) return;
    const payload = construirPayload();
    if (!payload) return;
    const basicoNuevo = typeof payload.basico_sugerido === 'number' ? payload.basico_sugerido : null;
    const cambioBasico = basicoNuevo !== basicoSugeridoOriginal;
    if (cambioBasico && !vigenciaDesde) {
      toast('Completá "Vigente desde" — el Básico sugerido cambió y hay que propagarlo a los legajos de esta categoría.', 'warn');
      return;
    }
    setAplicandoCascada(cambioBasico);
    try {
      await pb.collection('fichadas_categorias').update(editandoId, payload);
      if (cambioBasico && basicoNuevo != null) {
        const legajosDeCategoria = await pb.collection('fichadas_legajos').getFullList<FichadasLegajo>({
          filter: pb.filter('categoria = {:c}', { c: editandoId }),
        });
        let actualizados = 0;
        const errores: string[] = [];
        for (const l of legajosDeCategoria) {
          const resultado = await cambiarBasicoLegajo({
            legajoId: l.id, categoriaId: editandoId, basicoSugerido: basicoNuevo, vigenciaDesde,
          });
          if (resultado.ok) actualizados++;
          else errores.push(l.nombre + ': ' + resultado.error);
        }
        if (errores.length) {
          toast(`Categoría actualizada. ${actualizados} legajo(s) actualizados, ${errores.length} con error: ${errores.join(' · ')}`, 'warn');
        } else {
          toast(`Categoría actualizada. ${actualizados} legajo(s) actualizados con el nuevo básico.`, 'ok');
        }
      } else {
        toast('Categoría actualizada.', 'ok');
      }
      setEditandoId(null);
      setForm(FORM_VACIO);
      setBasicoSugeridoOriginal(null);
      setVigenciaDesde('');
      cargar();
    } catch (e) {
      toast('Error: ' + (e instanceof Error ? e.message : ''), 'err');
    } finally {
      setAplicandoCascada(false);
    }
  }
```

- [ ] **Step 6: UI — campo "Vigente desde" y hint actualizado**

Reemplazar el hint del principio de la pantalla (línea 140):

```tsx
      <div className="hint">Categorías de convenio — cada una con su Plus Vacacional, divisor y % de descuentos, usados al liquidar vacaciones. El Básico sugerido es el básico real: al cambiarlo acá, se propaga automáticamente a todos los legajos de esta categoría desde la fecha "Vigente desde" que indiques.</div>
```

Agregar el campo de fecha después del campo "Básico sugerido" en la fila de inputs (después de la línea 144), y el botón de guardar muestra el estado de la cascada (reemplazar las líneas 143-163):

```tsx
        <div className="field"><label>Nombre</label><input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Ej: Administ 2da" /></div>
        <div className="field"><label>Básico sugerido ($, opcional)</label><input value={form.basico_sugerido} onChange={(e) => setForm({ ...form, basico_sugerido: e.target.value })} style={{ width: 130 }} /></div>
        {editandoId && (
          <div className="field">
            <label>Vigente desde (si cambiás el Básico sugerido)</label>
            <input type="date" value={vigenciaDesde} onChange={(e) => setVigenciaDesde(e.target.value)} style={{ width: 140 }} />
          </div>
        )}
        <div className="field"><label>Plus Vacacional ($/día)</label><input value={form.plus_vacacional} onChange={(e) => setForm({ ...form, plus_vacacional: e.target.value })} style={{ width: 110 }} /></div>
        <div className="field"><label>Divisor mensual</label><input value={form.divisor_mensual} onChange={(e) => setForm({ ...form, divisor_mensual: e.target.value })} style={{ width: 90 }} /></div>
        {CAMPOS_PCT.map((c) => (
          <div className="field" key={c.key}>
            <label>{c.label}</label>
            <input value={form[c.key]} onChange={(e) => setForm({ ...form, [c.key]: e.target.value })} style={{ width: 90 }} />
          </div>
        ))}
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        {editandoId ? (
          <>
            <button onClick={guardarEdicion} disabled={aplicandoCascada}>{aplicandoCascada ? 'Aplicando a legajos…' : 'Guardar'}</button>
            <button className="secondary" onClick={cancelarEdicion}>Cancelar</button>
          </>
        ) : (
          <button onClick={crear}>Crear categoría</button>
        )}
      </div>
```

- [ ] **Step 7: Build**

Run: `cd web && npm run build`
Expected: compila limpio.

- [ ] **Step 8: Verificación manual**

Contra la instancia de prueba, en Sueldos → Categorías:
1. Editar una categoría SIN cambiar el Básico sugerido (solo un %) — confirmar que guarda sin pedir fecha y sin tocar ningún legajo.
2. Editar una categoría cambiando el Básico sugerido, con al menos un legajo asignado a esa categoría (usar uno de los legajos del backfill del Task 1) — confirmar que pide "Vigente desde", y que al guardar: la categoría se actualiza, el legajo recibe un tramo nuevo en `sueldos_basico_historial` con el básico y fecha correctos, y su `fichadas_legajos.basico` en Personal se actualiza.
3. Intentar guardar un cambio de Básico sugerido sin completar "Vigente desde" — confirmar que bloquea.

- [ ] **Step 9: Commit**

```bash
git add web/src/pages/sueldos/CategoriasSub.tsx
git commit -m "feat(sueldos): cascada de basico sugerido a legajos al editar una categoria"
```

---

### Task 4: Liquidación — Administrativos, Choferes y Vacaciones resuelven el básico vigente al período

**Files:**
- Modify: `web/src/pages/sueldos/LiquidacionAdministrativosSub.tsx`
- Modify: `web/src/pages/sueldos/LiquidacionChoferesSub.tsx`
- Modify: `web/src/pages/vacaciones/AsignarVacacionesSub.tsx`

**Interfaces:**
- Consumes: `basicoVigente` (Task 1, `web/src/pages/fichadas/motor.ts`), tipo `SueldosBasicoHistorial` (Task 1, `web/src/types.ts`).

- [ ] **Step 1: `LiquidacionAdministrativosSub.tsx` — imports**

Modificar las líneas 5-6:

```tsx
import { procesarPeriodo, calcularLiquidacionSueldoMensual, basicoVigente, type LiquidacionSueldoMensual } from '../fichadas/motor';
import type { Chofer, FichadasEmpresa, FichadasFeriado, FichadasLegajo, FichadasMarca, FichadasNovedad, HistorialLegajo, SueldosBasicoHistorial, SueldosTarifaViaje } from '../../types';
```

- [ ] **Step 2: `LiquidacionAdministrativosSub.tsx` — resolver el básico vigente**

En `calcular()`, quitar la línea `if (!legajo.basico) { setAviso('Este legajo no tiene un básico cargado (Personal → Empleados).'); return; }` (línea 48).

Agregar `sueldos_basico_historial` al `Promise.all` (líneas 56-64) y resolver el básico justo después:

```tsx
      const [legajosTodos, marcas, novedades, feriados, empresas, historial, tarifas, historialBasico] = await Promise.all([
        pb.collection('fichadas_legajos').getFullList<FichadasLegajo>({ expand: 'empresa,horario' }),
        pb.collection('fichadas_marcas').getFullList<FichadasMarca>({ filter: pb.filter('fecha >= {:d} && fecha <= {:h}', { d: desde, h: hasta }) }),
        pb.collection('fichadas_novedades').getFullList<FichadasNovedad>({ filter: pb.filter('fecha >= {:d} && fecha <= {:h}', { d: desde, h: hasta }) }),
        pb.collection('fichadas_feriados').getFullList<FichadasFeriado>({ filter: pb.filter('fecha >= {:d} && fecha <= {:h}', { d: desde, h: hasta }) }),
        pb.collection('fichadas_empresas').getFullList<FichadasEmpresa>(),
        pb.collection('fichadas_legajo_historial').getFullList<HistorialLegajo>(),
        pb.collection('sueldos_tarifas_viaje').getFullList<SueldosTarifaViaje>(),
        pb.collection('sueldos_basico_historial').getFullList<SueldosBasicoHistorial>({ filter: pb.filter('legajo = {:l}', { l: legajoId }) }),
      ]);
      const basico = basicoVigente(historialBasico, legajoId, desde);
      if (basico === null) { setAviso('No se encontró un básico vigente para este período (revisá el historial en Personal → Empleados).'); return; }
      const legajosAjustados = legajosTodos.map((l) => ((l.estado || l.fecha_baja) ? l : { ...l, horas_extra_fijas: null }));
```

Y reemplazar el uso de `legajo.basico` en la llamada a `calcularLiquidacionSueldoMensual` (línea 85):

```tsx
      const calc = calcularLiquidacionSueldoMensual({
        basico, fechaAlta: legajo.fecha_alta, categoria, horasExtraMes, anioMes,
        diasTrabajados, tarifaComida, tarifaEspecial,
      });
```

- [ ] **Step 3: `LiquidacionChoferesSub.tsx` — imports**

Modificar las líneas 4-5:

```tsx
import { basicoVigente } from '../fichadas/motor';
import type { Chofer, Tramo, SueldosBasicoHistorial, SueldosTarifaViaje, FichadasFeriado } from '../../types';
```

- [ ] **Step 4: `LiquidacionChoferesSub.tsx` — resolver el básico vigente**

En `calcular()`, quitar la línea `if (!legajo.basico) { setAviso('El legajo vinculado no tiene un básico cargado (Personal → Empleados).'); return; }` (línea 63).

Agregar `sueldos_basico_historial` al `Promise.all` (líneas 66-70) y resolver el básico:

```tsx
      const [tarifas, feriados, tramos, historialBasico] = await Promise.all([
        pb.collection('sueldos_tarifas_viaje').getFullList<SueldosTarifaViaje>(),
        pb.collection('fichadas_feriados').getFullList<FichadasFeriado>(),
        pb.collection('tramos').getFullList<Tramo>({ filter: pb.filter('chofer = {:chofer} && mes = {:mes}', { chofer: choferId, mes: mesStr }) }),
        pb.collection('sueldos_basico_historial').getFullList<SueldosBasicoHistorial>({ filter: pb.filter('legajo = {:l}', { l: legajo.id }) }),
      ]);
      const basico = basicoVigente(historialBasico, legajo.id, mesStr + '-01');
      if (basico === null) { setAviso('No se encontró un básico vigente para este período (revisá el historial en Personal → Empleados).'); return; }
```

Quitar la línea `const basico = legajo.basico;` (línea 106) — ya queda definido arriba, el resto del código (`const bruto = basico + variable;` en adelante) sigue igual.

- [ ] **Step 5: `AsignarVacacionesSub.tsx` — imports**

Modificar las líneas 5-13:

```tsx
import {
  basicoVigente, calcularHorasExtraPromedioPorLegajo, calcularLiquidacionVacaciones, calcularResumenVacaciones,
  detectarSolapamientoGrupo, partirPeriodoPorMes, procesarPeriodo,
  type TramoLiquidacion,
} from '../fichadas/motor';
import type {
  FichadasCategoria, FichadasEmpresa, FichadasFeriado, FichadasGrupoRestriccion, FichadasLegajo,
  FichadasMarca, FichadasNovedad, FichadasVacacion, HistorialLegajo, SueldosBasicoHistorial,
} from '../../types';
```

- [ ] **Step 6: `AsignarVacacionesSub.tsx` — guard y resolución del básico vigente**

En `liquidarPeriodo`, reemplazar el guard de categoría/básico (líneas 173-176):

```tsx
    if (!legajo.categoria) {
      toast('Para liquidar, completá la Categoría de este legajo en Personal → Empleados.', 'warn');
      return;
    }
```

Agregar `sueldos_basico_historial` al `Promise.all` (líneas 196-202) y resolver el básico antes de llamar a `procesarPeriodo`:

```tsx
      const [marcas, novedades, feriados, historial, legajoConHorario, historialBasico] = await Promise.all([
        pb.collection('fichadas_marcas').getFullList<FichadasMarca>({ filter: pb.filter('fecha >= {:d} && fecha <= {:h}', { d: desdeVentana, h: hastaVentana }) }),
        pb.collection('fichadas_novedades').getFullList<FichadasNovedad>({ filter: pb.filter('fecha >= {:d} && fecha <= {:h}', { d: desdeVentana, h: hastaVentana }) }),
        pb.collection('fichadas_feriados').getFullList<FichadasFeriado>({ filter: pb.filter('fecha >= {:d} && fecha <= {:h}', { d: desdeVentana, h: hastaVentana }) }),
        pb.collection('fichadas_legajo_historial').getFullList<HistorialLegajo>(),
        pb.collection('fichadas_legajos').getOne<FichadasLegajo>(legajo.id, { expand: 'horario' }),
        pb.collection('sueldos_basico_historial').getFullList<SueldosBasicoHistorial>({ filter: pb.filter('legajo = {:l}', { l: legajo.id }) }),
      ]);
      const basico = basicoVigente(historialBasico, legajo.id, v.desde);
      if (basico === null) { toast('No se encontró un básico vigente para este período (revisá el historial en Personal → Empleados).', 'warn'); return; }
      const { resultados } = procesarPeriodo({
        legajos: [legajoConHorario], marcas, novedades, feriados, historial, empresaNombrePorId,
        desde: desdeVentana, hasta: hastaVentana,
      });
      const horasExtraPromedio = calcularHorasExtraPromedioPorLegajo(resultados, legajo.id, primerMes, 6);

      const resultado = calcularLiquidacionVacaciones({
        basico, fechaAlta: legajo.fecha_alta, categoria, horasExtraPromedio,
        desde: v.desde, hasta: v.hasta,
      });
```

- [ ] **Step 7: Build**

Run: `cd web && npm run build`
Expected: compila limpio.

- [ ] **Step 8: Verificación manual**

Contra la instancia de prueba, usando un legajo al que el Task 2 u 3 le haya generado 2 tramos de vigencia distintos (uno cerrado en el pasado, uno abierto actual):
1. **Administrativos**: liquidar el mes actual — confirmar que usa el básico del tramo abierto. Liquidar un mes anterior al cambio de básico — confirmar que usa el básico del tramo viejo, no el actual.
2. **Choferes**: mismo chequeo, con un chofer vinculado a ese legajo.
3. **Vacaciones**: liquidar un período de vacaciones cuya fecha de inicio caiga antes del cambio de básico — confirmar que usa el básico viejo.
4. En las 3 pantallas, probar con un legajo sin ningún tramo en `sueldos_basico_historial` (o pedir un período anterior a `vigencia_desde` del tramo más viejo) — confirmar que aparece el aviso "No se encontró un básico vigente..." y no calcula nada.

- [ ] **Step 9: Commit**

```bash
git add web/src/pages/sueldos/LiquidacionAdministrativosSub.tsx web/src/pages/sueldos/LiquidacionChoferesSub.tsx web/src/pages/vacaciones/AsignarVacacionesSub.tsx
git commit -m "feat(sueldos,vacaciones): resolver basico vigente al periodo en vez del actual"
```

---

## Self-Review

**Cobertura del spec:**
- Colección `sueldos_basico_historial` con los 5 campos exactos → Task 1.
- Backfill idempotente → Task 1.
- Básico de solo lectura + modal de cambio de categoría con vigencia en Personal → Task 2.
- Bloqueo si la categoría no tiene `basico_sugerido`, bloqueo si la fecha de vigencia es anterior/igual al tramo abierto → Task 2 (`cambiarBasicoLegajo`).
- Cascada automática al cambiar el Básico sugerido de una categoría → Task 3.
- Los 3 consumidores (Administrativos, Choferes, Vacaciones) resuelven básico vigente al período, con aviso si no hay tramo → Task 4.
- Sin UI para editar/borrar tramos, sin prorrateo → no se agregó nada de eso en ninguna tarea (correcto, está fuera de alcance).

**Placeholders:** ninguno — todos los pasos tienen código completo y real, extraído de los archivos actuales del repo.

**Consistencia de tipos:** `SueldosBasicoHistorial` (Task 1) se usa con los mismos campos (`legajo`, `categoria`, `basico`, `vigencia_desde`, `vigencia_hasta`) en `basicoVigente` (Task 1), `cambiarBasicoLegajo` (Task 2) y los 3 fetches de Task 4. `basicoVigente(historial, legajoId, fecha)` se llama siempre con esa misma firma y orden de argumentos en las 3 pantallas de Task 4.

---

## Execution Handoff

Plan completo y guardado en `docs/superpowers/plans/2026-11-19-basico-historial-vigencia.md`. Dos opciones de ejecución:

**1. Subagent-Driven (recomendado)** — despacho un subagente nuevo por tarea, reviso entre tareas, iteración rápida.

**2. Inline Execution** — ejecuto las tareas en esta misma sesión con executing-plans, en bloque con checkpoints.

¿Cuál preferís?
