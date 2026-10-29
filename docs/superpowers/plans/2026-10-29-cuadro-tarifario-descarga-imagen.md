# Cuadro Tarifario: Descargar como Imagen — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar un botón en Cuadro Tarifario que descarga la categoría activa (Seco/Frío/Congelado) como un archivo PNG con membrete, listo para mandar a clientes.

**Architecture:** Se extraen dos piezas de UI ya existentes (el membrete con logo de Vale de Caja/Recibos, y el render de la tabla de precios de Cuadro Tarifario) a componentes compartidos, se combinan en un bloque nuevo montado siempre fuera de pantalla, y un botón convierte ese bloque a PNG con la librería `html-to-image` y dispara la descarga.

**Tech Stack:** React + TypeScript + Vite (proyecto `web/`). Sin backend/PocketBase involucrado. Sin infraestructura de testing automatizado en el frontend — cada tarea cierra con `npm run build` limpio + verificación manual en el navegador.

## Global Constraints

- Librería nueva: `html-to-image` (confirmado disponible en npm, última versión `1.11.13` al momento de escribir este plan) — pinnear como `"^1.11.13"`, mismo estilo `^` que el resto de `web/package.json`.
- `toPng(nodo, { pixelRatio: 2 })` — sin esto el texto sale borroso en pantallas de alta densidad.
- Nombre de archivo exacto: `` `Tarifario-${label}-${isoDate(new Date())}.png` `` donde `label` es "Seco"/"Frío"/"Congelado" (el mismo `label` que ya usa `CATEGORIAS` en `CuadroTarifarioPage.tsx`).
- Header/membrete: el mismo que ya usan Vale de Caja y Recibos — logo `/vale-logo.jpg` visible (120px) + "SAN LORENZO 31 / 2400 SAN FRANCISCO (Cba.)". NO el estilo de marca de agua del Cotizador.
- La imagen incluye: membrete, título de categoría, fecha de generación, el cuadro de "Mínimo por sucursal", y la tabla de precios completa de la categoría activa.
- Sin restricción de permisos nueva — disponible para cualquiera que ya pueda ver Cuadro Tarifario hoy.
- No se toca ningún archivo de `pb_hooks/` ni `pb_migrations/` — este plan es 100% frontend.

---

## Task 1: Componente compartido `MembreteImpreso`

Hoy `MembreteImpreso` es una función no exportada, copiada idéntica en `web/src/pages/tesoreria/RecibosPage.tsx` (líneas 37-46) y `web/src/pages/tesoreria/ValeCajaPage.tsx` (líneas 37-46). Se extrae a un componente compartido para que el bloque exportable de Cuadro Tarifario (Task 3) también pueda usarlo, sin triplicar el JSX.

De paso, se mueve también la línea de precarga del logo (`new Image().src = '/vale-logo.jpg';`) al nuevo archivo — hoy vive duplicada en ambas páginas con el mismo comentario explicando por qué hace falta (el `window.print()`/`toPng()` puede dispararse antes de que el navegador termine de pedir una imagen recién referenciada). Moverla al componente compartido la deja corriendo una sola vez por los 3 consumidores (incluyendo el nuevo de Task 3), en vez de depender de que cada archivo nuevo se acuerde de repetirla.

**Files:**
- Create: `web/src/components/MembreteImpreso.tsx`
- Modify: `web/src/pages/tesoreria/RecibosPage.tsx`
- Modify: `web/src/pages/tesoreria/ValeCajaPage.tsx`

**Interfaces:**
- Produces: `export function MembreteImpreso(): JSX.Element` — sin props, renderiza el logo + dirección. Usado por Task 3.

- [ ] **Step 1: Crear el componente compartido**

Crear `web/src/components/MembreteImpreso.tsx`:

```tsx
// Precarga el logo del membrete apenas carga este módulo: window.print() /
// toPng() pueden disparar antes de que el navegador termine de pedir una
// imagen recién referenciada -- el primer impreso/descarga de la sesión
// podía salir sin logo. Corre una sola vez por sesión (módulo compartido),
// sin importar cuántas páginas importen este componente.
new Image().src = '/vale-logo.jpg';

export function MembreteImpreso() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <img src="/vale-logo.jpg" alt="" style={{ height: 120 }} />
      <div>
        <div style={{ fontSize: 10, color: '#333' }}>SAN LORENZO 31<br />2400 SAN FRANCISCO (Cba.)</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Actualizar `RecibosPage.tsx`**

Buscar este bloque (líneas 10-16, el comentario + la línea de precarga):

```tsx
const RECIBIDO_DE_DEFAULT = 'Carossio Vairolatti y Cía SRL';

// Precarga el logo del membrete apenas carga el módulo: window.print() dispara
// 50ms después de montar el div de impresión, y Chrome no espera de forma
// confiable una imagen recién pedida en ese momento -- el primer impreso de
// la sesión podía salir sin logo.
new Image().src = '/vale-logo.jpg';
```

Reemplazar por:

```tsx
const RECIBIDO_DE_DEFAULT = 'Carossio Vairolatti y Cía SRL';
```

Agregar el import (junto a los imports existentes, después de `import type { Recibo } from '../../types';`):

```tsx
import { MembreteImpreso } from '../../components/MembreteImpreso';
```

Eliminar la función local completa:

```tsx
function MembreteImpreso() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <img src="/vale-logo.jpg" alt="" style={{ height: 120 }} />
      <div>
        <div style={{ fontSize: 10, color: '#333' }}>SAN LORENZO 31<br />2400 SAN FRANCISCO (Cba.)</div>
      </div>
    </div>
  );
}
```

El resto del archivo (`CopiaRecibo`, etc.) queda igual — sigue usando `<MembreteImpreso />`, ahora resuelto por el import.

- [ ] **Step 3: Actualizar `ValeCajaPage.tsx`**

Mismo cambio: buscar

```tsx
type ValeConChofer = ValeCaja & { expand?: { chofer?: Chofer } };

// Precarga el logo del membrete apenas carga el módulo: window.print() dispara
// 50ms después de montar el div de impresión, y Chrome no espera de forma
// confiable una imagen recién pedida en ese momento -- el primer impreso de
// la sesión podía salir sin logo.
new Image().src = '/vale-logo.jpg';
```

Reemplazar por:

```tsx
type ValeConChofer = ValeCaja & { expand?: { chofer?: Chofer } };
```

Agregar el import (después de `import type { Chofer, ValeCaja } from '../../types';`):

```tsx
import { MembreteImpreso } from '../../components/MembreteImpreso';
```

Eliminar la función local completa (idéntica a la de `RecibosPage.tsx`):

```tsx
function MembreteImpreso() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <img src="/vale-logo.jpg" alt="" style={{ height: 120 }} />
      <div>
        <div style={{ fontSize: 10, color: '#333' }}>SAN LORENZO 31<br />2400 SAN FRANCISCO (Cba.)</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Build**

Run: `cd web && npm run build`
Expected: compila sin errores (`tsc -b && vite build` termina con "built in ...").

- [ ] **Step 5: Verificación manual**

Levantar el servidor de desarrollo (`npm run dev` dentro de `web/`), entrar a Vale de Caja, crear o abrir un vale existente, usar "Imprimir" y confirmar que el membrete (logo + dirección) se sigue viendo exactamente igual que antes. Repetir en Recibos.

- [ ] **Step 6: Commit**

```bash
git add web/src/components/MembreteImpreso.tsx web/src/pages/tesoreria/RecibosPage.tsx web/src/pages/tesoreria/ValeCajaPage.tsx
git commit -m "Extraer MembreteImpreso a componente compartido"
```

---

## Task 2: Componente compartido `TablaCuadro`

Hoy el render de la tabla de precios vive inline en `CuadroTarifarioPage.tsx` (dos variantes: la de Seco, con 10 columnas de zona, y la simple de Frío/Congelado). Se extrae a un componente propio para que la vista en pantalla y el bloque exportable (Task 3) usen exactamente el mismo render — si el cuadro cambia de forma en el futuro, no hay que acordarse de actualizar dos lugares.

**Files:**
- Create: `web/src/pages/tarifas/TablaCuadro.tsx`
- Modify: `web/src/pages/tarifas/CuadroTarifarioPage.tsx`

**Interfaces:**
- Produces: `export function TablaCuadro({ categoria, filas }: { categoria: CuadroTarifarioFila['categoria']; filas: CuadroTarifarioFila[] }): JSX.Element`. Usado por `CuadroTarifarioPage.tsx` (Task 2) y `CuadroTarifarioExport.tsx` (Task 3).

- [ ] **Step 1: Crear el componente compartido**

Crear `web/src/pages/tarifas/TablaCuadro.tsx`:

```tsx
import { money } from '../../lib/format';
import type { CuadroTarifarioFila } from '../../types';

// Orden fijo de las 10 combinaciones de zona -- igual que en el sistema de
// terceros, NO es alfabetico (ver spec). C=Cordoba, S=San Francisco,
// R=Rosario, B=Buenos Aires.
const COLUMNAS_ZONA: { key: string; label: string }[] = [
  { key: 'CC', label: 'C⇄C' }, { key: 'CS', label: 'C⇄S' },
  { key: 'CR', label: 'C⇄R' }, { key: 'CB', label: 'C⇄B' },
  { key: 'RR', label: 'R⇄R' }, { key: 'RS', label: 'R⇄S' },
  { key: 'RB', label: 'R⇄B' }, { key: 'SS', label: 'S⇄S' },
  { key: 'SB', label: 'S⇄B' }, { key: 'BB', label: 'B⇄B' },
];

export function TablaCuadro({ categoria, filas }: { categoria: CuadroTarifarioFila['categoria']; filas: CuadroTarifarioFila[] }) {
  if (categoria === 'seco') {
    return (
      <table>
        <thead>
          <tr>
            <th>Rango (Kg)</th><th>Rango (m³)</th><th>Unidad</th>
            {COLUMNAS_ZONA.map((c) => <th key={c.key} className="num">{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.id}>
              <td>{f.rango_kg_desde} a {f.rango_kg_hasta} Kg</td>
              <td>{f.rango_m3_desde} a {f.rango_m3_hasta} Mts³</td>
              <td>
                {f.por_unidad && <span className="badge" style={{ color: 'var(--warn)', borderColor: 'var(--warn)' }} title="El valor es precio por Kg, no un monto fijo por banda">Por Kg</span>}
              </td>
              {COLUMNAS_ZONA.map((c) => <td key={c.key} className="num">{money(f.valores?.[c.key])}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  return (
    <table>
      <thead><tr><th>Desde (Kg)</th><th>Hasta (Kg)</th><th className="num">Valor</th></tr></thead>
      <tbody>
        {filas.map((f) => (
          <tr key={f.id}>
            <td>{f.rango_kg_desde}</td>
            <td>{f.rango_kg_hasta}</td>
            <td className="num">{money(f.valor)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 2: Refactorizar `CuadroTarifarioPage.tsx`**

Quitar la constante `COLUMNAS_ZONA` (líneas 10-19 del archivo actual — ya no se usa en esta página, se movió a `TablaCuadro.tsx`):

```tsx
// Orden fijo de las 10 combinaciones de zona -- igual que en el sistema de
// terceros, NO es alfabetico (ver spec). C=Cordoba, S=San Francisco,
// R=Rosario, B=Buenos Aires.
const COLUMNAS_ZONA: { key: string; label: string }[] = [
  { key: 'CC', label: 'C⇄C' }, { key: 'CS', label: 'C⇄S' },
  { key: 'CR', label: 'C⇄R' }, { key: 'CB', label: 'C⇄B' },
  { key: 'RR', label: 'R⇄R' }, { key: 'RS', label: 'R⇄S' },
  { key: 'RB', label: 'R⇄B' }, { key: 'SS', label: 'S⇄S' },
  { key: 'SB', label: 'S⇄B' }, { key: 'BB', label: 'B⇄B' },
];
```

Agregar el import, junto a `import type { CuadroTarifarioFila, CuadroTarifarioMinimos } from '../../types';`:

```tsx
import { TablaCuadro } from './TablaCuadro';
```

Reemplazar el bloque de la tabla (el `<div className="table-wrap" ...>` completo, con las dos variantes de `<table>` inline):

```tsx
        <div className="table-wrap" style={{ marginTop: 10, maxHeight: '70vh' }}>
          {tab === 'seco' ? (
            <table>
              <thead>
                <tr>
                  <th>Rango (Kg)</th><th>Rango (m³)</th><th>Unidad</th>
                  {COLUMNAS_ZONA.map((c) => <th key={c.key} className="num">{c.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {filasTab.map((f) => (
                  <tr key={f.id}>
                    <td>{f.rango_kg_desde} a {f.rango_kg_hasta} Kg</td>
                    <td>{f.rango_m3_desde} a {f.rango_m3_hasta} Mts³</td>
                    <td>
                      {f.por_unidad && <span className="badge" style={{ color: 'var(--warn)', borderColor: 'var(--warn)' }} title="El valor es precio por Kg, no un monto fijo por banda">Por Kg</span>}
                    </td>
                    {COLUMNAS_ZONA.map((c) => <td key={c.key} className="num">{money(f.valores?.[c.key])}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table>
              <thead><tr><th>Desde (Kg)</th><th>Hasta (Kg)</th><th className="num">Valor</th></tr></thead>
              <tbody>
                {filasTab.map((f) => (
                  <tr key={f.id}>
                    <td>{f.rango_kg_desde}</td>
                    <td>{f.rango_kg_hasta}</td>
                    <td className="num">{money(f.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!cargando && filasTab.length === 0 && <div className="empty">Sin datos para esta categoría.</div>}
        </div>
```

por:

```tsx
        <div className="table-wrap" style={{ marginTop: 10, maxHeight: '70vh' }}>
          <TablaCuadro categoria={tab} filas={filasTab} />
          {!cargando && filasTab.length === 0 && <div className="empty">Sin datos para esta categoría.</div>}
        </div>
```

(El import de `money` en `CuadroTarifarioPage.tsx` sigue haciendo falta — todavía se usa en el bloque de "Mínimo por sucursal" más arriba en el archivo.)

- [ ] **Step 3: Build**

Run: `cd web && npm run build`
Expected: compila sin errores.

- [ ] **Step 4: Verificación manual**

Entrar a Cuadro Tarifario en el navegador, click en cada una de las 3 pestañas (Seco, Frío, Congelado) y confirmar que las tablas se ven exactamente igual que antes del refactor (mismas columnas, mismos valores, el badge "Por Kg" donde corresponda).

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/tarifas/TablaCuadro.tsx web/src/pages/tarifas/CuadroTarifarioPage.tsx
git commit -m "Extraer TablaCuadro a componente compartido"
```

---

## Task 3: Botón "Descargar imagen"

Con los dos componentes compartidos ya listos (Tasks 1 y 2), se agrega la dependencia `html-to-image`, el bloque exportable nuevo, y el botón que los conecta.

**Files:**
- Modify: `web/package.json`
- Create: `web/src/pages/tarifas/CuadroTarifarioExport.tsx`
- Modify: `web/src/pages/tarifas/CuadroTarifarioPage.tsx`

**Interfaces:**
- Consumes: `MembreteImpreso` (Task 1, sin props), `TablaCuadro` (Task 2, props `{ categoria, filas }`).
- Produces: `export function CuadroTarifarioExport({ categoria, filas, minimos }: { categoria: CuadroTarifarioFila['categoria']; filas: CuadroTarifarioFila[]; minimos: CuadroTarifarioMinimos | null }): JSX.Element`.

- [ ] **Step 1: Agregar la dependencia**

Run: `cd web && npm install html-to-image@^1.11.13`

Expected: `web/package.json` queda con esta línea nueva en `"dependencies"` (orden alfabético, entre `"html-to-image"` y las existentes):

```json
    "html-to-image": "^1.11.13",
```

y `web/package-lock.json` se actualiza solo.

- [ ] **Step 2: Crear el bloque exportable**

Crear `web/src/pages/tarifas/CuadroTarifarioExport.tsx`:

```tsx
import { money, isoDate, fechaSola } from '../../lib/format';
import { MembreteImpreso } from '../../components/MembreteImpreso';
import { TablaCuadro } from './TablaCuadro';
import type { CuadroTarifarioFila, CuadroTarifarioMinimos } from '../../types';

const CATEGORIA_LABEL: Record<CuadroTarifarioFila['categoria'], string> = {
  seco: 'Seco', frio: 'Frío', congelado: 'Congelado',
};

// Bloque usado SOLO para generar la imagen descargable (CuadroTarifarioPage.tsx
// lo monta siempre fuera de pantalla) -- no es parte de la vista normal en
// pantalla, por eso no tiene el scroll/maxHeight de "table-wrap" ni el
// mensaje de "sin datos": si no hay filas para la categoria, la tabla sale
// vacia en la imagen, que es una situacion que no deberia darse (el boton
// de descarga esta en la misma pantalla que ya muestra esas filas).
export function CuadroTarifarioExport({ categoria, filas, minimos }: {
  categoria: CuadroTarifarioFila['categoria'];
  filas: CuadroTarifarioFila[];
  minimos: CuadroTarifarioMinimos | null;
}) {
  return (
    <div style={{ background: '#fff', padding: 24, fontFamily: 'Arial, sans-serif', fontSize: 12, color: '#000' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 20 }}>
        <MembreteImpreso />
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontWeight: 700, fontSize: 18 }}>Tarifario — {CATEGORIA_LABEL[categoria]}</div>
          <div style={{ fontSize: 10, color: '#333' }}>Generado el {fechaSola(isoDate(new Date()))}</div>
        </div>
      </div>

      {minimos && (
        <div style={{ border: '1px solid #999', borderRadius: 6, padding: '12px 20px', marginTop: 16 }}>
          <div style={{ marginBottom: 8, fontWeight: 700, textAlign: 'center' }}>Mínimo por sucursal</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', rowGap: 8, columnGap: 24, justifyItems: 'center' }}>
            <div>San Francisco: {money(minimos.san_francisco)}</div>
            <div>Córdoba: {money(minimos.cordoba)}</div>
            <div>Buenos Aires: {money(minimos.buenos_aires)}</div>
            <div>Rosario: {money(minimos.rosario)}</div>
          </div>
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <TablaCuadro categoria={categoria} filas={filas} />
      </div>
    </div>
  );
}
```

Nota: no se fija un `width` en el div raíz a propósito — al estar `position: absolute` y sin `right` definido (ver Step 4), el navegador lo dimensiona al ancho natural de su contenido, así la tabla de Seco (13 columnas) nunca queda recortada por un ancho fijo demasiado angosto.

`fechaSola(isoDate(new Date()))` da la fecha de hoy en formato `DD/MM/AAAA`: `isoDate()` devuelve `AAAA-MM-DD` y `fechaSola()` toma justo ese formato como entrada y lo reordena — mismos helpers que ya existen en `web/src/lib/format.ts`, sin agregar ninguno nuevo.

- [ ] **Step 3: Conectar el botón en `CuadroTarifarioPage.tsx`**

Agregar a los imports (reemplazar la línea `import { useEffect, useState } from 'react';` y agregar las nuevas):

```tsx
import { useEffect, useRef, useState } from 'react';
import { toPng } from 'html-to-image';
```

(el resto de los imports existentes quedan igual, y se agrega después de `import { TablaCuadro } from './TablaCuadro';`):

```tsx
import { CuadroTarifarioExport } from './CuadroTarifarioExport';
```

Agregar `isoDate` al import existente de `lib/format` (queda `import { money, isoDate } from '../../lib/format';`).

Agregar estado nuevo, junto a los `useState` existentes dentro de `CuadroTarifarioPage`:

```tsx
  const exportRef = useRef<HTMLDivElement>(null);
  const [generando, setGenerando] = useState(false);
```

Agregar la función, junto a `aplicarPorcentaje` (antes de `const filasTab = ...`):

```tsx
  async function descargarImagen() {
    if (!exportRef.current) return;
    setGenerando(true);
    try {
      const dataUrl = await toPng(exportRef.current, { pixelRatio: 2 });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `Tarifario-${CATEGORIAS.find((c) => c.id === tab)!.label}-${isoDate(new Date())}.png`;
      a.click();
    } catch (e) {
      toast('No se pudo generar la imagen: ' + (e instanceof Error ? e.message : ''), 'err');
    } finally {
      setGenerando(false);
    }
  }
```

Modificar la fila de pestañas para agregar el botón al lado:

Buscar:

```tsx
        <div className="row" style={{ marginTop: 12 }}>
          {CATEGORIAS.map((c) => (
            <button key={c.id} className={tab === c.id ? 'small' : 'small secondary'} onClick={() => setTab(c.id)}>{c.label}</button>
          ))}
        </div>
```

Reemplazar por:

```tsx
        <div className="row" style={{ marginTop: 12 }}>
          {CATEGORIAS.map((c) => (
            <button key={c.id} className={tab === c.id ? 'small' : 'small secondary'} onClick={() => setTab(c.id)}>{c.label}</button>
          ))}
          <button className="small secondary" onClick={descargarImagen} disabled={generando || cargando}>
            {generando ? 'Generando…' : 'Descargar imagen'}
          </button>
        </div>
```

Montar el bloque exportable siempre, fuera de pantalla — agregar justo antes del `</main>` final del componente:

Buscar:

```tsx
          {!cargando && filasTab.length === 0 && <div className="empty">Sin datos para esta categoría.</div>}
        </div>
      </div>
    </main>
  );
}
```

Reemplazar por:

```tsx
          {!cargando && filasTab.length === 0 && <div className="empty">Sin datos para esta categoría.</div>}
        </div>
      </div>
      <div ref={exportRef} style={{ position: 'absolute', left: -9999, top: 0 }}>
        <CuadroTarifarioExport categoria={tab} filas={filasTab} minimos={minimos} />
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Build**

Run: `cd web && npm run build`
Expected: compila sin errores.

- [ ] **Step 5: Verificación manual**

Levantar `npm run dev`, entrar a Cuadro Tarifario:
1. En la pestaña Seco, click "Descargar imagen". Abrir el PNG descargado (carpeta Descargas, nombre `Tarifario-Seco-<fecha-de-hoy>.png`) y confirmar: se ve el logo y la dirección arriba a la izquierda, "Tarifario — Seco" y la fecha de hoy arriba a la derecha, el cuadro de mínimos, y la tabla completa de las 10 columnas de zona sin recortar ningún borde.
2. Repetir en la pestaña Frío — confirmar título "Tarifario — Frío" y que la tabla sea la simple (Desde/Hasta/Valor).
3. Repetir en Congelado.
4. Mientras se genera cada imagen, confirmar que el botón pasa a decir "Generando…" y queda deshabilitado brevemente.

- [ ] **Step 6: Commit**

```bash
git add web/package.json web/package-lock.json web/src/pages/tarifas/CuadroTarifarioExport.tsx web/src/pages/tarifas/CuadroTarifarioPage.tsx
git commit -m "Cuadro Tarifario: boton para descargar la categoria activa como imagen"
```
