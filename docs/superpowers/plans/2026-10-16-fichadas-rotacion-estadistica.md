# Fichadas: Rotación - Estadística Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar fecha de alta/baja real a los legajos (reemplazando el interruptor manual "Activo/Inactivo") y una tabla de Rotación (altas, bajas por motivo, dotación, índice) a la pestaña Estadísticas de Fichadas, reemplazando el Excel que arma RRHH a mano. De paso, esto cierra de raíz la limitación ya aceptada en Horas Extras y Ausentismo donde un ex-empleado seguía contando después de su baja real.

**Architecture:** Dos campos nuevos en `fichadas_legajos` (`fecha_alta`, `fecha_baja`) + uno de motivo (`motivo_baja`, select de 4 valores). `estado` deja de ser un interruptor manual: la UI lo calcula (`estado = !fecha_baja`) en cada guardado. `procesarPeriodo()` (motor compartido) pasa a acotar la ventana de días que recorre por legajo a `[fecha_alta, fecha_baja]` cuando están cargadas. Una función de agregación nueva en `motor.ts` (`calcularEstadisticaRotacion`, distinta forma a las otras dos: opera sobre `legajos` directo, no sobre `ResultadoDia[]`, porque es conteo de altas/bajas, no de fichadas) y una tercera opción en el selector Ver de Estadísticas.

**Tech Stack:** React + TypeScript (Vite), PocketBase (migraciones), `tsx` para probar las funciones puras.

## Global Constraints

- Motivos de baja: exactamente estos 4 — Despido, Renuncia, Acuerdo, Jubilación. Sin agregar "Otro".
- `estado` (bool) se deriva de `fecha_baja`: activo = sin fecha de baja cargada. La UI nunca vuelve a exponer un interruptor libre; solo "Dar de baja" (carga fecha+motivo, pone `estado=false`) y "Reactivar" (borra fecha+motivo, pone `estado=true`).
- 0 legajos inactivos hoy en producción (verificado por SQL directo) — no hace falta ningún backfill de `fecha_baja` para no romper nada. `fecha_alta` queda vacía para los 61 legajos existentes.
- Sin desglose por área — agrupado solo por mes, total empresa.
- Índice de rotación = fórmula estándar `totalEgresos / dotacionInicial` (0 si dotación inicial es 0) — NO se reproduce el concepto de "Reemplazos" del Excel viejo.
- Un legajo sin `fecha_alta` se asume "de antes" (siempre activo desde el inicio de cualquier período que se calcule) — no aporta ningún "ingreso" porque no se sabe cuándo entró.
- Mismo recorte ya vigente en las otras dos estadísticas: si el año elegido es el actual, se recorta a hoy (no se inventan meses futuros).
- Mismo criterio de testing ya usado en este módulo: migración probada contra una PocketBase local real, funciones puras de `motor.ts` probadas con `tsx` (el script se escribe, se corre, y se borra — no queda trackeado en git).

---

## Task 1: Migración — fecha_alta, fecha_baja, motivo_baja en fichadas_legajos

**Files:**
- Create: `pb_migrations/1789170000_fichadas_legajos_alta_baja.js`
- Modify: `web/src/types.ts`

**Interfaces:**
- Produces: campos `fecha_alta` (text, opcional), `fecha_baja` (text, opcional), `motivo_baja` (select, opcional, 4 valores) en `fichadas_legajos`; `FichadasLegajo.fecha_alta?: string`, `FichadasLegajo.fecha_baja?: string`, `FichadasLegajo.motivo_baja?: string`.

- [ ] **Step 1: Escribir la migración**

```javascript
/// <reference path="../pb_data/types.d.ts" />
// Rotación: fecha de alta/baja real por legajo, para reemplazar el
// interruptor manual "estado" (que ahora se deriva: activo = sin
// fecha_baja) y para que Horas Extras/Ausentismo dejen de contar a un
// ex-empleado después de su baja real. Verificado en producción: 0
// legajos inactivos hoy, 61 activos -- no hace falta backfill. Ver
// docs/superpowers/specs/2026-10-16-fichadas-rotacion-estadistica-design.md.
migrate((db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId('fichadas_legajos');
  collection.schema.addField(new SchemaField({
    system: false, id: 'fcl0fechaalta1', name: 'fecha_alta', type: 'text',
    required: false, presentable: true, unique: false,
    options: { min: null, max: null, pattern: '' },
  }));
  collection.schema.addField(new SchemaField({
    system: false, id: 'fcl0fechabaja1', name: 'fecha_baja', type: 'text',
    required: false, presentable: true, unique: false,
    options: { min: null, max: null, pattern: '' },
  }));
  collection.schema.addField(new SchemaField({
    system: false, id: 'fcl0motivobaj1', name: 'motivo_baja', type: 'select',
    required: false, presentable: true, unique: false,
    options: { maxSelect: 1, values: ['Despido', 'Renuncia', 'Acuerdo', 'Jubilación'] },
  }));
  return dao.saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId('fichadas_legajos');
  collection.schema.removeField('fcl0fechaalta1');
  collection.schema.removeField('fcl0fechabaja1');
  collection.schema.removeField('fcl0motivobaj1');
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

Expected: `Applied 1789170000_fichadas_legajos_alta_baja.js` sin errores.

- [ ] **Step 3: Verificar los 3 campos quedaron bien definidos**

```bash
python3 -c "
import sqlite3, json
con = sqlite3.connect('data/data.db')
row = con.execute(\"SELECT schema FROM _collections WHERE name='fichadas_legajos'\").fetchone()
data = json.loads(row[0])
por_nombre = {f['name']: f for f in data}
assert por_nombre['fecha_alta']['required'] is False
assert por_nombre['fecha_baja']['required'] is False
assert por_nombre['motivo_baja']['required'] is False
assert len(por_nombre['motivo_baja']['options']['values']) == 4
print('OK: 3 campos presentes, fecha_alta/fecha_baja opcionales, motivo_baja con 4 valores')
"
```

Expected: imprime `OK: 3 campos presentes...` sin error en los asserts.

- [ ] **Step 4: Agregar los campos en `web/src/types.ts`**

Buscar:

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
  estado: boolean;
  expand?: { empresa?: FichadasEmpresa; horario?: FichadasHorario };
}
```

Reemplazar por:

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
  estado: boolean;
  fecha_alta?: string; // "YYYY-MM-DD", opcional -- vacío en legajos de antes del sistema
  fecha_baja?: string; // "YYYY-MM-DD", opcional -- si está cargada, estado = false
  motivo_baja?: string; // una de MOTIVOS_BAJA (motor.ts), solo si fecha_baja está cargada
  expand?: { empresa?: FichadasEmpresa; horario?: FichadasHorario };
}
```

- [ ] **Step 5: Commit**

```bash
git add pb_migrations/1789170000_fichadas_legajos_alta_baja.js web/src/types.ts
git commit -m "Fichadas: fecha de alta/baja y motivo en legajos (Rotación)"
```

(Incluir `Co-Authored-By: Claude <noreply@anthropic.com>`.)

---

## Task 2: Motor — ventana de actividad real por legajo en procesarPeriodo

**Files:**
- Modify: `web/src/pages/fichadas/motor.ts`

**Interfaces:**
- Consumes: `FichadasLegajo.fecha_alta`/`fecha_baja` (Task 1).
- Produces: `procesarPeriodo()` deja de generar `ResultadoDia` para un legajo fuera de su ventana real de actividad (sin cambiar su firma ni su tipo de retorno).

- [ ] **Step 1: Agregar el helper de fecha a UTC y acotar la ventana por legajo**

Buscar:

```typescript
function fechaAMinutosAbsolutos(fechaStr: string): number {
  const [y, m, d] = fechaStr.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 60000;
}
```

Reemplazar por:

```typescript
function fechaAMinutosAbsolutos(fechaStr: string): number {
  const [y, m, d] = fechaStr.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 60000;
}

function fechaAUtcMs(fechaStr: string): number {
  const [y, m, d] = fechaStr.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}
```

Buscar:

```typescript
  // Todo legajo activo tiene que evaluarse día por día aunque no tenga
  // ninguna fichada real en el período -- si alguien no vino nunca y nadie
  // cargó ninguna justificación, eso es exactamente "Sin Justificar", el
  // caso más claro de ausentismo sin justificar. (Confirmado con el
  // usuario: esto puede marcar de más a alguien recién ingresado antes de
  // su fecha real de alta, o a un ex-empleado antes de que se lo dé de
  // baja a mano -- aceptado como limitación temporal hasta que exista
  // fecha de alta/baja real, proyecto de Rotación.)
  legajos.forEach((l) => {
    if (l.estado && !marcasPorLegajo.has(l.id)) {
      marcasPorLegajo.set(l.id, []);
    }
  });
```

Reemplazar por:

```typescript
  // Todo legajo activo tiene que evaluarse día por día aunque no tenga
  // ninguna fichada real en el período -- si alguien no vino nunca y nadie
  // cargó ninguna justificación, eso es exactamente "Sin Justificar", el
  // caso más claro de ausentismo sin justificar. Esto puede marcar de más
  // a alguien recién ingresado antes de su fecha_alta real -- si esa
  // fecha está cargada, la ventana de abajo ya lo corta; si no está
  // cargada (legajo de antes del sistema), sigue siendo una limitación
  // conocida y aceptada.
  legajos.forEach((l) => {
    if (l.estado && !marcasPorLegajo.has(l.id)) {
      marcasPorLegajo.set(l.id, []);
    }
  });
```

Buscar:

```typescript
  const resultados: ResultadoDia[] = [];

  for (const [idLegajo, marcasGlobal] of marcasPorLegajo.entries()) {
    const legajo = legajos.find((l) => l.id === idLegajo);
    if (!legajo) continue;
    const usados = new Array(marcasGlobal.length).fill(false);
    const areaNombre = legajo.empresa ? empresaNombrePorId.get(legajo.empresa) || '—' : '—';

    for (let cur = utcDesde; cur <= utcHasta; cur += 86400000) {
```

Reemplazar por:

```typescript
  const resultados: ResultadoDia[] = [];

  for (const [idLegajo, marcasGlobal] of marcasPorLegajo.entries()) {
    const legajo = legajos.find((l) => l.id === idLegajo);
    if (!legajo) continue;
    const usados = new Array(marcasGlobal.length).fill(false);
    const areaNombre = legajo.empresa ? empresaNombrePorId.get(legajo.empresa) || '—' : '—';

    // Ventana real de actividad de este legajo dentro del período pedido --
    // si tiene fecha_alta/fecha_baja cargada, no se generan resultados
    // fuera de ese rango (ex-empleado ya no cuenta después de su baja,
    // alta reciente no cuenta antes de su ingreso real). Sin esas fechas
    // cargadas, el comportamiento es igual al de siempre (todo el período).
    const ventanaDesde = legajo.fecha_alta ? Math.max(utcDesde, fechaAUtcMs(legajo.fecha_alta)) : utcDesde;
    const ventanaHasta = legajo.fecha_baja ? Math.min(utcHasta, fechaAUtcMs(legajo.fecha_baja)) : utcHasta;

    for (let cur = ventanaDesde; cur <= ventanaHasta; cur += 86400000) {
```

- [ ] **Step 2: Escribir el script de prueba**

```typescript
// Prueba standalone: ventana de actividad real (fecha_alta/fecha_baja) en
// procesarPeriodo. Se corre con tsx y se borra después.
import { procesarPeriodo } from './motor';
import type { FichadasLegajo } from '../../types';

let ok = 0, fail = 0;
function check(nombre: string, cond: boolean, extra?: unknown) {
  if (cond) { ok++; console.log(`  OK   ${nombre}`); }
  else { fail++; console.log(`  FALLA ${nombre} ->`, extra); }
}

function legajoBase(id: string, overrides: Partial<FichadasLegajo> = {}): FichadasLegajo {
  return {
    id, created: '', updated: '',
    nro_tarjeta: id, nombre: 'Prueba ' + id, estado: true,
    dias_personalizados: [1, 2, 3, 4, 5].map((dia) => ({ dia, trabaja: true, pares: [[480, 960]] as [number, number][] })),
    ...overrides,
  };
}

// 2026-01-05 a 2026-01-09 son Lun a Vie (verificado).

// Caso 1: sin fecha_alta/fecha_baja -- comportamiento igual a hoy.
{
  const legajo = legajoBase('l1');
  const { resultados } = procesarPeriodo({
    legajos: [legajo], marcas: [], novedades: [], feriados: [],
    empresaNombrePorId: new Map(), desde: '2026-01-05', hasta: '2026-01-09',
  });
  check('sin fechas: 5 resultados (los 5 días hábiles del período)', resultados.length === 5, resultados.length);
}

// Caso 2: fecha_baja ANTES del período -- no debe aportar ningún resultado.
{
  const legajo = legajoBase('l2', { fecha_baja: '2026-01-01' });
  const { resultados } = procesarPeriodo({
    legajos: [legajo], marcas: [], novedades: [], feriados: [],
    empresaNombrePorId: new Map(), desde: '2026-01-05', hasta: '2026-01-09',
  });
  check('fecha_baja antes del período: 0 resultados', resultados.length === 0, resultados.length);
}

// Caso 3: fecha_alta DESPUÉS del período -- no debe aportar ningún resultado.
{
  const legajo = legajoBase('l3', { fecha_alta: '2026-02-01' });
  const { resultados } = procesarPeriodo({
    legajos: [legajo], marcas: [], novedades: [], feriados: [],
    empresaNombrePorId: new Map(), desde: '2026-01-05', hasta: '2026-01-09',
  });
  check('fecha_alta después del período: 0 resultados', resultados.length === 0, resultados.length);
}

// Caso 4: fecha_baja A MITAD del período -- solo resultados hasta esa fecha (inclusive).
{
  const legajo = legajoBase('l4', { fecha_baja: '2026-01-07' });
  const { resultados } = procesarPeriodo({
    legajos: [legajo], marcas: [], novedades: [], feriados: [],
    empresaNombrePorId: new Map(), desde: '2026-01-05', hasta: '2026-01-09',
  });
  const fechas = resultados.map((r) => r.fecha).sort();
  check('fecha_baja a mitad del período: 3 días (05, 06, 07)', fechas.length === 3, fechas);
  check('fecha_baja a mitad del período: ninguno después de la baja', fechas.every((f) => f <= '2026-01-07'), fechas);
}

console.log(`\n${ok} ok, ${fail} fallas`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 3: Correr la prueba y borrarla**

Run: `cd web && npx tsx src/pages/fichadas/motor.test-ventana.ts`
Expected: `6 ok, 0 fallas` (si el conteo real difiere porque se agregó/quitó algún `check(...)`, lo que manda es que todas las que haya pasen en 0, no el número exacto).

```bash
rm web/src/pages/fichadas/motor.test-ventana.ts
```

- [ ] **Step 4: Build**

Run: `cd web && npm run build`
Expected: build exitoso, sin errores de TypeScript.

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/fichadas/motor.ts
git commit -m "Fichadas: acotar procesarPeriodo a la ventana real de alta/baja por legajo"
```

---

## Task 3: Motor — función de agregación de Rotación

**Files:**
- Modify: `web/src/pages/fichadas/motor.ts`

**Interfaces:**
- Consumes: `FichadasLegajo.fecha_alta`/`fecha_baja`/`motivo_baja` (Task 1). NO consume `ResultadoDia` ni Task 2 — opera directo sobre `legajos`.
- Produces: `MOTIVOS_BAJA`, `RotacionMes`, `MovimientoRotacion`, `calcularEstadisticaRotacion()`.

- [ ] **Step 1: Agregar la función al final de `motor.ts`**

```typescript
// ---------- Estadística de Rotación (altas/bajas mensuales, total empresa) ----------

// Mismos 4 motivos que ya usaba el Excel de RRHH -- no agregar ni sacar
// ninguno sin actualizar también la migración del campo `motivo_baja`.
export const MOTIVOS_BAJA: string[] = ['Despido', 'Renuncia', 'Acuerdo', 'Jubilación'];

export interface RotacionMes {
  dotacionInicial: number;
  ingresos: number;
  despidos: number;
  renuncias: number;
  acuerdos: number;
  jubilaciones: number;
  totalEgresos: number;
  dotacionFinal: number;
  indiceRotacion: number; // totalEgresos / dotacionInicial, 0 si dotacionInicial=0 (fracción, no %)
}

export interface MovimientoRotacion {
  nombre: string;
  fecha: string;
  tipo: 'ingreso' | 'egreso';
  motivo?: string; // solo para egresos
}

export function calcularEstadisticaRotacion(params: {
  legajos: FichadasLegajo[];
  anio: number;
  mesesTranscurridos?: number; // 1-12, default 12 (año completo)
}): { meses: RotacionMes[]; movimientos: MovimientoRotacion[] } {
  const { legajos, anio, mesesTranscurridos = 12 } = params;

  // Un legajo sin fecha_alta se asume "de antes" -- siempre activo desde
  // el inicio de cualquier período que se calcule acá (nunca cuenta como
  // "ingreso", porque no se sabe cuándo entró realmente).
  function activoAl(legajo: FichadasLegajo, fechaIso: string): boolean {
    const alta = legajo.fecha_alta || '0000-01-01';
    return alta <= fechaIso && (!legajo.fecha_baja || legajo.fecha_baja > fechaIso);
  }

  const meses: RotacionMes[] = [];
  const movimientos: MovimientoRotacion[] = [];

  for (let m = 0; m < 12; m++) {
    if (m >= mesesTranscurridos) {
      // Mes futuro (año actual todavía no llegó ahí): no se inventa nada.
      meses.push({ dotacionInicial: 0, ingresos: 0, despidos: 0, renuncias: 0, acuerdos: 0, jubilaciones: 0, totalEgresos: 0, dotacionFinal: 0, indiceRotacion: 0 });
      continue;
    }
    const inicioMes = `${anio}-${String(m + 1).padStart(2, '0')}-01`;
    const ultimoDia = new Date(Date.UTC(anio, m + 1, 0)).getUTCDate();
    const finMes = `${anio}-${String(m + 1).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`;

    const dotacionInicial = legajos.filter((l) => activoAl(l, inicioMes)).length;
    const ingresosDelMes = legajos.filter((l) => l.fecha_alta && l.fecha_alta >= inicioMes && l.fecha_alta <= finMes);
    const egresosDelMes = legajos.filter((l) => l.fecha_baja && l.fecha_baja >= inicioMes && l.fecha_baja <= finMes);

    const despidos = egresosDelMes.filter((l) => l.motivo_baja === 'Despido').length;
    const renuncias = egresosDelMes.filter((l) => l.motivo_baja === 'Renuncia').length;
    const acuerdos = egresosDelMes.filter((l) => l.motivo_baja === 'Acuerdo').length;
    const jubilaciones = egresosDelMes.filter((l) => l.motivo_baja === 'Jubilación').length;
    const totalEgresos = egresosDelMes.length;
    const ingresos = ingresosDelMes.length;
    const dotacionFinal = dotacionInicial + ingresos - totalEgresos;
    const indiceRotacion = dotacionInicial > 0 ? totalEgresos / dotacionInicial : 0;

    ingresosDelMes.forEach((l) => movimientos.push({ nombre: l.nombre, fecha: l.fecha_alta!, tipo: 'ingreso' }));
    egresosDelMes.forEach((l) => movimientos.push({ nombre: l.nombre, fecha: l.fecha_baja!, tipo: 'egreso', motivo: l.motivo_baja }));

    meses.push({ dotacionInicial, ingresos, despidos, renuncias, acuerdos, jubilaciones, totalEgresos, dotacionFinal, indiceRotacion });
  }

  movimientos.sort((a, b) => a.fecha.localeCompare(b.fecha));
  return { meses, movimientos };
}
```

- [ ] **Step 2: Escribir el script de prueba**

```typescript
// Prueba standalone de calcularEstadisticaRotacion. Se corre con tsx y se
// borra después.
import { calcularEstadisticaRotacion } from './motor';
import type { FichadasLegajo } from '../../types';

let ok = 0, fail = 0;
function check(nombre: string, cond: boolean, extra?: unknown) {
  if (cond) { ok++; console.log(`  OK   ${nombre}`); }
  else { fail++; console.log(`  FALLA ${nombre} ->`, extra); }
}

function legajoBase(id: string, overrides: Partial<FichadasLegajo> = {}): FichadasLegajo {
  return { id, created: '', updated: '', nro_tarjeta: id, nombre: 'Prueba ' + id, estado: true, ...overrides };
}

const legajos: FichadasLegajo[] = [
  legajoBase('l1'), // de antes, activo todo el año
  legajoBase('l2', { fecha_alta: '2026-03-10' }), // ingresa en marzo
  legajoBase('l3', { fecha_baja: '2026-05-20', motivo_baja: 'Renuncia' }), // de antes, se va en mayo
];

const { meses, movimientos } = calcularEstadisticaRotacion({ legajos, anio: 2026, mesesTranscurridos: 12 });

check('enero: dotación inicial 2 (l1 y l3, l2 todavía no ingresó)', meses[0].dotacionInicial === 2, meses[0]);
check('enero: sin ingresos ni egresos', meses[0].ingresos === 0 && meses[0].totalEgresos === 0, meses[0]);

check('marzo: dotación inicial 2 (l2 ingresa recién el 10)', meses[2].dotacionInicial === 2, meses[2]);
check('marzo: 1 ingreso (l2)', meses[2].ingresos === 1, meses[2]);
check('marzo: dotación final 3', meses[2].dotacionFinal === 3, meses[2]);

check('mayo: dotación inicial 3 (l3 todavía activo el 1/5)', meses[4].dotacionInicial === 3, meses[4]);
check('mayo: 1 egreso por Renuncia', meses[4].totalEgresos === 1 && meses[4].renuncias === 1, meses[4]);
check('mayo: despidos/acuerdos/jubilaciones en 0', meses[4].despidos === 0 && meses[4].acuerdos === 0 && meses[4].jubilaciones === 0, meses[4]);
check('mayo: índice de rotación 1/3', Math.abs(meses[4].indiceRotacion - 1 / 3) < 1e-9, meses[4]);
check('mayo: dotación final 2', meses[4].dotacionFinal === 2, meses[4]);

check('junio: dotación inicial 2 (l3 ya se fue)', meses[5].dotacionInicial === 2, meses[5]);

check('movimientos: 2 en total (1 ingreso + 1 egreso)', movimientos.length === 2, movimientos);
check('movimientos: ordenados por fecha (marzo antes que mayo)', movimientos[0].fecha === '2026-03-10' && movimientos[1].fecha === '2026-05-20', movimientos);
check('movimiento de egreso trae el motivo', movimientos[1].motivo === 'Renuncia', movimientos[1]);

console.log(`\n${ok} ok, ${fail} fallas`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 3: Correr la prueba y borrarla**

Run: `cd web && npx tsx src/pages/fichadas/motor.test-rotacion.ts`
Expected: `11 ok, 0 fallas` (si el conteo real difiere porque se agregó/quitó algún `check(...)`, lo que manda es que todas las que haya pasen en 0, no el número exacto).

```bash
rm web/src/pages/fichadas/motor.test-rotacion.ts
```

- [ ] **Step 4: Build**

Run: `cd web && npm run build`
Expected: build exitoso, sin errores de TypeScript.

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/fichadas/motor.ts
git commit -m "Fichadas: agregación de Rotación (altas/bajas mensuales)"
```

---

## Task 4: Configuración — fecha de alta al crear, Dar de baja / Reactivar

**Files:**
- Modify: `web/src/pages/fichadas/ConfiguracionTab.tsx`

**Interfaces:**
- Consumes: `MOTIVOS_BAJA` (Task 3), `fecha_alta`/`fecha_baja`/`motivo_baja` (Task 1).
- Produces: el interruptor "Activo/Inactivo" desaparece de la UI; se reemplaza por "Dar de baja" (carga fecha+motivo) y "Reactivar" en cada fila de legajo activo/inactivo respectivamente.

- [ ] **Step 1: Importar `MOTIVOS_BAJA`**

Buscar:

```typescript
import { hhmmAMinutos, fmtDur } from './motor';
```

Reemplazar por:

```typescript
import { hhmmAMinutos, fmtDur, MOTIVOS_BAJA } from './motor';
```

- [ ] **Step 2: Reemplazar `EmpleadosSub` completo**

Buscar (desde `function EmpleadosSub` hasta el `}` que cierra la función, justo antes del comentario `// ---------- edición de 7 días`):

```tsx
function EmpleadosSub({ empresas, horarios, legajos, onChanged }: { empresas: FichadasEmpresa[]; horarios: FichadasHorario[]; legajos: FichadasLegajo[]; onChanged: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [nroLegajo, setNroLegajo] = useState('');
  const [nroTarjeta, setNroTarjeta] = useState('');
  const [nombre, setNombre] = useState('');
  const [empresa, setEmpresa] = useState(empresas[0]?.id || '');
  const [horario, setHorario] = useState(horarios[0]?.id || '');

  useEffect(() => { if (!empresa && empresas[0]) setEmpresa(empresas[0].id); }, [empresas, empresa]);
  useEffect(() => { if (!horario && horarios[0]) setHorario(horarios[0].id); }, [horarios, horario]);

  async function agregar() {
    if (!nroTarjeta.trim() || !nombre.trim()) { toast('Completá al menos N° Tarjeta y Nombre.', 'warn'); return; }
    try {
      await pb.collection('fichadas_legajos').create({
        nro_legajo: nroLegajo.trim(), nro_tarjeta: nroTarjeta.trim(), nombre: nombre.trim().toUpperCase(),
        empresa: empresa || null, horario: horario || null, estado: true,
      });
      setNroLegajo(''); setNroTarjeta(''); setNombre('');
      onChanged();
      toast('Empleado agregado.', 'ok');
    } catch (e) {
      toast('Error: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }

  async function editar(id: string, campo: string, valor: string | boolean) {
    try {
      await pb.collection('fichadas_legajos').update(id, { [campo]: valor });
      onChanged();
    } catch (e) {
      toast('Error: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }

  async function eliminar(id: string) {
    if (!(await confirm('¿Eliminar este empleado? Mejor usar "Inactivo" si solo dejó de trabajar, para no perder su historial de fichadas.', 'Eliminar empleado'))) return;
    try {
      await pb.collection('fichadas_legajos').delete(id);
      onChanged();
      toast('Eliminado.', 'ok');
    } catch (e) {
      toast('Error: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }

  return (
    <>
      <h3 style={{ fontSize: 13, color: 'var(--navy)', margin: '0 0 8px' }}>Agregar empleado nuevo</h3>
      <div className="row">
        <div className="field"><label>N° Legajo</label><input value={nroLegajo} onChange={(e) => setNroLegajo(e.target.value)} /></div>
        <div className="field"><label>N° Tarjeta</label><input value={nroTarjeta} onChange={(e) => setNroTarjeta(e.target.value)} placeholder="Suele ser igual al legajo" /></div>
        <div className="field" style={{ flex: 2 }}><label>Nombre</label><input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="APELLIDO NOMBRE" /></div>
        <div className="field"><label>Área</label><select value={empresa} onChange={(e) => setEmpresa(e.target.value)}>{empresas.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}</select></div>
        <div className="field"><label>Horario</label><select value={horario} onChange={(e) => setHorario(e.target.value)}>{horarios.map((h) => <option key={h.id} value={h.id}>{h.nombre}</option>)}</select></div>
        <button onClick={agregar}>Agregar</button>
      </div>

      <h3 style={{ fontSize: 13, color: 'var(--navy)', margin: '18px 0 8px' }}>Empleados cargados ({legajos.length})</h3>
      <div className="table-wrap" style={{ maxHeight: '50vh' }}>
        <table>
          <thead><tr><th>Legajo</th><th>Tarjeta</th><th>Nombre</th><th>Área</th><th>Horario</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            {legajos.map((l) => (
              <tr key={l.id} className={!l.estado ? 'inactivo' : ''}>
                <td>{l.nro_legajo}</td>
                <td>{l.nro_tarjeta}</td>
                <td className="admin-name">{l.nombre}</td>
                <td>
                  <select value={l.empresa || ''} onChange={(e) => editar(l.id, 'empresa', e.target.value)}>
                    {empresas.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                  </select>
                </td>
                <td>
                  <select value={l.horario || ''} onChange={(e) => editar(l.id, 'horario', e.target.value)}>
                    {horarios.map((h) => <option key={h.id} value={h.id}>{h.nombre}</option>)}
                  </select>
                </td>
                <td>
                  <select value={l.estado ? '1' : '0'} onChange={(e) => editar(l.id, 'estado', e.target.value === '1')}>
                    <option value="1">Activo</option>
                    <option value="0">Inactivo</option>
                  </select>
                </td>
                <td><button className="small danger" onClick={() => eliminar(l.id)}>Eliminar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
```

Reemplazar por:

```tsx
function EmpleadosSub({ empresas, horarios, legajos, onChanged }: { empresas: FichadasEmpresa[]; horarios: FichadasHorario[]; legajos: FichadasLegajo[]; onChanged: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [nroLegajo, setNroLegajo] = useState('');
  const [nroTarjeta, setNroTarjeta] = useState('');
  const [nombre, setNombre] = useState('');
  const [empresa, setEmpresa] = useState(empresas[0]?.id || '');
  const [horario, setHorario] = useState(horarios[0]?.id || '');
  const [fechaAlta, setFechaAlta] = useState('');
  const [idEnBaja, setIdEnBaja] = useState<string | null>(null);
  const [fechaBaja, setFechaBaja] = useState('');
  const [motivoBaja, setMotivoBaja] = useState('');

  useEffect(() => { if (!empresa && empresas[0]) setEmpresa(empresas[0].id); }, [empresas, empresa]);
  useEffect(() => { if (!horario && horarios[0]) setHorario(horarios[0].id); }, [horarios, horario]);

  async function agregar() {
    if (!nroTarjeta.trim() || !nombre.trim()) { toast('Completá al menos N° Tarjeta y Nombre.', 'warn'); return; }
    try {
      await pb.collection('fichadas_legajos').create({
        nro_legajo: nroLegajo.trim(), nro_tarjeta: nroTarjeta.trim(), nombre: nombre.trim().toUpperCase(),
        empresa: empresa || null, horario: horario || null, estado: true, fecha_alta: fechaAlta || null,
      });
      setNroLegajo(''); setNroTarjeta(''); setNombre(''); setFechaAlta('');
      onChanged();
      toast('Empleado agregado.', 'ok');
    } catch (e) {
      toast('Error: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }

  async function editar(id: string, campo: string, valor: string | boolean) {
    try {
      await pb.collection('fichadas_legajos').update(id, { [campo]: valor });
      onChanged();
    } catch (e) {
      toast('Error: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }

  function abrirBaja(id: string) {
    setIdEnBaja(id);
    setFechaBaja('');
    setMotivoBaja('');
  }

  async function confirmarBaja() {
    if (!idEnBaja) return;
    if (!fechaBaja || !motivoBaja) { toast('Completá fecha y motivo de la baja.', 'warn'); return; }
    try {
      await pb.collection('fichadas_legajos').update(idEnBaja, { fecha_baja: fechaBaja, motivo_baja: motivoBaja, estado: false });
      setIdEnBaja(null);
      onChanged();
      toast('Baja registrada.', 'ok');
    } catch (e) {
      toast('Error: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }

  async function reactivar(id: string) {
    if (!(await confirm('¿Reactivar a este empleado? Se borran la fecha y el motivo de baja cargados.', 'Reactivar empleado'))) return;
    try {
      await pb.collection('fichadas_legajos').update(id, { fecha_baja: null, motivo_baja: null, estado: true });
      onChanged();
      toast('Reactivado.', 'ok');
    } catch (e) {
      toast('Error: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }

  async function eliminar(id: string) {
    if (!(await confirm('¿Eliminar este empleado? Mejor usar "Dar de baja" si solo dejó de trabajar, para no perder su historial de fichadas.', 'Eliminar empleado'))) return;
    try {
      await pb.collection('fichadas_legajos').delete(id);
      onChanged();
      toast('Eliminado.', 'ok');
    } catch (e) {
      toast('Error: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }

  const legajoEnBaja = legajos.find((l) => l.id === idEnBaja);

  return (
    <>
      <h3 style={{ fontSize: 13, color: 'var(--navy)', margin: '0 0 8px' }}>Agregar empleado nuevo</h3>
      <div className="row">
        <div className="field"><label>N° Legajo</label><input value={nroLegajo} onChange={(e) => setNroLegajo(e.target.value)} /></div>
        <div className="field"><label>N° Tarjeta</label><input value={nroTarjeta} onChange={(e) => setNroTarjeta(e.target.value)} placeholder="Suele ser igual al legajo" /></div>
        <div className="field" style={{ flex: 2 }}><label>Nombre</label><input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="APELLIDO NOMBRE" /></div>
        <div className="field"><label>Área</label><select value={empresa} onChange={(e) => setEmpresa(e.target.value)}>{empresas.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}</select></div>
        <div className="field"><label>Horario</label><select value={horario} onChange={(e) => setHorario(e.target.value)}>{horarios.map((h) => <option key={h.id} value={h.id}>{h.nombre}</option>)}</select></div>
        <div className="field"><label>Fecha de alta</label><input type="date" value={fechaAlta} onChange={(e) => setFechaAlta(e.target.value)} /></div>
        <button onClick={agregar}>Agregar</button>
      </div>

      {legajoEnBaja && (
        <>
          <h3 style={{ fontSize: 13, color: 'var(--navy)', margin: '18px 0 8px' }}>Dar de baja a "{legajoEnBaja.nombre}"</h3>
          <div className="row">
            <div className="field"><label>Fecha de baja</label><input type="date" value={fechaBaja} onChange={(e) => setFechaBaja(e.target.value)} /></div>
            <div className="field">
              <label>Motivo</label>
              <select value={motivoBaja} onChange={(e) => setMotivoBaja(e.target.value)}>
                <option value="">Elegir…</option>
                {MOTIVOS_BAJA.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <button onClick={confirmarBaja}>Confirmar baja</button>
            <button className="secondary" onClick={() => setIdEnBaja(null)}>Cancelar</button>
          </div>
        </>
      )}

      <h3 style={{ fontSize: 13, color: 'var(--navy)', margin: '18px 0 8px' }}>Empleados cargados ({legajos.length})</h3>
      <div className="table-wrap" style={{ maxHeight: '50vh' }}>
        <table>
          <thead><tr><th>Legajo</th><th>Tarjeta</th><th>Nombre</th><th>Área</th><th>Horario</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            {legajos.map((l) => (
              <tr key={l.id} className={!l.estado ? 'inactivo' : ''}>
                <td>{l.nro_legajo}</td>
                <td>{l.nro_tarjeta}</td>
                <td className="admin-name">{l.nombre}</td>
                <td>
                  <select value={l.empresa || ''} onChange={(e) => editar(l.id, 'empresa', e.target.value)}>
                    {empresas.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                  </select>
                </td>
                <td>
                  <select value={l.horario || ''} onChange={(e) => editar(l.id, 'horario', e.target.value)}>
                    {horarios.map((h) => <option key={h.id} value={h.id}>{h.nombre}</option>)}
                  </select>
                </td>
                <td>
                  {l.estado
                    ? <button className="small secondary" onClick={() => abrirBaja(l.id)}>Dar de baja</button>
                    : (
                      <span title={l.fecha_baja ? `${l.motivo_baja || ''} — ${l.fecha_baja}` : ''}>
                        Inactivo <button className="small secondary" onClick={() => reactivar(l.id)}>Reactivar</button>
                      </span>
                    )}
                </td>
                <td><button className="small danger" onClick={() => eliminar(l.id)}>Eliminar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
```

- [ ] **Step 3: Build**

Run: `cd web && npm run build`
Expected: build exitoso, sin errores de TypeScript.

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/fichadas/ConfiguracionTab.tsx
git commit -m "Fichadas: Dar de baja / Reactivar con fecha y motivo (reemplaza el interruptor Activo/Inactivo)"
```

---

## Task 5: Pantalla de Estadísticas — selector Rotación

**Files:**
- Modify: `web/src/pages/fichadas/EstadisticasTab.tsx`

**Interfaces:**
- Consumes: `calcularEstadisticaRotacion()`, `RotacionMes`, `MovimientoRotacion` (Task 3).
- Produces: tercera opción "Rotación" en el selector Ver, con su propia tabla (9 filas de métrica × 12 meses) y un listado de movimientos del año debajo.

- [ ] **Step 1: Reescribir `web/src/pages/fichadas/EstadisticasTab.tsx` completo**

```tsx
import { Fragment, useEffect, useState } from 'react';
import { pb } from '../../lib/pb';
import { useToast } from '../../lib/ToastContext';
import { isoDate } from '../../lib/format';
import {
  procesarPeriodo, calcularEstadisticaHorasExtras, calcularEstadisticaAusentismo, calcularEstadisticaRotacion,
  type FilaEstadisticaArea, type FilaEstadisticaCausa, type RotacionMes, type MovimientoRotacion,
} from './motor';
import type { FichadasConfiguracion, FichadasEmpresa, FichadasFeriado, FichadasLegajo, FichadasMarca, FichadasNovedad } from '../../types';

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
type Vista = 'horas_extras' | 'ausentismo' | 'rotacion';

function fmtHs(n: number): string {
  return n.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}
function fmtPct(n: number): string {
  return (n * 100).toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
}

export function EstadisticasTab() {
  const toast = useToast();
  const [vista, setVista] = useState<Vista>('horas_extras');
  const [anio, setAnio] = useState(() => new Date().getFullYear());
  const [horasPosibles, setHorasPosibles] = useState('192');
  const [configId, setConfigId] = useState('');
  const [guardandoConfig, setGuardandoConfig] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [filasHorasExtras, setFilasHorasExtras] = useState<FilaEstadisticaArea[] | null>(null);
  const [totalHorasExtras, setTotalHorasExtras] = useState<FilaEstadisticaArea | null>(null);
  const [filasAusentismo, setFilasAusentismo] = useState<FilaEstadisticaCausa[] | null>(null);
  const [totalAusentismo, setTotalAusentismo] = useState<FilaEstadisticaCausa | null>(null);
  const [ultimaFechaConDatos, setUltimaFechaConDatos] = useState<string | null>(null);
  const [rotacionMeses, setRotacionMeses] = useState<RotacionMes[] | null>(null);
  const [rotacionMovimientos, setRotacionMovimientos] = useState<MovimientoRotacion[] | null>(null);
  const [rotacionMesesTranscurridos, setRotacionMesesTranscurridos] = useState(12);

  useEffect(() => {
    pb.collection('fichadas_configuracion').getFullList<FichadasConfiguracion>()
      .then((items) => {
        if (items[0]) {
          setConfigId(items[0].id);
          setHorasPosibles(String(items[0].horas_posibles_mensuales));
        }
      })
      .catch((e) => toast('No se pudo cargar la configuración: ' + (e instanceof Error ? e.message : ''), 'err'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function guardarHorasPosibles() {
    const n = Number(horasPosibles.replace(',', '.'));
    if (!isFinite(n) || n <= 0) { toast('Las horas posibles tienen que ser un número mayor a cero.', 'warn'); return; }
    if (!configId) { toast('No se encontró el registro de configuración.', 'err'); return; }
    setGuardandoConfig(true);
    try {
      await pb.collection('fichadas_configuracion').update(configId, { horas_posibles_mensuales: n });
      toast('Guardado.', 'ok');
    } catch (e) {
      toast('Error: ' + (e instanceof Error ? e.message : ''), 'err');
    } finally {
      setGuardandoConfig(false);
    }
  }

  async function calcular() {
    const n = Number(horasPosibles.replace(',', '.'));
    if (!isFinite(n) || n <= 0) { toast('Las horas posibles tienen que ser un número mayor a cero.', 'warn'); return; }
    const anioActual = new Date().getFullYear();
    if (!isFinite(anio) || anio < 2000 || anio > anioActual) { toast('Elegí un año válido.', 'warn'); return; }
    setCargando(true);
    try {
      const hoy = new Date();
      const desde = isoDate(new Date(anio, 0, 1));
      const finDeAnio = new Date(anio, 11, 31);
      const hasta = isoDate(finDeAnio.getTime() > hoy.getTime() ? hoy : finDeAnio);
      const mesesTranscurridos = anio < anioActual ? 12 : hoy.getMonth() + 1;
      const [legajosTodos, marcas, novedades, feriados, empresas] = await Promise.all([
        // sin filtro estado: las horas pasadas de ex-empleados tienen que contarse igual
        pb.collection('fichadas_legajos').getFullList<FichadasLegajo>({ expand: 'empresa,horario' }),
        pb.collection('fichadas_marcas').getFullList<FichadasMarca>({ filter: pb.filter('fecha >= {:d} && fecha <= {:h}', { d: desde, h: hasta }) }),
        pb.collection('fichadas_novedades').getFullList<FichadasNovedad>({ filter: pb.filter('fecha >= {:d} && fecha <= {:h}', { d: desde, h: hasta }) }),
        pb.collection('fichadas_feriados').getFullList<FichadasFeriado>({ filter: pb.filter('fecha >= {:d} && fecha <= {:h}', { d: desde, h: hasta }) }),
        pb.collection('fichadas_empresas').getFullList<FichadasEmpresa>({ sort: 'nombre' }),
      ]);
      const empresaNombrePorId = new Map(empresas.map((e) => [e.id, e.nombre]));
      // ex-empleados: no inventar horas extra fijas para períodos posteriores a su baja
      const legajosParaCalculo = legajosTodos.map((l) => (l.estado ? l : { ...l, horas_extra_fijas: null }));
      const { resultados } = procesarPeriodo({ legajos: legajosParaCalculo, marcas, novedades, feriados, empresaNombrePorId, desde, hasta });

      const dotacionPorArea = new Map<string, number>();
      legajosTodos.filter((l) => l.estado).forEach((l) => {
        const nombreArea = l.empresa ? empresaNombrePorId.get(l.empresa) : undefined;
        if (!nombreArea) return;
        dotacionPorArea.set(nombreArea, (dotacionPorArea.get(nombreArea) || 0) + 1);
      });
      const dotacionTotal = Array.from(dotacionPorArea.values()).reduce((a, b) => a + b, 0);

      const { filas: fHE, total: tHE } = calcularEstadisticaHorasExtras({
        resultados, areas: empresas.map((e) => e.nombre), dotacionPorArea, horasPosiblesMensuales: n, mesesTranscurridos,
      });
      setFilasHorasExtras(fHE);
      setTotalHorasExtras(tHE);

      const ultimaConDatos = marcas.length ? marcas.reduce((max, m) => (m.fecha > max ? m.fecha : max), marcas[0].fecha) : null;
      setUltimaFechaConDatos(ultimaConDatos);

      const { filas: fAus, total: tAus } = calcularEstadisticaAusentismo({
        resultados, dotacionTotal, horasPosiblesMensuales: n, mesesTranscurridos,
        ultimaFechaConDatos: ultimaConDatos || undefined,
      });
      setFilasAusentismo(fAus);
      setTotalAusentismo(tAus);

      const { meses: mesesRot, movimientos: movRot } = calcularEstadisticaRotacion({ legajos: legajosTodos, anio, mesesTranscurridos });
      setRotacionMeses(mesesRot);
      setRotacionMovimientos(movRot);
      setRotacionMesesTranscurridos(mesesTranscurridos);
    } catch (e) {
      toast('No se pudo calcular: ' + (e instanceof Error ? e.message : ''), 'err');
    } finally {
      setCargando(false);
    }
  }

  function filaTablaHorasExtras(f: FilaEstadisticaArea, destacada: boolean) {
    const etiquetas: [string, (m: FilaEstadisticaArea['meses'][number]) => string][] = [
      ['Dot.', (m) => String(m.dotacion)],
      ['HS', (m) => fmtHs(m.hs)],
      ['HS/To', (m) => fmtPct(m.hsTotalMes > 0 ? m.hs / m.hsTotalMes : 0)],
      ['%', (m) => fmtPct(m.porcentaje)],
      ['Hs/P.', (m) => fmtHs(m.hsPorPersona)],
    ];
    return (
      <>
        {etiquetas.map(([etiqueta, valorDe], i) => (
          <tr key={etiqueta} style={destacada ? { fontWeight: 700 } : undefined}>
            {i === 0 ? <td rowSpan={5} style={{ verticalAlign: 'top', fontWeight: 700 }}>{f.area}</td> : null}
            <td>{etiqueta}</td>
            {f.meses.map((m, idx) => <td key={idx} className="num">{valorDe(m)}</td>)}
            <td className="num">{etiqueta === 'HS' ? fmtHs(f.promedioHs) : ''}</td>
            <td className="num">{etiqueta === 'HS' ? fmtHs(f.totalHs) : ''}</td>
          </tr>
        ))}
      </>
    );
  }

  function filaTablaAusentismo(f: FilaEstadisticaCausa, destacada: boolean) {
    const etiquetas: [string, (m: FilaEstadisticaCausa['meses'][number]) => string][] = [
      ['Hs', (m) => fmtHs(m.horas)],
      ['%', (m) => fmtPct(m.porcentaje)],
    ];
    return (
      <>
        {etiquetas.map(([etiqueta, valorDe], i) => (
          <tr key={etiqueta} style={destacada ? { fontWeight: 700 } : undefined}>
            {i === 0 ? <td rowSpan={2} style={{ verticalAlign: 'top', fontWeight: 700 }}>{f.causa}</td> : null}
            <td>{etiqueta}</td>
            {f.meses.map((m, idx) => <td key={idx} className="num">{valorDe(m)}</td>)}
            <td className="num">{etiqueta === 'Hs' ? fmtHs(f.promedioHoras) : ''}</td>
            <td className="num">{etiqueta === 'Hs' ? fmtHs(f.totalHoras) : ''}</td>
          </tr>
        ))}
      </>
    );
  }

  function filasRotacion(meses: RotacionMes[], mesesTranscurridos: number) {
    function prom(valores: number[]) { return valores.slice(0, mesesTranscurridos).reduce((a, b) => a + b, 0) / mesesTranscurridos; }
    function total(valores: number[]) { return valores.reduce((a, b) => a + b, 0); }
    return [
      { etiqueta: 'Dotación Inicial', valores: meses.map((m) => m.dotacionInicial), prom: prom(meses.map((m) => m.dotacionInicial)) },
      { etiqueta: 'Ingresos', valores: meses.map((m) => m.ingresos), prom: prom(meses.map((m) => m.ingresos)), tot: total(meses.map((m) => m.ingresos)) },
      { etiqueta: 'Despidos', valores: meses.map((m) => m.despidos), prom: prom(meses.map((m) => m.despidos)), tot: total(meses.map((m) => m.despidos)) },
      { etiqueta: 'Renuncias', valores: meses.map((m) => m.renuncias), prom: prom(meses.map((m) => m.renuncias)), tot: total(meses.map((m) => m.renuncias)) },
      { etiqueta: 'Acuerdos', valores: meses.map((m) => m.acuerdos), prom: prom(meses.map((m) => m.acuerdos)), tot: total(meses.map((m) => m.acuerdos)) },
      { etiqueta: 'Jubilación', valores: meses.map((m) => m.jubilaciones), prom: prom(meses.map((m) => m.jubilaciones)), tot: total(meses.map((m) => m.jubilaciones)) },
      { etiqueta: 'Total Egresos', valores: meses.map((m) => m.totalEgresos), prom: prom(meses.map((m) => m.totalEgresos)), tot: total(meses.map((m) => m.totalEgresos)) },
      { etiqueta: 'Dotación Final', valores: meses.map((m) => m.dotacionFinal), prom: prom(meses.map((m) => m.dotacionFinal)) },
      { etiqueta: 'Índice de Rotación', valores: meses.map((m) => m.indiceRotacion), esPorcentaje: true, prom: prom(meses.map((m) => m.indiceRotacion)) },
    ] as { etiqueta: string; valores: number[]; esPorcentaje?: boolean; prom?: number; tot?: number }[];
  }

  const hayDatos = vista === 'horas_extras' ? !!(filasHorasExtras && totalHorasExtras)
    : vista === 'ausentismo' ? !!(filasAusentismo && totalAusentismo)
    : rotacionMeses !== null;

  return (
    <div className="card">
      <h2>Estadísticas</h2>
      <div className="hint">Resumen anual por área/causa/rotación — reemplaza las planillas que arma RRHH a mano.</div>

      <div className="row" style={{ marginTop: 14, flexWrap: 'wrap', alignItems: 'end' }}>
        <div className="field">
          <label>Ver</label>
          <select value={vista} onChange={(e) => setVista(e.target.value as Vista)}>
            <option value="horas_extras">Horas Extras</option>
            <option value="ausentismo">Ausentismo</option>
            <option value="rotacion">Rotación</option>
          </select>
        </div>
        <div className="field">
          <label>Año</label>
          <input type="number" min={2015} max={new Date().getFullYear()} value={anio} onChange={(e) => setAnio(Number(e.target.value))} style={{ width: 90 }} />
        </div>
        <div className="field">
          <label>Horas posibles por mes</label>
          <input value={horasPosibles} onChange={(e) => setHorasPosibles(e.target.value)} style={{ width: 90 }} />
        </div>
        <button className="secondary" onClick={guardarHorasPosibles} disabled={guardandoConfig}>Guardar horas posibles</button>
        <button onClick={calcular} disabled={cargando}>{cargando ? 'Calculando…' : 'Calcular'}</button>
      </div>

      {hayDatos && vista === 'ausentismo' && ultimaFechaConDatos && (
        <div className="hint" style={{ marginTop: 16 }}>
          Fichadas cargadas hasta el {ultimaFechaConDatos.split('-').reverse().join('/')} — los días sin fichadas importadas todavía no se cuentan como "Sin Justificar".
        </div>
      )}

      {hayDatos && vista !== 'rotacion' && (
        <div className="table-wrap" style={{ marginTop: 16 }}>
          <table>
            <thead>
              <tr>
                <th>{vista === 'horas_extras' ? 'Área' : 'Causa'}</th><th></th>
                {MESES.map((m) => <th key={m} className="num">{m}</th>)}
                <th className="num">Prom.</th>
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {vista === 'horas_extras' && filasHorasExtras && totalHorasExtras && (
                <>
                  {filasHorasExtras.map((f) => <Fragment key={f.area}>{filaTablaHorasExtras(f, false)}</Fragment>)}
                  {filaTablaHorasExtras(totalHorasExtras, true)}
                </>
              )}
              {vista === 'ausentismo' && filasAusentismo && totalAusentismo && (
                <>
                  {filasAusentismo.map((f) => <Fragment key={f.causa}>{filaTablaAusentismo(f, false)}</Fragment>)}
                  {filaTablaAusentismo(totalAusentismo, true)}
                </>
              )}
            </tbody>
          </table>
        </div>
      )}

      {hayDatos && vista === 'rotacion' && rotacionMeses && (
        <>
          <div className="table-wrap" style={{ marginTop: 16 }}>
            <table>
              <thead>
                <tr>
                  <th colSpan={2}>Métrica</th>
                  {MESES.map((m) => <th key={m} className="num">{m}</th>)}
                  <th className="num">Prom.</th>
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {filasRotacion(rotacionMeses, rotacionMesesTranscurridos).map((f) => (
                  <tr key={f.etiqueta}>
                    <td colSpan={2} style={{ fontWeight: 700 }}>{f.etiqueta}</td>
                    {f.valores.map((v, idx) => <td key={idx} className="num">{f.esPorcentaje ? fmtPct(v) : String(v)}</td>)}
                    <td className="num">{f.prom !== undefined ? (f.esPorcentaje ? fmtPct(f.prom) : fmtHs(f.prom)) : ''}</td>
                    <td className="num">{f.tot !== undefined ? String(f.tot) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rotacionMovimientos && rotacionMovimientos.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <h3 style={{ fontSize: 13, color: 'var(--navy)', margin: '0 0 8px' }}>Movimientos del año</h3>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {rotacionMovimientos.map((mv, idx) => (
                  <li key={idx} style={{ fontSize: 12 }}>
                    {mv.fecha.split('-').reverse().join('/')} — {mv.nombre} — {mv.tipo === 'ingreso' ? 'Alta' : `Baja (${mv.motivo || 'sin motivo'})`}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {rotacionMovimientos && rotacionMovimientos.length === 0 && (
            <div className="empty" style={{ marginTop: 16 }}>Sin altas ni bajas cargadas este año.</div>
          )}
        </>
      )}
      {!hayDatos && !cargando && <div className="empty" style={{ marginTop: 16 }}>Elegí un año y apretá "Calcular".</div>}
    </div>
  );
}
```

- [ ] **Step 2: Build**

Run: `cd web && npm run build`
Expected: build exitoso, sin errores de TypeScript.

- [ ] **Step 3: Commit**

```bash
git add web/src/pages/fichadas/EstadisticasTab.tsx
git commit -m "Fichadas: selector Rotación en Estadísticas"
```

---

## Task 6: Desplegar y verificar

**Files:** (ninguno nuevo — solo push y verificación)

- [ ] **Step 1: Push**

```bash
git push origin claude/cyv-driver-renditions-form-h4l5fu
```

- [ ] **Step 2: Esperar el deploy y confirmar**

Sondear `https://api.github.com/repos/sistemascyv/Desarrollos/actions/runs?branch=claude/cyv-driver-renditions-form-h4l5fu&per_page=1` hasta `status: completed` (o confirmar directamente que el hash del bundle JS cambió en `https://app.carossiovairolatti.com.ar/`).

- [ ] **Step 3: Verificación final en producción**

Entrar a Fichadas → Configuración → Empleados: confirmar que ya no aparece el interruptor Activo/Inactivo, que "Agregar empleado nuevo" tiene el campo Fecha de alta, y que un "Dar de baja" de prueba (y su "Reactivar") funcionan sin romper nada (probar con un legajo de prueba, no uno real, o deshacer con Reactivar al terminar). Entrar a Estadísticas, cambiar el selector a "Rotación", elegir el año actual, Calcular, y confirmar que la tabla se arma con las 9 filas de métrica sin errores (va a estar en ceros si no se cargó ninguna fecha de alta/baja real todavía — es esperable, no es un bug).
