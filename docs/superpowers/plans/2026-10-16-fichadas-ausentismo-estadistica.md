# Fichadas: Ausentismo - Estadística Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar una tabla de Ausentismo por causa (Enfermedad, Accidente, etc. + "Sin Justificar") a la pestaña Estadísticas de Fichadas, con el mismo formato mensual/anual + % que ya tiene Horas Extras, reemplazando el Excel que arma RRHH a mano.

**Architecture:** Un campo `causa` nuevo en `fichadas_novedades` (select, opcional, al lado del texto libre que ya existe), un campo `causa` expuesto en `ResultadoDia` (computado en `procesarPeriodo()`, reusando la lógica de `ausente`/novedad que ya existe), una función de agregación nueva en `motor.ts` (hermana de `calcularEstadisticaHorasExtras`, misma forma), un selector nuevo en el formulario de "Asignar novedad", y un selector Horas Extras/Ausentismo en la pantalla de Estadísticas que ya existe.

**Tech Stack:** React + TypeScript (Vite), PocketBase (migraciones), `tsx` para probar la agregación.

## Global Constraints

- La lista de causas es fija: Enfermedad, Accidente, COVID-19, Examen, Permiso Gremial, Capacitación, Casamiento, Nacimiento, Fallecimiento de Familiar, Donación de Sangre, Mudanza, Fam. Enfermo, Razones Particulares, Maternidad, Cuarentena, PARO, Suspendido (17 causas) — sin agregar ni sacar ninguna.
- El campo de texto libre que ya existe en "Asignar novedad" (`texto`) se mantiene tal cual — la causa es un campo nuevo, no lo reemplaza. Las novedades viejas quedan sin causa, sin romper nada.
- Un día `ausente` (sin ninguna justificación cargada, ya calculado por el motor) cuenta como causa **"Sin Justificar"**.
- Un día con novedad pero **sin** causa elegida no entra en ninguna causa (ni en "Sin Justificar": está justificado, solo falta clasificarlo).
- Los feriados quedan completamente afuera de esta estadística.
- Las horas ausentes de un día = las horas que esa persona tenía programado trabajar ese día (de `paresEsperados`), no horas fichadas.
- La dotación usada para el % es el total de la empresa (todas las áreas sumadas) — una causa no tiene dotación propia.
- Mismas reglas ya vigentes en Horas Extras: no se inventan ausencias de meses futuros, las de ex-empleados en meses pasados sí cuentan.

---

## Task 1: Migración — campo `causa` en `fichadas_novedades`

**Files:**
- Create: `pb_migrations/1789160000_fichadas_novedades_causa.js`

**Interfaces:**
- Produces: campo `causa` (select, opcional, 17 valores) en `fichadas_novedades`.

- [ ] **Step 1: Escribir la migración**

```javascript
/// <reference path="../pb_data/types.d.ts" />
// Ausentismo por causa: se agrega "causa" (lista fija, igual a la que ya
// usaba el Excel de RRHH) al lado del texto libre que ya existe en
// fichadas_novedades -- opcional, las novedades viejas quedan sin causa
// sin romper nada. Ver
// docs/superpowers/specs/2026-10-16-fichadas-ausentismo-estadistica-design.md.
migrate((db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId('fichadas_novedades');
  collection.schema.addField(new SchemaField({
    system: false, id: 'fcn0causa0001', name: 'causa', type: 'select',
    required: false, presentable: true, unique: false,
    options: {
      maxSelect: 1,
      values: [
        'Enfermedad', 'Accidente', 'COVID-19', 'Examen', 'Permiso Gremial', 'Capacitación',
        'Casamiento', 'Nacimiento', 'Fallecimiento de Familiar', 'Donación de Sangre', 'Mudanza',
        'Fam. Enfermo', 'Razones Particulares', 'Maternidad', 'Cuarentena', 'PARO', 'Suspendido',
      ],
    },
  }));
  return dao.saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId('fichadas_novedades');
  collection.schema.removeField('fcn0causa0001');
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

Expected: `Applied 1789160000_fichadas_novedades_causa.js` sin errores.

- [ ] **Step 3: Verificar el campo quedó bien definido**

```bash
python3 -c "
import sqlite3, json
con = sqlite3.connect('data/data.db')
row = con.execute(\"SELECT schema FROM _collections WHERE name='fichadas_novedades'\").fetchone()
data = json.loads(row[0])
campo = [f for f in data if f['name']=='causa'][0]
print('required:', campo['required'], 'valores:', len(campo['options']['values']))
assert campo['required'] is False
assert len(campo['options']['values']) == 17
"
```

Expected: imprime `required: False valores: 17`, sin error en los asserts.

- [ ] **Step 4: Commit**

```bash
git add pb_migrations/1789160000_fichadas_novedades_causa.js
git commit -m "Fichadas: campo causa en novedades (Ausentismo por causa)"
```

(Incluir `Co-Authored-By: Claude <noreply@anthropic.com>`.)

---

## Task 2: Motor — causa por día y función de agregación

**Files:**
- Modify: `web/src/types.ts`
- Modify: `web/src/pages/fichadas/motor.ts`

**Interfaces:**
- Consumes: campo `causa` de Task 1.
- Produces: `ResultadoDia.causa`, `CAUSAS_AUSENTISMO`, `CAUSA_SIN_JUSTIFICAR`, `calcularEstadisticaAusentismo()`.

- [ ] **Step 1: Agregar el campo en `web/src/types.ts`**

Buscar:

```typescript
export interface FichadasNovedad extends BaseRecord {
  legajo: string;
  fecha: string;
  texto: string;
}
```

Reemplazar por:

```typescript
export interface FichadasNovedad extends BaseRecord {
  legajo: string;
  fecha: string;
  texto: string;
  causa?: string;
}
```

- [ ] **Step 2: Modificar `web/src/pages/fichadas/motor.ts`**

Buscar:

```typescript
export interface ResultadoDia {
  idLegajo: string;
  nroLegajo: string;
  identificador: string; // nro_tarjeta
  nombre: string;
  dni: string;
  area: string;
  deposito: string;
  fecha: string;
  dia: string;
  paresEsperados: [number, number][];
  paresReales: [number | null, number | null][];
  hN: number;
  hE: number;
  ausente: boolean;
  novedad: string;
}
```

Reemplazar por:

```typescript
export interface ResultadoDia {
  idLegajo: string;
  nroLegajo: string;
  identificador: string; // nro_tarjeta
  nombre: string;
  dni: string;
  area: string;
  deposito: string;
  fecha: string;
  dia: string;
  paresEsperados: [number, number][];
  paresReales: [number | null, number | null][];
  hN: number;
  hE: number;
  ausente: boolean;
  novedad: string;
  causa: string; // '' (no es ausencia), 'Sin Justificar', o una de CAUSAS_AUSENTISMO
}

// Lista fija, igual a la que ya usaba el Excel de RRHH -- no agregar ni
// sacar ninguna sin actualizar también la migración del campo `causa`.
export const CAUSAS_AUSENTISMO: string[] = [
  'Enfermedad', 'Accidente', 'COVID-19', 'Examen', 'Permiso Gremial', 'Capacitación',
  'Casamiento', 'Nacimiento', 'Fallecimiento de Familiar', 'Donación de Sangre', 'Mudanza',
  'Fam. Enfermo', 'Razones Particulares', 'Maternidad', 'Cuarentena', 'PARO', 'Suspendido',
];
export const CAUSA_SIN_JUSTIFICAR = 'Sin Justificar';
```

Buscar:

```typescript
  const novedadPorLegajoFecha = new Map<string, string>();
  novedades.forEach((n) => novedadPorLegajoFecha.set(n.legajo + '|' + n.fecha, n.texto));
  const feriadoPorFecha = new Map<string, string>();
  feriados.forEach((f) => feriadoPorFecha.set(f.fecha, f.nombre || 'Feriado'));

  function novedadManual(idLegajo: string, fecha: string): string {
    const m = novedadPorLegajoFecha.get(idLegajo + '|' + fecha);
    if (m) return m;
    const f = feriadoPorFecha.get(fecha);
    if (f) return 'FERIADO — ' + f;
    return '';
  }
```

Reemplazar por:

```typescript
  const novedadPorLegajoFecha = new Map<string, { texto: string; causa: string }>();
  novedades.forEach((n) => novedadPorLegajoFecha.set(n.legajo + '|' + n.fecha, { texto: n.texto, causa: n.causa || '' }));
  const feriadoPorFecha = new Map<string, string>();
  feriados.forEach((f) => feriadoPorFecha.set(f.fecha, f.nombre || 'Feriado'));

  function novedadManual(idLegajo: string, fecha: string): string {
    const m = novedadPorLegajoFecha.get(idLegajo + '|' + fecha);
    if (m) return m.texto;
    const f = feriadoPorFecha.get(fecha);
    if (f) return 'FERIADO — ' + f;
    return '';
  }
```

Buscar:

```typescript
      const sinNingunaMarca = paresReales.every((p) => p[0] === null && p[1] === null);
      const ausente = trabaja && sinNingunaMarca && !novedad;

      resultados.push({
        idLegajo, nroLegajo: legajo.nro_legajo || '', identificador: legajo.nro_tarjeta,
        nombre: legajo.nombre, dni: legajo.dni || '', area: areaNombre, deposito: depositoDelDia || '—',
        fecha, dia: nombreDia,
        paresEsperados: pares, paresReales,
        hN, hE, ausente, novedad,
      });
```

Reemplazar por:

```typescript
      const sinNingunaMarca = paresReales.every((p) => p[0] === null && p[1] === null);
      const ausente = trabaja && sinNingunaMarca && !novedad;
      // Feriados nunca llegan acá con causa (no están en novedadPorLegajoFecha,
      // solo en feriadoPorFecha) -- quedan afuera de Ausentismo naturalmente.
      const causaNovedad = novedadPorLegajoFecha.get(idLegajo + '|' + fecha)?.causa || '';
      const causa = ausente ? CAUSA_SIN_JUSTIFICAR : causaNovedad;

      resultados.push({
        idLegajo, nroLegajo: legajo.nro_legajo || '', identificador: legajo.nro_tarjeta,
        nombre: legajo.nombre, dni: legajo.dni || '', area: areaNombre, deposito: depositoDelDia || '—',
        fecha, dia: nombreDia,
        paresEsperados: pares, paresReales,
        hN, hE, ausente, novedad, causa,
      });
```

- [ ] **Step 3: Agregar la función de agregación al final de `motor.ts`**

```typescript
// ---------- Estadística de Ausentismo (agrupado por causa y mes) ----------

export interface EstadisticaCausaMes {
  horas: number;
  porcentaje: number; // horas / (dotacionTotal * horasPosiblesMensuales)
}

export interface FilaEstadisticaCausa {
  causa: string;
  meses: EstadisticaCausaMes[]; // 12 posiciones, índice 0=enero .. 11=diciembre
  promedioHoras: number;
  totalHoras: number;
}

function horasEsperadasDelDia(r: ResultadoDia): number {
  const minutos = r.paresEsperados.reduce((acc, [e, s]) => acc + (s >= e ? s - e : s + 1440 - e), 0);
  return minutos / 60;
}

export function calcularEstadisticaAusentismo(params: {
  resultados: ResultadoDia[];
  dotacionTotal: number;
  horasPosiblesMensuales: number;
  mesesTranscurridos?: number;
}): { filas: FilaEstadisticaCausa[]; total: FilaEstadisticaCausa } {
  const { resultados, dotacionTotal, horasPosiblesMensuales, mesesTranscurridos = 12 } = params;
  const causas = [...CAUSAS_AUSENTISMO, CAUSA_SIN_JUSTIFICAR];

  const horasPorCausaMes = new Map<string, number[]>();
  causas.forEach((c) => horasPorCausaMes.set(c, new Array(12).fill(0)));

  resultados.forEach((r) => {
    if (!r.causa || !horasPorCausaMes.has(r.causa)) return;
    const mesIndex = Number(r.fecha.slice(5, 7)) - 1;
    if (mesIndex < 0 || mesIndex > 11) return;
    horasPorCausaMes.get(r.causa)![mesIndex] += horasEsperadasDelDia(r);
  });

  function calcularFila(causa: string, horasPorMes: number[]): FilaEstadisticaCausa {
    const meses: EstadisticaCausaMes[] = horasPorMes.map((horas) => {
      const porcentaje = dotacionTotal > 0 ? horas / (dotacionTotal * horasPosiblesMensuales) : 0;
      return { horas, porcentaje };
    });
    const totalHoras = meses.reduce((a, m) => a + m.horas, 0);
    const promedioHoras = totalHoras / mesesTranscurridos;
    return { causa, meses, promedioHoras, totalHoras };
  }

  const filas = causas.map((c) => calcularFila(c, horasPorCausaMes.get(c)!));

  const horasPorMesTotal = new Array(12).fill(0);
  causas.forEach((c) => {
    horasPorCausaMes.get(c)!.forEach((h, i) => { horasPorMesTotal[i] += h; });
  });
  const total = calcularFila('TOTAL', horasPorMesTotal);

  return { filas, total };
}
```

- [ ] **Step 4: Escribir el script de prueba**

```typescript
// Prueba standalone de causa-por-día y calcularEstadisticaAusentismo.
// Se corre con tsx y se borra después.
import { procesarPeriodo, calcularEstadisticaAusentismo, CAUSA_SIN_JUSTIFICAR } from './motor';
import type { FichadasLegajo, FichadasNovedad, FichadasFeriado } from '../../types';

let ok = 0, fail = 0;
function check(nombre: string, cond: boolean, extra?: unknown) {
  if (cond) { ok++; console.log(`  OK   ${nombre}`); }
  else { fail++; console.log(`  FALLA ${nombre} ->`, extra); }
}

// Legajo que trabaja lunes a viernes, 08:00-16:00 (8h/día).
const legajo: FichadasLegajo = {
  id: 'leg1', created: '', updated: '',
  nro_tarjeta: '1', nombre: 'Prueba', estado: true,
  dias_personalizados: [1, 2, 3, 4, 5].map((dia) => ({ dia, trabaja: true, pares: [[480, 960]] as [number, number][] })),
};

// Lunes 2026-01-05: ausente sin ninguna justificación.
// Martes 2026-01-06: novedad con causa "Enfermedad".
// Miércoles 2026-01-07: novedad SIN causa (solo texto libre).
// Jueves 2026-01-08: feriado (no debería contar para ninguna causa).
const novedades: FichadasNovedad[] = [
  { id: 'n1', created: '', updated: '', legajo: 'leg1', fecha: '2026-01-06', texto: 'gripe', causa: 'Enfermedad' },
  { id: 'n2', created: '', updated: '', legajo: 'leg1', fecha: '2026-01-07', texto: 'motivo sin clasificar' },
];
const feriados: FichadasFeriado[] = [
  { id: 'f1', created: '', updated: '', fecha: '2026-01-08', nombre: 'Feriado de prueba' },
];

const { resultados } = procesarPeriodo({
  legajos: [legajo], marcas: [], novedades, feriados,
  empresaNombrePorId: new Map(), desde: '2026-01-05', hasta: '2026-01-08',
});

const lunes = resultados.find((r) => r.fecha === '2026-01-05');
const martes = resultados.find((r) => r.fecha === '2026-01-06');
const miercoles = resultados.find((r) => r.fecha === '2026-01-07');
const jueves = resultados.find((r) => r.fecha === '2026-01-08');

check('lunes: ausente sin novedad -> causa Sin Justificar', lunes?.causa === CAUSA_SIN_JUSTIFICAR, lunes);
check('martes: novedad con causa Enfermedad -> causa Enfermedad', martes?.causa === 'Enfermedad', martes);
check('miércoles: novedad sin causa -> causa vacía (no entra a ninguna)', miercoles?.causa === '', miercoles);
// Jueves es un día normal de trabajo para este legajo (trabaja=true lunes a
// viernes), así que el motor SÍ genera una fila ese día aunque sea feriado
// -- lo que importa es que NO tenga causa (no cuenta para ninguna causa de
// Ausentismo), no que la fila no exista.
check('jueves: feriado -> sí genera fila (día normal de trabajo)', jueves !== undefined, jueves);
check('jueves: feriado -> causa vacía (no cuenta como ausencia de nadie)', jueves?.causa === '', jueves);
check('jueves: feriado -> ausente = false (no es una ausencia sin justificar)', jueves?.ausente === false, jueves);

const { filas, total } = calcularEstadisticaAusentismo({
  resultados, dotacionTotal: 1, horasPosiblesMensuales: 192,
});
const filaEnfermedad = filas.find((f) => f.causa === 'Enfermedad')!;
const filaSinJustificar = filas.find((f) => f.causa === CAUSA_SIN_JUSTIFICAR)!;

check('Enfermedad enero: 8 horas (martes completo)', filaEnfermedad.meses[0].horas === 8, filaEnfermedad.meses[0]);
check('Sin Justificar enero: 8 horas (lunes completo)', filaSinJustificar.meses[0].horas === 8, filaSinJustificar.meses[0]);
check('Enfermedad enero: % = 8/(1*192)', Math.abs(filaEnfermedad.meses[0].porcentaje - 8 / 192) < 1e-9, filaEnfermedad.meses[0]);
check('TOTAL enero: 16 horas (8 Enfermedad + 8 Sin Justificar, miércoles no clasificado no suma a nada)', total.meses[0].horas === 16, total.meses[0]);

console.log(`\n${ok} ok, ${fail} fallas`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 5: Correr la prueba y borrarla**

Run: `cd web && npx tsx src/pages/fichadas/motor.test-ausentismo.ts`
Expected: `10 ok, 0 fallas` (si el conteo real difiere porque se agregó/quitó algún `check(...)` al escribir el archivo, lo que manda es que todas las que haya pasen en 0, no el número exacto).

```bash
rm web/src/pages/fichadas/motor.test-ausentismo.ts
```

- [ ] **Step 6: Build**

Run: `cd web && npm run build`
Expected: build exitoso, sin errores de TypeScript.

- [ ] **Step 7: Commit**

```bash
git add web/src/types.ts web/src/pages/fichadas/motor.ts
git commit -m "Fichadas: causa por día y agregación de Ausentismo"
```

---

## Task 3: Pantalla de carga — selector de Causa en "Asignar novedad"

**Files:**
- Modify: `web/src/pages/fichadas/CargaTab.tsx`

**Interfaces:**
- Consumes: `causa` (Task 1), `CAUSAS_AUSENTISMO` (Task 2).
- Produces: el formulario de "Asignar novedad" manda `causa` (opcional) además de `texto`.

- [ ] **Step 1: Importar la constante**

Buscar:

```typescript
import { parsearTxtReloj, type MarcaParseada } from './motor';
```

Reemplazar por:

```typescript
import { parsearTxtReloj, CAUSAS_AUSENTISMO, type MarcaParseada } from './motor';
```

- [ ] **Step 2: Agregar el estado**

Buscar:

```typescript
  const [novTexto, setNovTexto] = useState('');
  const [aplicandoNovedad, setAplicandoNovedad] = useState(false);
```

Reemplazar por:

```typescript
  const [novTexto, setNovTexto] = useState('');
  const [novCausa, setNovCausa] = useState('');
  const [aplicandoNovedad, setAplicandoNovedad] = useState(false);
```

- [ ] **Step 3: Mandar la causa al crear/actualizar**

Buscar:

```typescript
          if (existente) {
            await pb.collection('fichadas_novedades').update(existente.id, { texto: novTexto.trim() });
          } else {
            await pb.collection('fichadas_novedades').create({ legajo: idLegajo, fecha, texto: novTexto.trim() });
          }
```

Reemplazar por:

```typescript
          if (existente) {
            await pb.collection('fichadas_novedades').update(existente.id, { texto: novTexto.trim(), causa: novCausa || null });
          } else {
            await pb.collection('fichadas_novedades').create({ legajo: idLegajo, fecha, texto: novTexto.trim(), causa: novCausa || null });
          }
```

- [ ] **Step 4: Agregar el selector en el formulario**

Buscar:

```tsx
        <div className="row" style={{ marginTop: 10 }}>
          <div className="field" style={{ flex: 2 }}><label>Motivo</label><input value={novTexto} onChange={(e) => setNovTexto(e.target.value)} placeholder="Ej: vacaciones" /></div>
          <button disabled={aplicandoNovedad} onClick={aplicarNovedad}>{aplicandoNovedad ? 'Aplicando…' : 'Aplicar'}</button>
        </div>
```

Reemplazar por:

```tsx
        <div className="row" style={{ marginTop: 10 }}>
          <div className="field">
            <label>Causa (para Ausentismo)</label>
            <select value={novCausa} onChange={(e) => setNovCausa(e.target.value)}>
              <option value="">Sin especificar</option>
              {CAUSAS_AUSENTISMO.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="field" style={{ flex: 2 }}><label>Motivo</label><input value={novTexto} onChange={(e) => setNovTexto(e.target.value)} placeholder="Ej: vacaciones" /></div>
          <button disabled={aplicandoNovedad} onClick={aplicarNovedad}>{aplicandoNovedad ? 'Aplicando…' : 'Aplicar'}</button>
        </div>
```

- [ ] **Step 5: Limpiar la causa después de aplicar**

Buscar:

```typescript
      toast('Novedad aplicada.', 'ok');
      setNovTexto('');
```

Reemplazar por:

```typescript
      toast('Novedad aplicada.', 'ok');
      setNovTexto('');
      setNovCausa('');
```

- [ ] **Step 6: Build**

Run: `cd web && npm run build`
Expected: build exitoso, sin errores de TypeScript.

- [ ] **Step 7: Commit**

```bash
git add web/src/pages/fichadas/CargaTab.tsx
git commit -m "Fichadas: selector de causa al asignar una novedad"
```

---

## Task 4: Pantalla de Estadísticas — selector Horas Extras / Ausentismo

**Files:**
- Modify: `web/src/pages/fichadas/EstadisticasTab.tsx`

**Interfaces:**
- Consumes: `calcularEstadisticaAusentismo()`, `CAUSA_SIN_JUSTIFICAR` (Task 2).
- Produces: un selector arriba de la tabla que cambia entre la vista de Horas Extras (ya existente) y la vista nueva de Ausentismo, compartiendo año y horas posibles.

- [ ] **Step 1: Reescribir `web/src/pages/fichadas/EstadisticasTab.tsx` completo**

```tsx
import { Fragment, useEffect, useState } from 'react';
import { pb } from '../../lib/pb';
import { useToast } from '../../lib/ToastContext';
import { isoDate } from '../../lib/format';
import {
  procesarPeriodo, calcularEstadisticaHorasExtras, calcularEstadisticaAusentismo,
  type FilaEstadisticaArea, type FilaEstadisticaCausa,
} from './motor';
import type { FichadasConfiguracion, FichadasEmpresa, FichadasFeriado, FichadasLegajo, FichadasMarca, FichadasNovedad } from '../../types';

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
type Vista = 'horas_extras' | 'ausentismo';

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
        pb.collection('fichadas_legajos').getFullList<FichadasLegajo>({ expand: 'empresa,horario' }),
        pb.collection('fichadas_marcas').getFullList<FichadasMarca>({ filter: pb.filter('fecha >= {:d} && fecha <= {:h}', { d: desde, h: hasta }) }),
        pb.collection('fichadas_novedades').getFullList<FichadasNovedad>({ filter: pb.filter('fecha >= {:d} && fecha <= {:h}', { d: desde, h: hasta }) }),
        pb.collection('fichadas_feriados').getFullList<FichadasFeriado>({ filter: pb.filter('fecha >= {:d} && fecha <= {:h}', { d: desde, h: hasta }) }),
        pb.collection('fichadas_empresas').getFullList<FichadasEmpresa>({ sort: 'nombre' }),
      ]);
      const empresaNombrePorId = new Map(empresas.map((e) => [e.id, e.nombre]));
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

      const { filas: fAus, total: tAus } = calcularEstadisticaAusentismo({
        resultados, dotacionTotal, horasPosiblesMensuales: n, mesesTranscurridos,
      });
      setFilasAusentismo(fAus);
      setTotalAusentismo(tAus);
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

  const hayDatos = vista === 'horas_extras' ? (filasHorasExtras && totalHorasExtras) : (filasAusentismo && totalAusentismo);

  return (
    <div className="card">
      <h2>Estadísticas</h2>
      <div className="hint">Resumen anual por área/causa — reemplaza las planillas que arma RRHH a mano.</div>

      <div className="row" style={{ marginTop: 14, flexWrap: 'wrap', alignItems: 'end' }}>
        <div className="field">
          <label>Ver</label>
          <select value={vista} onChange={(e) => setVista(e.target.value as Vista)}>
            <option value="horas_extras">Horas Extras</option>
            <option value="ausentismo">Ausentismo</option>
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

      {hayDatos && (
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
git commit -m "Fichadas: selector Horas Extras / Ausentismo en Estadísticas"
```

---

## Task 5: Desplegar y verificar

**Files:** (ninguno nuevo — solo push y verificación)

- [ ] **Step 1: Push**

```bash
git push origin claude/cyv-driver-renditions-form-h4l5fu
```

- [ ] **Step 2: Esperar el deploy y confirmar**

Sondear `https://api.github.com/repos/sistemascyv/Desarrollos/actions/runs?branch=claude/cyv-driver-renditions-form-h4l5fu&per_page=1` hasta `status: completed` (o confirmar directamente que el hash del bundle JS cambió en `https://app.carossiovairolatti.com.ar/`).

- [ ] **Step 3: Verificación final en producción**

Entrar a Fichadas → Carga y novedades, confirmar que aparece el selector de Causa al asignar una novedad. Entrar a Estadísticas, cambiar el selector a "Ausentismo", elegir el año actual, Calcular, y confirmar que la tabla se arma con las 17 causas + "Sin Justificar" + TOTAL, sin errores.
