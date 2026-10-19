# Fichadas: Descargar Excel en Estadísticas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar un botón "Descargar Excel" a la pestaña Estadísticas de Fichadas que baje un único `.xlsx` con 3 hojas (Horas Extras, Ausentismo, Rotación) a partir de los datos ya calculados en memoria.

**Architecture:** Reusa el patrón ya existente en `ResultadosTab.tsx` (array-de-arrays por hoja → `XLSX.utils.aoa_to_sheet` → `XLSX.utils.book_append_sheet` → `XLSX.writeFile`), con la librería `xlsx` ya instalada en el proyecto. No hace ningún fetch nuevo ni recalcula nada — arma las hojas a partir de los `state` que `calcular()` ya pobló.

**Tech Stack:** React + TypeScript (Vite), librería `xlsx` (ya en `package.json`).

## Global Constraints

- Un solo archivo `.xlsx` con las 3 hojas siempre juntas (no una descarga por vista) — confirmado con el usuario.
- Nombre del archivo: `estadisticas_rrhh_{año}.xlsx` (el año elegido en el selector al momento de descargar) — confirmado con el usuario (no `estadisticas_fichadas`).
- Los números se exportan crudos, no el texto ya formateado de pantalla. Horas con 2 decimales (mismo criterio que `ResultadosTab.tsx`: `Math.round(x * 100) / 100`). Porcentajes (HS/To, %, Índice de Rotación) como número ya multiplicado por 100 y redondeado a 1 decimal (ej. `12.8`, no `0.128` ni `"12,8%"`).
- Botón deshabilitado hasta que se calculó algo — sin mensaje de error si no hay datos, simplemente no clickeable.
- Fuera de alcance: exportar una sola vista, formato visual (negritas/colores/anchos), otros formatos de archivo.

---

## Task 1: Botón "Descargar Excel" en EstadisticasTab.tsx

**Files:**
- Modify: `web/src/pages/fichadas/EstadisticasTab.tsx`

**Interfaces:**
- Consumes: el `state` ya existente en el componente (`filasHorasExtras`, `totalHorasExtras`, `filasAusentismo`, `totalAusentismo`, `rotacionMeses`, `rotacionMovimientos`, `rotacionMesesTranscurridos`, `anio`), y la función `filasRotacion()` ya definida en el mismo archivo.
- No produce nada consumido por otras tareas — es la única tarea del plan.

- [ ] **Step 1: Importar la librería xlsx**

Buscar:

```typescript
import { Fragment, useEffect, useState } from 'react';
import { pb } from '../../lib/pb';
```

Reemplazar por:

```typescript
import { Fragment, useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { pb } from '../../lib/pb';
```

- [ ] **Step 2: Agregar los helpers de redondeo y el tipo de fila de Excel**

Buscar:

```typescript
function fmtHs(n: number): string {
  return n.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}
function fmtPct(n: number): string {
  return (n * 100).toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
}
```

Reemplazar por:

```typescript
function fmtHs(n: number): string {
  return n.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}
function fmtPct(n: number): string {
  return (n * 100).toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
}

// ---------- Excel: números crudos (no el texto ya formateado de pantalla) ----------
type FilaExcel = (string | number | null)[];
function hs2(n: number): number { return Math.round(n * 100) / 100; }
function pct1(n: number): number { return Math.round(n * 1000) / 10; } // ej. 0.128 -> 12.8

function filaAoaHorasExtras(f: FilaEstadisticaArea): FilaExcel[] {
  const etiquetas: [string, (m: FilaEstadisticaArea['meses'][number]) => number][] = [
    ['Dot.', (m) => m.dotacion],
    ['HS', (m) => hs2(m.hs)],
    ['HS/To', (m) => pct1(m.hsTotalMes > 0 ? m.hs / m.hsTotalMes : 0)],
    ['%', (m) => pct1(m.porcentaje)],
    ['Hs/P.', (m) => hs2(m.hsPorPersona)],
  ];
  return etiquetas.map(([etiqueta, valorDe]) => [
    f.area, etiqueta,
    ...f.meses.map(valorDe),
    etiqueta === 'HS' ? hs2(f.promedioHs) : null,
    etiqueta === 'HS' ? hs2(f.totalHs) : null,
  ]);
}

function filaAoaAusentismo(f: FilaEstadisticaCausa): FilaExcel[] {
  const etiquetas: [string, (m: FilaEstadisticaCausa['meses'][number]) => number][] = [
    ['Hs', (m) => hs2(m.horas)],
    ['%', (m) => pct1(m.porcentaje)],
  ];
  return etiquetas.map(([etiqueta, valorDe]) => [
    f.causa, etiqueta,
    ...f.meses.map(valorDe),
    etiqueta === 'Hs' ? hs2(f.promedioHoras) : null,
    etiqueta === 'Hs' ? hs2(f.totalHoras) : null,
  ]);
}
```

- [ ] **Step 3: Agregar `todoCalculado` y la función `descargarExcel`**

Buscar:

```typescript
  function filasRotacion(meses: RotacionMes[], mesesTranscurridos: number) {
```

Reemplazar por (agrega las dos funciones nuevas antes de `filasRotacion`, que ya existe y queda intacta):

```typescript
  function descargarExcel() {
    if (!todoCalculado || !filasHorasExtras || !totalHorasExtras || !filasAusentismo || !totalAusentismo || !rotacionMeses) return;
    const wb = XLSX.utils.book_new();

    const aoaHE: FilaExcel[] = [['Área', '', ...MESES, 'Prom.', 'Total']];
    filasHorasExtras.forEach((f) => aoaHE.push(...filaAoaHorasExtras(f)));
    aoaHE.push(...filaAoaHorasExtras(totalHorasExtras));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoaHE), 'Horas Extras');

    const aoaAus: FilaExcel[] = [['Causa', '', ...MESES, 'Prom.', 'Total']];
    filasAusentismo.forEach((f) => aoaAus.push(...filaAoaAusentismo(f)));
    aoaAus.push(...filaAoaAusentismo(totalAusentismo));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoaAus), 'Ausentismo');

    const aoaRot: FilaExcel[] = [['Métrica', ...MESES, 'Prom.', 'Total']];
    filasRotacion(rotacionMeses, rotacionMesesTranscurridos).forEach((f) => {
      aoaRot.push([
        f.etiqueta,
        ...f.valores.map((v) => (f.esPorcentaje ? pct1(v) : v)),
        f.prom !== undefined ? (f.esPorcentaje ? pct1(f.prom) : hs2(f.prom)) : null,
        f.tot !== undefined ? f.tot : null,
      ]);
    });
    aoaRot.push([]);
    aoaRot.push(['Fecha', 'Nombre', 'Tipo', 'Motivo']);
    (rotacionMovimientos || []).forEach((mv) => {
      aoaRot.push([mv.fecha, mv.nombre, mv.tipo === 'ingreso' ? 'Alta' : 'Baja', mv.motivo || '']);
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoaRot), 'Rotación');

    XLSX.writeFile(wb, `estadisticas_rrhh_${anio}.xlsx`);
  }

  function filasRotacion(meses: RotacionMes[], mesesTranscurridos: number) {
```

- [ ] **Step 4: Definir `todoCalculado` junto a `hayDatos`**

Buscar:

```typescript
  const hayDatos = vista === 'horas_extras' ? !!(filasHorasExtras && totalHorasExtras)
    : vista === 'ausentismo' ? !!(filasAusentismo && totalAusentismo)
    : rotacionMeses !== null;
```

Reemplazar por:

```typescript
  const hayDatos = vista === 'horas_extras' ? !!(filasHorasExtras && totalHorasExtras)
    : vista === 'ausentismo' ? !!(filasAusentismo && totalAusentismo)
    : rotacionMeses !== null;
  const todoCalculado = !!(filasHorasExtras && totalHorasExtras && filasAusentismo && totalAusentismo && rotacionMeses);
```

- [ ] **Step 5: Agregar el botón al lado de "Calcular"**

Buscar:

```tsx
        <button className="secondary" onClick={guardarHorasPosibles} disabled={guardandoConfig}>Guardar horas posibles</button>
        <button onClick={calcular} disabled={cargando}>{cargando ? 'Calculando…' : 'Calcular'}</button>
      </div>
```

Reemplazar por:

```tsx
        <button className="secondary" onClick={guardarHorasPosibles} disabled={guardandoConfig}>Guardar horas posibles</button>
        <button onClick={calcular} disabled={cargando}>{cargando ? 'Calculando…' : 'Calcular'}</button>
        <button className="secondary" onClick={descargarExcel} disabled={!todoCalculado}>Descargar Excel</button>
      </div>
```

- [ ] **Step 6: Build**

Run: `cd web && npm run build`
Expected: build exitoso, sin errores de TypeScript.

- [ ] **Step 7: Commit**

```bash
git add web/src/pages/fichadas/EstadisticasTab.tsx
git commit -m "Fichadas: descargar Excel con Horas Extras/Ausentismo/Rotación en Estadísticas"
```

(Incluir `Co-Authored-By: Claude <noreply@anthropic.com>`.)

---

## Task 2: Desplegar y verificar

**Files:** (ninguno nuevo — solo push y verificación)

- [ ] **Step 1: Push**

```bash
git push origin claude/cyv-driver-renditions-form-h4l5fu
```

- [ ] **Step 2: Esperar el deploy y confirmar**

Sondear `https://api.github.com/repos/sistemascyv/Desarrollos/actions/runs?branch=claude/cyv-driver-renditions-form-h4l5fu&per_page=1` hasta `status: completed` (o confirmar directamente que el hash del bundle JS cambió en `https://app.carossiovairolatti.com.ar/`).

- [ ] **Step 3: Verificación final en producción**

Entrar a Fichadas → Estadísticas, elegir un año, Calcular, y confirmar que "Descargar Excel" pasa de deshabilitado a habilitado. Tocarlo, abrir el `.xlsx` descargado (`estadisticas_rrhh_{año}.xlsx`) y confirmar: 3 hojas (Horas Extras, Ausentismo, Rotación), los números coinciden con lo que se ve en pantalla (sin el `%` ni las comas de formato), la hoja Rotación tiene el listado de movimientos debajo de la tabla.
