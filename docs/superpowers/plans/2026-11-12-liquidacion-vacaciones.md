# Liquidación de Vacaciones Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar el cálculo de cuánta plata se le paga a un legajo por un período de vacaciones ya asignado (liquidación), reemplazando el Excel que arma RRHH a mano (`ACTIS TOBIAS.xls`), dentro del módulo Vacaciones ya existente.

**Architecture:** Una colección nueva (`fichadas_categorias`, con los parámetros de convenio: Plus Vacacional, divisor, 6 % de descuento) + 2 campos nuevos en `fichadas_legajos` (`categoria`, `basico`) + 4 funciones puras nuevas en `motor.ts` (antigüedad de liquidación, promedio de horas extra, partir un período por mes, y el cálculo completo) + una pantalla nueva de administración de categorías (sub-vista de Vacaciones) + un botón "Liquidar" por período en la vista "Lista por fecha" ya existente, que abre un panel con el desglose completo.

**Tech Stack:** React + TypeScript (Vite), PocketBase (migraciones), `tsx` para probar las funciones puras.

## Global Constraints

- Reglas de acceso de la colección nueva: mismo patrón ya establecido para Vacaciones — `@request.auth.id != "" && (@request.auth.rol = "admin" || @request.auth.modulos ~ "vacaciones")` para list/view/create/update, `@request.auth.rol = "admin"` para delete. **Usar siempre el operador `~`, nunca `?=`** — `usuarios.modulos` es un campo `json` plano, y `?=` no matchea nunca contra él (bug real ya encontrado y corregido en `pb_migrations/1789410000_corregir_operador_modulos_a_like.js`; cualquier regla nueva que toque `modulos` tiene que usar `~`).
- `calcularAntiguedadPctLiquidacion(fechaAlta, anioLiquidacion) = (anioLiquidacion - Number(fechaAlta.slice(0,4))) + 1`. Sin `fechaAlta`: no calculable (`null`).
- El % de antigüedad de un tramo usa el año **de ese tramo** (`anioMes`), no un año global del período — si el período cruza de diciembre a enero, los dos tramos pueden tener % distinto.
- `calcularHorasExtraPromedioPorLegajo`: promedio en **horas** (no minutos — `ResultadoDia.hE` está en minutos) de los 6 meses calendario **inmediatamente anteriores** al mes de inicio del período (sin incluirlo).
- Fórmula completa por tramo (copiada del Excel real, no reinterpretar):
  - `valorHoraExtra = basico / 24 / 8 * 1.5`
  - `montoHorasExtra = valorHoraExtra * horasExtraPromedio`
  - `antiguedadPct = calcularAntiguedadPctLiquidacion(fechaAlta, añoDelTramo)`
  - `montoAntiguedad = (basico + montoHorasExtra) * antiguedadPct / 100`
  - `totalMensual = basico + montoHorasExtra + montoAntiguedad`
  - `porDia = totalMensual / categoria.divisor_mensual`
  - `vacacionesBase = porDia * díasDelTramo`
  - `plusVacacional = categoria.plus_vacacional * díasDelTramo`
  - `antiguedadPlusVacacional = plusVacacional * antiguedadPct / 100`
  - `bruto = vacacionesBase + plusVacacional + antiguedadPlusVacacional`
  - 6 descuentos individuales = `bruto * categoria.pct_X / 100` cada uno (jubilación, ley19032, obra social, ANSSAL, cuota sindical, seguro de sepelio) — **calcular cada uno por separado para mostrarlos desglosados**, no solo el total.
  - `neto = bruto - totalDescuentos`
- Caso de prueba real (`ACTIS TOBIAS.xls`, legajo 588, verificado celda por celda con openpyxl contra el archivo real): `fechaAlta='2025-10-15'`, `basico=1216186.92`, categoría con `plus_vacacional=25584.83`, `divisor_mensual=24`, `pct_jubilacion=11`, `pct_ley19032=3`, `pct_obra_social=2.55`, `pct_ansal=0.45`, `pct_cuota_sindical=3`, `pct_seguro_sepelio=1.5`, período `desde='2026-09-28'` `hasta='2026-10-11'`. **El valor real de `horasExtraPromedio` usado en esa liquidación fue `0`** (el Excel tiene un promedio de 6 meses calculado aparte, de `0.08333333333333333`, pero la celda que de verdad alimenta la fórmula principal quedó en 0 en este caso puntual — son dos números distintos del mismo archivo, no te confundas si los ves juntos). Con `horasExtraPromedio=0`, los valores esperados son exactos (tolerancia `1e-6`):
  - Tramo "2026-09" (3 días): `antiguedadPct=2`, `totalMensual=1240510.6584`, `porDia=51687.9441`, `vacacionesBase=155063.8323`, `plusVacacional=76754.49`, `antiguedadPlusVacacional=1535.0898`, `bruto=233353.4121`, `totalDescuentos=50170.9836015`, `neto=183182.4284985`.
  - Tramo "2026-10" (11 días): `antiguedadPct=2`, `totalMensual=1240510.6584` (igual), `porDia=51687.9441` (igual), `vacacionesBase=568567.3851`, `plusVacacional=281433.13`, `antiguedadPlusVacacional=5628.6626`, `bruto=855629.1777`, `totalDescuentos=183960.2732055`, `neto=671668.9044945`.
  - Si algún número intermedio no te cierra exacto, recalculá a mano con una calculadora antes de asumir que el valor de este documento está mal — son valores reales, no estimaciones.
- `calcularHorasExtraPromedioPorLegajo`, probado por separado (no mezclado con el caso de arriba): con horas extra mensuales reales de este mismo legajo en marzo-agosto 2026 de `0, 0, 0, 0.5, 0, 0` horas (extraídas de `B38:B43` del Excel real), el promedio esperado es `0.5 / 6 = 0.08333333333333333`.
- Testing: funciones puras probadas con `tsx` de forma aislada (el script se escribe, se corre, y se borra — no queda trackeado en git), igual criterio que el resto de `motor.ts`. Migraciones probadas contra una PocketBase local real (v0.22.55; en Windows, `pocketbase_0.22.55_windows_amd64.zip` + `pocketbase.exe`).
- No se migra ningún cálculo histórico — se arranca de cero.
- No se toca Planilla Choferes.

---

## Task 1: Colección `fichadas_categorias` + campos nuevos en `fichadas_legajos` + tipos TS

**Files:**
- Create: `pb_migrations/1789450000_fichadas_categorias.js`
- Modify: `web/src/types.ts`

**Interfaces:**
- Produces: colección `fichadas_categorias` (`nombre` text requerido, `plus_vacacional`/`divisor_mensual`/`pct_jubilacion`/`pct_ley19032`/`pct_obra_social`/`pct_ansal`/`pct_cuota_sindical`/`pct_seguro_sepelio` number requeridos), campos `categoria` (relation, opcional) y `basico` (number, opcional) en `fichadas_legajos`. Tipo TS `FichadasCategoria`; `FichadasLegajo.categoria?: string`, `FichadasLegajo.basico?: number`.

- [ ] **Step 1: Escribir la migración**

```javascript
/// <reference path="../pb_data/types.d.ts" />
// Liquidación de Vacaciones: colección nueva con los parámetros de
// convenio por categoría (Plus Vacacional, divisor mensual, y los 6 %
// de descuento), más categoria/basico en fichadas_legajos. Ver
// docs/superpowers/specs/2026-11-11-liquidacion-vacaciones-design.md.
migrate((db) => {
  const dao = new Dao(db);
  dao.saveCollection(new Collection({
    "id": "fchd0categor01",
    "name": "fichadas_categorias",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false, "id": "fcc0nombre001", "name": "nombre", "type": "text",
        "required": true, "presentable": true, "unique": false,
        "options": { "min": null, "max": null, "pattern": "" }
      },
      {
        "system": false, "id": "fcc0plusvac01", "name": "plus_vacacional", "type": "number",
        "required": true, "presentable": true, "unique": false,
        "options": { "min": 0, "max": null, "noDecimal": false }
      },
      {
        "system": false, "id": "fcc0divisor01", "name": "divisor_mensual", "type": "number",
        "required": true, "presentable": true, "unique": false,
        "options": { "min": 1, "max": null, "noDecimal": false }
      },
      {
        "system": false, "id": "fcc0pctjubil1", "name": "pct_jubilacion", "type": "number",
        "required": true, "presentable": false, "unique": false,
        "options": { "min": 0, "max": 100, "noDecimal": false }
      },
      {
        "system": false, "id": "fcc0pctley191", "name": "pct_ley19032", "type": "number",
        "required": true, "presentable": false, "unique": false,
        "options": { "min": 0, "max": 100, "noDecimal": false }
      },
      {
        "system": false, "id": "fcc0pctobrso1", "name": "pct_obra_social", "type": "number",
        "required": true, "presentable": false, "unique": false,
        "options": { "min": 0, "max": 100, "noDecimal": false }
      },
      {
        "system": false, "id": "fcc0pctansal1", "name": "pct_ansal", "type": "number",
        "required": true, "presentable": false, "unique": false,
        "options": { "min": 0, "max": 100, "noDecimal": false }
      },
      {
        "system": false, "id": "fcc0pctsindi1", "name": "pct_cuota_sindical", "type": "number",
        "required": true, "presentable": false, "unique": false,
        "options": { "min": 0, "max": 100, "noDecimal": false }
      },
      {
        "system": false, "id": "fcc0pctsepel1", "name": "pct_seguro_sepelio", "type": "number",
        "required": true, "presentable": false, "unique": false,
        "options": { "min": 0, "max": 100, "noDecimal": false }
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

  const legajos = dao.findCollectionByNameOrId('fichadas_legajos');
  legajos.schema.addField(new SchemaField({
    system: false, id: 'fcl0categoria1', name: 'categoria', type: 'relation',
    required: false, presentable: false, unique: false,
    options: {
      collectionId: 'fchd0categor01', cascadeDelete: false,
      minSelect: null, maxSelect: 1, displayFields: ['nombre'],
    },
  }));
  legajos.schema.addField(new SchemaField({
    system: false, id: 'fcl0basico001', name: 'basico', type: 'number',
    required: false, presentable: false, unique: false,
    options: { min: 0, max: null, noDecimal: false },
  }));
  dao.saveCollection(legajos);

  return null;
}, (db) => {
  const dao = new Dao(db);
  const legajos = dao.findCollectionByNameOrId('fichadas_legajos');
  legajos.schema.removeField('fcl0categoria1');
  legajos.schema.removeField('fcl0basico001');
  dao.saveCollection(legajos);
  try { dao.deleteCollection(dao.findCollectionByNameOrId('fichadas_categorias')); } catch (e) { /* no existía */ }
  return null;
})
```

- [ ] **Step 2: Probar contra una PocketBase local real**

```bash
mkdir -p /tmp/pb-test && cd /tmp/pb-test
curl -sL -o pb.zip "https://github.com/pocketbase/pocketbase/releases/download/v0.22.55/pocketbase_0.22.55_windows_amd64.zip"
unzip -o pb.zip
rm -rf data mig hooks
mkdir -p mig hooks
cp /ruta/al/repo/pb_migrations/*.js mig/
cp /ruta/al/repo/pb_hooks/*.js hooks/
./pocketbase.exe migrate up --migrationsDir mig --hooksDir hooks --dir data
```

(En Linux, usar `pocketbase_0.22.55_linux_amd64.zip` y `./pocketbase` en vez de `pocketbase.exe`.)

Expected: `Applied 1789450000_fichadas_categorias.js` sin errores, junto con todas las migraciones anteriores.

- [ ] **Step 3: Verificar el esquema con sqlite**

```bash
python3 -c "
import sqlite3, json
con = sqlite3.connect('data/data.db')
row = con.execute(\"SELECT schema FROM _collections WHERE name='fichadas_categorias'\").fetchone()
assert row is not None, 'fichadas_categorias no existe'
campos = {f['name']: f for f in json.loads(row[0])}
for c in ['nombre','plus_vacacional','divisor_mensual','pct_jubilacion','pct_ley19032','pct_obra_social','pct_ansal','pct_cuota_sindical','pct_seguro_sepelio']:
    assert c in campos, c + ' falta'
    assert campos[c]['required'] is True, c + ' debería ser requerido'
rules = con.execute(\"SELECT listRule FROM _collections WHERE name='fichadas_categorias'\").fetchone()[0]
assert 'modulos ~' in rules and 'modulos ?=' not in rules, 'la regla tiene que usar ~, no ?='
row2 = con.execute(\"SELECT schema FROM _collections WHERE name='fichadas_legajos'\").fetchone()
campos2 = {f['name']: f for f in json.loads(row2[0])}
assert 'categoria' in campos2 and campos2['categoria']['required'] is False
assert 'basico' in campos2 and campos2['basico']['required'] is False
print('OK: fichadas_categorias y los 2 campos nuevos de fichadas_legajos están bien')
"
```

Expected: `OK: fichadas_categorias y los 2 campos nuevos de fichadas_legajos están bien`, sin `AssertionError`.

- [ ] **Step 4: Agregar los tipos en `web/src/types.ts`**

Buscar la interfaz `FichadasLegajo` (cerca de la línea 281) y agregar `categoria?: string;` y `basico?: number;` justo antes de `expand?:`:

```typescript
export interface FichadasLegajo extends BaseRecord {
  nro_legajo?: string;
  nro_tarjeta: string;
  nombre: string;
  dni?: string;
  empresa?: string;
  horario?: string;
  dias_personalizados?: DiaHorario[] | null;
  horas_extra_fijas?: HoraExtraFija[] | null;
  horas_extra_fijas_desde?: string;
  estado: boolean;
  fecha_alta?: string;
  fecha_baja?: string;
  motivo_baja?: string;
  categoria?: string;
  basico?: number;
  expand?: { empresa?: FichadasEmpresa; horario?: FichadasHorario; categoria?: FichadasCategoria };
}
```

Y agregar, después del bloque `FichadasGrupoRestriccion` (buscar `export interface FichadasGrupoRestriccion`, el bloque termina con `}`), la interfaz nueva:

```typescript
export interface FichadasCategoria extends BaseRecord {
  nombre: string;
  plus_vacacional: number;
  divisor_mensual: number;
  pct_jubilacion: number;
  pct_ley19032: number;
  pct_obra_social: number;
  pct_ansal: number;
  pct_cuota_sindical: number;
  pct_seguro_sepelio: number;
}
```

- [ ] **Step 5: Build**

Run: `cd web && npm run build`
Expected: build exitoso, sin errores de TypeScript.

- [ ] **Step 6: Commit**

```bash
git add pb_migrations/1789450000_fichadas_categorias.js web/src/types.ts
git commit -m "feat(fichadas): coleccion fichadas_categorias y campos categoria/basico en legajos"
```

---

## Task 2: Funciones puras de cálculo en `motor.ts`

**Files:**
- Modify: `web/src/pages/fichadas/motor.ts`
- Test (temporal, se borra): `web/src/pages/fichadas/motor.test-liquidacion.ts`

**Interfaces:**
- Consumes: `ResultadoDia` (ya existe en `motor.ts`, tiene `idLegajo: string`, `fecha: string`, `hE: number` en minutos), `FichadasCategoria` (Task 1).
- Produces: `calcularAntiguedadPctLiquidacion(fechaAlta, anioLiquidacion): number | null`, `partirPeriodoPorMes(desde, hasta): TramoMes[]`, `calcularHorasExtraPromedioPorLegajo(resultados, idLegajo, mesInicioExclusive, meses?): number`, `calcularLiquidacionVacaciones(params): { tramos: TramoLiquidacion[]; bruto: number; totalDescuentos: number; neto: number } | null`, interfaces `TramoMes` y `TramoLiquidacion`.

- [ ] **Step 1: Agregar el import de `FichadasCategoria` y las funciones al final de `motor.ts`**

Buscar la línea de import de tipos (línea 1) y agregar `FichadasCategoria` en orden alfabético:

```typescript
import type { DiaHorario, FichadasCategoria, FichadasFeriado, FichadasGrupoRestriccion, FichadasLegajo, FichadasMarca, FichadasNovedad, FichadasVacacion, HistorialLegajo } from '../../types';
```

Agregar este bloque al final del archivo (después de `detectarSolapamientoGrupo`):

```typescript
// ---------- Liquidación de Vacaciones ----------

// (añoLiquidacion - año de fecha_alta) + 1 -- se cuenta por años
// calendario que abarca el período trabajado, no por años cumplidos
// (verificado contra un caso real: ingreso 2025, liquidación 2026 ->
// antigüedad 2, no 1). Sin fecha_alta: no calculable.
export function calcularAntiguedadPctLiquidacion(fechaAlta: string | null | undefined, anioLiquidacion: number): number | null {
  if (!fechaAlta) return null;
  const anioAlta = Number(fechaAlta.slice(0, 4));
  return (anioLiquidacion - anioAlta) + 1;
}

export interface TramoMes {
  anioMes: string; // "YYYY-MM"
  desde: string; // "YYYY-MM-DD"
  hasta: string; // "YYYY-MM-DD"
  dias: number; // inclusive
}

// Parte [desde,hasta] en tramos que no cruzan de mes calendario -- cada
// tramo tiene su propio "año" para el cálculo de antigüedad de
// liquidación (un período que cruza de diciembre a enero puede tener
// % distinto en cada tramo).
export function partirPeriodoPorMes(desde: string, hasta: string): TramoMes[] {
  const [yD, mD, dD] = desde.split('-').map(Number);
  const [yH, mH, dH] = hasta.split('-').map(Number);
  const hastaUtc = Date.UTC(yH, mH - 1, dH);
  const tramos: TramoMes[] = [];
  let curUtc = Date.UTC(yD, mD - 1, dD);
  while (curUtc <= hastaUtc) {
    const cur = new Date(curUtc);
    const anio = cur.getUTCFullYear();
    const mes = cur.getUTCMonth(); // 0-indexado
    const finDeMesUtc = Date.UTC(anio, mes + 1, 0); // último día de este mes
    const finTramoUtc = Math.min(hastaUtc, finDeMesUtc);
    const dias = Math.round((finTramoUtc - curUtc) / 86400000) + 1;
    tramos.push({
      anioMes: `${anio}-${String(mes + 1).padStart(2, '0')}`,
      desde: new Date(curUtc).toISOString().slice(0, 10),
      hasta: new Date(finTramoUtc).toISOString().slice(0, 10),
      dias,
    });
    curUtc = finTramoUtc + 86400000;
  }
  return tramos;
}

// Promedio en HORAS (ResultadoDia.hE está en minutos) de horas extra de
// los `meses` meses calendario inmediatamente anteriores a
// `mesInicioExclusive` (sin incluirlo), para un legajo puntual.
export function calcularHorasExtraPromedioPorLegajo(
  resultados: ResultadoDia[],
  idLegajo: string,
  mesInicioExclusive: string, // "YYYY-MM"
  meses = 6
): number {
  const [anioInicio, mesInicio] = mesInicioExclusive.split('-').map(Number);
  const indiceInicio = anioInicio * 12 + (mesInicio - 1);
  const indicesVentana = new Set<number>();
  for (let i = 1; i <= meses; i++) indicesVentana.add(indiceInicio - i);

  let totalMinutos = 0;
  resultados.forEach((r) => {
    if (r.idLegajo !== idLegajo) return;
    const [y, m] = r.fecha.split('-').map(Number);
    const indice = y * 12 + (m - 1);
    if (indicesVentana.has(indice)) totalMinutos += r.hE;
  });
  return totalMinutos / 60 / meses;
}

export interface TramoLiquidacion {
  anioMes: string;
  dias: number;
  antiguedadPct: number;
  totalMensual: number;
  porDia: number;
  vacacionesBase: number;
  plusVacacional: number;
  antiguedadPlusVacacional: number;
  bruto: number;
  descuentoJubilacion: number;
  descuentoLey19032: number;
  descuentoObraSocial: number;
  descuentoAnsal: number;
  descuentoCuotaSindical: number;
  descuentoSeguroSepelio: number;
  totalDescuentos: number;
  neto: number;
}

// Replica exacta de las fórmulas del Excel de RRHH (ACTIS TOBIAS.xls).
// Un período que cruza de mes se parte en tramos (partirPeriodoPorMes);
// cada tramo usa el mismo basico/horasExtraPromedio/categoria, pero su
// propio antiguedadPct (el año de ESE tramo).
export function calcularLiquidacionVacaciones(params: {
  basico: number;
  fechaAlta: string | null | undefined;
  categoria: FichadasCategoria;
  horasExtraPromedio: number;
  desde: string;
  hasta: string;
}): { tramos: TramoLiquidacion[]; bruto: number; totalDescuentos: number; neto: number } | null {
  const { basico, fechaAlta, categoria, horasExtraPromedio, desde, hasta } = params;
  if (!fechaAlta) return null;

  const valorHoraExtra = (basico / 24 / 8) * 1.5;
  const montoHorasExtra = valorHoraExtra * horasExtraPromedio;

  const tramos: TramoLiquidacion[] = partirPeriodoPorMes(desde, hasta).map((t) => {
    const anioTramo = Number(t.anioMes.slice(0, 4));
    const antiguedadPct = calcularAntiguedadPctLiquidacion(fechaAlta, anioTramo)!;
    const montoAntiguedad = (basico + montoHorasExtra) * (antiguedadPct / 100);
    const totalMensual = basico + montoHorasExtra + montoAntiguedad;
    const porDia = totalMensual / categoria.divisor_mensual;
    const vacacionesBase = porDia * t.dias;
    const plusVacacional = categoria.plus_vacacional * t.dias;
    const antiguedadPlusVacacional = plusVacacional * (antiguedadPct / 100);
    const bruto = vacacionesBase + plusVacacional + antiguedadPlusVacacional;
    const descuentoJubilacion = bruto * (categoria.pct_jubilacion / 100);
    const descuentoLey19032 = bruto * (categoria.pct_ley19032 / 100);
    const descuentoObraSocial = bruto * (categoria.pct_obra_social / 100);
    const descuentoAnsal = bruto * (categoria.pct_ansal / 100);
    const descuentoCuotaSindical = bruto * (categoria.pct_cuota_sindical / 100);
    const descuentoSeguroSepelio = bruto * (categoria.pct_seguro_sepelio / 100);
    const totalDescuentos = descuentoJubilacion + descuentoLey19032 + descuentoObraSocial + descuentoAnsal + descuentoCuotaSindical + descuentoSeguroSepelio;
    const neto = bruto - totalDescuentos;
    return {
      anioMes: t.anioMes, dias: t.dias, antiguedadPct, totalMensual, porDia,
      vacacionesBase, plusVacacional, antiguedadPlusVacacional, bruto,
      descuentoJubilacion, descuentoLey19032, descuentoObraSocial, descuentoAnsal, descuentoCuotaSindical, descuentoSeguroSepelio,
      totalDescuentos, neto,
    };
  });

  return {
    tramos,
    bruto: tramos.reduce((a, t) => a + t.bruto, 0),
    totalDescuentos: tramos.reduce((a, t) => a + t.totalDescuentos, 0),
    neto: tramos.reduce((a, t) => a + t.neto, 0),
  };
}
```

- [ ] **Step 2: Escribir el script de prueba**

```typescript
// Prueba standalone de calcularAntiguedadPctLiquidacion, partirPeriodoPorMes,
// calcularHorasExtraPromedioPorLegajo y calcularLiquidacionVacaciones. Caso
// de prueba real sacado de ACTIS TOBIAS.xls (verificado celda por celda
// con openpyxl). Se corre con tsx y se borra después.
import { calcularAntiguedadPctLiquidacion, calcularHorasExtraPromedioPorLegajo, calcularLiquidacionVacaciones, partirPeriodoPorMes } from './motor';
import type { FichadasCategoria } from '../../types';
import type { ResultadoDia } from './motor';

let ok = 0, fail = 0;
function check(nombre: string, cond: boolean, extra?: unknown) {
  if (cond) { ok++; console.log(`  OK   ${nombre}`); }
  else { fail++; console.log(`  FALLA ${nombre} ->`, extra); }
}
function cerca(a: number, b: number, tol = 1e-6): boolean {
  return Math.abs(a - b) < tol;
}

// ---- calcularAntiguedadPctLiquidacion ----
check('sin fecha_alta: null', calcularAntiguedadPctLiquidacion(undefined, 2026) === null);
check('ingreso 2025, liquidación 2026 -> 2', calcularAntiguedadPctLiquidacion('2025-10-15', 2026) === 2);
check('ingreso 2020, liquidación 2026 -> 7', calcularAntiguedadPctLiquidacion('2020-01-01', 2026) === 7);

// ---- partirPeriodoPorMes ----
const tramos = partirPeriodoPorMes('2026-09-28', '2026-10-11');
check('2 tramos (cruza de mes)', tramos.length === 2, tramos);
check('tramo 1: septiembre, 3 días', tramos[0].anioMes === '2026-09' && tramos[0].desde === '2026-09-28' && tramos[0].hasta === '2026-09-30' && tramos[0].dias === 3, tramos[0]);
check('tramo 2: octubre, 11 días', tramos[1].anioMes === '2026-10' && tramos[1].desde === '2026-10-01' && tramos[1].hasta === '2026-10-11' && tramos[1].dias === 11, tramos[1]);

const tramoUnico = partirPeriodoPorMes('2026-03-01', '2026-03-10');
check('1 tramo (no cruza de mes)', tramoUnico.length === 1 && tramoUnico[0].dias === 10, tramoUnico);

// ---- calcularHorasExtraPromedioPorLegajo ----
function resultadoBase(idLegajo: string, fecha: string, hE: number): ResultadoDia {
  return {
    idLegajo, nroLegajo: '1', identificador: '1', nombre: 'Prueba', dni: '', area: '', deposito: '',
    fecha, dia: 'LUNES', paresEsperados: [], paresReales: [], hN: 0, hE, ausente: false, novedad: '', causa: '',
  };
}
const resultadosHE: ResultadoDia[] = [
  resultadoBase('l1', '2026-06-15', 30), // junio: 0.5 horas = 30 min
];
const promedio = calcularHorasExtraPromedioPorLegajo(resultadosHE, 'l1', '2026-09', 6);
check('promedio 6 meses: 0,0,0,0.5,0,0 -> 0.08333...', cerca(promedio, 0.5 / 6), promedio);

const promedioOtroLegajo = calcularHorasExtraPromedioPorLegajo(resultadosHE, 'l2', '2026-09', 6);
check('otro legajo no cuenta las horas de l1', promedioOtroLegajo === 0, promedioOtroLegajo);

const resultadosFueraDeVentana: ResultadoDia[] = [
  resultadoBase('l1', '2026-06-15', 30), // dentro de la ventana (mar-ago 2026)
  resultadoBase('l1', '2026-09-05', 999), // dentro del período mismo, no de la ventana de 6 meses previos
  resultadoBase('l1', '2025-12-01', 999), // más de 6 meses antes
];
const promedioVentana = calcularHorasExtraPromedioPorLegajo(resultadosFueraDeVentana, 'l1', '2026-09', 6);
check('solo cuenta los 6 meses previos, no el mes de inicio ni más atrás', cerca(promedioVentana, 0.5 / 6), promedioVentana);

// ---- calcularLiquidacionVacaciones (caso real ACTIS TOBIAS.xls) ----
const categoria: FichadasCategoria = {
  id: 'c1', created: '', updated: '', nombre: 'Administ 2da',
  plus_vacacional: 25584.83, divisor_mensual: 24,
  pct_jubilacion: 11, pct_ley19032: 3, pct_obra_social: 2.55, pct_ansal: 0.45,
  pct_cuota_sindical: 3, pct_seguro_sepelio: 1.5,
};
const liquidacion = calcularLiquidacionVacaciones({
  basico: 1216186.92, fechaAlta: '2025-10-15', categoria, horasExtraPromedio: 0,
  desde: '2026-09-28', hasta: '2026-10-11',
});
check('liquidación no es null', liquidacion !== null);
if (liquidacion) {
  check('2 tramos', liquidacion.tramos.length === 2, liquidacion.tramos);
  const t1 = liquidacion.tramos[0], t2 = liquidacion.tramos[1];
  check('tramo 1 (sept, 3 días): antigüedadPct 2', t1.antiguedadPct === 2, t1);
  check('tramo 1: totalMensual', cerca(t1.totalMensual, 1240510.6584), t1.totalMensual);
  check('tramo 1: porDia', cerca(t1.porDia, 51687.9441), t1.porDia);
  check('tramo 1: vacacionesBase', cerca(t1.vacacionesBase, 155063.8323), t1.vacacionesBase);
  check('tramo 1: plusVacacional', cerca(t1.plusVacacional, 76754.49), t1.plusVacacional);
  check('tramo 1: antiguedadPlusVacacional', cerca(t1.antiguedadPlusVacacional, 1535.0898), t1.antiguedadPlusVacacional);
  check('tramo 1: bruto', cerca(t1.bruto, 233353.4121), t1.bruto);
  check('tramo 1: totalDescuentos', cerca(t1.totalDescuentos, 50170.9836015, 1e-3), t1.totalDescuentos);
  check('tramo 1: neto', cerca(t1.neto, 183182.4284985, 1e-3), t1.neto);

  check('tramo 2 (oct, 11 días): antigüedadPct 2', t2.antiguedadPct === 2, t2);
  check('tramo 2: totalMensual (igual que tramo 1)', cerca(t2.totalMensual, 1240510.6584), t2.totalMensual);
  check('tramo 2: vacacionesBase', cerca(t2.vacacionesBase, 568567.3851), t2.vacacionesBase);
  check('tramo 2: plusVacacional', cerca(t2.plusVacacional, 281433.13), t2.plusVacacional);
  check('tramo 2: antiguedadPlusVacacional', cerca(t2.antiguedadPlusVacacional, 5628.6626), t2.antiguedadPlusVacacional);
  check('tramo 2: bruto', cerca(t2.bruto, 855629.1777), t2.bruto);
  check('tramo 2: totalDescuentos', cerca(t2.totalDescuentos, 183960.2732055, 1e-3), t2.totalDescuentos);
  check('tramo 2: neto', cerca(t2.neto, 671668.9044945, 1e-3), t2.neto);

  check('neto total = suma de los 2 tramos', cerca(liquidacion.neto, t1.neto + t2.neto), liquidacion.neto);
}

const sinFechaAlta = calcularLiquidacionVacaciones({
  basico: 1000, fechaAlta: undefined, categoria, horasExtraPromedio: 0, desde: '2026-01-01', hasta: '2026-01-05',
});
check('sin fecha_alta: null', sinFechaAlta === null);

console.log(`\n${ok} ok, ${fail} fallas`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 3: Correr la prueba y borrarla**

Run: `cd web && npx tsx src/pages/fichadas/motor.test-liquidacion.ts`
Expected: `19 ok, 0 fallas` (si el conteo real difiere porque se agregó/quitó algún `check(...)`, lo que manda es que todas las que haya pasen en 0, no el número exacto).

```bash
rm web/src/pages/fichadas/motor.test-liquidacion.ts
```

- [ ] **Step 4: Build**

Run: `cd web && npm run build`
Expected: build exitoso, sin errores de TypeScript.

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/fichadas/motor.ts
git commit -m "feat(fichadas): calculo de liquidacion de vacaciones (antiguedad, horas extra promedio, tramos por mes)"
```

---

## Task 3: Pantalla de administración de Categorías

**Files:**
- Create: `web/src/pages/vacaciones/CategoriasSub.tsx`
- Modify: `web/src/pages/vacaciones/VacacionesPage.tsx`

**Interfaces:**
- Consumes: `FichadasCategoria` (Task 1); `pb`, `useToast`, `useConfirm`.
- Produces: tercera vista "Categorías" en `VacacionesPage`.

- [ ] **Step 1: Crear `CategoriasSub.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { pb } from '../../lib/pb';
import { useToast } from '../../lib/ToastContext';
import { useConfirm } from '../../lib/ConfirmContext';
import type { FichadasCategoria } from '../../types';

const CAMPOS_PCT: { key: keyof FormCategoria; label: string }[] = [
  { key: 'pct_jubilacion', label: 'Jubilación %' },
  { key: 'pct_ley19032', label: 'Ley 19032 %' },
  { key: 'pct_obra_social', label: 'Obra Social %' },
  { key: 'pct_ansal', label: 'ANSSAL %' },
  { key: 'pct_cuota_sindical', label: 'Cuota Sindical %' },
  { key: 'pct_seguro_sepelio', label: 'Seguro de Sepelio %' },
];

interface FormCategoria {
  nombre: string;
  plus_vacacional: string;
  divisor_mensual: string;
  pct_jubilacion: string;
  pct_ley19032: string;
  pct_obra_social: string;
  pct_ansal: string;
  pct_cuota_sindical: string;
  pct_seguro_sepelio: string;
}

const CAMPOS_NUMERICOS: (keyof FormCategoria)[] = [
  'plus_vacacional', 'divisor_mensual', 'pct_jubilacion', 'pct_ley19032',
  'pct_obra_social', 'pct_ansal', 'pct_cuota_sindical', 'pct_seguro_sepelio',
];

const FORM_VACIO: FormCategoria = {
  nombre: '', plus_vacacional: '', divisor_mensual: '24',
  pct_jubilacion: '11', pct_ley19032: '3', pct_obra_social: '2.55',
  pct_ansal: '0.45', pct_cuota_sindical: '3', pct_seguro_sepelio: '1.5',
};

export function CategoriasSub() {
  const toast = useToast();
  const confirm = useConfirm();
  const [categorias, setCategorias] = useState<FichadasCategoria[]>([]);
  const [form, setForm] = useState<FormCategoria>(FORM_VACIO);
  const [editandoId, setEditandoId] = useState<string | null>(null);

  async function cargar() {
    try {
      const c = await pb.collection('fichadas_categorias').getFullList<FichadasCategoria>({ sort: 'nombre' });
      setCategorias(c);
    } catch (e) {
      toast('No se pudieron cargar las categorías: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }
  useEffect(() => { cargar(); }, []);

  function construirPayload(): Record<string, number | string> | null {
    const nombre = form.nombre.trim();
    if (!nombre) { toast('Ponele un nombre a la categoría.', 'warn'); return null; }
    const numericos: Record<string, number> = {};
    for (const campo of CAMPOS_NUMERICOS) {
      const n = Number(form[campo].replace(',', '.'));
      if (!isFinite(n) || n < 0) { toast(`Revisá el valor de "${campo}".`, 'warn'); return null; }
      numericos[campo] = n;
    }
    return { nombre, ...numericos };
  }

  async function crear() {
    const payload = construirPayload();
    if (!payload) return;
    try {
      await pb.collection('fichadas_categorias').create(payload);
      setForm(FORM_VACIO);
      cargar();
      toast('Categoría creada.', 'ok');
    } catch (e) {
      toast('Error: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }

  function abrirEdicion(c: FichadasCategoria) {
    setEditandoId(c.id);
    setForm({
      nombre: c.nombre,
      plus_vacacional: String(c.plus_vacacional),
      divisor_mensual: String(c.divisor_mensual),
      pct_jubilacion: String(c.pct_jubilacion),
      pct_ley19032: String(c.pct_ley19032),
      pct_obra_social: String(c.pct_obra_social),
      pct_ansal: String(c.pct_ansal),
      pct_cuota_sindical: String(c.pct_cuota_sindical),
      pct_seguro_sepelio: String(c.pct_seguro_sepelio),
    });
  }

  async function guardarEdicion() {
    if (!editandoId) return;
    const payload = construirPayload();
    if (!payload) return;
    try {
      await pb.collection('fichadas_categorias').update(editandoId, payload);
      setEditandoId(null);
      setForm(FORM_VACIO);
      cargar();
      toast('Categoría actualizada.', 'ok');
    } catch (e) {
      toast('Error: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }

  function cancelarEdicion() {
    setEditandoId(null);
    setForm(FORM_VACIO);
  }

  async function eliminar(id: string) {
    if (!(await confirm('¿Eliminar esta categoría? Los legajos que la tengan asignada quedan sin categoría.', 'Eliminar categoría'))) return;
    try {
      await pb.collection('fichadas_categorias').delete(id);
      cargar();
      toast('Eliminada.', 'ok');
    } catch (e) {
      toast('Error: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }

  return (
    <div className="card">
      <div className="hint">Categorías de convenio — cada una con su Plus Vacacional, divisor y % de descuentos, usados al liquidar vacaciones.</div>
      <h3 style={{ fontSize: 13, color: 'var(--navy)', margin: '14px 0 8px' }}>{editandoId ? 'Editar categoría' : 'Nueva categoría'}</h3>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <div className="field"><label>Nombre</label><input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Ej: Administ 2da" /></div>
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
            <button onClick={guardarEdicion}>Guardar</button>
            <button className="secondary" onClick={cancelarEdicion}>Cancelar</button>
          </>
        ) : (
          <button onClick={crear}>Crear categoría</button>
        )}
      </div>

      <h3 style={{ fontSize: 13, color: 'var(--navy)', margin: '18px 0 8px' }}>Categorías ({categorias.length})</h3>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Nombre</th><th>Plus Vac.</th><th>Divisor</th><th>Jubil.</th><th>Ley 19032</th><th>Obra Soc.</th><th>ANSSAL</th><th>Sindical</th><th>Sepelio</th><th></th></tr></thead>
          <tbody>
            {categorias.map((c) => (
              <tr key={c.id}>
                <td className="admin-name">{c.nombre}</td>
                <td className="num">{c.plus_vacacional}</td>
                <td className="num">{c.divisor_mensual}</td>
                <td className="num">{c.pct_jubilacion}%</td>
                <td className="num">{c.pct_ley19032}%</td>
                <td className="num">{c.pct_obra_social}%</td>
                <td className="num">{c.pct_ansal}%</td>
                <td className="num">{c.pct_cuota_sindical}%</td>
                <td className="num">{c.pct_seguro_sepelio}%</td>
                <td>
                  <button className="small secondary" onClick={() => abrirEdicion(c)}>Editar</button>
                  <button className="small danger" onClick={() => eliminar(c.id)}>Eliminar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {categorias.length === 0 && <div className="empty" style={{ marginTop: 16 }}>Sin categorías cargadas.</div>}
    </div>
  );
}
```

- [ ] **Step 2: Agregar la tercera vista en `VacacionesPage.tsx`**

Reemplazar el contenido completo del archivo por:

```tsx
import { useState } from 'react';
import { AsignarVacacionesSub } from './AsignarVacacionesSub';
import { GruposRestriccionSub } from './GruposRestriccionSub';
import { CategoriasSub } from './CategoriasSub';

type Vista = 'vacaciones' | 'grupos' | 'categorias';

export function VacacionesPage() {
  const [vista, setVista] = useState<Vista>('vacaciones');

  return (
    <main>
      <div className="card">
        <h2 style={{ margin: 0 }}>Vacaciones</h2>
        <div className="hint">Días por antigüedad, asignación de períodos, liquidación y grupos de restricción — reemplaza los Excel de licencias que arma RRHH a mano.</div>
        <div className="row" style={{ marginTop: 14 }}>
          <button type="button" className={vista === 'vacaciones' ? 'small' : 'small secondary'} onClick={() => setVista('vacaciones')}>Vacaciones</button>
          <button type="button" className={vista === 'grupos' ? 'small' : 'small secondary'} onClick={() => setVista('grupos')}>Grupos de restricción</button>
          <button type="button" className={vista === 'categorias' ? 'small' : 'small secondary'} onClick={() => setVista('categorias')}>Categorías</button>
        </div>
      </div>

      {vista === 'vacaciones' && <AsignarVacacionesSub />}
      {vista === 'grupos' && <GruposRestriccionSub />}
      {vista === 'categorias' && <CategoriasSub />}
    </main>
  );
}
```

- [ ] **Step 3: Build**

Run: `cd web && npm run build`
Expected: build exitoso, sin errores de TypeScript.

- [ ] **Step 4: Verificación manual**

1. `cd web && npm run dev`, entrar a Vacaciones → "Categorías".
2. Crear una categoría de prueba con los 8 valores, confirmar que aparece en la tabla.
3. Editarla (cambiar un valor), confirmar que se guarda.
4. Eliminarla, confirmar que desaparece.

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/vacaciones/CategoriasSub.tsx web/src/pages/vacaciones/VacacionesPage.tsx
git commit -m "feat(fichadas): pantalla de administracion de categorias de convenio"
```

---

## Task 4: Agregar Categoría/Básico a Empleados + botón "Liquidar" con panel de desglose

**Files:**
- Modify: `web/src/pages/fichadas/ConfiguracionTab.tsx`
- Modify: `web/src/pages/vacaciones/AsignarVacacionesSub.tsx`

**Interfaces:**
- Consumes: `calcularLiquidacionVacaciones`, `calcularHorasExtraPromedioPorLegajo`, `partirPeriodoPorMes`, `procesarPeriodo` (todos de `../fichadas/motor`); `FichadasCategoria`, `FichadasMarca`, `FichadasNovedad`, `FichadasFeriado`, `HistorialLegajo` (Task 1 y tipos ya existentes).
- Produces: legajos con `categoria`/`basico` editables desde Configuración; botón "Liquidar" funcional en la vista "Lista por fecha" de Vacaciones.

- [ ] **Step 1: Agregar Categoría y Básico al formulario de Empleados**

En `web/src/pages/fichadas/ConfiguracionTab.tsx`, la función `EmpleadosSub` ya recibe `empresas`, `horarios`, `legajos`, `onChanged` como props. Hay que:

1. Agregar el import de `FichadasCategoria` y cargar la lista de categorías dentro de `ConfiguracionTab` (el componente padre que ya carga `empresas`/`horarios`/`legajos`), pasándola a `EmpleadosSub` como prop nueva.

Buscar:
```typescript
import type { DiaHorario, FichadasEmpresa, FichadasHorario, FichadasLegajo, HoraExtraFija } from '../../types';
```
Reemplazar por:
```typescript
import type { DiaHorario, FichadasCategoria, FichadasEmpresa, FichadasHorario, FichadasLegajo, HoraExtraFija } from '../../types';
```

Buscar:
```typescript
export function ConfiguracionTab() {
  const [subTab, setSubTab] = useState<SubTabId>('empleados');
  const [empresas, setEmpresas] = useState<FichadasEmpresa[]>([]);
  const [horarios, setHorarios] = useState<FichadasHorario[]>([]);
  const [legajos, setLegajos] = useState<FichadasLegajo[]>([]);
  const [tick, setTick] = useState(0);
  const refrescar = () => setTick((t) => t + 1);
  const toast = useToast();

  useEffect(() => {
    (async () => {
      try {
        const [e, h, l] = await Promise.all([
          pb.collection('fichadas_empresas').getFullList<FichadasEmpresa>({ sort: 'nombre' }),
          pb.collection('fichadas_horarios').getFullList<FichadasHorario>({ sort: 'nombre' }),
          pb.collection('fichadas_legajos').getFullList<FichadasLegajo>({ sort: 'nombre' }),
        ]);
        setEmpresas(e); setHorarios(h); setLegajos(l);
      } catch (err) {
        toast('No se pudo cargar la configuración: ' + (err instanceof Error ? err.message : ''), 'err');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);
```
Reemplazar por:
```typescript
export function ConfiguracionTab() {
  const [subTab, setSubTab] = useState<SubTabId>('empleados');
  const [empresas, setEmpresas] = useState<FichadasEmpresa[]>([]);
  const [horarios, setHorarios] = useState<FichadasHorario[]>([]);
  const [legajos, setLegajos] = useState<FichadasLegajo[]>([]);
  const [categorias, setCategorias] = useState<FichadasCategoria[]>([]);
  const [tick, setTick] = useState(0);
  const refrescar = () => setTick((t) => t + 1);
  const toast = useToast();

  useEffect(() => {
    (async () => {
      try {
        const [e, h, l, c] = await Promise.all([
          pb.collection('fichadas_empresas').getFullList<FichadasEmpresa>({ sort: 'nombre' }),
          pb.collection('fichadas_horarios').getFullList<FichadasHorario>({ sort: 'nombre' }),
          pb.collection('fichadas_legajos').getFullList<FichadasLegajo>({ sort: 'nombre' }),
          pb.collection('fichadas_categorias').getFullList<FichadasCategoria>({ sort: 'nombre' }),
        ]);
        setEmpresas(e); setHorarios(h); setLegajos(l); setCategorias(c);
      } catch (err) {
        toast('No se pudo cargar la configuración: ' + (err instanceof Error ? err.message : ''), 'err');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);
```

Buscar:
```typescript
        {subTab === 'empleados' && <EmpleadosSub empresas={empresas} horarios={horarios} legajos={legajos} onChanged={refrescar} />}
```
Reemplazar por:
```typescript
        {subTab === 'empleados' && <EmpleadosSub empresas={empresas} horarios={horarios} legajos={legajos} categorias={categorias} onChanged={refrescar} />}
```

2. En la firma de `EmpleadosSub`, agregar `categorias` a los props. Buscar:
```typescript
function EmpleadosSub({ empresas, horarios, legajos, onChanged }: { empresas: FichadasEmpresa[]; horarios: FichadasHorario[]; legajos: FichadasLegajo[]; onChanged: () => void }) {
```
Reemplazar por:
```typescript
function EmpleadosSub({ empresas, horarios, legajos, categorias, onChanged }: { empresas: FichadasEmpresa[]; horarios: FichadasHorario[]; legajos: FichadasLegajo[]; categorias: FichadasCategoria[]; onChanged: () => void }) {
```

3. Agregar 2 columnas a la tabla de empleados (Categoría y Básico). Buscar el encabezado de la tabla:
```typescript
          <thead><tr><th>Legajo</th><th>Tarjeta</th><th>Nombre</th><th>Área</th><th>Horario</th><th>Fecha alta</th><th>Estado</th><th></th></tr></thead>
```
Reemplazar por:
```typescript
          <thead><tr><th>Legajo</th><th>Tarjeta</th><th>Nombre</th><th>Área</th><th>Horario</th><th>Fecha alta</th><th>Categoría</th><th>Básico</th><th>Estado</th><th></th></tr></thead>
```

Buscar la fila de la fecha de alta dentro del `.map`:
```typescript
                <td>
                  <input type="date" value={l.fecha_alta || ''} onChange={(e) => editar(l.id, 'fecha_alta', e.target.value)} />
                </td>
                <td>
```
Reemplazar por:
```typescript
                <td>
                  <input type="date" value={l.fecha_alta || ''} onChange={(e) => editar(l.id, 'fecha_alta', e.target.value)} />
                </td>
                <td>
                  <select value={l.categoria || ''} onChange={(e) => editar(l.id, 'categoria', e.target.value)}>
                    <option value="">Sin categoría</option>
                    {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                </td>
                <td>
                  <input
                    key={l.id + '-' + (l.basico ?? '')}
                    defaultValue={l.basico ?? ''}
                    style={{ width: 90 }}
                    onBlur={(e) => {
                      const txt = e.target.value.trim();
                      if (txt === '') { if (l.basico != null) editar(l.id, 'basico', ''); return; }
                      const n = Number(txt.replace(',', '.'));
                      if (!isFinite(n) || n < 0) { toast('El Básico tiene que ser un número.', 'warn'); return; }
                      if (n !== l.basico) editar(l.id, 'basico', String(n));
                    }}
                  />
                </td>
                <td>
```

La función `editar(id, campo, valor)` ya existe y acepta `string | boolean` — como `basico` ahora puede llegar como texto vacío (para "borrar" el valor), hay que permitir que guarde `null` cuando está vacío. Buscar la función `editar`:
```typescript
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
Reemplazar por:
```typescript
  async function editar(id: string, campo: string, valor: string | boolean) {
    if (campo === 'fecha_alta' && typeof valor === 'string' && valor) {
      const legajo = legajos.find((l) => l.id === id);
      if (legajo?.fecha_baja && valor > legajo.fecha_baja) {
        toast('La fecha de alta no puede ser posterior a la fecha de baja de este legajo.', 'warn');
        return;
      }
    }
    const valorAEnviar = (campo === 'categoria' || campo === 'basico') && valor === '' ? null : valor;
    try {
      await pb.collection('fichadas_legajos').update(id, { [campo]: valorAEnviar });
      onChanged();
    } catch (e) {
      toast('Error: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }
```

- [ ] **Step 2: Agregar el botón "Liquidar" y el panel en `AsignarVacacionesSub.tsx`**

Reemplazar el contenido completo del archivo por:

```tsx
import { useEffect, useMemo, useState } from 'react';
import { pb } from '../../lib/pb';
import { useToast } from '../../lib/ToastContext';
import { useConfirm } from '../../lib/ConfirmContext';
import {
  calcularHorasExtraPromedioPorLegajo, calcularLiquidacionVacaciones, calcularResumenVacaciones,
  detectarSolapamientoGrupo, partirPeriodoPorMes, procesarPeriodo,
  type TramoLiquidacion,
} from '../fichadas/motor';
import type {
  FichadasCategoria, FichadasEmpresa, FichadasFeriado, FichadasGrupoRestriccion, FichadasLegajo,
  FichadasMarca, FichadasNovedad, FichadasVacacion, HistorialLegajo,
} from '../../types';

type Vista = 'lista' | 'por_legajo';

function fmtDias(n: number | null): string {
  if (n === null) return '—';
  const r = Math.round(n * 10) / 10;
  return r % 1 === 0 ? String(r) : r.toFixed(1);
}

function fmtMoneda(n: number): string {
  return n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function diasDelPeriodo(desde: string, hasta: string): number {
  return Math.round((new Date(hasta + 'T00:00:00Z').getTime() - new Date(desde + 'T00:00:00Z').getTime()) / 86400000) + 1;
}

// Mes inmediatamente anterior a `anioMes` ("YYYY-MM" -> "YYYY-MM" del mes previo).
function mesAnterior(anioMes: string): string {
  const [y, m] = anioMes.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  d.setUTCMonth(d.getUTCMonth() - 1);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

interface ResultadoLiquidacion {
  vacacionId: string;
  nombreLegajo: string;
  tramos: TramoLiquidacion[];
  bruto: number;
  totalDescuentos: number;
  neto: number;
}

export function AsignarVacacionesSub() {
  const toast = useToast();
  const confirm = useConfirm();
  const [vista, setVista] = useState<Vista>('lista');
  const [anio, setAnio] = useState(() => new Date().getFullYear());
  const [legajos, setLegajos] = useState<FichadasLegajo[]>([]);
  const [empresas, setEmpresas] = useState<FichadasEmpresa[]>([]);
  const [vacaciones, setVacaciones] = useState<FichadasVacacion[]>([]);
  const [grupos, setGrupos] = useState<FichadasGrupoRestriccion[]>([]);
  const [categorias, setCategorias] = useState<FichadasCategoria[]>([]);
  const [areaFiltro, setAreaFiltro] = useState('');
  const [tick, setTick] = useState(0);
  const refrescar = () => setTick((t) => t + 1);

  const [idLegajoNuevo, setIdLegajoNuevo] = useState('');
  const [desdeNuevo, setDesdeNuevo] = useState('');
  const [hastaNuevo, setHastaNuevo] = useState('');
  const [comentarioNuevo, setComentarioNuevo] = useState('');
  const [guardando, setGuardando] = useState(false);

  const [liquidando, setLiquidando] = useState<string | null>(null);
  const [liquidacion, setLiquidacion] = useState<ResultadoLiquidacion | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [l, e, v, g, c] = await Promise.all([
          pb.collection('fichadas_legajos').getFullList<FichadasLegajo>({ sort: 'nombre' }),
          pb.collection('fichadas_empresas').getFullList<FichadasEmpresa>({ sort: 'nombre' }),
          pb.collection('fichadas_vacaciones').getFullList<FichadasVacacion>({ sort: 'desde' }),
          pb.collection('fichadas_grupos_restriccion').getFullList<FichadasGrupoRestriccion>(),
          pb.collection('fichadas_categorias').getFullList<FichadasCategoria>({ sort: 'nombre' }),
        ]);
        setLegajos(l); setEmpresas(e); setVacaciones(v); setGrupos(g); setCategorias(c);
      } catch (err) {
        toast('No se pudo cargar Vacaciones: ' + (err instanceof Error ? err.message : ''), 'err');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  useEffect(() => { if (!idLegajoNuevo && legajos[0]) setIdLegajoNuevo(legajos[0].id); }, [legajos, idLegajoNuevo]);

  const empresaNombrePorId = useMemo(() => new Map(empresas.map((e) => [e.id, e.nombre])), [empresas]);
  const legajoPorId = useMemo(() => new Map(legajos.map((l) => [l.id, l])), [legajos]);
  const categoriaPorId = useMemo(() => new Map(categorias.map((c) => [c.id, c])), [categorias]);

  const legajosParaResumen = useMemo(
    () => legajos.filter((l) => l.estado || vacaciones.some((v) => v.legajo === l.id && v.anio === anio)),
    [legajos, vacaciones, anio]
  );
  const resumen = useMemo(
    () => calcularResumenVacaciones({ legajos: legajosParaResumen, vacaciones, empresaNombrePorId, anio }),
    [legajosParaResumen, vacaciones, empresaNombrePorId, anio]
  );

  const periodosDelAnio = useMemo(() => {
    return vacaciones
      .filter((v) => v.anio === anio)
      .filter((v) => !areaFiltro || legajoPorId.get(v.legajo)?.empresa === areaFiltro)
      .sort((a, b) => a.desde.localeCompare(b.desde));
  }, [vacaciones, anio, areaFiltro, legajoPorId]);

  async function asignarPeriodo() {
    if (!idLegajoNuevo || !desdeNuevo || !hastaNuevo) { toast('Completá empleado, desde y hasta.', 'warn'); return; }
    if (hastaNuevo < desdeNuevo) { toast('"Hasta" no puede ser anterior a "Desde".', 'warn'); return; }
    setGuardando(true);
    try {
      const creado = await pb.collection('fichadas_vacaciones').create<FichadasVacacion>({
        legajo: idLegajoNuevo, desde: desdeNuevo, hasta: hastaNuevo, anio, comentario: comentarioNuevo.trim() || null,
      });

      const legajoElegido = legajoPorId.get(idLegajoNuevo);
      if (legajoElegido) {
        const resumenLegajo = calcularResumenVacaciones({
          legajos: [legajoElegido], vacaciones: [...vacaciones, creado], empresaNombrePorId, anio,
        })[0];
        if (resumenLegajo.diasRestantes !== null && resumenLegajo.diasRestantes < 0) {
          toast(`${resumenLegajo.nombre} queda con ${fmtDias(resumenLegajo.diasRestantes)} días de exceso sobre lo que le corresponde en ${anio}.`, 'warn');
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

  async function liquidarPeriodo(v: FichadasVacacion) {
    const legajo = legajoPorId.get(v.legajo);
    if (!legajo) return;
    if (!legajo.categoria || legajo.basico == null) {
      toast('Para liquidar, completá Categoría y Básico de este legajo en Configuración → Empleados.', 'warn');
      return;
    }
    const categoria = categoriaPorId.get(legajo.categoria);
    if (!categoria) { toast('No se encontró la categoría de este legajo.', 'err'); return; }
    if (!legajo.fecha_alta) { toast('Este legajo no tiene fecha de alta cargada, no se puede liquidar.', 'err'); return; }

    setLiquidando(v.id);
    try {
      const tramosMes = partirPeriodoPorMes(v.desde, v.hasta);
      const primerMes = tramosMes[0].anioMes;
      // ventana de 6 meses calendario inmediatamente anteriores al mes de inicio
      let cursor = primerMes;
      const mesesVentana: string[] = [];
      for (let i = 0; i < 6; i++) { cursor = mesAnterior(cursor); mesesVentana.push(cursor); }
      mesesVentana.sort();
      const [yIni, mIni] = mesesVentana[0].split('-').map(Number);
      const [yFin, mFin] = mesesVentana[mesesVentana.length - 1].split('-').map(Number);
      const desdeVentana = `${yIni}-${String(mIni).padStart(2, '0')}-01`;
      const ultimoDiaFin = new Date(Date.UTC(yFin, mFin, 0)).getUTCDate();
      const hastaVentana = `${yFin}-${String(mFin).padStart(2, '0')}-${String(ultimoDiaFin).padStart(2, '0')}`;

      const [marcas, novedades, feriados, historial] = await Promise.all([
        pb.collection('fichadas_marcas').getFullList<FichadasMarca>({ filter: pb.filter('fecha >= {:d} && fecha <= {:h}', { d: desdeVentana, h: hastaVentana }) }),
        pb.collection('fichadas_novedades').getFullList<FichadasNovedad>({ filter: pb.filter('fecha >= {:d} && fecha <= {:h}', { d: desdeVentana, h: hastaVentana }) }),
        pb.collection('fichadas_feriados').getFullList<FichadasFeriado>({ filter: pb.filter('fecha >= {:d} && fecha <= {:h}', { d: desdeVentana, h: hastaVentana }) }),
        pb.collection('fichadas_legajo_historial').getFullList<HistorialLegajo>(),
      ]);
      const { resultados } = procesarPeriodo({
        legajos: [legajo], marcas, novedades, feriados, historial, empresaNombrePorId,
        desde: desdeVentana, hasta: hastaVentana,
      });
      const horasExtraPromedio = calcularHorasExtraPromedioPorLegajo(resultados, legajo.id, primerMes, 6);

      const resultado = calcularLiquidacionVacaciones({
        basico: legajo.basico, fechaAlta: legajo.fecha_alta, categoria, horasExtraPromedio,
        desde: v.desde, hasta: v.hasta,
      });
      if (!resultado) { toast('No se pudo calcular la liquidación.', 'err'); return; }
      setLiquidacion({ vacacionId: v.id, nombreLegajo: legajo.nombre, ...resultado });
    } catch (e) {
      toast('Error al liquidar: ' + (e instanceof Error ? e.message : ''), 'err');
    } finally {
      setLiquidando(null);
    }
  }

  return (
    <div className="card">
      <h2>Vacaciones</h2>
      <div className="hint">Días por antigüedad, asignación de períodos, liquidación y control de notificación — reemplaza los Excel de licencias que arma RRHH a mano.</div>

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
                      <td>
                        <button className="small secondary" onClick={() => liquidarPeriodo(v)} disabled={liquidando === v.id}>
                          {liquidando === v.id ? 'Calculando…' : 'Liquidar'}
                        </button>
                        <button className="small danger" onClick={() => eliminarPeriodo(v.id)}>Eliminar</button>
                      </td>
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

      {liquidacion && (
        <>
          <h3 style={{ fontSize: 13, color: 'var(--navy)', margin: '18px 0 8px' }}>Liquidación — {liquidacion.nombreLegajo}</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Mes</th><th>Días</th><th>Antig. %</th><th>Total mensual</th><th>Por día</th>
                  <th>Vacaciones</th><th>Plus Vac.</th><th>Antig. Plus Vac.</th><th>Bruto</th>
                  <th>Jubil.</th><th>Ley 19032</th><th>Obra Soc.</th><th>ANSSAL</th><th>Sindical</th><th>Sepelio</th><th>Neto</th>
                </tr>
              </thead>
              <tbody>
                {liquidacion.tramos.map((t) => (
                  <tr key={t.anioMes}>
                    <td>{t.anioMes}</td>
                    <td className="num">{t.dias}</td>
                    <td className="num">{t.antiguedadPct}%</td>
                    <td className="num">{fmtMoneda(t.totalMensual)}</td>
                    <td className="num">{fmtMoneda(t.porDia)}</td>
                    <td className="num">{fmtMoneda(t.vacacionesBase)}</td>
                    <td className="num">{fmtMoneda(t.plusVacacional)}</td>
                    <td className="num">{fmtMoneda(t.antiguedadPlusVacacional)}</td>
                    <td className="num">{fmtMoneda(t.bruto)}</td>
                    <td className="num">{fmtMoneda(t.descuentoJubilacion)}</td>
                    <td className="num">{fmtMoneda(t.descuentoLey19032)}</td>
                    <td className="num">{fmtMoneda(t.descuentoObraSocial)}</td>
                    <td className="num">{fmtMoneda(t.descuentoAnsal)}</td>
                    <td className="num">{fmtMoneda(t.descuentoCuotaSindical)}</td>
                    <td className="num">{fmtMoneda(t.descuentoSeguroSepelio)}</td>
                    <td className="num" style={{ fontWeight: 700 }}>{fmtMoneda(t.neto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row" style={{ marginTop: 10, alignItems: 'center' }}>
            <div style={{ fontWeight: 700 }}>Neto total del período: ${fmtMoneda(liquidacion.neto)}</div>
            <button className="small secondary" onClick={() => setLiquidacion(null)}>Cerrar</button>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Build**

Run: `cd web && npm run build`
Expected: build exitoso, sin errores de TypeScript.

- [ ] **Step 4: Verificación manual**

1. `cd web && npm run dev`, entrar a Fichadas → Configuración → Empleados.
2. Elegir un legajo, asignarle una Categoría (la creada en Task 3) y un Básico, confirmar que se guarda.
3. Ir a Vacaciones → Lista por fecha, asignarle un período de prueba a ese mismo legajo si no tiene uno, con fechas que crucen de un mes a otro (ej. 28 de un mes al 5 del siguiente).
4. Apretar "Liquidar" en ese período — confirmar que aparece el panel con 2 filas (una por mes) y los números tienen sentido (no NaN, no negativos raros).
5. Probar "Liquidar" en un legajo SIN categoría/básico cargado — confirmar que aparece el aviso pidiendo completarlos, sin romper nada.

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/fichadas/ConfiguracionTab.tsx web/src/pages/vacaciones/AsignarVacacionesSub.tsx
git commit -m "feat(fichadas): categoria/basico por legajo y boton Liquidar con desglose completo"
```
