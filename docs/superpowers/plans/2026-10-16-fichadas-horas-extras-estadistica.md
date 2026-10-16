# Fichadas: Horas Extras - Estadística Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar una pestaña "Estadísticas" a Fichadas que arme, para un año elegido, el mismo resumen mensual/anual por área que hoy RRHH arma a mano en Excel (Dotación, Horas Extra, % del total mensual, % sobre horas posibles, horas por persona).

**Architecture:** Una función de agregación nueva en `motor.ts` (reutiliza `procesarPeriodo()`, no duplica lógica de cálculo), una colección chica de un solo registro para el valor configurable de "horas posibles mensuales", y una pestaña nueva en `FichadasPage.tsx` con el mismo patrón de carga de datos que ya usa `ResultadosTab.tsx` pero para un año completo en vez de un rango corto.

**Tech Stack:** React + TypeScript (Vite), PocketBase (migraciones), `tsx` para probar la función de agregación como script standalone.

## Global Constraints

- Se agrupa por las áreas que ya existen en `fichadas_empresas` — no se arma una clasificación paralela.
- "Horas posibles mensuales" es un único valor configurable (no una tabla de 12 valores).
- La dotación usa el conteo de legajos activos **actual** por área — igual para los 12 meses del año que se esté mirando (no es dotación histórica; eso queda para el proyecto de Rotación).
- No hay exportación a Excel en esta primera versión.
- No se migra el histórico del Excel viejo (años 2019-2024) — solo se calcula a partir de lo que ya está cargado en el sistema.

---

## Task 1: Migración — colección `fichadas_configuracion`

**Files:**
- Create: `pb_migrations/1789150000_created_fichadas_configuracion.js`

**Interfaces:**
- Produces: colección `fichadas_configuracion` con exactamente un registro, campo `horas_posibles_mensuales` (number, valor inicial 192).

- [ ] **Step 1: Escribir la migración**

```javascript
/// <reference path="../pb_data/types.d.ts" />
// Fichadas: "horas posibles mensuales" -- el denominador para calcular el
// % de horas extra sobre el total posible (ej: HS extra / (dotación ×
// horas posibles)). Un único valor configurable, no una tabla por mes.
// Esta colección tiene exactamente UN registro -- se crea acá con el
// valor inicial y después solo se edita (nunca se crea uno nuevo ni se
// borra), por eso createRule/deleteRule quedan en null.
migrate((db) => {
  const dao = new Dao(db);
  const collection = new Collection({
    "id": "fchdconfig0001",
    "name": "fichadas_configuracion",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false, "id": "fcf0horasposi1", "name": "horas_posibles_mensuales", "type": "number",
        "required": true, "presentable": true, "unique": false,
        "options": { "min": 1, "max": null, "noDecimal": false },
      },
    ],
    "indexes": [],
    "listRule": "@request.auth.id != \"\" && (@request.auth.rol = \"admin\" || @request.auth.modulos ~ \"fichadas\")",
    "viewRule": "@request.auth.id != \"\" && (@request.auth.rol = \"admin\" || @request.auth.modulos ~ \"fichadas\")",
    "createRule": null,
    "updateRule": "@request.auth.id != \"\" && (@request.auth.rol = \"admin\" || @request.auth.modulos ~ \"fichadas\")",
    "deleteRule": null,
    "options": {},
  });
  dao.saveCollection(collection);

  const record = new Record(collection, { horas_posibles_mensuales: 192 });
  dao.saveRecord(record);

  return null;
}, (db) => {
  const dao = new Dao(db);
  return dao.deleteCollection(dao.findCollectionByNameOrId("fichadas_configuracion"));
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

Expected: `Applied 1789150000_created_fichadas_configuracion.js` sin errores.

- [ ] **Step 3: Verificar el registro quedó creado**

```bash
python3 -c "
import sqlite3
con = sqlite3.connect('data/data.db')
rows = con.execute('SELECT * FROM fichadas_configuracion').fetchall()
print(rows)
assert len(rows) == 1, 'tiene que haber exactamente 1 registro'
"
```

Expected: imprime un registro, el assert no falla.

- [ ] **Step 4: Commit**

```bash
git add pb_migrations/1789150000_created_fichadas_configuracion.js
git commit -m "Fichadas: colección de configuración (horas posibles mensuales)"
```

(Incluir `Co-Authored-By: Claude <noreply@anthropic.com>` en el commit, según la convención de este repo.)

---

## Task 2: Motor — función de agregación por área y mes

**Files:**
- Modify: `web/src/pages/fichadas/motor.ts`

**Interfaces:**
- Produces: `calcularEstadisticaHorasExtras()`, tipos `EstadisticaAreaMes` y `FilaEstadisticaArea`.

- [ ] **Step 1: Agregar la función al final de `motor.ts`**

```typescript
// ---------- Estadística de Horas Extras (agrupado por área y mes) ----------

export interface EstadisticaAreaMes {
  dotacion: number;
  hs: number; // horas (no minutos)
  hsTotalMes: number; // horas de TODAS las áreas ese mismo mes
  porcentaje: number; // hs / (dotacion * horasPosiblesMensuales), 0 si dotacion=0
  hsPorPersona: number; // hs / dotacion, 0 si dotacion=0
}

export interface FilaEstadisticaArea {
  area: string;
  meses: EstadisticaAreaMes[]; // 12 posiciones, índice 0=enero .. 11=diciembre
  promedioHs: number;
  totalHs: number;
}

export function calcularEstadisticaHorasExtras(params: {
  resultados: ResultadoDia[];
  areas: string[]; // nombres de área a incluir, en el orden a mostrar
  dotacionPorArea: Map<string, number>;
  horasPosiblesMensuales: number;
}): { filas: FilaEstadisticaArea[]; total: FilaEstadisticaArea } {
  const { resultados, areas, dotacionPorArea, horasPosiblesMensuales } = params;

  const hsPorAreaMes = new Map<string, number[]>(); // minutos acumulados
  areas.forEach((a) => hsPorAreaMes.set(a, new Array(12).fill(0)));
  const hsTotalPorMesMin = new Array(12).fill(0);

  resultados.forEach((r) => {
    const mesIndex = Number(r.fecha.slice(5, 7)) - 1;
    if (mesIndex < 0 || mesIndex > 11) return;
    hsTotalPorMesMin[mesIndex] += r.hE;
    if (!hsPorAreaMes.has(r.area)) hsPorAreaMes.set(r.area, new Array(12).fill(0));
    hsPorAreaMes.get(r.area)![mesIndex] += r.hE;
  });

  function calcularFila(area: string, dotacion: number, minutosPorMes: number[]): FilaEstadisticaArea {
    const meses: EstadisticaAreaMes[] = minutosPorMes.map((min, i) => {
      const hs = min / 60;
      const hsTotalMes = hsTotalPorMesMin[i] / 60;
      const porcentaje = dotacion > 0 ? hs / (dotacion * horasPosiblesMensuales) : 0;
      const hsPorPersona = dotacion > 0 ? hs / dotacion : 0;
      return { dotacion, hs, hsTotalMes, porcentaje, hsPorPersona };
    });
    const totalHs = meses.reduce((a, m) => a + m.hs, 0);
    const promedioHs = totalHs / 12;
    return { area, meses, promedioHs, totalHs };
  }

  const filas = areas.map((area) => calcularFila(area, dotacionPorArea.get(area) || 0, hsPorAreaMes.get(area) || new Array(12).fill(0)));

  const dotacionTotal = areas.reduce((acc, area) => acc + (dotacionPorArea.get(area) || 0), 0);
  const minutosPorMesTotal = new Array(12).fill(0);
  areas.forEach((area) => {
    const arr = hsPorAreaMes.get(area) || [];
    arr.forEach((min, i) => { minutosPorMesTotal[i] += min; });
  });
  const total = calcularFila('TOTAL', dotacionTotal, minutosPorMesTotal);

  return { filas, total };
}
```

- [ ] **Step 2: Escribir el script de prueba**

```typescript
// Prueba standalone de calcularEstadisticaHorasExtras. Se corre con tsx
// (ver otras pruebas de este mismo módulo) y se borra después.
import { calcularEstadisticaHorasExtras, type ResultadoDia } from './motor';

let ok = 0, fail = 0;
function check(nombre: string, cond: boolean, extra?: unknown) {
  if (cond) { ok++; console.log(`  OK   ${nombre}`); }
  else { fail++; console.log(`  FALLA ${nombre} ->`, extra); }
}

function resultado(area: string, fecha: string, hE: number): ResultadoDia {
  return {
    idLegajo: 'x', nroLegajo: '', identificador: '', nombre: '', dni: '',
    area, deposito: '', fecha, dia: '', paresEsperados: [], paresReales: [],
    hN: 0, hE, ausente: false, novedad: '',
  };
}

// 2 áreas, enero: CORDOBA tiene 120min (2h) de extra, BS AS tiene 60min (1h).
const resultados: ResultadoDia[] = [
  resultado('CORDOBA', '2026-01-05', 120),
  resultado('BS AS', '2026-01-10', 60),
];

const { filas, total } = calcularEstadisticaHorasExtras({
  resultados,
  areas: ['CORDOBA', 'BS AS'],
  dotacionPorArea: new Map([['CORDOBA', 2], ['BS AS', 1]]),
  horasPosiblesMensuales: 192,
});

const cordoba = filas.find((f) => f.area === 'CORDOBA')!;
const bsas = filas.find((f) => f.area === 'BS AS')!;

check('Córdoba enero: hs = 2', cordoba.meses[0].hs === 2, cordoba.meses[0]);
check('Córdoba enero: hsTotalMes = 3 (2+1 de las dos áreas)', cordoba.meses[0].hsTotalMes === 3, cordoba.meses[0]);
check('Córdoba enero: % = 2/(2*192)', Math.abs(cordoba.meses[0].porcentaje - 2 / (2 * 192)) < 1e-9, cordoba.meses[0]);
check('Córdoba enero: Hs/P = 2/2 = 1', cordoba.meses[0].hsPorPersona === 1, cordoba.meses[0]);
check('Córdoba: febrero en 0 (sin datos)', cordoba.meses[1].hs === 0, cordoba.meses[1]);
check('Córdoba: total anual = 2 (solo enero tiene datos)', cordoba.totalHs === 2, cordoba.totalHs);
check('Córdoba: promedio anual = 2/12', Math.abs(cordoba.promedioHs - 2 / 12) < 1e-9, cordoba.promedioHs);

check('BS AS enero: hs = 1', bsas.meses[0].hs === 1, bsas.meses[0]);

check('TOTAL enero: dotación = 3 (2+1)', total.meses[0].dotacion === 3, total.meses[0]);
check('TOTAL enero: hs = 3 (2+1)', total.meses[0].hs === 3, total.meses[0]);

// Área sin dotación (0 legajos activos hoy) pero con horas extra históricas
// -- no debe romper (división por 0 evitada).
const { filas: filasSinDotacion } = calcularEstadisticaHorasExtras({
  resultados: [resultado('ROSARIO', '2026-03-01', 60)],
  areas: ['ROSARIO'],
  dotacionPorArea: new Map(), // ROSARIO no está en el mapa -> dotación 0
  horasPosiblesMensuales: 192,
});
const rosario = filasSinDotacion[0];
check('Área sin dotación: % no explota (queda en 0)', rosario.meses[2].porcentaje === 0, rosario.meses[2]);
check('Área sin dotación: Hs/P no explota (queda en 0)', rosario.meses[2].hsPorPersona === 0, rosario.meses[2]);
check('Área sin dotación: hs sigue sumando igual', rosario.meses[2].hs === 1, rosario.meses[2]);

console.log(`\n${ok} ok, ${fail} fallas`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 3: Correr la prueba y borrarla**

Run: `cd web && npx tsx src/pages/fichadas/motor.test-estadistica.ts`
Expected: `11 ok, 0 fallas`.

```bash
rm web/src/pages/fichadas/motor.test-estadistica.ts
```

- [ ] **Step 4: Build**

Run: `cd web && npm run build`
Expected: build exitoso, sin errores de TypeScript.

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/fichadas/motor.ts
git commit -m "Fichadas: función de agregación de horas extra por área y mes"
```

---

## Task 3: Pantalla — pestaña "Estadísticas"

**Files:**
- Create: `web/src/pages/fichadas/EstadisticasTab.tsx`
- Modify: `web/src/pages/fichadas/FichadasPage.tsx`
- Modify: `web/src/types.ts`

**Interfaces:**
- Consumes: `calcularEstadisticaHorasExtras()` (Task 2), colección `fichadas_configuracion` (Task 1).
- Produces: pestaña nueva visible en Fichadas, con el selector de año, el campo de horas posibles, y la tabla.

- [ ] **Step 1: Agregar el tipo en `web/src/types.ts`**

Buscar el final de los tipos de Fichadas (después de `FichadasFeriado` o similar) y agregar:

```typescript
export interface FichadasConfiguracion extends BaseRecord {
  horas_posibles_mensuales: number;
}
```

- [ ] **Step 2: Escribir `web/src/pages/fichadas/EstadisticasTab.tsx`**

```tsx
import { Fragment, useEffect, useState } from 'react';
import { pb } from '../../lib/pb';
import { useToast } from '../../lib/ToastContext';
import { isoDate } from '../../lib/format';
import { procesarPeriodo, calcularEstadisticaHorasExtras, type FilaEstadisticaArea } from './motor';
import type { FichadasConfiguracion, FichadasEmpresa, FichadasFeriado, FichadasLegajo, FichadasMarca, FichadasNovedad } from '../../types';

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function fmtHs(n: number): string {
  return n.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}
function fmtPct(n: number): string {
  return (n * 100).toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
}

export function EstadisticasTab() {
  const toast = useToast();
  const [anio, setAnio] = useState(() => new Date().getFullYear());
  const [horasPosibles, setHorasPosibles] = useState('192');
  const [configId, setConfigId] = useState('');
  const [guardandoConfig, setGuardandoConfig] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [filas, setFilas] = useState<FilaEstadisticaArea[] | null>(null);
  const [total, setTotal] = useState<FilaEstadisticaArea | null>(null);

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
    setCargando(true);
    try {
      const desde = isoDate(new Date(anio, 0, 1));
      const hasta = isoDate(new Date(anio, 11, 31));
      const [legajos, marcas, novedades, feriados, empresas] = await Promise.all([
        pb.collection('fichadas_legajos').getFullList<FichadasLegajo>({ filter: 'estado = true', expand: 'empresa,horario' }),
        pb.collection('fichadas_marcas').getFullList<FichadasMarca>({ filter: pb.filter('fecha >= {:d} && fecha <= {:h}', { d: desde, h: hasta }) }),
        pb.collection('fichadas_novedades').getFullList<FichadasNovedad>({ filter: pb.filter('fecha >= {:d} && fecha <= {:h}', { d: desde, h: hasta }) }),
        pb.collection('fichadas_feriados').getFullList<FichadasFeriado>({ filter: pb.filter('fecha >= {:d} && fecha <= {:h}', { d: desde, h: hasta }) }),
        pb.collection('fichadas_empresas').getFullList<FichadasEmpresa>({ sort: 'nombre' }),
      ]);
      const empresaNombrePorId = new Map(empresas.map((e) => [e.id, e.nombre]));
      const { resultados } = procesarPeriodo({ legajos, marcas, novedades, feriados, empresaNombrePorId, desde, hasta });

      const dotacionPorArea = new Map<string, number>();
      legajos.forEach((l) => {
        const nombreArea = l.empresa ? empresaNombrePorId.get(l.empresa) : undefined;
        if (!nombreArea) return;
        dotacionPorArea.set(nombreArea, (dotacionPorArea.get(nombreArea) || 0) + 1);
      });

      const { filas: f, total: t } = calcularEstadisticaHorasExtras({
        resultados, areas: empresas.map((e) => e.nombre), dotacionPorArea, horasPosiblesMensuales: n,
      });
      setFilas(f);
      setTotal(t);
    } catch (e) {
      toast('No se pudo calcular: ' + (e instanceof Error ? e.message : ''), 'err');
    } finally {
      setCargando(false);
    }
  }

  function filaTabla(f: FilaEstadisticaArea, destacada: boolean) {
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

  return (
    <div className="card">
      <h2>Estadísticas</h2>
      <div className="hint">Resumen anual de horas extra por área — reemplaza la planilla que arma RRHH a mano.</div>

      <div className="row" style={{ marginTop: 14, flexWrap: 'wrap', alignItems: 'end' }}>
        <div className="field">
          <label>Año</label>
          <input type="number" value={anio} onChange={(e) => setAnio(Number(e.target.value))} style={{ width: 90 }} />
        </div>
        <div className="field">
          <label>Horas posibles por mes</label>
          <input value={horasPosibles} onChange={(e) => setHorasPosibles(e.target.value)} style={{ width: 90 }} />
        </div>
        <button className="secondary" onClick={guardarHorasPosibles} disabled={guardandoConfig}>Guardar horas posibles</button>
        <button onClick={calcular} disabled={cargando}>{cargando ? 'Calculando…' : 'Calcular'}</button>
      </div>

      {filas && total && (
        <div className="table-wrap" style={{ marginTop: 16 }}>
          <table>
            <thead>
              <tr>
                <th>Área</th><th></th>
                {MESES.map((m) => <th key={m} className="num">{m}</th>)}
                <th className="num">Prom.</th>
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => <Fragment key={f.area}>{filaTabla(f, false)}</Fragment>)}
              {filaTabla(total, true)}
            </tbody>
          </table>
        </div>
      )}
      {!filas && !cargando && <div className="empty" style={{ marginTop: 16 }}>Elegí un año y apretá "Calcular".</div>}
    </div>
  );
}
```

- [ ] **Step 3: Registrar la pestaña en `web/src/pages/fichadas/FichadasPage.tsx`**

Buscar:

```typescript
import { CargaTab } from './CargaTab';
import { ResultadosTab } from './ResultadosTab';
import { ConfiguracionTab } from './ConfiguracionTab';

const TABS = [
  { id: 'carga', label: 'Carga y novedades' },
  { id: 'resultados', label: 'Resultados' },
  { id: 'configuracion', label: 'Configuración' },
];
```

Reemplazar por:

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

Buscar:

```tsx
      {tab === 'carga' && <CargaTab />}
      {tab === 'resultados' && <ResultadosTab />}
      {tab === 'configuracion' && <ConfiguracionTab />}
```

Reemplazar por:

```tsx
      {tab === 'carga' && <CargaTab />}
      {tab === 'resultados' && <ResultadosTab />}
      {tab === 'estadisticas' && <EstadisticasTab />}
      {tab === 'configuracion' && <ConfiguracionTab />}
```

- [ ] **Step 4: Build**

Run: `cd web && npm run build`
Expected: build exitoso, sin errores de TypeScript.

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/fichadas/EstadisticasTab.tsx web/src/pages/fichadas/FichadasPage.tsx web/src/types.ts
git commit -m "Fichadas: pestaña Estadísticas (resumen anual de horas extra por área)"
```

---

## Task 4: Desplegar y verificar

**Files:** (ninguno nuevo — solo push y verificación)

- [ ] **Step 1: Push**

```bash
git push origin claude/cyv-driver-renditions-form-h4l5fu
```

- [ ] **Step 2: Esperar el deploy y confirmar**

Sondear `https://api.github.com/repos/sistemascyv/Desarrollos/actions/runs?branch=claude/cyv-driver-renditions-form-h4l5fu&per_page=1` hasta `status: completed` (o confirmar directamente que el hash del bundle JS cambió en `https://app.carossiovairolatti.com.ar/`).

- [ ] **Step 3: Verificación final en producción**

Entrar a Fichadas → Estadísticas, elegir el año actual, apretar Calcular, y confirmar que la tabla se arma sin errores y los números de alguna área conocida son razonables comparados contra lo que ya se ve en Resultados para ese mismo período.
