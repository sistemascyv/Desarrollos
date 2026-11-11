# Fichadas: Vacaciones/Licencias Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar un módulo "Vacaciones" a Fichadas (RRHH) que calcula automáticamente los días que corresponden a cada legajo por antigüedad, permite asignar períodos con avisos de exceso de días y de solapamiento entre personas de un mismo "grupo de restricción", y reemplaza los 5 Excel de licencias/vacaciones + `GRAL VACACIONES.xlsx` que arma RRHH a mano.

**Architecture:** Dos colecciones nuevas (`fichadas_vacaciones`, `fichadas_grupos_restriccion`) + dos campos puros nuevos en `motor.ts` (cálculo de días por antigüedad, resumen de asignados/restantes, detección de solapamiento de grupo) + una pestaña nueva `VacacionesTab.tsx` en `FichadasPage.tsx` + un sub-tab nuevo "Grupos de restricción" en `ConfiguracionTab.tsx`. La carga de datos reales (backfill de `fecha_alta` + períodos ya asignados en 2026) se genera con un script Node de un solo uso que lee los Excel reales y escribe dos migraciones de PocketBase con los datos embebidos — mismo patrón que `1788920000_seed_fichadas_legajos_1.js`.

**Tech Stack:** React + TypeScript (Vite), PocketBase (migraciones), `tsx` para probar las funciones puras, Node + `xlsx` (ya instalado en `web/node_modules`) para el script de extracción de datos.

## Addendum post-revisión final (commit `a322604`)

La revisión final de la rama encontró dos premisas de este plan que el Excel real contradice — las tareas de abajo quedan como constancia de lo que se armó primero, pero el código final ya refleja la corrección, no lo que dice el texto original de las tareas:

- **`GRAL VACACIONES.xlsx` es una sola temporada continua (set/2026 a ago/2027), no está partida por año calendario.** Filtrar por `desde` (como hacían las Tareas 3 y 4 originalmente) perdía en silencio 65 de los 90 períodos reales ya asignados y notificados. Se agregó un campo `anio` explícito en `fichadas_vacaciones` (migración `1789355000_fichadas_vacaciones_anio.js`), independiente de las fechas, y toda la lógica de resumen/asignación/vista por año (`motor.ts`, `VacacionesTab.tsx`) bucket-ea por ese campo en vez de parsear `desde`. La migración de datos (`1789370000_seed_fichadas_vacaciones_2026.js`) se regeneró con los 90 períodos, todos `anio: 2026`.
- **La fórmula de antigüedad menor a 1 año no era `antigüedad*14/100`** — esa es la excepción en 4 de 63 celdas reales del Excel, no la regla. La fórmula real, usada en 59 de esas celdas, es `antigüedad*14` (sin dividir). `diasQueCorrespondenPorAntiguedad` en `motor.ts` ya quedó corregida así.

Un seguimiento pendiente, no bloqueante, que quedó anotado para el usuario: el selector de año de la pantalla Vacaciones usa el año calendario actual por defecto, pero una temporada corre de septiembre a agosto — entre enero y agosto de cualquier año, alguien que quiera cargar un período de la temporada anterior va a tener que cambiar el selector a mano (nada avisa si no lo hace).

**Nota sobre el operador de las reglas de acceso:** el ejemplo de la Restricción global de abajo ("`@request.auth.modulos ?= \"fichadas\"`") y el código de las Tareas 1/4/5 usan `?=`, copiado del patrón visible en `1788900000_created_fichadas.js` sin saber que `?=` **no funciona** contra `modulos` porque ese campo es `json` plano, no una relación/select multi-valor real — PocketBase ya lo había corregido una vez antes (`1789050000_fix_operador_modulos_json.js`) y esta sesión lo reintrodujo sin querer. Confirmado con usuarios reales de prueba contra la API: con `?=` ningún usuario no-admin veía nunca una fila, aunque su `modulos` sí contuviera el valor. El operador correcto es `~` (contains/like). Corregido en `pb_migrations/1789410000_corregir_operador_modulos_a_like.js`, que también arregla de paso `fichadas_legajo_historial` (mismo bug, previo a esta sesión) y seis colecciones que ya andaban bien con `~` y se rompieron al "estandarizarse" a `?=` en `1789390000`/`1789400000`.

## Global Constraints

- "Días que corresponden": antigüedad en años = (31/12 del año elegido − `fecha_alta`) en días / 365. Si antigüedad > 1 año: <5→14, <10→21, <20→28, ≥20→35. Si antigüedad ≤ 1 año: `antigüedad * 14 / 100` (tal cual, sin corregir, aunque el resultado sea muy bajo — decisión explícita del usuario). Si antigüedad ≤ 0: 0. Sin `fecha_alta`: no calculable (`null`).
- Un período de `fichadas_vacaciones` pertenece al año de su fecha `desde` (no al de `hasta`).
- Días asignados (por legajo y año) = suma de `(hasta − desde + 1)` días de cada período cuyo `desde` cae en ese año. Días restantes = corresponden − asignados.
- Al guardar un período que hace que asignados > corresponden: se guarda igual, aviso (toast `warn`), nunca bloquea.
- Solapamiento de grupo de restricción: al guardar un período para `legajoX`, si algún otro legajo del mismo grupo tiene un período con `desde_otro <= hasta` && `hasta_otro >= desde` (cualquier año): se guarda igual, aviso (toast `warn`), nunca bloquea.
- `notificado` es un casillero manual, sin ninguna automatización.
- Reglas de acceso de las 2 colecciones nuevas: igual patrón que `fichadas_novedades` (`@request.auth.rol = "admin" || @request.auth.modulos ?= "fichadas"` para list/view/create/update, `@request.auth.rol = "admin"` para delete).
- Fechas como texto `"YYYY-MM-DD"` (10 caracteres), igual convención que `fichadas_marcas.fecha`.
- No se migra ningún año anterior a 2026.
- Matching de la migración de datos: por **nombre normalizado** (mayúsculas, sin acentos, sin comas, palabras ordenadas alfabéticamente para no depender del orden "Apellido, Nombre"), nunca por el número de "Legajo" del Excel — se verificó contra el padrón real que ese número NO es el mismo campo que `nro_legajo` en el sistema. Si el nombre no matchea exactamente a una sola persona (0 o 2+ candidatos), esa fila se omite y se loguea — nunca se adivina ni se crea un legajo nuevo.

---

## Task 1: Colecciones nuevas + tipos TS

**Files:**
- Create: `pb_migrations/1789350000_fichadas_vacaciones_y_grupos.js`
- Modify: `web/src/types.ts`

**Interfaces:**
- Produces: colecciones `fichadas_vacaciones` (`legajo` relation→`fichadas_legajos` requerida, `desde` text requerida, `hasta` text requerida, `comentario` text opcional, `notificado` bool opcional) y `fichadas_grupos_restriccion` (`nombre` text opcional, `legajos` relation múltiple→`fichadas_legajos`, mínimo 2, requerida). Tipos TS `FichadasVacacion` y `FichadasGrupoRestriccion`.

- [ ] **Step 1: Escribir la migración**

```javascript
/// <reference path="../pb_data/types.d.ts" />
// Vacaciones/Licencias: reemplaza LIC-CHOF.xls + las 4 LICENCIA
// VACACIONES por grupo/sucursal + GRAL VACACIONES.xlsx (RRHH los
// llevaba 100% a mano). Ver
// docs/superpowers/specs/2026-11-11-fichadas-vacaciones-licencias-design.md.
migrate((db) => {
  const dao = new Dao(db);
  dao.saveCollection(new Collection({
    "id": "fchd0vacac001",
    "name": "fichadas_vacaciones",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false, "id": "fcv0legajo001", "name": "legajo", "type": "relation",
        "required": true, "presentable": false, "unique": false,
        "options": {
          "collectionId": "fchd0legajos001", "cascadeDelete": true,
          "minSelect": null, "maxSelect": 1, "displayFields": ["nombre"]
        }
      },
      {
        "system": false, "id": "fcv0desde0001", "name": "desde", "type": "text",
        "required": true, "presentable": true, "unique": false,
        "options": { "min": 10, "max": 10, "pattern": "" }
      },
      {
        "system": false, "id": "fcv0hasta0001", "name": "hasta", "type": "text",
        "required": true, "presentable": true, "unique": false,
        "options": { "min": 10, "max": 10, "pattern": "" }
      },
      {
        "system": false, "id": "fcv0coment001", "name": "comentario", "type": "text",
        "required": false, "presentable": false, "unique": false,
        "options": { "min": null, "max": null, "pattern": "" }
      },
      {
        "system": false, "id": "fcv0notific01", "name": "notificado", "type": "bool",
        "required": false, "presentable": true, "unique": false,
        "options": {}
      }
    ],
    "indexes": [],
    "listRule": "@request.auth.id != \"\" && (@request.auth.rol = \"admin\" || @request.auth.modulos ?= \"fichadas\")",
    "viewRule": "@request.auth.id != \"\" && (@request.auth.rol = \"admin\" || @request.auth.modulos ?= \"fichadas\")",
    "createRule": "@request.auth.id != \"\" && (@request.auth.rol = \"admin\" || @request.auth.modulos ?= \"fichadas\")",
    "updateRule": "@request.auth.id != \"\" && (@request.auth.rol = \"admin\" || @request.auth.modulos ?= \"fichadas\")",
    "deleteRule": "@request.auth.rol = \"admin\"",
    "options": {}
  }));
  dao.saveCollection(new Collection({
    "id": "fchd0grupos01",
    "name": "fichadas_grupos_restriccion",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false, "id": "fcg0nombre001", "name": "nombre", "type": "text",
        "required": false, "presentable": true, "unique": false,
        "options": { "min": null, "max": null, "pattern": "" }
      },
      {
        "system": false, "id": "fcg0legajos01", "name": "legajos", "type": "relation",
        "required": true, "presentable": false, "unique": false,
        "options": {
          "collectionId": "fchd0legajos001", "cascadeDelete": false,
          "minSelect": 2, "maxSelect": 50, "displayFields": ["nombre"]
        }
      }
    ],
    "indexes": [],
    "listRule": "@request.auth.id != \"\" && (@request.auth.rol = \"admin\" || @request.auth.modulos ?= \"fichadas\")",
    "viewRule": "@request.auth.id != \"\" && (@request.auth.rol = \"admin\" || @request.auth.modulos ?= \"fichadas\")",
    "createRule": "@request.auth.id != \"\" && (@request.auth.rol = \"admin\" || @request.auth.modulos ?= \"fichadas\")",
    "updateRule": "@request.auth.id != \"\" && (@request.auth.rol = \"admin\" || @request.auth.modulos ?= \"fichadas\")",
    "deleteRule": "@request.auth.rol = \"admin\"",
    "options": {}
  }));
  return null;
}, (db) => {
  const dao = new Dao(db);
  try { dao.deleteCollection(dao.findCollectionByNameOrId('fichadas_grupos_restriccion')); } catch (e) { /* no existía */ }
  try { dao.deleteCollection(dao.findCollectionByNameOrId('fichadas_vacaciones')); } catch (e) { /* no existía */ }
  return null;
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

(En Windows, usar `pocketbase_0.22.55_windows_amd64.zip` y `pocketbase.exe`.)

Expected: `Applied 1789350000_fichadas_vacaciones_y_grupos.js` sin errores (junto con todas las migraciones anteriores que ya pasaban).

- [ ] **Step 3: Verificar las 2 colecciones quedaron bien definidas**

```bash
python3 -c "
import sqlite3, json
con = sqlite3.connect('data/data.db')
for nombre in ('fichadas_vacaciones', 'fichadas_grupos_restriccion'):
    row = con.execute(\"SELECT schema FROM _collections WHERE name=?\", (nombre,)).fetchone()
    assert row is not None, nombre + ' no existe'
    campos = {f['name']: f for f in json.loads(row[0])}
    print(nombre, '->', sorted(campos.keys()))
campos_vac = {f['name']: f for f in json.loads(con.execute(\"SELECT schema FROM _collections WHERE name='fichadas_vacaciones'\").fetchone()[0])}
assert campos_vac['legajo']['required'] is True
assert campos_vac['desde']['required'] is True
assert campos_vac['hasta']['required'] is True
assert campos_vac['comentario']['required'] is False
assert campos_vac['notificado']['required'] is False
campos_gru = {f['name']: f for f in json.loads(con.execute(\"SELECT schema FROM _collections WHERE name='fichadas_grupos_restriccion'\").fetchone()[0])}
assert campos_gru['legajos']['options']['minSelect'] == 2
print('OK: campos y reglas correctos')
"
```

Expected: imprime los dos listados de campos y `OK: campos y reglas correctos`, sin ningún `AssertionError`.

- [ ] **Step 4: Agregar los tipos en `web/src/types.ts`**

Buscar el bloque de `FichadasConfiguracion` (cerca de la línea 330) y agregar justo después:

```typescript
export interface FichadasVacacion extends BaseRecord {
  legajo: string;
  desde: string; // "YYYY-MM-DD"
  hasta: string; // "YYYY-MM-DD"
  comentario?: string;
  notificado?: boolean;
  expand?: { legajo?: FichadasLegajo };
}

export interface FichadasGrupoRestriccion extends BaseRecord {
  nombre?: string;
  legajos: string[];
  expand?: { legajos?: FichadasLegajo[] };
}
```

- [ ] **Step 5: Build**

Run: `cd web && npm run build`
Expected: build exitoso, sin errores de TypeScript.

- [ ] **Step 6: Commit**

```bash
git add pb_migrations/1789350000_fichadas_vacaciones_y_grupos.js web/src/types.ts
git commit -m "feat(fichadas): colecciones fichadas_vacaciones y fichadas_grupos_restriccion"
```

---

## Task 2: Funciones puras de cálculo en `motor.ts`

**Files:**
- Modify: `web/src/pages/fichadas/motor.ts`
- Test (temporal, se borra): `web/src/pages/fichadas/motor.test-vacaciones.ts`

**Interfaces:**
- Consumes: `FichadasLegajo` (`fecha_alta?: string`, `empresa?: string`, `nombre: string`), `FichadasVacacion` y `FichadasGrupoRestriccion` (Task 1).
- Produces: `diasQueCorrespondenPorAntiguedad(fechaAlta, anio): number | null`, `calcularResumenVacaciones(params): ResumenVacacionLegajo[]`, `detectarSolapamientoGrupo(params): SolapamientoGrupo[]`, interfaces `ResumenVacacionLegajo` y `SolapamientoGrupo`.

- [ ] **Step 1: Agregar las funciones al final de `motor.ts`**

Agregar este bloque al final del archivo (después de `calcularEstadisticaRotacion`), y agregar `FichadasVacacion` y `FichadasGrupoRestriccion` al import de tipos en la línea 1 (`import type { DiaHorario, FichadasFeriado, FichadasGrupoRestriccion, FichadasLegajo, FichadasMarca, FichadasNovedad, FichadasVacacion, HistorialLegajo } from '../../types';`):

```typescript
// ---------- Vacaciones/Licencias ----------

// Misma fórmula que ya usaba el Excel de RRHH (LIC-CHOF.xls, columna de
// "Días"), con fecha de referencia el 31/12 del año elegido. Para
// antigüedad <= 1 año se replica tal cual la cuenta del Excel
// (antiguedadAnios * 14 / 100) aunque da un resultado muy por debajo del
// proporcional real de la ley -- decisión explícita del usuario, no
// "corregirla" para no cambiar los números que RRHH ya conoce.
export function diasQueCorrespondenPorAntiguedad(fechaAlta: string | null | undefined, anio: number): number | null {
  if (!fechaAlta) return null;
  const [yA, mA, dA] = fechaAlta.split('-').map(Number);
  const altaUtc = Date.UTC(yA, mA - 1, dA);
  const refUtc = Date.UTC(anio, 11, 31);
  const antiguedadAnios = (refUtc - altaUtc) / 86400000 / 365;
  if (antiguedadAnios <= 0) return 0;
  if (antiguedadAnios > 1) {
    if (antiguedadAnios < 5) return 14;
    if (antiguedadAnios < 10) return 21;
    if (antiguedadAnios < 20) return 28;
    return 35;
  }
  return (antiguedadAnios * 14) / 100;
}

function diasEntre(desde: string, hasta: string): number {
  const [yD, mD, dD] = desde.split('-').map(Number);
  const [yH, mH, dH] = hasta.split('-').map(Number);
  return Math.round((Date.UTC(yH, mH - 1, dH) - Date.UTC(yD, mD - 1, dD)) / 86400000) + 1;
}

export interface ResumenVacacionLegajo {
  idLegajo: string;
  nombre: string;
  area: string;
  diasQueCorresponden: number | null; // null = no calculable (sin fecha_alta)
  diasAsignados: number;
  diasRestantes: number | null; // null si diasQueCorresponden es null
  periodos: FichadasVacacion[]; // los que caen en `anio`, ordenados por desde
}

export function calcularResumenVacaciones(params: {
  legajos: FichadasLegajo[];
  vacaciones: FichadasVacacion[];
  empresaNombrePorId: Map<string, string>;
  anio: number;
}): ResumenVacacionLegajo[] {
  const { legajos, vacaciones, empresaNombrePorId, anio } = params;
  const vacacionesPorLegajo = new Map<string, FichadasVacacion[]>();
  vacaciones.forEach((v) => {
    if (!vacacionesPorLegajo.has(v.legajo)) vacacionesPorLegajo.set(v.legajo, []);
    vacacionesPorLegajo.get(v.legajo)!.push(v);
  });

  return legajos.map((l) => {
    const todasDelLegajo = vacacionesPorLegajo.get(l.id) || [];
    const periodos = todasDelLegajo
      .filter((v) => Number(v.desde.slice(0, 4)) === anio)
      .sort((a, b) => a.desde.localeCompare(b.desde));
    const diasQueCorresponden = diasQueCorrespondenPorAntiguedad(l.fecha_alta, anio);
    const diasAsignados = periodos.reduce((acc, v) => acc + diasEntre(v.desde, v.hasta), 0);
    const diasRestantes = diasQueCorresponden === null ? null : diasQueCorresponden - diasAsignados;
    return {
      idLegajo: l.id,
      nombre: l.nombre,
      area: l.empresa ? (empresaNombrePorId.get(l.empresa) || '—') : '—',
      diasQueCorresponden, diasAsignados, diasRestantes, periodos,
    };
  });
}

export interface SolapamientoGrupo {
  nombre: string; // nombre de la otra persona
  desde: string;
  hasta: string;
}

function seSuperponen(aDesde: string, aHasta: string, bDesde: string, bHasta: string): boolean {
  return aDesde <= bHasta && aHasta >= bDesde; // "YYYY-MM-DD" compara bien como texto
}

// Detecta si asignar [desde,hasta] a idLegajo se solapa con algún período
// de otra persona de su mismo grupo de restricción, en cualquier año. Un
// legajo puede estar en más de un grupo -- se juntan todos los
// compañeros de todos sus grupos antes de comparar.
export function detectarSolapamientoGrupo(params: {
  idLegajo: string;
  desde: string;
  hasta: string;
  grupos: FichadasGrupoRestriccion[];
  vacaciones: FichadasVacacion[];
  legajoPorId: Map<string, FichadasLegajo>;
}): SolapamientoGrupo[] {
  const { idLegajo, desde, hasta, grupos, vacaciones, legajoPorId } = params;
  const companerosDeGrupo = new Set<string>();
  grupos.forEach((g) => {
    if (g.legajos.includes(idLegajo)) {
      g.legajos.forEach((id) => { if (id !== idLegajo) companerosDeGrupo.add(id); });
    }
  });
  if (companerosDeGrupo.size === 0) return [];

  const resultado: SolapamientoGrupo[] = [];
  vacaciones.forEach((v) => {
    if (!companerosDeGrupo.has(v.legajo)) return;
    if (!seSuperponen(desde, hasta, v.desde, v.hasta)) return;
    const otro = legajoPorId.get(v.legajo);
    resultado.push({ nombre: otro?.nombre || '—', desde: v.desde, hasta: v.hasta });
  });
  return resultado;
}
```

- [ ] **Step 2: Escribir el script de prueba**

```typescript
// Prueba standalone de diasQueCorrespondenPorAntiguedad, calcularResumenVacaciones
// y detectarSolapamientoGrupo. Se corre con tsx y se borra después.
import { calcularResumenVacaciones, detectarSolapamientoGrupo, diasQueCorrespondenPorAntiguedad } from './motor';
import type { FichadasGrupoRestriccion, FichadasLegajo, FichadasVacacion } from '../../types';

let ok = 0, fail = 0;
function check(nombre: string, cond: boolean, extra?: unknown) {
  if (cond) { ok++; console.log(`  OK   ${nombre}`); }
  else { fail++; console.log(`  FALLA ${nombre} ->`, extra); }
}

function legajoBase(id: string, overrides: Partial<FichadasLegajo> = {}): FichadasLegajo {
  return { id, created: '', updated: '', nro_tarjeta: id, nombre: 'Prueba ' + id, estado: true, ...overrides };
}
function vacacionBase(id: string, legajo: string, desde: string, hasta: string, overrides: Partial<FichadasVacacion> = {}): FichadasVacacion {
  return { id, created: '', updated: '', legajo, desde, hasta, ...overrides };
}

// ---- diasQueCorrespondenPorAntiguedad ----
check('sin fecha_alta: null', diasQueCorrespondenPorAntiguedad(undefined, 2026) === null);
check('<5 años: 14', diasQueCorrespondenPorAntiguedad('2023-01-01', 2026) === 14);
check('<10 años: 21', diasQueCorrespondenPorAntiguedad('2017-06-01', 2026) === 21);
check('<20 años: 28', diasQueCorrespondenPorAntiguedad('2010-01-01', 2026) === 28);
check('>=20 años: 35', diasQueCorrespondenPorAntiguedad('2000-01-01', 2026) === 35);
const menosDeUnAnio = diasQueCorrespondenPorAntiguedad('2026-06-01', 2026); // ~0.58 años
check('<=1 año: formula del Excel tal cual (no el proporcional legal)', menosDeUnAnio !== null && menosDeUnAnio < 1, menosDeUnAnio);
check('ingreso posterior al cierre del año: 0', diasQueCorrespondenPorAntiguedad('2027-01-01', 2026) === 0);

// ---- calcularResumenVacaciones ----
const legajos: FichadasLegajo[] = [
  legajoBase('l1', { fecha_alta: '2000-01-01', empresa: 'e1' }), // 35 días
  legajoBase('l2'), // sin fecha_alta
];
const vacaciones: FichadasVacacion[] = [
  vacacionBase('v1', 'l1', '2026-01-10', '2026-01-19'), // 10 días, cuenta para 2026
  vacacionBase('v2', 'l1', '2026-12-28', '2027-01-03'), // 7 días, cuenta para 2026 (año de "desde")
  vacacionBase('v3', 'l1', '2025-12-20', '2025-12-29'), // cuenta para 2025, no 2026
];
const empresaNombrePorId = new Map([['e1', 'Área Uno']]);
const resumen = calcularResumenVacaciones({ legajos, vacaciones, empresaNombrePorId, anio: 2026 });
check('l1: área correcta', resumen[0].area === 'Área Uno', resumen[0]);
check('l1: corresponden 35', resumen[0].diasQueCorresponden === 35, resumen[0]);
check('l1: asignados 17 (10+7, v3 no cuenta)', resumen[0].diasAsignados === 17, resumen[0]);
check('l1: restantes 18', resumen[0].diasRestantes === 18, resumen[0]);
check('l1: 2 períodos de 2026, ordenados por desde', resumen[0].periodos.length === 2 && resumen[0].periodos[0].id === 'v1', resumen[0].periodos);
check('l2: sin fecha_alta -> corresponden y restantes null', resumen[1].diasQueCorresponden === null && resumen[1].diasRestantes === null, resumen[1]);

const vacacionesExceso: FichadasVacacion[] = [
  ...vacaciones,
  vacacionBase('v4', 'l1', '2026-11-01', '2026-11-30'), // +30 días más: total 47, se pasa de 35
];
const resumenExceso = calcularResumenVacaciones({ legajos, vacaciones: vacacionesExceso, empresaNombrePorId, anio: 2026 });
check('exceso: restantes negativo', resumenExceso[0].diasRestantes! < 0, resumenExceso[0]);

// ---- detectarSolapamientoGrupo ----
const legajoPorId = new Map(legajos.map((l) => [l.id, l]));
const grupos: FichadasGrupoRestriccion[] = [
  { id: 'g1', created: '', updated: '', legajos: ['l1', 'l2'] },
];
const sinGrupo = detectarSolapamientoGrupo({
  idLegajo: 'l3', desde: '2026-01-01', hasta: '2026-01-10', grupos, vacaciones, legajoPorId: new Map([...legajoPorId, ['l3', legajoBase('l3')]]),
});
check('legajo sin grupo: sin solapamientos', sinGrupo.length === 0, sinGrupo);

const conSolapamiento = detectarSolapamientoGrupo({
  idLegajo: 'l2', desde: '2026-01-15', hasta: '2026-01-25', grupos, vacaciones, legajoPorId,
});
check('l2 se solapa con el v1 de l1 (10 al 19, pide 15 al 25)', conSolapamiento.length === 1 && conSolapamiento[0].nombre === legajoBase('l1').nombre, conSolapamiento);

const sinSolapamiento = detectarSolapamientoGrupo({
  idLegajo: 'l2', desde: '2026-02-01', hasta: '2026-02-10', grupos, vacaciones, legajoPorId,
});
check('l2 sin fechas que se cruzan: sin solapamientos', sinSolapamiento.length === 0, sinSolapamiento);

const propioLegajoNuncaEsSuCompanero = detectarSolapamientoGrupo({
  idLegajo: 'l1', desde: '2026-01-10', hasta: '2026-01-19', grupos, vacaciones, legajoPorId,
});
check('l1 comparado contra sus propios períodos: nunca se cuenta a sí mismo como solapamiento', propioLegajoNuncaEsSuCompanero.length === 0, propioLegajoNuncaEsSuCompanero);

console.log(`\n${ok} ok, ${fail} fallas`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 3: Correr la prueba y borrarla**

Run: `cd web && npx tsx src/pages/fichadas/motor.test-vacaciones.ts`
Expected: `18 ok, 0 fallas` (si el conteo real difiere porque se agregó/quitó algún `check(...)`, lo que manda es que todas las que haya pasen en 0, no el número exacto).

```bash
rm web/src/pages/fichadas/motor.test-vacaciones.ts
```

- [ ] **Step 4: Build**

Run: `cd web && npm run build`
Expected: build exitoso, sin errores de TypeScript.

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/fichadas/motor.ts
git commit -m "feat(fichadas): calculo de dias por antiguedad, resumen de vacaciones y solapamiento de grupo"
```

---

## Task 3: Migración de datos reales (backfill de fecha_alta + vacaciones 2026)

**Files:**
- Create (temporal, se borra al final): `scripts-tmp/extraer_vacaciones.js`
- Create: `pb_migrations/1789360000_backfill_fecha_alta_desde_ingreso.js` (generado por el script)
- Create: `pb_migrations/1789370000_seed_fichadas_vacaciones_2026.js` (generado por el script)

**Interfaces:**
- Consumes: los 6 archivos reales ya confirmados en disco en `FICHADAS REPORTES/estadisticas/` (`LIC-CHOF.xls`, `LICENCIA VACACIONES - ADMINISTRATIVOS.xls`, `LICENCIA VACACIONES - BSAS.xls`, `LICENCIA VACACIONES - CBA.xls`, `LICENCIA VACACIONES - OPERATIVOS.xls`, `GRAL VACACIONES.xlsx`), y `fichadas_legajos` (match en tiempo de ejecución de la migración, vía `nombre`).
- Produces: datos reales dentro de `fichadas_vacaciones` y `fecha_alta` completada en `fichadas_legajos`, sin tocar ningún registro que ya tenga `fecha_alta` cargada.

**Nota importante de alcance:** mucho del personal que aparece en estos Excel todavía no tiene legajo en `fichadas_legajos` (el padrón quedó desactualizado desde el import original del reloj CINTIA), y el número de "Legajo" que usan estos Excel NO es el mismo campo que `nro_legajo` del sistema — confirmado comparando ambas fuentes. Por eso el matching es por **nombre normalizado** (mayúsculas, sin acentos, sin comas, palabras ordenadas alfabéticamente), y toda fila que no matchee a una sola persona se **omite y se loguea** (nunca se adivina ni se crea un legajo nuevo — eso queda para que RRHH lo complete a mano desde Configuración → Empleados).

- [ ] **Step 1: Escribir el script de extracción**

```javascript
// Script temporal: lee los Excel reales de licencias/vacaciones y genera
// los dos archivos de migración de datos (backfill de fecha_alta +
// carga de los períodos ya asignados en 2026). Se corre una vez con
// node desde la raíz del repo, y se borra después -- no queda en git.
// Ver docs/superpowers/plans/2026-11-11-fichadas-vacaciones-licencias.md.
const path = require('path');
const fs = require('fs');
const XLSX = require(path.join(__dirname, '..', 'web', 'node_modules', 'xlsx'));

const CARPETA = path.join(__dirname, '..', 'FICHADAS REPORTES', 'estadisticas');
const DESTINO_MIGRACIONES = path.join(__dirname, '..', 'pb_migrations');

function excelFechaATexto(valor) {
  if (valor instanceof Date) {
    const y = valor.getUTCFullYear(), m = String(valor.getUTCMonth() + 1).padStart(2, '0'), d = String(valor.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  // sheet_to_json con raw:false formatea las fechas reales como texto
  // "M/D/YY" (formato de EE.UU., mes primero, año de 2 dígitos) según el
  // formato de celda de Excel -- NO vienen como Date aunque se pida
  // cellDates:true. Las fechas mal cargadas a mano (ej. "15/02/202",
  // "20/09/026") quedan afuera de este patrón y se descartan.
  if (typeof valor === 'string') {
    const m = valor.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (m) {
      const mes = Number(m[1]), dia = Number(m[2]);
      let anio = Number(m[3]);
      if (anio < 100) anio += (anio <= 30 ? 2000 : 1900);
      if (mes >= 1 && mes <= 12 && dia >= 1 && dia <= 31 && anio >= 1900 && anio <= 2100) {
        return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
      }
    }
  }
  return null;
}

function normalizarNombre(nombre) {
  return (nombre || '')
    .toUpperCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[,.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ').filter(Boolean).sort().join(' ');
}

// ---------- 1) Backfill de fecha_alta desde la columna "Ingreso" ----------
// Mismo layout en los 5 archivos, hoja "2026": col0=Días, col1=antigüedad
// (años), col2=antigüedad (días), col3=Ingreso, col4=Legajo (NO es
// nro_legajo del sistema), col5=Nombre.
const ARCHIVOS_LICENCIAS = [
  'LIC-CHOF.xls',
  'LICENCIA VACACIONES - ADMINISTRATIVOS.xls',
  'LICENCIA VACACIONES - BSAS.xls',
  'LICENCIA VACACIONES - CBA.xls',
  'LICENCIA VACACIONES - OPERATIVOS.xls',
];

const altaPorNombre = new Map(); // nombre normalizado -> fecha_alta (texto)
for (const archivo of ARCHIVOS_LICENCIAS) {
  const wb = XLSX.readFile(path.join(CARPETA, archivo), { cellDates: true });
  const hoja = wb.Sheets['2026'];
  if (!hoja) { console.warn(`[backfill] ${archivo}: no tiene hoja "2026", se omite.`); continue; }
  const filas = XLSX.utils.sheet_to_json(hoja, { header: 1, raw: false, defval: null });
  let vistos = 0;
  for (const fila of filas) {
    const legajoNum = fila[4];
    if (legajoNum === null || legajoNum === undefined || isNaN(Number(legajoNum))) continue;
    const ingreso = excelFechaATexto(fila[3]);
    const nombre = fila[5];
    if (!ingreso || !nombre) continue;
    const key = normalizarNombre(nombre);
    if (!altaPorNombre.has(key)) { altaPorNombre.set(key, { fecha_alta: ingreso, nombreOriginal: String(nombre) }); vistos++; }
  }
  console.log(`[backfill] ${archivo}: ${vistos} personas con fecha de ingreso leída.`);
}
console.log(`[backfill] total personas distintas con fecha de ingreso: ${altaPorNombre.size}`);

// ---------- 2) Períodos de 2026 desde GRAL VACACIONES.xlsx ----------
function extraerPeriodos(hoja, { tieneSecciones }) {
  const filas = XLSX.utils.sheet_to_json(hoja, { header: 1, raw: false, defval: null });
  const periodos = [];
  for (const fila of filas) {
    const col0 = fila[0];
    const col1 = fila[1];
    if (tieneSecciones && typeof col0 === 'string' && (col1 === null || col1 === undefined) && col0.trim().toUpperCase() !== 'LEGAJO') {
      continue; // fila de título de sección (ej. "SAN FRANCISCO") o título general
    }
    if (col0 === null || col0 === undefined || isNaN(Number(col0))) continue; // encabezado o vacía
    const nombre = fila[1];
    const desde = excelFechaATexto(fila[3]);
    const hasta = excelFechaATexto(fila[4]);
    const comentario = fila[5] || null;
    const notificado = (fila[6] || '').toString().trim().toUpperCase() === 'SI';
    if (!desde || !hasta) {
      console.warn(`[vacaciones] fila descartada por fecha inválida: ${nombre} -- desde=${JSON.stringify(fila[3])} hasta=${JSON.stringify(fila[4])}`);
      continue;
    }
    if (desde.slice(0, 4) !== '2026') continue; // solo lo que arranca en 2026
    periodos.push({ nombre: String(nombre || ''), desde, hasta, comentario, notificado });
  }
  return periodos;
}

const wbGral = XLSX.readFile(path.join(CARPETA, 'GRAL VACACIONES.xlsx'), { cellDates: true });
const periodosSucursales = extraerPeriodos(wbGral.Sheets['SUCURSALES'], { tieneSecciones: true });
const periodosChoferes = extraerPeriodos(wbGral.Sheets['CHOFERES'], { tieneSecciones: false });
const periodos2026 = [...periodosSucursales, ...periodosChoferes];
console.log(`[vacaciones] ${periodosSucursales.length} períodos de SUCURSALES + ${periodosChoferes.length} de CHOFERES = ${periodos2026.length} períodos de 2026 (antes de matchear contra legajos).`);

const chequeo = periodos2026.find((p) => normalizarNombre(p.nombre) === normalizarNombre('Carossio, Pablo'));
if (!chequeo || chequeo.desde !== '2026-12-07' || chequeo.hasta !== '2027-01-03') {
  console.error('AUTOCHEQUEO FALLÓ: no se encontró el período esperado de Carossio, Pablo (2026-12-07 a 2027-01-03). Revisar el parseo antes de continuar.');
  process.exit(1);
}
console.log('Autochequeo OK (Carossio, Pablo).');

// ---------- 3) Generar los dos archivos de migración ----------
// El match contra fichadas_legajos se hace por NOMBRE, en tiempo de
// ejecución de la migración (dao.findFirstRecordByFilter), no acá -- así
// funciona igual de bien corrida hoy contra una base de prueba vieja o
// más adelante contra producción con más legajos cargados. Si el nombre
// no matchea a exactamente un legajo, la migración lo loguea y lo
// saltea (no inventa ni corre el riesgo de pisar el legajo equivocado).

const backfillArr = Array.from(altaPorNombre.entries()).map(([nombreNormalizado, d]) => ({ nombre_normalizado: nombreNormalizado, nombre_original: d.nombreOriginal, fecha_alta: d.fecha_alta }));
const migracionBackfill = `/// <reference path="../pb_data/types.d.ts" />
// Vacaciones: backfill de fecha_alta para legajos activos sin esa fecha,
// usando la columna "Ingreso" de los 5 Excel de licencias (fuente real,
// confirmada con el usuario) -- generado una sola vez con un script
// temporal (ver docs/superpowers/plans/2026-11-11-fichadas-vacaciones-licencias.md).
// Match por nombre normalizado (el numero de "Legajo" del Excel NO es
// nro_legajo del sistema -- verificado). No pisa fecha_alta donde ya
// haya un valor cargado, y no toca nada si el nombre no matchea a
// exactamente un legajo.
function normalizarNombre(nombre) {
  return (nombre || '').toUpperCase()
    .replace(/[ÁÀÂÄ]/g, 'A').replace(/[ÉÈÊË]/g, 'E').replace(/[ÍÌÎÏ]/g, 'I')
    .replace(/[ÓÒÔÖ]/g, 'O').replace(/[ÚÙÛÜ]/g, 'U').replace(/Ñ/g, 'N')
    .replace(/[,.]/g, ' ').replace(/\\s+/g, ' ').trim()
    .split(' ').filter(Boolean).sort().join(' ');
}
migrate((db) => {
  const dao = new Dao(db);
  const legajosCol = dao.findCollectionByNameOrId('fichadas_legajos');
  const todosLosLegajos = dao.findRecordsByFilter(legajosCol.id, "id != ''", '', 2000, 0);
  const porNombre = new Map();
  todosLosLegajos.forEach((r) => {
    const key = normalizarNombre(r.get('nombre'));
    if (!porNombre.has(key)) porNombre.set(key, []);
    porNombre.get(key).push(r);
  });
  const datos = ${JSON.stringify(backfillArr)};
  let completados = 0, yaTenian = 0, sinMatch = 0;
  for (const d of datos) {
    const candidatos = porNombre.get(d.nombre_normalizado) || [];
    if (candidatos.length !== 1) {
      sinMatch++;
      console.log('vacaciones backfill: sin match (' + candidatos.length + ' candidatos) para "' + d.nombre_original + '"');
      continue;
    }
    const record = candidatos[0];
    if (record.get('fecha_alta')) { yaTenian++; continue; }
    record.set('fecha_alta', d.fecha_alta);
    dao.saveRecord(record);
    completados++;
  }
  console.log('vacaciones: fecha_alta completada en ' + completados + ' legajos (' + yaTenian + ' ya la tenían, ' + sinMatch + ' sin match por nombre).');
  return null;
}, (db) => {
  // No se revierte: volver a dejar fecha_alta en blanco perdería el dato
  // real recuperado, sin ningún beneficio (mismo criterio que
  // 1789180000_backfill_fecha_alta_desde_cintia.js).
  return null;
})
`;
fs.writeFileSync(path.join(DESTINO_MIGRACIONES, '1789360000_backfill_fecha_alta_desde_ingreso.js'), migracionBackfill);
console.log('Escrito: pb_migrations/1789360000_backfill_fecha_alta_desde_ingreso.js');

const periodosArr = periodos2026.map((p) => ({ nombre_normalizado: normalizarNombreJS(p.nombre), nombre_original: p.nombre, desde: p.desde, hasta: p.hasta, comentario: p.comentario, notificado: p.notificado }));
function normalizarNombreJS(nombre) { return normalizarNombre(nombre); }

const migracionVacaciones = `/// <reference path="../pb_data/types.d.ts" />
// Vacaciones: carga de los períodos ya asignados para 2026, migrados
// desde GRAL VACACIONES.xlsx (fuente consolidada) -- generado una sola
// vez con un script temporal (ver
// docs/superpowers/plans/2026-11-11-fichadas-vacaciones-licencias.md).
// Match por nombre normalizado, mismo criterio que
// 1789360000_backfill_fecha_alta_desde_ingreso.js. No se migra ningún
// año anterior a 2026 (decidido con el usuario).
function normalizarNombre(nombre) {
  return (nombre || '').toUpperCase()
    .replace(/[ÁÀÂÄ]/g, 'A').replace(/[ÉÈÊË]/g, 'E').replace(/[ÍÌÎÏ]/g, 'I')
    .replace(/[ÓÒÔÖ]/g, 'O').replace(/[ÚÙÛÜ]/g, 'U').replace(/Ñ/g, 'N')
    .replace(/[,.]/g, ' ').replace(/\\s+/g, ' ').trim()
    .split(' ').filter(Boolean).sort().join(' ');
}
migrate((db) => {
  const dao = new Dao(db);
  const legajosCol = dao.findCollectionByNameOrId('fichadas_legajos');
  const vacacionesCol = dao.findCollectionByNameOrId('fichadas_vacaciones');
  const todosLosLegajos = dao.findRecordsByFilter(legajosCol.id, "id != ''", '', 2000, 0);
  const porNombre = new Map();
  todosLosLegajos.forEach((r) => {
    const key = normalizarNombre(r.get('nombre'));
    if (!porNombre.has(key)) porNombre.set(key, []);
    porNombre.get(key).push(r);
  });
  const datos = ${JSON.stringify(periodosArr)};
  let creados = 0, sinMatch = 0;
  for (const d of datos) {
    const candidatos = porNombre.get(d.nombre_normalizado) || [];
    if (candidatos.length !== 1) {
      sinMatch++;
      console.log('vacaciones 2026: sin match (' + candidatos.length + ' candidatos) para "' + d.nombre_original + '"');
      continue;
    }
    const record = new Record(vacacionesCol, {
      legajo: candidatos[0].id, desde: d.desde, hasta: d.hasta,
      comentario: d.comentario || '', notificado: !!d.notificado,
    });
    dao.saveRecord(record);
    creados++;
  }
  console.log('vacaciones 2026: ' + creados + ' períodos creados, ' + sinMatch + ' sin match por nombre.');
  return null;
}, (db) => {
  const dao = new Dao(db);
  const vacacionesCol = dao.findCollectionByNameOrId('fichadas_vacaciones');
  dao.findRecordsByFilter(vacacionesCol.id, "desde >= '2026-01-01' && desde <= '2026-12-31'", '', 2000, 0)
    .forEach((r) => dao.deleteRecord(r));
  return null;
})
`;
fs.writeFileSync(path.join(DESTINO_MIGRACIONES, '1789370000_seed_fichadas_vacaciones_2026.js'), migracionVacaciones);
console.log('Escrito: pb_migrations/1789370000_seed_fichadas_vacaciones_2026.js');
```

- [ ] **Step 2: Correr el script**

```bash
mkdir -p scripts-tmp
# pegar el contenido de arriba en scripts-tmp/extraer_vacaciones.js
node scripts-tmp/extraer_vacaciones.js
```

Expected (contra los archivos reales de `FICHADAS REPORTES/estadisticas/`, ya verificado en esta sesión de planificación):
```
[backfill] LIC-CHOF.xls: 62 personas con fecha de ingreso leída.
[backfill] LICENCIA VACACIONES - ADMINISTRATIVOS.xls: 14 personas con fecha de ingreso leída.
[backfill] LICENCIA VACACIONES - BSAS.xls: 14 personas con fecha de ingreso leída.
[backfill] LICENCIA VACACIONES - CBA.xls: 14 personas con fecha de ingreso leída.
[backfill] LICENCIA VACACIONES - OPERATIVOS.xls: 16 personas con fecha de ingreso leída.
[backfill] total personas distintas con fecha de ingreso: 120
[vacaciones] 10 períodos de SUCURSALES + 15 de CHOFERES = 25 períodos de 2026 (antes de matchear contra legajos).
Autochequeo OK (Carossio, Pablo).
Escrito: pb_migrations/1789360000_backfill_fecha_alta_desde_ingreso.js
Escrito: pb_migrations/1789370000_seed_fichadas_vacaciones_2026.js
```
(Si el repo tiene archivos distintos a los de esta sesión, los números de "personas"/"períodos leídos" pueden variar — lo que no puede fallar es el autochequeo de Carossio, Pablo, ni la escritura final de los 2 archivos.)

- [ ] **Step 3: Borrar el script temporal**

```bash
rm -rf scripts-tmp
```

- [ ] **Step 4: Probar las 2 migraciones generadas contra una PocketBase local real**

Repetir el setup de Task 1 Step 2 (o reutilizar el mismo `/tmp/pb-test` si sigue de la tarea anterior, corriendo `./pocketbase migrate up` de nuevo para que tome las 2 migraciones nuevas).

Run: `./pocketbase migrate up --migrationsDir mig --hooksDir hooks --dir data` (desde `/tmp/pb-test`, con los `.js` nuevos ya copiados a `mig/`)

Expected (contra la base armada únicamente con las migraciones de este repo, que es la misma foto de legajos que usó esta sesión para probar el script):
```
Applied 1789360000_backfill_fecha_alta_desde_ingreso.js
Applied 1789370000_seed_fichadas_vacaciones_2026.js
```
con, en la salida de consola de PocketBase, una línea final tipo `vacaciones: fecha_alta completada en 53 legajos (0 ya la tenían, 67 sin match por nombre)` y `vacaciones 2026: 12 períodos creados, 13 sin match por nombre` (más los 2 descartados antes por fecha inválida, que ni llegan a este paso). Si el número exacto difiere, lo que importa es que el total `completados + yaTenian + sinMatch` sea igual a la cantidad de `datos` de cada migración, y que no haya ningún error de SQL.

- [ ] **Step 5: Verificar un caso puntual con sqlite**

```bash
python3 -c "
import sqlite3
con = sqlite3.connect('data/data.db')
row = con.execute(\"SELECT desde, hasta FROM fichadas_vacaciones v JOIN fichadas_legajos l ON v.legajo = l.id WHERE l.nombre LIKE '%CAROSSIO%PABLO%' OR l.nombre LIKE '%PABLO%CAROSSIO%'\").fetchone()
assert row == ('2026-12-07', '2027-01-03'), row
print('OK: período de Carossio Pablo cargado correctamente ->', row)
"
```

Expected: `OK: período de Carossio Pablo cargado correctamente -> ('2026-12-07', '2027-01-03')`.

- [ ] **Step 6: Commit**

```bash
git add pb_migrations/1789360000_backfill_fecha_alta_desde_ingreso.js pb_migrations/1789370000_seed_fichadas_vacaciones_2026.js
git commit -m "data(fichadas): backfill de fecha_alta y carga de vacaciones 2026 desde los Excel de RRHH"
```

---

## Task 4: Pestaña "Vacaciones"

**Files:**
- Create: `web/src/pages/fichadas/VacacionesTab.tsx`
- Modify: `web/src/pages/fichadas/FichadasPage.tsx`

**Interfaces:**
- Consumes: `calcularResumenVacaciones`, `detectarSolapamientoGrupo` (Task 2); `FichadasVacacion`, `FichadasGrupoRestriccion` (Task 1); `pb`, `useToast`, `useConfirm`.
- Produces: pestaña "Vacaciones" navegable en `/rrhh/fichadas/vacaciones`.

- [ ] **Step 1: Crear `VacacionesTab.tsx`**

```tsx
import { useEffect, useMemo, useState } from 'react';
import { pb } from '../../lib/pb';
import { useToast } from '../../lib/ToastContext';
import { useConfirm } from '../../lib/ConfirmContext';
import { calcularResumenVacaciones, detectarSolapamientoGrupo } from './motor';
import type { FichadasEmpresa, FichadasGrupoRestriccion, FichadasLegajo, FichadasVacacion } from '../../types';

type Vista = 'lista' | 'por_legajo';

function fmtDias(n: number | null): string {
  if (n === null) return '—';
  const r = Math.round(n * 10) / 10;
  return r % 1 === 0 ? String(r) : r.toFixed(1);
}

function diasDelPeriodo(desde: string, hasta: string): number {
  return Math.round((new Date(hasta + 'T00:00:00Z').getTime() - new Date(desde + 'T00:00:00Z').getTime()) / 86400000) + 1;
}

export function VacacionesTab() {
  const toast = useToast();
  const confirm = useConfirm();
  const [vista, setVista] = useState<Vista>('lista');
  const [anio, setAnio] = useState(() => new Date().getFullYear());
  const [legajos, setLegajos] = useState<FichadasLegajo[]>([]);
  const [empresas, setEmpresas] = useState<FichadasEmpresa[]>([]);
  const [vacaciones, setVacaciones] = useState<FichadasVacacion[]>([]);
  const [grupos, setGrupos] = useState<FichadasGrupoRestriccion[]>([]);
  const [areaFiltro, setAreaFiltro] = useState('');
  const [tick, setTick] = useState(0);
  const refrescar = () => setTick((t) => t + 1);

  const [idLegajoNuevo, setIdLegajoNuevo] = useState('');
  const [desdeNuevo, setDesdeNuevo] = useState('');
  const [hastaNuevo, setHastaNuevo] = useState('');
  const [comentarioNuevo, setComentarioNuevo] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [l, e, v, g] = await Promise.all([
          pb.collection('fichadas_legajos').getFullList<FichadasLegajo>({ sort: 'nombre' }),
          pb.collection('fichadas_empresas').getFullList<FichadasEmpresa>({ sort: 'nombre' }),
          pb.collection('fichadas_vacaciones').getFullList<FichadasVacacion>({ sort: 'desde' }),
          pb.collection('fichadas_grupos_restriccion').getFullList<FichadasGrupoRestriccion>(),
        ]);
        setLegajos(l); setEmpresas(e); setVacaciones(v); setGrupos(g);
      } catch (err) {
        toast('No se pudo cargar Vacaciones: ' + (err instanceof Error ? err.message : ''), 'err');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  useEffect(() => { if (!idLegajoNuevo && legajos[0]) setIdLegajoNuevo(legajos[0].id); }, [legajos, idLegajoNuevo]);

  const empresaNombrePorId = useMemo(() => new Map(empresas.map((e) => [e.id, e.nombre])), [empresas]);
  const legajoPorId = useMemo(() => new Map(legajos.map((l) => [l.id, l])), [legajos]);

  const legajosParaResumen = useMemo(
    () => legajos.filter((l) => l.estado || vacaciones.some((v) => v.legajo === l.id && Number(v.desde.slice(0, 4)) === anio)),
    [legajos, vacaciones, anio]
  );
  const resumen = useMemo(
    () => calcularResumenVacaciones({ legajos: legajosParaResumen, vacaciones, empresaNombrePorId, anio }),
    [legajosParaResumen, vacaciones, empresaNombrePorId, anio]
  );

  const periodosDelAnio = useMemo(() => {
    return vacaciones
      .filter((v) => Number(v.desde.slice(0, 4)) === anio)
      .filter((v) => !areaFiltro || legajoPorId.get(v.legajo)?.empresa === areaFiltro)
      .sort((a, b) => a.desde.localeCompare(b.desde));
  }, [vacaciones, anio, areaFiltro, legajoPorId]);

  async function asignarPeriodo() {
    if (!idLegajoNuevo || !desdeNuevo || !hastaNuevo) { toast('Completá empleado, desde y hasta.', 'warn'); return; }
    if (hastaNuevo < desdeNuevo) { toast('"Hasta" no puede ser anterior a "Desde".', 'warn'); return; }
    setGuardando(true);
    try {
      const creado = await pb.collection('fichadas_vacaciones').create<FichadasVacacion>({
        legajo: idLegajoNuevo, desde: desdeNuevo, hasta: hastaNuevo, comentario: comentarioNuevo.trim() || null,
      });

      const legajoElegido = legajoPorId.get(idLegajoNuevo);
      const anioDelPeriodo = Number(desdeNuevo.slice(0, 4));
      if (legajoElegido) {
        const resumenLegajo = calcularResumenVacaciones({
          legajos: [legajoElegido], vacaciones: [...vacaciones, creado], empresaNombrePorId, anio: anioDelPeriodo,
        })[0];
        if (resumenLegajo.diasRestantes !== null && resumenLegajo.diasRestantes < 0) {
          toast(`${resumenLegajo.nombre} queda con ${fmtDias(resumenLegajo.diasRestantes)} días de exceso sobre lo que le corresponde en ${anioDelPeriodo}.`, 'warn');
        }
      }

      const solapa = detectarSolapamientoGrupo({
        idLegajo: idLegajoNuevo, desde: desdeNuevo, hasta: hastaNuevo, grupos, vacaciones: [...vacaciones, creado], legajoPorId,
      });
      solapa.forEach((s) => {
        toast(`Se solapa con ${s.nombre} (${s.desde} a ${s.hasta}), que está en el mismo grupo de restricción.`, 'warn');
      });

      setDesdeNuevo(''); setHastaNuevo(''); setComentarioNuevo('');
      refrescar();
      toast('Período asignado.', 'ok');
    } catch (e) {
      toast('Error: ' + (e instanceof Error ? e.message : ''), 'err');
    } finally {
      setGuardando(false);
    }
  }

  async function eliminarPeriodo(id: string) {
    if (!(await confirm('¿Eliminar este período de vacaciones?', 'Eliminar período'))) return;
    try {
      await pb.collection('fichadas_vacaciones').delete(id);
      refrescar();
      toast('Eliminado.', 'ok');
    } catch (e) {
      toast('Error: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }

  async function toggleNotificado(v: FichadasVacacion) {
    try {
      await pb.collection('fichadas_vacaciones').update(v.id, { notificado: !v.notificado });
      refrescar();
    } catch (e) {
      toast('Error: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }

  return (
    <div className="card">
      <h2>Vacaciones</h2>
      <div className="hint">Días por antigüedad, asignación de períodos y control de notificación — reemplaza los Excel de licencias que arma RRHH a mano.</div>

      <div className="row" style={{ marginTop: 14, flexWrap: 'wrap', alignItems: 'end' }}>
        <div className="field">
          <label>Ver</label>
          <select value={vista} onChange={(e) => setVista(e.target.value as Vista)}>
            <option value="lista">Lista por fecha</option>
            <option value="por_legajo">Por legajo</option>
          </select>
        </div>
        <div className="field">
          <label>Año</label>
          <input type="number" min={2020} max={new Date().getFullYear() + 2} value={anio} onChange={(e) => setAnio(Number(e.target.value))} style={{ width: 90 }} />
        </div>
        {vista === 'lista' && (
          <div className="field">
            <label>Área</label>
            <select value={areaFiltro} onChange={(e) => setAreaFiltro(e.target.value)}>
              <option value="">Todas</option>
              {empresas.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
            </select>
          </div>
        )}
      </div>

      <h3 style={{ fontSize: 13, color: 'var(--navy)', margin: '18px 0 8px' }}>Asignar período</h3>
      <div className="row">
        <div className="field" style={{ flex: 2 }}>
          <label>Empleado</label>
          <select value={idLegajoNuevo} onChange={(e) => setIdLegajoNuevo(e.target.value)}>
            {legajos.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
          </select>
        </div>
        <div className="field"><label>Desde</label><input type="date" value={desdeNuevo} onChange={(e) => setDesdeNuevo(e.target.value)} /></div>
        <div className="field"><label>Hasta</label><input type="date" value={hastaNuevo} onChange={(e) => setHastaNuevo(e.target.value)} /></div>
        <div className="field" style={{ flex: 2 }}><label>Comentario</label><input value={comentarioNuevo} onChange={(e) => setComentarioNuevo(e.target.value)} placeholder="Opcional" /></div>
        <button onClick={asignarPeriodo} disabled={guardando}>{guardando ? 'Guardando…' : 'Asignar'}</button>
      </div>

      {vista === 'lista' && (
        <>
          <h3 style={{ fontSize: 13, color: 'var(--navy)', margin: '18px 0 8px' }}>Períodos de {anio} ({periodosDelAnio.length})</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Legajo</th><th>Nombre</th><th>Área</th><th>Desde</th><th>Hasta</th><th>Días</th><th>Comentario</th><th>Notificado</th><th></th></tr></thead>
              <tbody>
                {periodosDelAnio.map((v) => {
                  const l = legajoPorId.get(v.legajo);
                  return (
                    <tr key={v.id}>
                      <td>{l?.nro_legajo || '—'}</td>
                      <td className="admin-name">{l?.nombre || '—'}</td>
                      <td>{l?.empresa ? (empresaNombrePorId.get(l.empresa) || '—') : '—'}</td>
                      <td>{v.desde}</td>
                      <td>{v.hasta}</td>
                      <td className="num">{diasDelPeriodo(v.desde, v.hasta)}</td>
                      <td>{v.comentario || ''}</td>
                      <td><input type="checkbox" checked={!!v.notificado} onChange={() => toggleNotificado(v)} /></td>
                      <td><button className="small danger" onClick={() => eliminarPeriodo(v.id)}>Eliminar</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {periodosDelAnio.length === 0 && <div className="empty" style={{ marginTop: 16 }}>Sin períodos asignados en {anio}.</div>}
        </>
      )}

      {vista === 'por_legajo' && (
        <>
          <h3 style={{ fontSize: 13, color: 'var(--navy)', margin: '18px 0 8px' }}>Resumen por legajo — {anio}</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Legajo</th><th>Nombre</th><th>Área</th><th>Corresponden</th><th>Asignados</th><th>Restantes</th><th>Períodos</th></tr></thead>
              <tbody>
                {resumen.map((r) => (
                  <tr key={r.idLegajo}>
                    <td>{legajoPorId.get(r.idLegajo)?.nro_legajo || '—'}</td>
                    <td className="admin-name">{r.nombre}</td>
                    <td>{r.area}</td>
                    <td className="num">{fmtDias(r.diasQueCorresponden)}</td>
                    <td className="num">{fmtDias(r.diasAsignados)}</td>
                    <td className="num" style={r.diasRestantes !== null && r.diasRestantes < 0 ? { color: 'var(--warn)', fontWeight: 700 } : undefined}>{fmtDias(r.diasRestantes)}</td>
                    <td>{r.periodos.map((p) => `${p.desde} a ${p.hasta}`).join(' | ') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Agregar la pestaña a `FichadasPage.tsx`**

Buscar:

```typescript
import { CargaTab } from './CargaTab';
import { ResultadosTab } from './ResultadosTab';
import { EstadisticasTab } from './EstadisticasTab';
import { ConfiguracionTab } from './ConfiguracionTab';

const TABS = [
  { id: 'carga', label: 'Carga y novedades' },
  { id: 'resultados', label: 'Resultados' },
  { id: 'estadisticas', label: 'Estadísticas' },
  { id: 'configuracion', label: 'Configuración' },
];
```

Reemplazar por:

```typescript
import { CargaTab } from './CargaTab';
import { ResultadosTab } from './ResultadosTab';
import { EstadisticasTab } from './EstadisticasTab';
import { VacacionesTab } from './VacacionesTab';
import { ConfiguracionTab } from './ConfiguracionTab';

const TABS = [
  { id: 'carga', label: 'Carga y novedades' },
  { id: 'resultados', label: 'Resultados' },
  { id: 'estadisticas', label: 'Estadísticas' },
  { id: 'vacaciones', label: 'Vacaciones' },
  { id: 'configuracion', label: 'Configuración' },
];
```

Y buscar:

```typescript
      {tab === 'carga' && <CargaTab />}
      {tab === 'resultados' && <ResultadosTab />}
      {tab === 'estadisticas' && <EstadisticasTab />}
      {tab === 'configuracion' && <ConfiguracionTab />}
```

Reemplazar por:

```typescript
      {tab === 'carga' && <CargaTab />}
      {tab === 'resultados' && <ResultadosTab />}
      {tab === 'estadisticas' && <EstadisticasTab />}
      {tab === 'vacaciones' && <VacacionesTab />}
      {tab === 'configuracion' && <ConfiguracionTab />}
```

- [ ] **Step 3: Build**

Run: `cd web && npm run build`
Expected: build exitoso, sin errores de TypeScript.

- [ ] **Step 4: Verificación manual**

1. `cd web && npm run dev`, entrar a `/rrhh/fichadas/vacaciones` logueado con un usuario con el módulo `fichadas`.
2. Confirmar que aparece la pestaña "Vacaciones" entre "Estadísticas" y "Configuración".
3. Elegir un empleado, asignar un período de vacaciones con fechas de prueba, confirmar que aparece en "Lista por fecha" con los días calculados correctamente.
4. Cambiar a "Por legajo" y confirmar que ese empleado muestra días asignados/restantes actualizados.
5. Tildar "Notificado" en un período y refrescar la página — confirmar que el tilde persiste.

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/fichadas/VacacionesTab.tsx web/src/pages/fichadas/FichadasPage.tsx
git commit -m "feat(fichadas): pestaña Vacaciones (lista por fecha, resumen por legajo, asignar período)"
```

---

## Task 5: Grupos de restricción (dentro de Configuración)

**Files:**
- Modify: `web/src/pages/fichadas/ConfiguracionTab.tsx`

**Interfaces:**
- Consumes: `FichadasGrupoRestriccion`, `FichadasLegajo` (Task 1); `pb`, `useToast`, `useConfirm`.
- Produces: sub-tab "Grupos de restricción" dentro de Configuración, para que RRHH arme los grupos que después usa `detectarSolapamientoGrupo` en la pestaña Vacaciones.

- [ ] **Step 1: Agregar el import y el sub-tab**

Buscar:

```typescript
import type { DiaHorario, FichadasEmpresa, FichadasHorario, FichadasLegajo, HoraExtraFija } from '../../types';

const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const SUB_TABS = [
  { id: 'empleados', label: 'Empleados' },
  { id: 'horario_personal', label: 'Horario personalizado' },
  { id: 'horas_fijas', label: 'Horas extra fijas' },
  { id: 'plantillas', label: 'Plantillas de horario' },
  { id: 'areas', label: 'Áreas' },
] as const;
```

Reemplazar por:

```typescript
import type { DiaHorario, FichadasEmpresa, FichadasGrupoRestriccion, FichadasHorario, FichadasLegajo, HoraExtraFija } from '../../types';

const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const SUB_TABS = [
  { id: 'empleados', label: 'Empleados' },
  { id: 'horario_personal', label: 'Horario personalizado' },
  { id: 'horas_fijas', label: 'Horas extra fijas' },
  { id: 'plantillas', label: 'Plantillas de horario' },
  { id: 'areas', label: 'Áreas' },
  { id: 'grupos_restriccion', label: 'Grupos de restricción' },
] as const;
```

Buscar:

```typescript
        {subTab === 'areas' && <AreasSub empresas={empresas} legajos={legajos} onChanged={refrescar} />}
      </div>
    </div>
  );
}
```

Reemplazar por:

```typescript
        {subTab === 'areas' && <AreasSub empresas={empresas} legajos={legajos} onChanged={refrescar} />}
        {subTab === 'grupos_restriccion' && <GruposRestriccionSub legajos={legajos} />}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Agregar el componente `GruposRestriccionSub` al final del archivo**

```tsx
// ---------- Grupos de restricción (vacaciones que no pueden coincidir) ----------

function GruposRestriccionSub({ legajos }: { legajos: FichadasLegajo[] }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [grupos, setGrupos] = useState<FichadasGrupoRestriccion[]>([]);
  const [nombreNuevo, setNombreNuevo] = useState('');
  const [seleccionNueva, setSeleccionNueva] = useState<string[]>([]);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [seleccionEditando, setSeleccionEditando] = useState<string[]>([]);

  async function cargar() {
    try {
      const g = await pb.collection('fichadas_grupos_restriccion').getFullList<FichadasGrupoRestriccion>({ sort: 'nombre' });
      setGrupos(g);
    } catch (e) {
      toast('No se pudieron cargar los grupos: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }
  useEffect(() => { cargar(); }, []);

  function opcionesSeleccionadas(select: HTMLSelectElement): string[] {
    return Array.from(select.selectedOptions).map((o) => o.value);
  }

  async function crear() {
    if (seleccionNueva.length < 2) { toast('Elegí al menos 2 personas para el grupo.', 'warn'); return; }
    try {
      await pb.collection('fichadas_grupos_restriccion').create({ nombre: nombreNuevo.trim() || null, legajos: seleccionNueva });
      setNombreNuevo(''); setSeleccionNueva([]);
      cargar();
      toast('Grupo creado.', 'ok');
    } catch (e) {
      toast('Error: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }

  function abrirEdicion(g: FichadasGrupoRestriccion) {
    setEditandoId(g.id);
    setSeleccionEditando(g.legajos);
  }

  async function guardarEdicion() {
    if (!editandoId) return;
    if (seleccionEditando.length < 2) { toast('El grupo necesita al menos 2 personas.', 'warn'); return; }
    try {
      await pb.collection('fichadas_grupos_restriccion').update(editandoId, { legajos: seleccionEditando });
      setEditandoId(null);
      cargar();
      toast('Grupo actualizado.', 'ok');
    } catch (e) {
      toast('Error: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }

  async function eliminar(id: string) {
    if (!(await confirm('¿Eliminar este grupo de restricción?', 'Eliminar grupo'))) return;
    try {
      await pb.collection('fichadas_grupos_restriccion').delete(id);
      cargar();
      toast('Eliminado.', 'ok');
    } catch (e) {
      toast('Error: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }

  const legajoPorId = new Map(legajos.map((l) => [l.id, l]));

  return (
    <>
      <div className="hint">Personas que no pueden coincidir de vacaciones al mismo tiempo. Al asignar un período que se solapa con alguien del mismo grupo, la pestaña Vacaciones avisa (no bloquea).</div>
      <h3 style={{ fontSize: 13, color: 'var(--navy)', margin: '14px 0 8px' }}>Nuevo grupo</h3>
      <div className="row">
        <div className="field"><label>Nombre (opcional)</label><input value={nombreNuevo} onChange={(e) => setNombreNuevo(e.target.value)} placeholder="Ej: Julian y Diego" /></div>
        <div className="field" style={{ flex: 2 }}>
          <label>Personas (Ctrl/Cmd + clic para elegir varias)</label>
          <select multiple value={seleccionNueva} onChange={(e) => setSeleccionNueva(opcionesSeleccionadas(e.target))} style={{ height: 140 }}>
            {legajos.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
          </select>
        </div>
        <button onClick={crear}>Crear grupo</button>
      </div>

      <h3 style={{ fontSize: 13, color: 'var(--navy)', margin: '18px 0 8px' }}>Grupos ({grupos.length})</h3>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Nombre</th><th>Personas</th><th></th></tr></thead>
          <tbody>
            {grupos.map((g) => (
              <tr key={g.id}>
                <td className="admin-name">{g.nombre || '—'}</td>
                <td>{g.legajos.map((id) => legajoPorId.get(id)?.nombre || '—').join(', ')}</td>
                <td>
                  <button className="small secondary" onClick={() => abrirEdicion(g)}>Editar</button>
                  <button className="small danger" onClick={() => eliminar(g.id)}>Eliminar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editandoId && (
        <>
          <h3 style={{ fontSize: 13, color: 'var(--navy)', margin: '18px 0 8px' }}>Editar personas del grupo</h3>
          <div className="row">
            <div className="field" style={{ flex: 2 }}>
              <select multiple value={seleccionEditando} onChange={(e) => setSeleccionEditando(opcionesSeleccionadas(e.target))} style={{ height: 140 }}>
                {legajos.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
              </select>
            </div>
            <button onClick={guardarEdicion}>Guardar</button>
            <button className="secondary" onClick={() => setEditandoId(null)}>Cancelar</button>
          </div>
        </>
      )}
    </>
  );
}
```

- [ ] **Step 3: Build**

Run: `cd web && npm run build`
Expected: build exitoso, sin errores de TypeScript.

- [ ] **Step 4: Verificación manual**

1. `cd web && npm run dev`, entrar a Fichadas → Configuración → "Grupos de restricción".
2. Crear un grupo con 2 personas, confirmar que aparece en la tabla.
3. Ir a la pestaña Vacaciones, asignarle a una de esas 2 personas un período que se solape con un período ya asignado a la otra — confirmar que aparece el toast de aviso con el nombre y las fechas correctas, y que el período se guarda igual.
4. Volver a Configuración → Grupos de restricción, editar el grupo (sacar una persona, poner otra), confirmar que se guarda.
5. Eliminar el grupo, confirmar que desaparece de la tabla.

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/fichadas/ConfiguracionTab.tsx
git commit -m "feat(fichadas): grupos de restricción de vacaciones en Configuración"
```
