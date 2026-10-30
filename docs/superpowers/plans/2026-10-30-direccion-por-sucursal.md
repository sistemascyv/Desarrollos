# Dirección por sucursal en el membrete — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El logo + dirección que aparece en Vale de Caja, Recibos, Cotización y la imagen del Cuadro Tarifario muestra la dirección de la sucursal real del documento, no siempre la de San Francisco.

**Architecture:** Una tabla única (`DIRECCION_SUCURSAL`) con las 4 direcciones. `MembreteImpreso` pasa a recibir la sucursal como prop y busca en esa tabla. Cada consumidor le pasa la sucursal que ya tiene disponible: el propio registro (vale/recibo/cotización, todos ya tienen `sucursal` desde el proyecto de segmentación) o, para el Cuadro Tarifario (sin sucursal propia), la del usuario que descarga la imagen.

**Tech Stack:** React + TypeScript + Vite. Proyecto 100% frontend — no toca backend/PocketBase (los campos `sucursal` que se consumen ya existen en el backend desde el proyecto de segmentación por sucursal).

## Global Constraints

- Direcciones exactas a usar (ningún otro texto, ninguna variación):
  - `san_francisco`: calle `San Lorenzo 31`, localidad `San Francisco`
  - `cordoba`: calle `Celso Barrios 3779`, localidad `Córdoba Capital`
  - `rosario`: calle `Centro 27 - San Nicolás 3151`, localidad `Rosario`
  - `buenos_aires`: calle `Av. 27 de Febrero 5631`, localidad `Villa Soldati (C.A.B.A.)`
- Buenos Aires siempre muestra Villa Soldati — nunca el depósito Cortejarena, sin importar la categoría de la cotización.
- Sin sucursal (registro viejo, o usuario/admin sin sucursal cargada): default a `san_francisco`.
- El logo (`/vale-logo.jpg`) no cambia. CUIT/Ingresos Brutos de `CotizacionImprimirPage.tsx` no cambian — es la misma razón social para las 4 sucursales.
- No hay tests automatizados de frontend. Build: `npm run build` desde `web/` (`tsc -b && vite build`) debe quedar limpio al final de cada tarea. No hay navegador disponible en este entorno de desarrollo — verificación manual descripta paso a paso, queda pendiente de una pasada del usuario.

---

## File Structure

- **Create:** `web/src/lib/direccionesSucursal.ts` — tabla `DIRECCION_SUCURSAL` con las 4 direcciones.
- **Modify:** `web/src/types.ts` — agrega `sucursal?: Sucursal` a las interfaces `ValeCaja` y `Recibo` (que `Cotizacion` ya tiene).
- **Modify:** `web/src/components/MembreteImpreso.tsx` — recibe `sucursal?: Sucursal` como prop, muestra la dirección correspondiente.
- **Modify:** `web/src/pages/tesoreria/ValeCajaPage.tsx` — pasa `sucursal={v.sucursal}` al `MembreteImpreso` dentro de `CopiaVale`.
- **Modify:** `web/src/pages/tesoreria/RecibosPage.tsx` — pasa `sucursal={r.sucursal}` al `MembreteImpreso` dentro de `CopiaRecibo`.
- **Modify:** `web/src/pages/tarifas/CuadroTarifarioExport.tsx` — recibe `sucursal?: Sucursal` como prop nueva, se la pasa al `MembreteImpreso`.
- **Modify:** `web/src/pages/tarifas/CuadroTarifarioPage.tsx` — lee `usuario` de `useAuth()` y se lo pasa a `CuadroTarifarioExport` como `sucursal={usuario?.sucursal}`.
- **Modify:** `web/src/pages/tarifas/CotizacionImprimirPage.tsx` — su encabezado propio (sin `MembreteImpreso`, es texto solo) lee `DIRECCION_SUCURSAL[cot.sucursal || 'san_francisco']` directamente.

---

### Task 1: Tabla de direcciones + tipos TS

**Files:**
- Create: `web/src/lib/direccionesSucursal.ts`
- Modify: `web/src/types.ts` (interfaces `ValeCaja` líneas 15-28 y `Recibo` líneas 30-38)

**Interfaces:**
- Produces: `DIRECCION_SUCURSAL: Record<Sucursal, { calle: string; localidad: string }>` exportado desde `web/src/lib/direccionesSucursal.ts`. `sucursal?: Sucursal` en las interfaces `ValeCaja` y `Recibo`. Las Tasks 2 y 3 consumen ambos.

- [ ] **Step 1: Crear la tabla de direcciones**

Crear `web/src/lib/direccionesSucursal.ts`:

```ts
import type { Sucursal } from '../types';

export const DIRECCION_SUCURSAL: Record<Sucursal, { calle: string; localidad: string }> = {
  san_francisco: { calle: 'San Lorenzo 31', localidad: 'San Francisco' },
  cordoba: { calle: 'Celso Barrios 3779', localidad: 'Córdoba Capital' },
  rosario: { calle: 'Centro 27 - San Nicolás 3151', localidad: 'Rosario' },
  buenos_aires: { calle: 'Av. 27 de Febrero 5631', localidad: 'Villa Soldati (C.A.B.A.)' },
};
```

- [ ] **Step 2: Agregar `sucursal` a `ValeCaja`**

En `web/src/types.ts`, la interfaz `ValeCaja` hoy es (líneas 15-28):

```ts
export interface ValeCaja extends BaseRecord {
  numero: number;
  fecha: string;
  chofer: string;
  nombre_firma?: string;
  importe: number;
  moneda: 'ARS' | 'BRL' | 'USD';
  observacion1?: string;
  observacion2?: string;
  usado: boolean;
  periodo_desde?: string; // "YYYY-MM-DD", rango de la rendición que lo usó -- vacío si no está usado
  periodo_hasta?: string;
  creado_por?: string;
}
```

Agregar `sucursal?: Sucursal;` después de `creado_por?: string;`:

```ts
export interface ValeCaja extends BaseRecord {
  numero: number;
  fecha: string;
  chofer: string;
  nombre_firma?: string;
  importe: number;
  moneda: 'ARS' | 'BRL' | 'USD';
  observacion1?: string;
  observacion2?: string;
  usado: boolean;
  periodo_desde?: string; // "YYYY-MM-DD", rango de la rendición que lo usó -- vacío si no está usado
  periodo_hasta?: string;
  creado_por?: string;
  sucursal?: Sucursal;
}
```

- [ ] **Step 3: Agregar `sucursal` a `Recibo`**

En el mismo archivo, la interfaz `Recibo` hoy es (líneas 30-38):

```ts
export interface Recibo extends BaseRecord {
  numero: number;
  fecha: string;
  recibido_de: string;
  importe: number;
  moneda: 'ARS' | 'USD';
  concepto?: string;
  creado_por?: string;
}
```

Agregar `sucursal?: Sucursal;` después de `creado_por?: string;`:

```ts
export interface Recibo extends BaseRecord {
  numero: number;
  fecha: string;
  recibido_de: string;
  importe: number;
  moneda: 'ARS' | 'USD';
  concepto?: string;
  creado_por?: string;
  sucursal?: Sucursal;
}
```

(El tipo `Sucursal` ya está declarado más abajo en el mismo archivo, línea 123 — TypeScript no tiene problema con el orden de declaración dentro de un mismo archivo.)

- [ ] **Step 4: Build**

Run: `cd web && npm run build`
Expected: compila limpio (los campos nuevos son opcionales y sin uso todavía).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/direccionesSucursal.ts web/src/types.ts
git commit -m "feat: tabla de direcciones por sucursal + campo sucursal en ValeCaja/Recibo"
```

---

### Task 2: `MembreteImpreso` + sus 3 consumidores (Vale de Caja, Recibos, Cuadro Tarifario)

**Files:**
- Modify: `web/src/components/MembreteImpreso.tsx`
- Modify: `web/src/pages/tesoreria/ValeCajaPage.tsx` (función `CopiaVale`)
- Modify: `web/src/pages/tesoreria/RecibosPage.tsx` (función `CopiaRecibo`)
- Modify: `web/src/pages/tarifas/CuadroTarifarioExport.tsx`
- Modify: `web/src/pages/tarifas/CuadroTarifarioPage.tsx`

**Interfaces:**
- Consumes: `DIRECCION_SUCURSAL` de `../lib/direccionesSucursal` (Task 1). `sucursal?: Sucursal` en `ValeCaja`/`Recibo` (Task 1).
- Produces: `MembreteImpreso({ sucursal?: Sucursal })` — nueva prop opcional. `CuadroTarifarioExport` gana una prop nueva `sucursal?: Sucursal`.

- [ ] **Step 1: `MembreteImpreso.tsx`**

El contenido completo actual es:

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

Reemplazarlo por:

```tsx
import type { Sucursal } from '../types';
import { DIRECCION_SUCURSAL } from '../lib/direccionesSucursal';

// Precarga el logo del membrete apenas carga este módulo: window.print() /
// toPng() pueden disparar antes de que el navegador termine de pedir una
// imagen recién referenciada -- el primer impreso/descarga de la sesión
// podía salir sin logo. Corre una sola vez por sesión (módulo compartido),
// sin importar cuántas páginas importen este componente.
new Image().src = '/vale-logo.jpg';

export function MembreteImpreso({ sucursal }: { sucursal?: Sucursal }) {
  const direccion = DIRECCION_SUCURSAL[sucursal || 'san_francisco'];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <img src="/vale-logo.jpg" alt="" style={{ height: 120 }} />
      <div>
        <div style={{ fontSize: 10, color: '#333', textTransform: 'uppercase' }}>{direccion.calle}<br />{direccion.localidad}</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: `ValeCajaPage.tsx` — pasar la sucursal del vale**

En `web/src/pages/tesoreria/ValeCajaPage.tsx`, dentro de la función `CopiaVale` (alrededor de la línea 37), la línea hoy es:

```tsx
        <MembreteImpreso />
```

Reemplazarla por:

```tsx
        <MembreteImpreso sucursal={v.sucursal} />
```

(`v` ya es el parámetro de `CopiaVale({ v, etiqueta }: { v: ValeConChofer; etiqueta: string })`, y `ValeConChofer = ValeCaja & {...}` ya incluye `sucursal` gracias a la Task 1 — no hace falta ningún otro cambio en este archivo.)

- [ ] **Step 3: `RecibosPage.tsx` — pasar la sucursal del recibo**

En `web/src/pages/tesoreria/RecibosPage.tsx`, dentro de la función `CopiaRecibo` (línea 37), la línea hoy es:

```tsx
        <MembreteImpreso />
```

Reemplazarla por:

```tsx
        <MembreteImpreso sucursal={r.sucursal} />
```

(`r` ya es el parámetro de `CopiaRecibo({ r, etiqueta }: { r: Recibo; etiqueta: string })` — no hace falta ningún otro cambio en este archivo.)

- [ ] **Step 4: `CuadroTarifarioExport.tsx` — nueva prop `sucursal`**

El import de tipos hoy (línea 5) es:

```tsx
import type { CuadroTarifarioFila, CuadroTarifarioMinimos } from '../../types';
```

Reemplazarlo por:

```tsx
import type { CuadroTarifarioFila, CuadroTarifarioMinimos, Sucursal } from '../../types';
```

La firma del componente hoy es:

```tsx
export function CuadroTarifarioExport({ categoria, filas, minimos }: {
  categoria: CuadroTarifarioFila['categoria'];
  filas: CuadroTarifarioFila[];
  minimos: CuadroTarifarioMinimos | null;
}) {
```

Reemplazarla por:

```tsx
export function CuadroTarifarioExport({ categoria, filas, minimos, sucursal }: {
  categoria: CuadroTarifarioFila['categoria'];
  filas: CuadroTarifarioFila[];
  minimos: CuadroTarifarioMinimos | null;
  sucursal?: Sucursal;
}) {
```

Dentro del JSX, la línea con `<MembreteImpreso />` hoy es:

```tsx
        <MembreteImpreso />
```

Reemplazarla por:

```tsx
        <MembreteImpreso sucursal={sucursal} />
```

- [ ] **Step 5: `CuadroTarifarioPage.tsx` — pasar la sucursal del usuario logueado**

La línea hoy es:

```tsx
  const { isAdmin } = useAuth();
```

Reemplazarla por:

```tsx
  const { isAdmin, usuario } = useAuth();
```

Más abajo, donde se monta `CuadroTarifarioExport` (dentro del bloque fuera de pantalla usado para la descarga de imagen), la línea hoy es:

```tsx
          <CuadroTarifarioExport categoria={tab} filas={filasTab} minimos={minimos} />
```

Reemplazarla por:

```tsx
          <CuadroTarifarioExport categoria={tab} filas={filasTab} minimos={minimos} sucursal={usuario?.sucursal} />
```

- [ ] **Step 6: Build**

Run: `cd web && npm run build`
Expected: compila limpio.

- [ ] **Step 7: Verificación manual**

No hay navegador disponible en este entorno — verificar por lectura de código: confirmar que `v.sucursal`/`r.sucursal`/`usuario?.sucursal` son todos de tipo `Sucursal | undefined` (compatibles con la prop opcional de `MembreteImpreso`), y que no quedó ningún `<MembreteImpreso />` sin la prop `sucursal` en ninguno de los 3 archivos modificados (`grep -n "<MembreteImpreso" web/src/pages/tesoreria/ValeCajaPage.tsx web/src/pages/tesoreria/RecibosPage.tsx web/src/pages/tarifas/CuadroTarifarioExport.tsx` — las 3 líneas deben tener `sucursal={...}`).

- [ ] **Step 8: Commit**

```bash
git add web/src/components/MembreteImpreso.tsx web/src/pages/tesoreria/ValeCajaPage.tsx web/src/pages/tesoreria/RecibosPage.tsx web/src/pages/tarifas/CuadroTarifarioExport.tsx web/src/pages/tarifas/CuadroTarifarioPage.tsx
git commit -m "feat: MembreteImpreso muestra la direccion de la sucursal real (Vale de Caja, Recibos, Cuadro Tarifario)"
```

---

### Task 3: Encabezado de impresión de Cotización

**Files:**
- Modify: `web/src/pages/tarifas/CotizacionImprimirPage.tsx`

**Interfaces:**
- Consumes: `DIRECCION_SUCURSAL` de `../../lib/direccionesSucursal` (Task 1). `Cotizacion.sucursal` (ya existe, agregado en el proyecto de segmentación).
- Produces: nada que otras tareas consuman.

- [ ] **Step 1: Import**

La línea 8 hoy es:

```tsx
import { CATEGORIAS } from '../../lib/categoriasTarifario';
```

Agregar una línea nueva de import justo debajo:

```tsx
import { DIRECCION_SUCURSAL } from '../../lib/direccionesSucursal';
```

- [ ] **Step 2: Calcular la dirección**

La línea 49 hoy es:

```tsx
  const categoriaLabel = CATEGORIAS.find((c) => c.id === cot.categoria)?.label || 'Seco';
```

Agregar una línea justo después:

```tsx
  const categoriaLabel = CATEGORIAS.find((c) => c.id === cot.categoria)?.label || 'Seco';
  const direccion = DIRECCION_SUCURSAL[cot.sucursal || 'san_francisco'];
```

- [ ] **Step 3: Mostrarla en el encabezado**

El bloque del encabezado hoy (líneas 70-75) es:

```tsx
        <div style={{ textAlign: 'right', fontSize: 11 }}>
          <div>Carossio, Vairolatti &amp; Cía S.R.L.</div>
          <div>San Lorenzo 31</div>
          <div>San Francisco</div>
          <div>CUIT: 30-54057342-1 - Ing. Brutos: 904-249209-7</div>
        </div>
```

Reemplazar por:

```tsx
        <div style={{ textAlign: 'right', fontSize: 11 }}>
          <div>Carossio, Vairolatti &amp; Cía S.R.L.</div>
          <div>{direccion.calle}</div>
          <div>{direccion.localidad}</div>
          <div>CUIT: 30-54057342-1 - Ing. Brutos: 904-249209-7</div>
        </div>
```

(CUIT/Ingresos Brutos no cambian — es la misma razón social en las 4 sucursales.)

- [ ] **Step 4: Build**

Run: `cd web && npm run build`
Expected: compila limpio.

- [ ] **Step 5: Verificación manual**

No hay navegador disponible en este entorno — verificar por lectura de código: `cot.sucursal` es de tipo `Sucursal | undefined` según la interfaz `Cotizacion` (confirmar leyendo `web/src/types.ts`), compatible con el índice de `DIRECCION_SUCURSAL[cot.sucursal || 'san_francisco']`. Confirmar que CUIT/Ingresos Brutos (línea sin cambios) siguen apareciendo exactamente igual que antes.

- [ ] **Step 6: Commit**

```bash
git add web/src/pages/tarifas/CotizacionImprimirPage.tsx
git commit -m "feat: impresion de cotizacion muestra la direccion de su propia sucursal"
```
