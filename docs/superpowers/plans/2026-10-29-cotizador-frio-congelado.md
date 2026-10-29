# Cotizador: cotizar en Frío y Congelado — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El Cotizador hoy solo cotiza carga Seca; este plan agrega Frío y Congelado como categorías alternativas, elegidas una vez por cotización completa.

**Architecture:** Se agrega un campo `categoria` a la colección `cotizaciones` (migración PocketBase + backfill a `'seco'`). El frontend deja de filtrar `cuadro_tarifario` por categoría en el servidor (pide todo, filtra en cliente, mismo patrón que `CuadroTarifarioPage.tsx`) y bifurca el cálculo de cada ítem: Seco sigue usando `calcularItem` (zona + m³) sin cambios; Frío/Congelado usan una función nueva, más simple (banda de Kg, valor fijo). El selector de categoría vive junto a Origen/Destino/Paga en; el campo Mts³ se oculta para Frío/Congelado.

**Tech Stack:** React + TypeScript + Vite (frontend), PocketBase (backend, con una migración de esquema nueva).

## Global Constraints

- La categoría se elige **una vez por cotización completa**, no por ítem — no se permite mezclar categorías dentro de una misma cotización.
- El **mínimo por sucursal** aplica igual para las 3 categorías — `minimoDeSucursal`/`calcularTotales` no cambian.
- El campo "Mts³" se **oculta** (no solo se deshabilita) cuando la categoría es Frío o Congelado.
- La numeración correlativa por sucursal (`pb_hooks/cotizaciones.pb.js`) no cambia — sigue sin relación con la categoría.
- Id real de la colección `cotizaciones` en PocketBase: `cotizaciones01` (confirmado en `pb_migrations/1789280000_created_cotizaciones.js`). Último timestamp de migración usado en el repo: `1789310000`.
- Build: `npm run build` desde `web/` (`tsc -b && vite build`) debe quedar limpio al final de cada tarea. No hay tests automatizados de frontend — cada tarea termina con build limpio + verificación manual paso a paso.
- La migración de PocketBase (Task 1) no se puede ejecutar contra una base real en este entorno (no hay PocketBase local) — su verificación en este plan es estática (sintaxis + revisión de IDs). El despliegue real (copiar el archivo al `pb_migrations/` del servidor + reiniciar el servicio) lo hace el controller por fuera de las tareas del plan, igual que en features anteriores de este proyecto.

---

## File Structure

- **Create:** `pb_migrations/1789320000_cotizaciones_categoria.js` — agrega el campo `categoria` a `cotizaciones` + backfill a `'seco'`.
- **Create:** `web/src/lib/categoriasTarifario.ts` — constante `CATEGORIAS` y tipo `CategoriaId` compartidos (hoy duplicados/locales en `CuadroTarifarioPage.tsx`).
- **Modify:** `web/src/types.ts` — agrega `categoria?` a la interfaz `Cotizacion`.
- **Modify:** `web/src/pages/tarifas/cotizadorMotor.ts` — nueva función `calcularItemFrioCongelado`.
- **Modify:** `web/src/pages/tarifas/CuadroTarifarioPage.tsx` — pasa a importar `CATEGORIAS`/`CategoriaId` del archivo compartido en vez de declararlos localmente.
- **Modify:** `web/src/pages/tarifas/CotizadorPage.tsx` — selector de categoría, filtro client-side, bifurcación de cálculo, columna Mts³ condicional.
- **Modify:** `web/src/pages/tarifas/CotizacionImprimirPage.tsx` — agrega "Categoría: X" al encabezado impreso.

---

### Task 1: Modelo de datos — migración + tipo TS

**Files:**
- Create: `pb_migrations/1789320000_cotizaciones_categoria.js`
- Modify: `web/src/types.ts` (interfaz `Cotizacion`, agregar campo después de `paga_en` en la línea 130)

**Interfaces:**
- Produces: campo `categoria?: 'seco' | 'frio' | 'congelado';` en la interfaz `Cotizacion` (`web/src/types.ts`). Las tareas 3 y 4 lo consumen.

- [ ] **Step 1: Escribir la migración**

Crear `pb_migrations/1789320000_cotizaciones_categoria.js`:

```js
/// <reference path="../pb_data/types.d.ts" />
// Cotizador: agrega la categoria (seco/frio/congelado) a cada cotizacion --
// hoy el Cotizador solo cotiza Seco, con esto puede cotizar las 3. Una
// cotizacion es de UNA sola categoria completa, no por item (confirmado
// con el usuario, ver docs/superpowers/specs/2026-10-29-cotizador-frio-congelado-design.md).
// Backfill: las cotizaciones existentes (todas de antes de esta feature,
// todas Seco) quedan en 'seco' -- mismo patron que
// pb_migrations/1789270000_usuarios_sucursal.js. "required: false" a
// proposito aunque el formulario real siempre la manda -- mismo motivo que
// el resto de los campos de esta coleccion (ver
// pb_migrations/1789280000_created_cotizaciones.js): no hace falta volver
// a "required: true" despues.
migrate((db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId('cotizaciones01');
  collection.schema.addField(new SchemaField({
    system: false, id: 'cot0categoria1', name: 'categoria', type: 'select',
    required: false, presentable: true, unique: false,
    options: { maxSelect: 1, values: ['seco', 'frio', 'congelado'] },
  }));
  dao.saveCollection(collection);

  dao.findRecordsByFilter('cotizaciones', "categoria = ''", '', 500, 0).forEach((c) => {
    c.set('categoria', 'seco');
    dao.saveRecord(c);
  });

  return null;
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId('cotizaciones01');
  collection.schema.removeField('cot0categoria1');
  return dao.saveCollection(collection);
})
```

- [ ] **Step 2: Verificar sintaxis**

Run: `node --check pb_migrations/1789320000_cotizaciones_categoria.js`
Expected: sin output (exit code 0). `Dao`/`SchemaField`/`migrate`/`Collection` son globals de PocketBase que no existen en Node — este check solo valida sintaxis JS, no ejecuta la migración (no hay PocketBase local en este entorno). Confirmar a mano que `cot0categoria1` no choca con ningún id de campo ya usado en `pb_migrations/1789280000_created_cotizaciones.js` (lista: `cot0numero0001`, `cot0fecha00001`, `cot0trfcorig01`, `cot0trfcdest1`, `cot0pagaen0001`, `cot0cliente001`, `cot0solicpor01`, `cot0telefono01`, `cot0email00001`, `cot0lugcarga01`, `cot0lugdescar1`, `cot0tipomerc01`, `cot0observac01`, `cot0segactivo1`, `cot0segporc001`, `cot0contraree1`, `cot0taxiflet01`, `cot0subtotal01`, `cot0recargo001`, `cot0seguro0001`, `cot0netograva1`, `cot0iva0000001`, `cot0total00001`, `cot0creadopor1`) — ninguno coincide con `cot0categoria1`.

- [ ] **Step 3: Agregar el campo al tipo TS**

En `web/src/types.ts`, la interfaz `Cotizacion` hoy es (líneas 125-151):

```ts
export interface Cotizacion extends BaseRecord {
  numero: string;
  fecha: string;
  trafico_origen: Sucursal;
  trafico_destino: Sucursal;
  paga_en: 'origen' | 'destino';
  cliente?: string;
  ...
```

Agregar el campo nuevo justo después de `paga_en`:

```ts
export interface Cotizacion extends BaseRecord {
  numero: string;
  fecha: string;
  trafico_origen: Sucursal;
  trafico_destino: Sucursal;
  paga_en: 'origen' | 'destino';
  categoria?: 'seco' | 'frio' | 'congelado';
  cliente?: string;
  ...
```

(el resto de la interfaz, desde `cliente?` en adelante, queda exactamente igual).

- [ ] **Step 4: Build**

Run: `cd web && npm run build`
Expected: compila limpio (nada más referencia `categoria` todavía, es un campo opcional nuevo sin uso).

- [ ] **Step 5: Commit**

```bash
git add pb_migrations/1789320000_cotizaciones_categoria.js web/src/types.ts
git commit -m "feat: agregar campo categoria a cotizaciones (migracion + tipo)"
```

---

### Task 2: Motor de cálculo Frío/Congelado + constante de categorías compartida

**Files:**
- Create: `web/src/lib/categoriasTarifario.ts`
- Modify: `web/src/pages/tarifas/cotizadorMotor.ts` (agregar función después de `calcularItem`, que termina en la línea 79, antes de `minimoDeSucursal` en la línea 81)
- Modify: `web/src/pages/tarifas/CuadroTarifarioPage.tsx` (líneas 1-18: imports y declaración local de `CATEGORIAS`/`CategoriaId`)

**Interfaces:**
- Consumes: nada de la Task 1 (función pura, no toca `Cotizacion`).
- Produces: `calcularItemFrioCongelado(filas: CuadroTarifarioFila[], kilos: number): ItemCalculado | null` exportada desde `web/src/pages/tarifas/cotizadorMotor.ts`. `CATEGORIAS` (array `readonly [{id:'seco'|'frio'|'congelado', label:string}]`) y tipo `CategoriaId` exportados desde `web/src/lib/categoriasTarifario.ts`. La Task 3 y la Task 4 consumen ambos.

- [ ] **Step 1: Crear el archivo compartido de categorías**

Crear `web/src/lib/categoriasTarifario.ts`:

```ts
export const CATEGORIAS = [
  { id: 'seco', label: 'Seco' },
  { id: 'frio', label: 'Frío' },
  { id: 'congelado', label: 'Congelado' },
] as const;

export type CategoriaId = typeof CATEGORIAS[number]['id'];
```

- [ ] **Step 2: Agregar la función de cálculo Frío/Congelado**

En `web/src/pages/tarifas/cotizadorMotor.ts`, la función `calcularItem` termina así (línea 78-79):

```ts
  return candidatos.reduce((a, b) => (b.total > a.total ? b : a));
}
```

Justo después, antes de `export function minimoDeSucursal(...)`, agregar:

```ts
// Frio/Congelado: a diferencia de Seco, esas tablas no tienen columna de
// zona ni de m3 -- el precio es un valor fijo por banda de Kg, sin
// comparar candidatos ni zona de trafico.
export function calcularItemFrioCongelado(filas: CuadroTarifarioFila[], kilos: number): ItemCalculado | null {
  if (kilos <= 0) return null;
  const fila = bandaPorLimiteSuperior(filas, kilos, (f) => f.rango_kg_hasta);
  if (!fila || fila.valor == null) return null;
  return { precio: fila.valor, total: fila.valor, porUnidad: false };
}
```

No hace falta ningún import nuevo: `bandaPorLimiteSuperior` ya es una función privada de este mismo archivo, `CuadroTarifarioFila` ya está importado arriba, e `ItemCalculado` ya está declarado arriba en el mismo archivo.

- [ ] **Step 3: Hacer que `CuadroTarifarioPage.tsx` use el archivo compartido**

En `web/src/pages/tarifas/CuadroTarifarioPage.tsx`, los imports y la declaración local hoy son (líneas 1-18):

```tsx
import { useEffect, useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import { Link } from 'react-router-dom';
import { pb } from '../../lib/pb';
import { useAuth } from '../../lib/AuthContext';
import { useToast } from '../../lib/ToastContext';
import { useConfirm } from '../../lib/ConfirmContext';
import { money, isoDate } from '../../lib/format';
import type { CuadroTarifarioFila, CuadroTarifarioMinimos } from '../../types';
import { TablaCuadro } from './TablaCuadro';
import { CuadroTarifarioExport } from './CuadroTarifarioExport';

const CATEGORIAS = [
  { id: 'seco', label: 'Seco' },
  { id: 'frio', label: 'Frío' },
  { id: 'congelado', label: 'Congelado' },
] as const;
type CategoriaId = typeof CATEGORIAS[number]['id'];
```

Reemplazar por:

```tsx
import { useEffect, useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import { Link } from 'react-router-dom';
import { pb } from '../../lib/pb';
import { useAuth } from '../../lib/AuthContext';
import { useToast } from '../../lib/ToastContext';
import { useConfirm } from '../../lib/ConfirmContext';
import { money, isoDate } from '../../lib/format';
import type { CuadroTarifarioFila, CuadroTarifarioMinimos } from '../../types';
import { TablaCuadro } from './TablaCuadro';
import { CuadroTarifarioExport } from './CuadroTarifarioExport';
import { CATEGORIAS, type CategoriaId } from '../../lib/categoriasTarifario';
```

El resto del archivo (uso de `CATEGORIAS.map(...)`, `useState<CategoriaId>('seco')`, etc.) no cambia — son el mismo nombre e idéntica forma, solo cambia de dónde vienen.

- [ ] **Step 4: Build**

Run: `cd web && npm run build`
Expected: compila limpio.

- [ ] **Step 5: Verificación manual (regresión)**

Con el build servido (`npm run preview` o el flujo de desarrollo que ya use este proyecto), entrar a Tarifas → Cuadro Tarifario y confirmar que las pestañas Seco/Frío/Congelado siguen funcionando exactamente igual que antes (nada debería cambiar visualmente — este paso solo movió de dónde sale la constante).

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/categoriasTarifario.ts web/src/pages/tarifas/cotizadorMotor.ts web/src/pages/tarifas/CuadroTarifarioPage.tsx
git commit -m "refactor: extraer CATEGORIAS compartido + agregar calcularItemFrioCongelado"
```

---

### Task 3: Cotizador — selector de categoría, filtro, cálculo y UI

**Files:**
- Modify: `web/src/pages/tarifas/CotizadorPage.tsx` (archivo completo — ver fragmentos exactos abajo)

**Interfaces:**
- Consumes: `categoria?: 'seco'|'frio'|'congelado'` de la interfaz `Cotizacion` (Task 1). `calcularItemFrioCongelado(filas, kilos): ItemCalculado | null` de `./cotizadorMotor` (Task 2). `CATEGORIAS`, `CategoriaId` de `../../lib/categoriasTarifario` (Task 2).
- Produces: nada que otras tareas consuman (Task 4 es independiente de esta).

- [ ] **Step 1: Imports**

Línea 9 hoy:
```ts
import { claveZona, calcularItem, calcularTotales, minimoDeSucursal } from './cotizadorMotor';
```
Reemplazar por:
```ts
import { claveZona, calcularItem, calcularItemFrioCongelado, calcularTotales, minimoDeSucursal } from './cotizadorMotor';
```
Agregar una línea nueva de import justo debajo:
```ts
import { CATEGORIAS, type CategoriaId } from '../../lib/categoriasTarifario';
```

- [ ] **Step 2: Estado — renombrar `filasSeco` a `filas`, agregar `categoria`**

Línea 95 hoy:
```ts
  const [filasSeco, setFilasSeco] = useState<CuadroTarifarioFila[]>([]);
```
Reemplazar por:
```ts
  const [filas, setFilas] = useState<CuadroTarifarioFila[]>([]);
  const [categoria, setCategoria] = useState<CategoriaId>('seco');
```

- [ ] **Step 3: Carga de datos — sacar el filtro server-side**

Dentro de `cargarListaYDatos()`, línea 126 hoy:
```ts
        pb.collection('cuadro_tarifario').getFullList<CuadroTarifarioFila>({ filter: "categoria = 'seco'", sort: 'rango_kg_desde' }),
```
Reemplazar por:
```ts
        pb.collection('cuadro_tarifario').getFullList<CuadroTarifarioFila>({ sort: 'rango_kg_desde' }),
```
Línea 131 hoy:
```ts
      setFilasSeco(cuadro);
```
Reemplazar por:
```ts
      setFilas(cuadro);
```

- [ ] **Step 4: Resetear categoría al abrir una cotización nueva**

Línea 140 hoy:
```ts
    setTraficoOrigen('san_francisco'); setTraficoDestino('san_francisco'); setPagaEn('origen');
```
Reemplazar por:
```ts
    setTraficoOrigen('san_francisco'); setTraficoDestino('san_francisco'); setPagaEn('origen'); setCategoria('seco');
```

- [ ] **Step 5: Bifurcar el cálculo por categoría**

Líneas 160-165 hoy:
```ts
  const clave = claveZona(traficoOrigen, traficoDestino);
  const itemsParseados = items.map(parsearItem);
  const itemsCalculados = itemsParseados.map((p) => {
    if (!clave || p.invalido || !p.tieneCarga) return null;
    return calcularItem(filasSeco, p.kilos, p.m3, clave);
  });
```
Reemplazar por:
```ts
  const clave = claveZona(traficoOrigen, traficoDestino);
  const filasCategoria = filas.filter((f) => f.categoria === categoria);
  const itemsParseados = items.map(parsearItem);
  const itemsCalculados = itemsParseados.map((p) => {
    if (p.invalido || !p.tieneCarga) return null;
    if (categoria === 'seco') {
      if (!clave) return null;
      return calcularItem(filasCategoria, p.kilos, p.m3, clave);
    }
    return calcularItemFrioCongelado(filasCategoria, p.kilos);
  });
```

(el resto del bloque de cálculo — `hayItemInvalido`, `itemsValidos`, `totales`, etc., líneas 166-195 — no cambia, ya que sigue operando sobre `itemsCalculados`/`itemsParseados` sin importar de dónde salió el precio).

- [ ] **Step 6: Mandar la categoría al guardar**

Dentro de `guardar()`, el `create()` hoy (línea 224-235) empieza así:
```ts
          cot = await pb.collection('cotizaciones').create<Cotizacion>({
            fecha, trafico_origen: traficoOrigen, trafico_destino: traficoDestino, paga_en: pagaEn,
```
Reemplazar esa primera línea del objeto por:
```ts
          cot = await pb.collection('cotizaciones').create<Cotizacion>({
            fecha, categoria, trafico_origen: traficoOrigen, trafico_destino: traficoDestino, paga_en: pagaEn,
```
(el resto de los campos del objeto, de `cliente:` en adelante, no cambia).

- [ ] **Step 7: Actualizar el texto de la lista**

Línea 285 hoy:
```tsx
              <div className="hint">Cotizaciones de carga Seca — <Link to="/comercial/tarifas">ver Cuadro Tarifario</Link>.</div>
```
Reemplazar por:
```tsx
              <div className="hint">Cotizaciones de carga — <Link to="/comercial/tarifas">ver Cuadro Tarifario</Link>.</div>
```

- [ ] **Step 8: Agregar el selector de Categoría al formulario**

El bloque de Fecha/Tráfico Origen/Tráfico Destino/Paga en hoy (líneas 315-336) es:
```tsx
        <div className="row">
          <div className="field"><label>Fecha</label><input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></div>
          <div className="field">
            <label>Tráfico Origen</label>
            <select value={traficoOrigen} onChange={(e) => setTraficoOrigen(e.target.value as Sucursal)}>
              {SUCURSALES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Tráfico Destino</label>
            <select value={traficoDestino} onChange={(e) => setTraficoDestino(e.target.value as Sucursal)}>
              {SUCURSALES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Paga en</label>
            <select value={pagaEn} onChange={(e) => setPagaEn(e.target.value as 'origen' | 'destino')}>
              <option value="origen">Origen</option>
              <option value="destino">Destino</option>
            </select>
          </div>
        </div>
```
Agregar un quinto `.field` para Categoría, justo antes de cerrar ese `</div>` de `row`:
```tsx
        <div className="row">
          <div className="field"><label>Fecha</label><input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></div>
          <div className="field">
            <label>Tráfico Origen</label>
            <select value={traficoOrigen} onChange={(e) => setTraficoOrigen(e.target.value as Sucursal)}>
              {SUCURSALES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Tráfico Destino</label>
            <select value={traficoDestino} onChange={(e) => setTraficoDestino(e.target.value as Sucursal)}>
              {SUCURSALES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Paga en</label>
            <select value={pagaEn} onChange={(e) => setPagaEn(e.target.value as 'origen' | 'destino')}>
              <option value="origen">Origen</option>
              <option value="destino">Destino</option>
            </select>
          </div>
          <div className="field">
            <label>Categoría</label>
            <select value={categoria} onChange={(e) => setCategoria(e.target.value as CategoriaId)}>
              {CATEGORIAS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
        </div>
```

- [ ] **Step 9: Ocultar la columna Mts³ para Frío/Congelado**

El header de la tabla de ítems hoy (línea 372):
```tsx
            <thead><tr><th>Kilos</th><th>Mts³</th><th>Bultos</th><th>Valor Declarado</th><th className="num">Precio</th><th className="num">Total</th><th>Opciones</th></tr></thead>
```
Reemplazar por:
```tsx
            <thead><tr><th>Kilos</th>{categoria === 'seco' && <th>Mts³</th>}<th>Bultos</th><th>Valor Declarado</th><th className="num">Precio</th><th className="num">Total</th><th>Opciones</th></tr></thead>
```
La celda de Mts³ en cada fila hoy (línea 381):
```tsx
                    <td><input inputMode="decimal" value={it.m3} onChange={(e) => actualizarItem(i, 'm3', e.target.value)} style={{ width: 90 }} /></td>
```
Reemplazar por:
```tsx
                    {categoria === 'seco' && <td><input inputMode="decimal" value={it.m3} onChange={(e) => actualizarItem(i, 'm3', e.target.value)} style={{ width: 90 }} /></td>}
```

- [ ] **Step 10: Build**

Run: `cd web && npm run build`
Expected: compila limpio.

- [ ] **Step 11: Verificación manual**

Con el build servido:
1. Entrar a Cotizador → "+ Nueva Cotización". Confirmar que aparece el selector "Categoría" (Seco/Frío/Congelado) junto a Tráfico Origen/Destino/Paga en, en Seco por defecto, y que la tabla de ítems muestra la columna Mts³.
2. Cambiar la categoría a Frío. Confirmar que la columna Mts³ desaparece de la tabla de ítems.
3. Anotar (en Tarifas → Cuadro Tarifario → pestaña Frío) un rango de Kg con un valor cargado, y cargar un ítem en el Cotizador con un Kilos dentro de ese rango. Confirmar que Precio y Total del ítem muestran exactamente ese valor fijo (sin relación con zona de tráfico).
4. Volver a Seco. Confirmar que la columna Mts³ reaparece y que una cotización Seco sigue calculando igual que antes (regresión — comparar contra una cotización Seco ya existente con el mismo tráfico/peso).
5. Guardar una cotización en Frío. Confirmar que se guarda sin error, con numeración correlativa normal (prefijo de sucursal), y que el total respeta el mínimo por sucursal si el flete calculado queda por debajo.
6. Guardar una cotización en Congelado y repetir el mismo chequeo.

- [ ] **Step 12: Commit**

```bash
git add web/src/pages/tarifas/CotizadorPage.tsx
git commit -m "feat: Cotizador - permitir cotizar en Frio y Congelado, no solo Seco"
```

---

### Task 4: Impresión — mostrar la categoría en el encabezado

**Files:**
- Modify: `web/src/pages/tarifas/CotizacionImprimirPage.tsx`

**Interfaces:**
- Consumes: `categoria?: 'seco'|'frio'|'congelado'` de la interfaz `Cotizacion` (Task 1). `CATEGORIAS` de `../../lib/categoriasTarifario` (Task 2).
- Produces: nada que otras tareas consuman.

- [ ] **Step 1: Import**

Línea 7 hoy:
```tsx
import { fechaVencimiento } from './cotizadorMotor';
```
Agregar una línea de import justo debajo:
```tsx
import { CATEGORIAS } from '../../lib/categoriasTarifario';
```

- [ ] **Step 2: Calcular el label de la categoría**

Líneas 45-47 hoy:
```tsx
  const vencimiento = fechaVencimiento(cot.fecha);
  const hoy = isoDate(new Date());
  const estado = hoy > vencimiento ? 'Vencido' : 'Vigente';
```
Agregar una línea justo después:
```tsx
  const vencimiento = fechaVencimiento(cot.fecha);
  const hoy = isoDate(new Date());
  const estado = hoy > vencimiento ? 'Vencido' : 'Vigente';
  const categoriaLabel = CATEGORIAS.find((c) => c.id === cot.categoria)?.label || 'Seco';
```

- [ ] **Step 3: Mostrarlo en el encabezado**

El bloque de encabezado hoy (líneas 75-84):
```tsx
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <div>Cotización: <strong>{cot.numero}</strong></div>
            <div>Fecha: {cot.fecha}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div>Estado: {estado}</div>
            <div>Vencimiento: {vencimiento} (salvo incremento tarifario)</div>
          </div>
        </div>
```
Reemplazar por:
```tsx
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <div>Cotización: <strong>{cot.numero}</strong></div>
            <div>Fecha: {cot.fecha}</div>
            <div>Categoría: {categoriaLabel}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div>Estado: {estado}</div>
            <div>Vencimiento: {vencimiento} (salvo incremento tarifario)</div>
          </div>
        </div>
```

- [ ] **Step 4: Build**

Run: `cd web && npm run build`
Expected: compila limpio.

- [ ] **Step 5: Verificación manual**

Abrir la vista de impresión (`/comercial/cotizador/:id/imprimir`) de una cotización vieja (de antes de esta migración, backfillenada a Seco) y confirmar que muestra "Categoría: Seco". Abrir la vista de impresión de las cotizaciones Frío/Congelado guardadas en la Task 3 y confirmar que muestran "Categoría: Frío" / "Categoría: Congelado" respectivamente. De paso, confirmar que la vista previa de impresión sigue saliendo en 1 página y sin fondo oscuro detrás del diálogo (regresión del fix reciente de `index.css`).

- [ ] **Step 6: Commit**

```bash
git add web/src/pages/tarifas/CotizacionImprimirPage.tsx
git commit -m "feat: mostrar categoria en la impresion de la cotizacion"
```
