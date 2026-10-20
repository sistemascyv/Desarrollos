# Fichadas: Reingresos en Rotación Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un reingreso (alguien que se fue y volvió a entrar) no pierda su historial de altas/bajas en Rotación, y que el hueco entre la baja vieja y el reingreso no se evalúe como si la persona estuviera "de antes del sistema" (sin generar "Sin Justificar" donde no trabajaba ahí).

**Architecture:** Una colección nueva `fichadas_legajo_historial` guarda cada etapa laboral ya cerrada (una fila por reingreso). Los campos actuales de `fichadas_legajos` (`fecha_alta`/`fecha_baja`/`motivo_baja`/`estado`) siguen representando la etapa actual, sin cambiar de significado. `procesarPeriodo()` pasa a evaluar una ventana por cada etapa (historial + actual) en vez de una sola. `calcularEstadisticaRotacion()` considera el historial para dotación/ingresos/egresos. "Reactivar" en Configuración pasa a pedir una fecha de alta nueva y guarda la etapa vieja en el historial antes de abrir la nueva.

**Tech Stack:** React + TypeScript (Vite), PocketBase (migraciones), `tsx` para probar el motor.

## Global Constraints

- Los campos actuales de `fichadas_legajos` (`fecha_alta`/`fecha_baja`/`motivo_baja`/`estado`) no cambian de significado — siguen siendo la etapa actual.
- `fichadas_legajo_historial.fecha_alta` es **opcional** (igual criterio que la etapa actual: un legajo viejo puede no tener su fecha de alta real registrada — vacío se trata como "de antes", nunca cuenta como ingreso puntual). `fecha_baja` y `motivo_baja` son **requeridas** — toda fila de historial es, por definición, una etapa ya cerrada.
- Mismos permisos que ya tiene `fichadas_legajos`: lectura/escritura para el módulo "fichadas" (`@request.auth.modulos ?= "fichadas"`), borrado solo admin.
- Fuera de alcance: editar o borrar una fila de historial desde la pantalla (se corrige a mano en el admin de PocketBase si hace falta), una vista tipo línea de tiempo de las etapas de un legajo.

---

## Task 1: Migración — colección fichadas_legajo_historial

**Files:**
- Create: `pb_migrations/1789220000_created_fichadas_legajo_historial.js`
- Modify: `web/src/types.ts`

**Interfaces:**
- Produces: colección `fichadas_legajo_historial` (campos `legajo`, `fecha_alta`, `fecha_baja`, `motivo_baja`); `HistorialLegajo` interface en `types.ts` con esos mismos campos.

- [ ] **Step 1: Escribir la migración**

```javascript
/// <reference path="../pb_data/types.d.ts" />
// Historial de etapas laborales cerradas de un legajo (reingresos) --
// cada vez que alguien se reincorpora después de haberse ido, se guarda
// acá la etapa que se cierra (fecha_alta/fecha_baja/motivo_baja de ese
// momento) antes de abrir una nueva en el propio fichadas_legajos. Ver
// docs/superpowers/specs/2026-10-20-fichadas-rotacion-reingresos-design.md.
migrate((db) => {
  const dao = new Dao(db);
  const collection = new Collection({
    id: 'fchd0histlegaj1',
    name: 'fichadas_legajo_historial',
    type: 'base',
    system: false,
    schema: [
      {
        system: false, id: 'fhl0legajo001', name: 'legajo', type: 'relation',
        required: true, presentable: true, unique: false,
        options: { collectionId: 'fchd0legajos001', cascadeDelete: true, minSelect: null, maxSelect: 1, displayFields: ['nombre'] },
      },
      {
        system: false, id: 'fhl0fechaalta1', name: 'fecha_alta', type: 'text',
        required: false, presentable: true, unique: false,
        options: { min: null, max: null, pattern: '' },
      },
      {
        system: false, id: 'fhl0fechabaja1', name: 'fecha_baja', type: 'text',
        required: true, presentable: true, unique: false,
        options: { min: null, max: null, pattern: '' },
      },
      {
        system: false, id: 'fhl0motivobaj1', name: 'motivo_baja', type: 'select',
        required: true, presentable: true, unique: false,
        options: { maxSelect: 1, values: ['Despido', 'Renuncia', 'Acuerdo', 'Jubilación'] },
      },
    ],
    indexes: [],
    listRule: '@request.auth.id != "" && (@request.auth.rol = "admin" || @request.auth.modulos ?= "fichadas")',
    viewRule: '@request.auth.id != "" && (@request.auth.rol = "admin" || @request.auth.modulos ?= "fichadas")',
    createRule: '@request.auth.id != "" && (@request.auth.rol = "admin" || @request.auth.modulos ?= "fichadas")',
    updateRule: '@request.auth.id != "" && (@request.auth.rol = "admin" || @request.auth.modulos ?= "fichadas")',
    deleteRule: '@request.auth.rol = "admin"',
    options: {},
  });
  return dao.saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  try { dao.deleteCollection(dao.findCollectionByNameOrId('fichadas_legajo_historial')); } catch (e) { /* no existía */ }
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

Expected: `Applied 1789220000_created_fichadas_legajo_historial.js` sin errores.

- [ ] **Step 3: Verificar la colección quedó bien definida**

```bash
python3 -c "
import sqlite3, json
con = sqlite3.connect('data/data.db')
row = con.execute(\"SELECT schema, listRule, createRule, deleteRule FROM _collections WHERE name='fichadas_legajo_historial'\").fetchone()
data = json.loads(row[0])
por_nombre = {f['name']: f for f in data}
assert por_nombre['legajo']['required'] is True
assert por_nombre['fecha_alta']['required'] is False
assert por_nombre['fecha_baja']['required'] is True
assert por_nombre['motivo_baja']['required'] is True
assert len(por_nombre['motivo_baja']['options']['values']) == 4
assert 'fichadas' in row[1]
assert row[3] == '@request.auth.rol = \"admin\"'
print('OK: fichadas_legajo_historial con los 4 campos y permisos correctos')
"
```

Expected: imprime `OK: fichadas_legajo_historial...` sin error en los asserts.

- [ ] **Step 4: Agregar `HistorialLegajo` en `web/src/types.ts`**

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
  horas_extra_fijas_desde?: string; // "YYYY-MM-DD", opcional -- vacío = sin corte, se aplica siempre (igual que antes de este campo)
  estado: boolean;
  fecha_alta?: string; // "YYYY-MM-DD", opcional -- vacío en legajos de antes del sistema
  fecha_baja?: string; // "YYYY-MM-DD", opcional -- si está cargada, estado = false
  motivo_baja?: string; // una de MOTIVOS_BAJA (motor.ts), solo si fecha_baja está cargada
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
  horas_extra_fijas_desde?: string; // "YYYY-MM-DD", opcional -- vacío = sin corte, se aplica siempre (igual que antes de este campo)
  estado: boolean;
  fecha_alta?: string; // "YYYY-MM-DD", opcional -- vacío en legajos de antes del sistema
  fecha_baja?: string; // "YYYY-MM-DD", opcional -- si está cargada, estado = false
  motivo_baja?: string; // una de MOTIVOS_BAJA (motor.ts), solo si fecha_baja está cargada
  expand?: { empresa?: FichadasEmpresa; horario?: FichadasHorario };
}

// Una fila por cada etapa laboral YA CERRADA de un legajo (reingresos) --
// se crea al "Reactivar" en Configuración, antes de abrir la etapa nueva.
export interface HistorialLegajo extends BaseRecord {
  legajo: string;
  fecha_alta?: string; // "YYYY-MM-DD", opcional -- igual criterio que FichadasLegajo.fecha_alta ("de antes")
  fecha_baja: string; // "YYYY-MM-DD", siempre cargada -- toda fila de historial es una etapa cerrada
  motivo_baja: string; // una de MOTIVOS_BAJA (motor.ts)
}
```

- [ ] **Step 5: Commit**

```bash
git add pb_migrations/1789220000_created_fichadas_legajo_historial.js web/src/types.ts
git commit -m "Fichadas: colección fichadas_legajo_historial para reingresos"
```

(Incluir `Co-Authored-By: Claude <noreply@anthropic.com>`.)

---

## Task 2: Motor — procesarPeriodo con múltiples ventanas por legajo

**Files:**
- Modify: `web/src/pages/fichadas/motor.ts`

**Interfaces:**
- Consumes: `HistorialLegajo` (Task 1).
- Produces: `procesarPeriodo()` acepta un nuevo parámetro opcional `historial?: HistorialLegajo[]` y evalúa una ventana por cada etapa laboral (historial + actual) en vez de una sola. Sin `historial` (u omitido), el comportamiento es idéntico al actual.

- [ ] **Step 1: Agregar el import de `HistorialLegajo`**

Buscar:

```typescript
import type { DiaHorario, FichadasFeriado, FichadasLegajo, FichadasMarca, FichadasNovedad } from '../../types';
```

Reemplazar por:

```typescript
import type { DiaHorario, FichadasFeriado, FichadasLegajo, FichadasMarca, FichadasNovedad, HistorialLegajo } from '../../types';
```

- [ ] **Step 2: Agregar el parámetro `historial` y el mapa por legajo**

Buscar:

```typescript
export function procesarPeriodo(params: {
  legajos: FichadasLegajo[];
  marcas: FichadasMarca[];
  novedades: FichadasNovedad[];
  feriados: FichadasFeriado[];
  empresaNombrePorId: Map<string, string>;
  desde: string; // YYYY-MM-DD
  hasta: string; // YYYY-MM-DD
}): { resultados: ResultadoDia[]; tarjetasSinLegajo: string[] } {
  const { legajos, marcas, novedades, feriados, empresaNombrePorId, desde, hasta } = params;
```

Reemplazar por:

```typescript
export function procesarPeriodo(params: {
  legajos: FichadasLegajo[];
  marcas: FichadasMarca[];
  novedades: FichadasNovedad[];
  feriados: FichadasFeriado[];
  historial?: HistorialLegajo[]; // etapas laborales ya cerradas de cualquier legajo (reingresos)
  empresaNombrePorId: Map<string, string>;
  desde: string; // YYYY-MM-DD
  hasta: string; // YYYY-MM-DD
}): { resultados: ResultadoDia[]; tarjetasSinLegajo: string[] } {
  const { legajos, marcas, novedades, feriados, historial = [], empresaNombrePorId, desde, hasta } = params;
  const historialPorLegajo = new Map<string, HistorialLegajo[]>();
  historial.forEach((h) => {
    if (!historialPorLegajo.has(h.legajo)) historialPorLegajo.set(h.legajo, []);
    historialPorLegajo.get(h.legajo)!.push(h);
  });
```

- [ ] **Step 3: Reemplazar la ventana única por una lista de ventanas**

Buscar:

```typescript
    // Ventana real de actividad de este legajo dentro del período pedido --
    // si tiene fecha_alta/fecha_baja cargada, no se generan resultados
    // fuera de ese rango (ex-empleado ya no cuenta después de su baja,
    // alta reciente no cuenta antes de su ingreso real). Sin esas fechas
    // cargadas, el comportamiento es igual al de siempre (todo el período).
    const ventanaDesde = legajo.fecha_alta ? Math.max(utcDesde, fechaAUtcMs(legajo.fecha_alta)) : utcDesde;
    const ventanaHasta = legajo.fecha_baja ? Math.min(utcHasta, fechaAUtcMs(legajo.fecha_baja)) : utcHasta;

    for (let cur = ventanaDesde; cur <= ventanaHasta; cur += 86400000) {
```

Reemplazar por:

```typescript
    // Lista de ventanas de actividad real de este legajo dentro del período
    // pedido -- una por cada etapa laboral ya cerrada
    // (fichadas_legajo_historial) más la etapa actual (fecha_alta/fecha_baja
    // del propio legajo). Cada ventana se recorta al período pedido y se
    // descarta si queda vacía -- así el hueco entre una baja vieja y un
    // reingreso nunca se evalúa (no genera "Sin Justificar" donde la
    // persona no trabajaba ahí), y la primera etapa de alguien que se fue y
    // volvió sigue pudiendo consultarse en períodos pasados.
    const ventanas: [number, number][] = [];
    (historialPorLegajo.get(idLegajo) || []).forEach((h) => {
      const d = h.fecha_alta ? Math.max(utcDesde, fechaAUtcMs(h.fecha_alta)) : utcDesde;
      const hh = Math.min(utcHasta, fechaAUtcMs(h.fecha_baja));
      if (d <= hh) ventanas.push([d, hh]);
    });
    {
      const d = legajo.fecha_alta ? Math.max(utcDesde, fechaAUtcMs(legajo.fecha_alta)) : utcDesde;
      const hh = legajo.fecha_baja ? Math.min(utcHasta, fechaAUtcMs(legajo.fecha_baja)) : utcHasta;
      if (d <= hh) ventanas.push([d, hh]);
    }

    for (const [ventanaDesde, ventanaHasta] of ventanas) {
    for (let cur = ventanaDesde; cur <= ventanaHasta; cur += 86400000) {
```

(La sangría del cuerpo del día-por-día que sigue no se corrige a mano — queda un nivel de menos de lo ideal, es cosmético y no afecta el comportamiento. Si querés, se puede re-indentar al final como limpieza, pero no es necesario para que funcione.)

- [ ] **Step 4: Cerrar el loop nuevo**

Buscar:

```typescript
      resultados.push({
        idLegajo, nroLegajo: legajo.nro_legajo || '', identificador: legajo.nro_tarjeta,
        nombre: legajo.nombre, dni: legajo.dni || '', area: areaNombre, deposito: depositoDelDia || '—',
        fecha, dia: nombreDia,
        paresEsperados: pares, paresReales,
        hN, hE, ausente, novedad, causa,
      });
    }
  }
```

Reemplazar por:

```typescript
      resultados.push({
        idLegajo, nroLegajo: legajo.nro_legajo || '', identificador: legajo.nro_tarjeta,
        nombre: legajo.nombre, dni: legajo.dni || '', area: areaNombre, deposito: depositoDelDia || '—',
        fecha, dia: nombreDia,
        paresEsperados: pares, paresReales,
        hN, hE, ausente, novedad, causa,
      });
    }
    }
  }
```

- [ ] **Step 5: Escribir el script de prueba**

```typescript
// Prueba standalone: procesarPeriodo con múltiples ventanas (reingresos).
// Se corre con tsx y se borra después.
import { procesarPeriodo } from './motor';
import type { FichadasLegajo, HistorialLegajo } from '../../types';

let ok = 0, fail = 0;
function check(nombre: string, cond: boolean, extra?: unknown) {
  if (cond) { ok++; console.log(`  OK   ${nombre}`); }
  else { fail++; console.log(`  FALLA ${nombre} ->`, extra); }
}

// Legajo que trabaja los 7 días (para no depender de a qué día de la
// semana cae cada fecha en esta prueba).
const legajo: FichadasLegajo = {
  id: 'l1', created: '', updated: '',
  nro_tarjeta: 'l1', nombre: 'Prueba', estado: true,
  dias_personalizados: [1, 2, 3, 4, 5, 6, 7].map((dia) => ({ dia, trabaja: true, pares: [[480, 960]] as [number, number][] })),
  fecha_alta: '2026-01-10', // etapa actual: reingresó el 10, sigue activo
};

const historial: HistorialLegajo[] = [
  { id: 'h1', created: '', updated: '', legajo: 'l1', fecha_alta: '2026-01-01', fecha_baja: '2026-01-05', motivo_baja: 'Renuncia' },
];

const { resultados } = procesarPeriodo({
  legajos: [legajo], marcas: [], novedades: [], feriados: [], historial,
  empresaNombrePorId: new Map(), desde: '2026-01-01', hasta: '2026-01-12',
});

const fechas = resultados.map((r) => r.fecha).sort();
check('etapa vieja: 5 días (01 a 05)', fechas.filter((f) => f >= '2026-01-01' && f <= '2026-01-05').length === 5, fechas);
check('hueco (06 a 09): sin resultados', fechas.filter((f) => f >= '2026-01-06' && f <= '2026-01-09').length === 0, fechas);
check('etapa actual: 3 días (10 a 12)', fechas.filter((f) => f >= '2026-01-10' && f <= '2026-01-12').length === 3, fechas);
check('total: 8 días (5 + 3, sin el hueco)', fechas.length === 8, fechas);

// Sin historial: comportamiento igual al actual (ventana única).
{
  const legajoSinHistorial: FichadasLegajo = { ...legajo, fecha_alta: '2026-01-01' };
  const { resultados: res2 } = procesarPeriodo({
    legajos: [legajoSinHistorial], marcas: [], novedades: [], feriados: [], historial: [],
    empresaNombrePorId: new Map(), desde: '2026-01-01', hasta: '2026-01-12',
  });
  check('sin historial: 12 días seguidos (ventana única de siempre)', res2.length === 12, res2.length);
}

console.log(`\n${ok} ok, ${fail} fallas`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 6: Correr la prueba y borrarla**

Run: `cd web && npx tsx src/pages/fichadas/motor.test-reingresos.ts`
Expected: `5 ok, 0 fallas` (si el conteo real difiere porque se agregó/quitó algún `check(...)`, lo que manda es que todas las que haya pasen en 0, no el número exacto).

```bash
rm web/src/pages/fichadas/motor.test-reingresos.ts
```

- [ ] **Step 7: Build**

Run: `cd web && npm run build`
Expected: build exitoso, sin errores de TypeScript. `historial` es opcional en la firma de `procesarPeriodo`, así que ninguno de sus dos llamadores (que recién se actualizan en la Tarea 4) necesita cambiar todavía para que el build pase.

- [ ] **Step 8: Commit**

```bash
git add web/src/pages/fichadas/motor.ts
git commit -m "Fichadas: procesarPeriodo evalúa múltiples ventanas por legajo (reingresos)"
```

---

## Task 3: Motor — calcularEstadisticaRotacion considera el historial

**Files:**
- Modify: `web/src/pages/fichadas/motor.ts`

**Interfaces:**
- Consumes: `HistorialLegajo` (Task 1). Independiente de la Tarea 2 (toca una función distinta del mismo archivo).
- Produces: `calcularEstadisticaRotacion()` acepta un nuevo parámetro opcional `historial?: HistorialLegajo[]`. Sin él, el comportamiento es idéntico al actual.

- [ ] **Step 1: Reescribir `calcularEstadisticaRotacion` completa**

Buscar:

```typescript
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
    return alta < fechaIso && (!legajo.fecha_baja || legajo.fecha_baja >= fechaIso);
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

Reemplazar por:

```typescript
export function calcularEstadisticaRotacion(params: {
  legajos: FichadasLegajo[];
  historial?: HistorialLegajo[]; // etapas laborales ya cerradas de cualquier legajo (reingresos)
  anio: number;
  mesesTranscurridos?: number; // 1-12, default 12 (año completo)
}): { meses: RotacionMes[]; movimientos: MovimientoRotacion[] } {
  const { legajos, historial = [], anio, mesesTranscurridos = 12 } = params;

  const historialPorLegajo = new Map<string, HistorialLegajo[]>();
  historial.forEach((h) => {
    if (!historialPorLegajo.has(h.legajo)) historialPorLegajo.set(h.legajo, []);
    historialPorLegajo.get(h.legajo)!.push(h);
  });

  // Un legajo sin fecha_alta se asume "de antes" -- siempre activo desde
  // el inicio de cualquier período que se calcule acá (nunca cuenta como
  // "ingreso", porque no se sabe cuándo entró realmente). Lo mismo aplica
  // a una fila de historial sin fecha_alta.
  function activoAl(legajo: FichadasLegajo, fechaIso: string): boolean {
    const historialDeEste = historialPorLegajo.get(legajo.id) || [];
    const activoEnAlgunaEtapaVieja = historialDeEste.some((h) => {
      const alta = h.fecha_alta || '0000-01-01';
      return alta < fechaIso && h.fecha_baja >= fechaIso;
    });
    if (activoEnAlgunaEtapaVieja) return true;
    const alta = legajo.fecha_alta || '0000-01-01';
    return alta < fechaIso && (!legajo.fecha_baja || legajo.fecha_baja >= fechaIso);
  }

  // Eventos de alta/baja a considerar: cada etapa cerrada del historial +
  // la etapa actual de cada legajo. Un reingreso aporta un ingreso Y un
  // egreso distintos (el de la etapa vieja y el de la nueva), igual que
  // en la práctica real de RRHH.
  interface Evento { legajo: FichadasLegajo; fecha: string; tipo: 'ingreso' | 'egreso'; motivo?: string }
  const eventos: Evento[] = [];
  legajos.forEach((l) => {
    (historialPorLegajo.get(l.id) || []).forEach((h) => {
      if (h.fecha_alta) eventos.push({ legajo: l, fecha: h.fecha_alta, tipo: 'ingreso' });
      eventos.push({ legajo: l, fecha: h.fecha_baja, tipo: 'egreso', motivo: h.motivo_baja });
    });
    if (l.fecha_alta) eventos.push({ legajo: l, fecha: l.fecha_alta, tipo: 'ingreso' });
    if (l.fecha_baja) eventos.push({ legajo: l, fecha: l.fecha_baja, tipo: 'egreso', motivo: l.motivo_baja });
  });

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
    const ingresosDelMes = eventos.filter((e) => e.tipo === 'ingreso' && e.fecha >= inicioMes && e.fecha <= finMes);
    const egresosDelMes = eventos.filter((e) => e.tipo === 'egreso' && e.fecha >= inicioMes && e.fecha <= finMes);

    const despidos = egresosDelMes.filter((e) => e.motivo === 'Despido').length;
    const renuncias = egresosDelMes.filter((e) => e.motivo === 'Renuncia').length;
    const acuerdos = egresosDelMes.filter((e) => e.motivo === 'Acuerdo').length;
    const jubilaciones = egresosDelMes.filter((e) => e.motivo === 'Jubilación').length;
    const totalEgresos = egresosDelMes.length;
    const ingresos = ingresosDelMes.length;
    const dotacionFinal = dotacionInicial + ingresos - totalEgresos;
    const indiceRotacion = dotacionInicial > 0 ? totalEgresos / dotacionInicial : 0;

    ingresosDelMes.forEach((e) => movimientos.push({ nombre: e.legajo.nombre, fecha: e.fecha, tipo: 'ingreso' }));
    egresosDelMes.forEach((e) => movimientos.push({ nombre: e.legajo.nombre, fecha: e.fecha, tipo: 'egreso', motivo: e.motivo }));

    meses.push({ dotacionInicial, ingresos, despidos, renuncias, acuerdos, jubilaciones, totalEgresos, dotacionFinal, indiceRotacion });
  }

  movimientos.sort((a, b) => a.fecha.localeCompare(b.fecha));
  return { meses, movimientos };
}
```

- [ ] **Step 2: Escribir el script de prueba**

```typescript
// Prueba standalone de calcularEstadisticaRotacion con historial
// (reingresos). Se corre con tsx y se borra después.
import { calcularEstadisticaRotacion } from './motor';
import type { FichadasLegajo, HistorialLegajo } from '../../types';

let ok = 0, fail = 0;
function check(nombre: string, cond: boolean, extra?: unknown) {
  if (cond) { ok++; console.log(`  OK   ${nombre}`); }
  else { fail++; console.log(`  FALLA ${nombre} ->`, extra); }
}

// Etapa vieja: alta 2026-02-01, baja 2026-04-15 (Renuncia).
// Etapa actual: reingresa 2026-08-01, sigue activo.
const legajo: FichadasLegajo = {
  id: 'l1', created: '', updated: '', nro_tarjeta: 'l1', nombre: 'Prueba', estado: true,
  fecha_alta: '2026-08-01',
};
const historial: HistorialLegajo[] = [
  { id: 'h1', created: '', updated: '', legajo: 'l1', fecha_alta: '2026-02-01', fecha_baja: '2026-04-15', motivo_baja: 'Renuncia' },
];

const { meses, movimientos } = calcularEstadisticaRotacion({ legajos: [legajo], historial, anio: 2026, mesesTranscurridos: 12 });

check('febrero: 1 ingreso (etapa vieja)', meses[1].ingresos === 1, meses[1]);
check('febrero: dotación inicial 0 (recién entra ese mismo día 1)', meses[1].dotacionInicial === 0, meses[1]);
check('abril: 1 egreso por Renuncia (etapa vieja)', meses[3].totalEgresos === 1 && meses[3].renuncias === 1, meses[3]);
check('abril: dotación inicial 1 (activo desde febrero)', meses[3].dotacionInicial === 1, meses[3]);
check('abril: dotación final 0', meses[3].dotacionFinal === 0, meses[3]);
check('junio: dotación inicial 0 (hueco entre etapas)', meses[5].dotacionInicial === 0, meses[5]);
check('agosto: 1 ingreso (etapa actual)', meses[7].ingresos === 1, meses[7]);
check('septiembre: dotación inicial 1 (activo por la etapa actual)', meses[8].dotacionInicial === 1, meses[8]);
check('movimientos: 3 en total (alta vieja + baja vieja + alta nueva)', movimientos.length === 3, movimientos);

console.log(`\n${ok} ok, ${fail} fallas`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 3: Correr la prueba y borrarla**

Run: `cd web && npx tsx src/pages/fichadas/motor.test-rotacion-historial.ts`
Expected: `9 ok, 0 fallas` (si el conteo real difiere porque se agregó/quitó algún `check(...)`, lo que manda es que todas las que haya pasen en 0, no el número exacto).

```bash
rm web/src/pages/fichadas/motor.test-rotacion-historial.ts
```

- [ ] **Step 4: Build**

Run: `cd web && npm run build`
Expected: build exitoso, sin errores de TypeScript.

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/fichadas/motor.ts
git commit -m "Fichadas: calcularEstadisticaRotacion considera el historial de reingresos"
```

---

## Task 4: Pasar el historial a procesarPeriodo/calcularEstadisticaRotacion

**Files:**
- Modify: `web/src/pages/fichadas/EstadisticasTab.tsx`
- Modify: `web/src/pages/fichadas/ResultadosTab.tsx`

**Interfaces:**
- Consumes: `historial?` en `procesarPeriodo` (Task 2) y `calcularEstadisticaRotacion` (Task 3), `HistorialLegajo` (Task 1).
- No produce nada consumido por otras tareas.

- [ ] **Step 1: `EstadisticasTab.tsx` — importar el tipo**

Buscar:

```typescript
import type { FichadasConfiguracion, FichadasEmpresa, FichadasFeriado, FichadasLegajo, FichadasMarca, FichadasNovedad } from '../../types';
```

Reemplazar por:

```typescript
import type { FichadasConfiguracion, FichadasEmpresa, FichadasFeriado, FichadasLegajo, FichadasMarca, FichadasNovedad, HistorialLegajo } from '../../types';
```

- [ ] **Step 2: `EstadisticasTab.tsx` — traer el historial y pasarlo a procesarPeriodo**

Buscar:

```typescript
      const [legajosTodos, marcas, novedades, feriados, empresas] = await Promise.all([
        // sin filtro estado: las horas pasadas de ex-empleados tienen que contarse igual
        pb.collection('fichadas_legajos').getFullList<FichadasLegajo>({ expand: 'empresa,horario' }),
        pb.collection('fichadas_marcas').getFullList<FichadasMarca>({ filter: pb.filter('fecha >= {:d} && fecha <= {:h}', { d: desde, h: hasta }) }),
        pb.collection('fichadas_novedades').getFullList<FichadasNovedad>({ filter: pb.filter('fecha >= {:d} && fecha <= {:h}', { d: desde, h: hasta }) }),
        pb.collection('fichadas_feriados').getFullList<FichadasFeriado>({ filter: pb.filter('fecha >= {:d} && fecha <= {:h}', { d: desde, h: hasta }) }),
        pb.collection('fichadas_empresas').getFullList<FichadasEmpresa>({ sort: 'nombre' }),
      ]);
      const empresaNombrePorId = new Map(empresas.map((e) => [e.id, e.nombre]));
      // ex-empleados SIN fecha_baja cargada (caso legacy): no inventar horas extra
      // fijas para todo el período, no hay forma de saber cuándo se fueron. Si
      // tienen fecha_baja, el recorte de ventana en procesarPeriodo ya corta sus
      // horas fijas justo después de esa fecha -- no hace falta pisarlas acá.
      const legajosParaCalculo = legajosTodos.map((l) => ((l.estado || l.fecha_baja) ? l : { ...l, horas_extra_fijas: null }));
      const { resultados } = procesarPeriodo({ legajos: legajosParaCalculo, marcas, novedades, feriados, empresaNombrePorId, desde, hasta });
```

Reemplazar por:

```typescript
      const [legajosTodos, marcas, novedades, feriados, empresas, historial] = await Promise.all([
        // sin filtro estado: las horas pasadas de ex-empleados tienen que contarse igual
        pb.collection('fichadas_legajos').getFullList<FichadasLegajo>({ expand: 'empresa,horario' }),
        pb.collection('fichadas_marcas').getFullList<FichadasMarca>({ filter: pb.filter('fecha >= {:d} && fecha <= {:h}', { d: desde, h: hasta }) }),
        pb.collection('fichadas_novedades').getFullList<FichadasNovedad>({ filter: pb.filter('fecha >= {:d} && fecha <= {:h}', { d: desde, h: hasta }) }),
        pb.collection('fichadas_feriados').getFullList<FichadasFeriado>({ filter: pb.filter('fecha >= {:d} && fecha <= {:h}', { d: desde, h: hasta }) }),
        pb.collection('fichadas_empresas').getFullList<FichadasEmpresa>({ sort: 'nombre' }),
        // sin filtro de fecha: son pocas filas (reingresos son raros), y hacen
        // falta etapas de cualquier año para dotación/ventanas correctas.
        pb.collection('fichadas_legajo_historial').getFullList<HistorialLegajo>(),
      ]);
      const empresaNombrePorId = new Map(empresas.map((e) => [e.id, e.nombre]));
      // ex-empleados SIN fecha_baja cargada (caso legacy): no inventar horas extra
      // fijas para todo el período, no hay forma de saber cuándo se fueron. Si
      // tienen fecha_baja, el recorte de ventana en procesarPeriodo ya corta sus
      // horas fijas justo después de esa fecha -- no hace falta pisarlas acá.
      const legajosParaCalculo = legajosTodos.map((l) => ((l.estado || l.fecha_baja) ? l : { ...l, horas_extra_fijas: null }));
      const { resultados } = procesarPeriodo({ legajos: legajosParaCalculo, marcas, novedades, feriados, historial, empresaNombrePorId, desde, hasta });
```

- [ ] **Step 3: `EstadisticasTab.tsx` — pasar el historial a calcularEstadisticaRotacion**

Buscar:

```typescript
      const { meses: mesesRot, movimientos: movRot } = calcularEstadisticaRotacion({ legajos: legajosTodos, anio, mesesTranscurridos });
```

Reemplazar por:

```typescript
      const { meses: mesesRot, movimientos: movRot } = calcularEstadisticaRotacion({ legajos: legajosTodos, historial, anio, mesesTranscurridos });
```

- [ ] **Step 4: `ResultadosTab.tsx` — importar el tipo**

Buscar:

```typescript
import type { FichadasEmpresa, FichadasFeriado, FichadasLegajo, FichadasMarca, FichadasNovedad } from '../../types';
```

Reemplazar por:

```typescript
import type { FichadasEmpresa, FichadasFeriado, FichadasLegajo, FichadasMarca, FichadasNovedad, HistorialLegajo } from '../../types';
```

- [ ] **Step 5: `ResultadosTab.tsx` — traer el historial y pasarlo a procesarPeriodo**

Buscar:

```typescript
      const [legajosTodos, marcas, novedades, feriados, empresas] = await Promise.all([
        // sin filtro estado: un ex-empleado tiene que poder consultarse en
        // períodos pasados igual que ya hacen Horas Extras/Ausentismo/Rotación
        pb.collection('fichadas_legajos').getFullList<FichadasLegajo>({ expand: 'empresa,horario' }),
        pb.collection('fichadas_marcas').getFullList<FichadasMarca>({ filter: pb.filter('fecha >= {:d} && fecha <= {:h}', { d: desde, h: hasta }) }),
        pb.collection('fichadas_novedades').getFullList<FichadasNovedad>({ filter: pb.filter('fecha >= {:d} && fecha <= {:h}', { d: desde, h: hasta }) }),
        pb.collection('fichadas_feriados').getFullList<FichadasFeriado>({ filter: pb.filter('fecha >= {:d} && fecha <= {:h}', { d: desde, h: hasta }) }),
        pb.collection('fichadas_empresas').getFullList<FichadasEmpresa>(),
      ]);
      // ex-empleados SIN fecha_baja cargada (caso legacy): no inventar horas
      // extra fijas para todo el período. Con fecha_baja, el recorte de
      // ventana en procesarPeriodo ya corta sus horas fijas justo después.
      const legajos = legajosTodos.map((l) => ((l.estado || l.fecha_baja) ? l : { ...l, horas_extra_fijas: null }));
      const empresaNombrePorId = new Map(empresas.map((e) => [e.id, e.nombre]));
      const { resultados: res, tarjetasSinLegajo } = procesarPeriodo({
        legajos, marcas, novedades, feriados, empresaNombrePorId, desde, hasta,
      });
```

Reemplazar por:

```typescript
      const [legajosTodos, marcas, novedades, feriados, empresas, historial] = await Promise.all([
        // sin filtro estado: un ex-empleado tiene que poder consultarse en
        // períodos pasados igual que ya hacen Horas Extras/Ausentismo/Rotación
        pb.collection('fichadas_legajos').getFullList<FichadasLegajo>({ expand: 'empresa,horario' }),
        pb.collection('fichadas_marcas').getFullList<FichadasMarca>({ filter: pb.filter('fecha >= {:d} && fecha <= {:h}', { d: desde, h: hasta }) }),
        pb.collection('fichadas_novedades').getFullList<FichadasNovedad>({ filter: pb.filter('fecha >= {:d} && fecha <= {:h}', { d: desde, h: hasta }) }),
        pb.collection('fichadas_feriados').getFullList<FichadasFeriado>({ filter: pb.filter('fecha >= {:d} && fecha <= {:h}', { d: desde, h: hasta }) }),
        pb.collection('fichadas_empresas').getFullList<FichadasEmpresa>(),
        // sin filtro de fecha: son pocas filas (reingresos son raros), y hacen
        // falta etapas de cualquier año para ventanas correctas.
        pb.collection('fichadas_legajo_historial').getFullList<HistorialLegajo>(),
      ]);
      // ex-empleados SIN fecha_baja cargada (caso legacy): no inventar horas
      // extra fijas para todo el período. Con fecha_baja, el recorte de
      // ventana en procesarPeriodo ya corta sus horas fijas justo después.
      const legajos = legajosTodos.map((l) => ((l.estado || l.fecha_baja) ? l : { ...l, horas_extra_fijas: null }));
      const empresaNombrePorId = new Map(empresas.map((e) => [e.id, e.nombre]));
      const { resultados: res, tarjetasSinLegajo } = procesarPeriodo({
        legajos, marcas, novedades, feriados, historial, empresaNombrePorId, desde, hasta,
      });
```

- [ ] **Step 6: Build**

Run: `cd web && npm run build`
Expected: build exitoso, sin errores de TypeScript.

- [ ] **Step 7: Commit**

```bash
git add web/src/pages/fichadas/EstadisticasTab.tsx web/src/pages/fichadas/ResultadosTab.tsx
git commit -m "Fichadas: Estadísticas y Resultados pasan el historial de reingresos al motor"
```

---

## Task 5: Configuración — "Reactivar" pide fecha de alta y guarda el historial

**Files:**
- Modify: `web/src/pages/fichadas/ConfiguracionTab.tsx`

**Interfaces:**
- Consumes: colección `fichadas_legajo_historial` (Task 1).
- No produce nada consumido por otras tareas.

- [ ] **Step 1: Agregar el estado nuevo**

Buscar:

```typescript
  const [fechaAlta, setFechaAlta] = useState('');
  const [idEnBaja, setIdEnBaja] = useState<string | null>(null);
  const [fechaBaja, setFechaBaja] = useState('');
  const [motivoBaja, setMotivoBaja] = useState('');
```

Reemplazar por:

```typescript
  const [fechaAlta, setFechaAlta] = useState('');
  const [idEnBaja, setIdEnBaja] = useState<string | null>(null);
  const [fechaBaja, setFechaBaja] = useState('');
  const [motivoBaja, setMotivoBaja] = useState('');
  const [idEnReingreso, setIdEnReingreso] = useState<string | null>(null);
  const [fechaAltaNueva, setFechaAltaNueva] = useState('');
```

- [ ] **Step 2: Reemplazar `reactivar` por el flujo de reingreso**

Buscar:

```typescript
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
```

Reemplazar por:

```typescript
  function abrirReingreso(id: string) {
    setIdEnReingreso(id);
    setFechaAltaNueva('');
  }

  async function confirmarReingreso() {
    if (!idEnReingreso) return;
    if (!fechaAltaNueva) { toast('Completá la fecha de alta del reingreso.', 'warn'); return; }
    const legajo = legajos.find((l) => l.id === idEnReingreso);
    if (!legajo) return;
    try {
      // guarda la etapa que se cierra (fecha_alta/fecha_baja/motivo_baja
      // actuales) antes de pisarlos con los datos del reingreso -- si no,
      // se pierde el egreso viejo del historial de Rotación.
      await pb.collection('fichadas_legajo_historial').create({
        legajo: idEnReingreso,
        fecha_alta: legajo.fecha_alta || null,
        fecha_baja: legajo.fecha_baja,
        motivo_baja: legajo.motivo_baja,
      });
      await pb.collection('fichadas_legajos').update(idEnReingreso, {
        fecha_alta: fechaAltaNueva, fecha_baja: null, motivo_baja: null, estado: true,
      });
      setIdEnReingreso(null);
      onChanged();
      toast('Reingreso registrado.', 'ok');
    } catch (e) {
      toast('Error: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }
```

- [ ] **Step 3: Agregar `legajoEnReingreso`**

Buscar:

```typescript
  const legajoEnBaja = legajos.find((l) => l.id === idEnBaja);

  return (
```

Reemplazar por:

```typescript
  const legajoEnBaja = legajos.find((l) => l.id === idEnBaja);
  const legajoEnReingreso = legajos.find((l) => l.id === idEnReingreso);

  return (
```

- [ ] **Step 4: Agregar el mini-formulario de reingreso en la pantalla**

Buscar:

```tsx
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
```

Reemplazar por:

```tsx
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

      {legajoEnReingreso && (
        <>
          <h3 style={{ fontSize: 13, color: 'var(--navy)', margin: '18px 0 8px' }}>Reincorporar a "{legajoEnReingreso.nombre}"</h3>
          <div className="hint">Se guarda la etapa anterior (con su fecha de baja y motivo) en el historial de esa persona, y arranca una nueva con la fecha que pongas acá.</div>
          <div className="row" style={{ marginTop: 6 }}>
            <div className="field"><label>Fecha de alta (nueva)</label><input type="date" value={fechaAltaNueva} onChange={(e) => setFechaAltaNueva(e.target.value)} /></div>
            <button onClick={confirmarReingreso}>Confirmar reingreso</button>
            <button className="secondary" onClick={() => setIdEnReingreso(null)}>Cancelar</button>
          </div>
        </>
      )}
```

- [ ] **Step 5: Cambiar el botón "Reactivar" para abrir el formulario**

Buscar:

```tsx
                <td>
                  {l.estado
                    ? <button className="small secondary" onClick={() => abrirBaja(l.id)}>Dar de baja</button>
                    : (
                      <span title={l.fecha_baja ? `${l.motivo_baja || ''} — ${l.fecha_baja}` : ''}>
                        Inactivo <button className="small secondary" onClick={() => reactivar(l.id)}>Reactivar</button>
                      </span>
                    )}
                </td>
```

Reemplazar por:

```tsx
                <td>
                  {l.estado
                    ? <button className="small secondary" onClick={() => abrirBaja(l.id)}>Dar de baja</button>
                    : (
                      <span title={l.fecha_baja ? `${l.motivo_baja || ''} — ${l.fecha_baja}` : ''}>
                        Inactivo <button className="small secondary" onClick={() => abrirReingreso(l.id)}>Reactivar</button>
                      </span>
                    )}
                </td>
```

- [ ] **Step 6: Build**

Run: `cd web && npm run build`
Expected: build exitoso, sin errores de TypeScript.

- [ ] **Step 7: Commit**

```bash
git add web/src/pages/fichadas/ConfiguracionTab.tsx
git commit -m "Fichadas: Reactivar pide fecha de alta nueva y guarda el historial del reingreso"
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

Entrar a Fichadas → Configuración → Empleados, dar de baja a un legajo de prueba, después tocar "Reactivar" y confirmar que ahora pide una fecha de alta nueva (no reactiva con un solo clic). Confirmar el reingreso y verificar en Estadísticas → Rotación que aparecen dos movimientos (la baja vieja y el alta nueva) en el listado del año. Deshacer la prueba si corresponde (volver a dar de baja y reactivar con los datos reales, o avisar que quedó un registro de prueba para borrar a mano).
