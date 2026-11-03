# Tests automáticos frontend (primera vuelta, funciones puras de lib/) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar la primera infraestructura de tests automáticos al proyecto (Vitest) y cubrir con tests las funciones puras de `web/src/lib/` (`cuit.ts`, `numeroEnLetras.ts`, `format.ts`), integrando la corrida de tests como paso obligatorio en ambos pipelines de CI.

**Architecture:** Vitest co-ubicado (`<nombre>.test.ts` al lado de `<nombre>.ts`), sin configuración adicional (glob de test files por convención). A diferencia del TDD clásico, estas funciones ya existen y son correctas — no hay paso de "implementación": cada tarea escribe el test contra la función ya existente y lo corre esperando que pase de entrada (test de caracterización, no desarrollo guiado por test). El único código de producción que cambia es `package.json` (nuevo script `test`) y los dos workflows de GitHub Actions (nuevo paso `npm run test`).

**Tech Stack:** Vitest ^5.1.0 (devDependency nueva). Sin `jsdom` ni `@testing-library/react` — las funciones en alcance no tocan DOM ni React.

## Global Constraints

- Alcance de tests: únicamente `web/src/lib/cuit.ts`, `web/src/lib/numeroEnLetras.ts`, `web/src/lib/format.ts`. Nada de `pb_hooks/`, componentes/páginas React, ni `categoriasTarifario.ts`/`direccionesSucursal.ts` (son datos puros sin lógica).
- Tests co-ubicados: `<nombre>.test.ts` junto a `<nombre>.ts`, sin config custom de Vitest (default glob).
- Script nuevo en `web/package.json`: `"test": "vitest run"`.
- CI: paso `npm run test` agregado en `.github/workflows/deploy.yml` y `.github/workflows/deploy-staging.yml`, inmediatamente después del paso "Lint" y antes de "Compilar el frontend" — mismo criterio que el lint (si falla, corta el pipeline antes de build/deploy).
- No agregar coverage thresholds, watch mode, ni UI de Vitest (YAGNI — no pedido por el spec).
- `uid()` de `format.ts` no es determinístico (usa `Date.now()`/`Math.random()`): solo se valida el formato del string devuelto, no un valor exacto.
- `fechaHora()` de `format.ts` formatea con `toLocaleString('es-AR', ...)`, lo que depende de la zona horaria del proceso que corre el test — el runner de GitHub Actions corre en UTC por defecto, distinto de la zona horaria de Argentina (UTC-3) que asume el código. El test de `fechaHora()` DEBE fijar `process.env.TZ = 'America/Argentina/Buenos_Aires';` como primera línea del archivo de test, antes de cualquier otra importación, para que el resultado sea el mismo en cualquier máquina/CI.
- `money()` de `format.ts` usa `toLocaleString('es-AR', { style: 'currency', ... })`, que intercala un espacio Unicode NBSP (no un espacio común) entre `$` y el número — los tests de `money()` usan `toContain(...)` sobre fragmentos del string, nunca igualdad exacta contra un literal con espacio común, para no fallar por ese carácter invisible.

---

### Task 1: Setup de Vitest + tests de `cuit.ts`

**Files:**
- Modify: `web/package.json` (agregar devDependency `vitest` y script `test`)
- Create: `web/src/lib/cuit.test.ts`

**Interfaces:**
- Consumes: exports existentes de `web/src/lib/cuit.ts` — `esCuitValido(cuit: string): boolean`, `tipoPersonaPorCuit(cuit: string): 'Física' | 'Jurídica' | null`, `situacionADias(situacion: number): string`, `tipoSociedadDeDenominacion(denominacion: string | null): string | null`, `extraerCandidatosCuit(textoOcr: string): CandidatoCuit[]`, `extraerChequesDeLineas(lineas: string[]): ChequeDetectado[]`.
- Produces: script `npm run test` en `web/package.json` (consumido por Task 4's workflows), devDependency `vitest` instalada (consumida por Tasks 2 y 3).

- [ ] **Step 1: Instalar Vitest**

```bash
cd web && npm install -D vitest@^5.1.0
```

- [ ] **Step 2: Agregar el script `test` a `web/package.json`**

En `web/package.json`, dentro de `"scripts"`, agregar la entrada `"test"` (manteniendo las existentes `dev`, `build`, `lint`, `preview`):

```json
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "oxlint",
    "test": "vitest run",
    "preview": "vite preview"
  },
```

- [ ] **Step 3: Escribir `web/src/lib/cuit.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import {
  esCuitValido,
  tipoPersonaPorCuit,
  situacionADias,
  tipoSociedadDeDenominacion,
  extraerCandidatosCuit,
  extraerChequesDeLineas,
} from './cuit';

describe('esCuitValido', () => {
  it('acepta un CUIT válido de persona física', () => {
    expect(esCuitValido('20123456786')).toBe(true);
  });

  it('acepta un CUIT válido de persona jurídica', () => {
    expect(esCuitValido('30710407165')).toBe(true);
  });

  it('rechaza un CUIT con dígito verificador incorrecto', () => {
    expect(esCuitValido('20123456780')).toBe(false);
  });

  it('rechaza un string que no tiene 11 dígitos', () => {
    expect(esCuitValido('1234567890')).toBe(false);
  });

  it('rechaza un string con caracteres no numéricos', () => {
    expect(esCuitValido('2012345678A')).toBe(false);
  });

  it('rechaza el esquema especial donde el verificador calculado es 10', () => {
    expect(esCuitValido('00000000069')).toBe(false);
  });
});

describe('tipoPersonaPorCuit', () => {
  it('reconoce prefijo 20 como Física', () => {
    expect(tipoPersonaPorCuit('20123456786')).toBe('Física');
  });

  it('reconoce prefijo 30 como Jurídica', () => {
    expect(tipoPersonaPorCuit('30710407165')).toBe('Jurídica');
  });

  it('devuelve null para un prefijo no clasificado', () => {
    expect(tipoPersonaPorCuit('50123456786')).toBeNull();
  });
});

describe('situacionADias', () => {
  it('clasifica situación 0 o 1 como normal hasta 31 días', () => {
    expect(situacionADias(0)).toBe('Hasta 31 días (situación normal)');
    expect(situacionADias(1)).toBe('Hasta 31 días (situación normal)');
  });

  it('clasifica situación 2 como 32 a 90 días', () => {
    expect(situacionADias(2)).toBe('32 a 90 días');
  });

  it('clasifica situación 3 como 91 a 180 días', () => {
    expect(situacionADias(3)).toBe('91 a 180 días');
  });

  it('clasifica situación 4 como 181 a 365 días', () => {
    expect(situacionADias(4)).toBe('181 a 365 días');
  });

  it('clasifica situación 5 o más como más de 365 días', () => {
    expect(situacionADias(5)).toBe('Más de 365 días');
    expect(situacionADias(6)).toBe('Más de 365 días');
  });
});

describe('tipoSociedadDeDenominacion', () => {
  it('reconoce el sufijo S.A.', () => {
    expect(tipoSociedadDeDenominacion('DREAN S.A.')).toBe('S.A.');
  });

  it('reconoce el sufijo S.R.L.', () => {
    expect(tipoSociedadDeDenominacion('TRANSPORTE SRL')).toBe('S.R.L.');
  });

  it('reconoce Cooperativa cuando termina en COOPERATIVA LTDA', () => {
    expect(tipoSociedadDeDenominacion('CONSORCIO COOPERATIVA LTDA')).toBe('Cooperativa');
  });

  it('devuelve null si no matchea ningún sufijo conocido', () => {
    expect(tipoSociedadDeDenominacion('JUAN PEREZ')).toBeNull();
  });

  it('devuelve null si la denominación es null', () => {
    expect(tipoSociedadDeDenominacion(null)).toBeNull();
  });
});

describe('extraerCandidatosCuit', () => {
  it('extrae un CUIT válido y uno invalido de texto OCR, válidos primero', () => {
    const resultado = extraerCandidatosCuit(
      'CUIT: 20123456786 Importe $100, otro invalido 11111111111'
    );
    expect(resultado).toEqual([
      { cuit: '20123456786', valido: true },
      { cuit: '11111111111', valido: false },
    ]);
  });

  it('reconoce el formato con separadores XX-XXXXXXXX-X', () => {
    const resultado = extraerCandidatosCuit('Emisor 20-12345678-6 Importe $500');
    expect(resultado).toEqual([{ cuit: '20123456786', valido: true }]);
  });

  it('no duplica el mismo CUIT si aparece dos veces', () => {
    const resultado = extraerCandidatosCuit('20123456786 y de nuevo 20123456786');
    expect(resultado).toEqual([{ cuit: '20123456786', valido: true }]);
  });
});

describe('extraerChequesDeLineas', () => {
  it('parsea una línea simple con fecha, N° de cheque, importe, CUITs y emisor', () => {
    const lineas = [
      '05/03/2026 1234567 $298.380,82 20123456786 DREAN SA ACTIVO 30710407165',
    ];
    expect(extraerChequesDeLineas(lineas)).toEqual([
      {
        cuit: '30710407165',
        valido: true,
        numeroCheque: '1234567',
        monto: '298380.82',
        emisorNombre: 'DREAN SA',
      },
    ]);
  });

  it('pega una razón social envuelta en la línea anterior a la fila ancla', () => {
    const lineas = [
      'SUCESORES DE',
      '05/03/2026 1234567 $298.380,82 20123456786 ALFREDO WILLINER ACTIVO 30710407165',
    ];
    expect(extraerChequesDeLineas(lineas)).toEqual([
      {
        cuit: '30710407165',
        valido: true,
        numeroCheque: '1234567',
        monto: '298380.82',
        emisorNombre: 'SUCESORES DE ALFREDO WILLINER',
      },
    ]);
  });
});
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `cd web && npm run test -- cuit.test.ts`
Expected: todos los tests en `cuit.test.ts` en PASS (son funciones ya existentes y correctas, no se espera ningún fallo).

- [ ] **Step 5: Commit**

```bash
git add web/package.json web/package-lock.json web/src/lib/cuit.test.ts
git commit -m "Tests: setup de Vitest + tests de cuit.ts"
```

---

### Task 2: Tests de `numeroEnLetras.ts`

**Files:**
- Create: `web/src/lib/numeroEnLetras.test.ts`

**Interfaces:**
- Consumes: `importeEnLetras(importe: number): string` de `web/src/lib/numeroEnLetras.ts`. Vitest ya instalado por Task 1.
- Produces: nada consumido por tareas posteriores.

- [ ] **Step 1: Escribir `web/src/lib/numeroEnLetras.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { importeEnLetras } from './numeroEnLetras';

describe('importeEnLetras', () => {
  it('convierte cero', () => {
    expect(importeEnLetras(0)).toBe('CERO');
  });

  it('convierte un número simple de un dígito', () => {
    expect(importeEnLetras(1)).toBe('UNO');
  });

  it('convierte un número de la serie VEINTI (21)', () => {
    expect(importeEnLetras(21)).toBe('VEINTIUNO');
  });

  it('convierte cien exacto', () => {
    expect(importeEnLetras(100)).toBe('CIEN');
  });

  it('convierte ciento uno', () => {
    expect(importeEnLetras(101)).toBe('CIENTO UNO');
  });

  it('convierte mil quinientos', () => {
    expect(importeEnLetras(1500)).toBe('MIL QUINIENTOS');
  });

  it('convierte dos mil quinientos', () => {
    expect(importeEnLetras(2500)).toBe('DOS MIL QUINIENTOS');
  });

  it('convierte un millón exacto', () => {
    expect(importeEnLetras(1000000)).toBe('UN MILLON');
  });

  it('convierte un monto grande con millones, miles y centavos', () => {
    expect(importeEnLetras(1234567.89)).toBe(
      'UN MILLON DOSCIENTOS TREINTA Y CUATRO MIL QUINIENTOS SESENTA Y SIETE CON 89/100'
    );
  });

  it('agrega la leyenda CON X/100 solo cuando hay centavos', () => {
    expect(importeEnLetras(250.5)).toBe('DOSCIENTOS CINCUENTA CON 50/100');
    expect(importeEnLetras(250)).not.toContain('CON');
  });
});
```

- [ ] **Step 2: Correr los tests y verificar que pasan**

Run: `cd web && npm run test -- numeroEnLetras.test.ts`
Expected: todos los tests en PASS.

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/numeroEnLetras.test.ts
git commit -m "Tests: numeroEnLetras.ts"
```

---

### Task 3: Tests de `format.ts`

**Files:**
- Create: `web/src/lib/format.test.ts`

**Interfaces:**
- Consumes: `money(n: unknown): string`, `isoDate(d: Date): string`, `monthLabel(ym: string): string`, `uid(): string`, `fechaHora(pbDate: string | undefined | null): string`, `fechaSola(pbDate: string | undefined | null): string` de `web/src/lib/format.ts`. Vitest ya instalado por Task 1.
- Produces: nada consumido por tareas posteriores.

- [ ] **Step 1: Escribir `web/src/lib/format.test.ts`**

```typescript
// Fija la zona horaria ANTES de cualquier otra cosa: fechaHora() formatea con
// toLocaleString, que depende de la TZ del proceso. Sin esto, el test pasa en
// una máquina en horario de Argentina y falla en CI (que corre en UTC).
process.env.TZ = 'America/Argentina/Buenos_Aires';

import { describe, it, expect } from 'vitest';
import { money, isoDate, monthLabel, uid, fechaHora, fechaSola } from './format';

describe('money', () => {
  it('formatea un número entero como moneda ARS', () => {
    expect(money(1000)).toContain('1.000,00');
    expect(money(1000)).toContain('$');
  });

  it('formatea un número con decimales', () => {
    expect(money(1234.5)).toContain('1.234,50');
  });

  it('devuelve cero formateado para valores no numéricos', () => {
    expect(money('abc')).toContain('0,00');
  });

  it('devuelve cero formateado para undefined', () => {
    expect(money(undefined)).toContain('0,00');
  });
});

describe('isoDate', () => {
  it('formatea una fecha como YYYY-MM-DD con ceros a la izquierda', () => {
    expect(isoDate(new Date(2026, 2, 5))).toBe('2026-03-05');
  });
});

describe('monthLabel', () => {
  it('convierte "YYYY-MM" al nombre del mes capitalizado en español', () => {
    expect(monthLabel('2026-03')).toBe('Marzo de 2026');
  });

  it('funciona para el primer mes del año', () => {
    expect(monthLabel('2026-01')).toBe('Enero de 2026');
  });
});

describe('uid', () => {
  it('devuelve un string con el formato tmp_<timestamp>_<random>', () => {
    expect(uid()).toMatch(/^tmp_\d+_[a-z0-9]+$/);
  });

  it('genera valores distintos en llamadas sucesivas', () => {
    expect(uid()).not.toBe(uid());
  });
});

describe('fechaHora', () => {
  it('devuelve string vacío para null o undefined', () => {
    expect(fechaHora(null)).toBe('');
    expect(fechaHora(undefined)).toBe('');
  });

  it('formatea una fecha-hora de PocketBase (con espacio en vez de T) a horario de Argentina', () => {
    expect(fechaHora('2026-09-22 12:34:56.789Z')).toBe('22/9/2026, 09:34:56');
  });
});

describe('fechaSola', () => {
  it('devuelve string vacío para null o undefined', () => {
    expect(fechaSola(null)).toBe('');
    expect(fechaSola(undefined)).toBe('');
  });

  it('formatea una fecha de PocketBase a DD/MM/YYYY sin corrimiento de día por UTC', () => {
    expect(fechaSola('2026-09-23 00:00:00.000Z')).toBe('23/09/2026');
  });

  it('funciona para el primer día de un mes de un solo dígito', () => {
    expect(fechaSola('2026-01-05 00:00:00.000Z')).toBe('05/01/2026');
  });
});
```

- [ ] **Step 2: Correr los tests y verificar que pasan**

Run: `cd web && npm run test -- format.test.ts`
Expected: todos los tests en PASS.

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/format.test.ts
git commit -m "Tests: format.ts"
```

---

### Task 4: Integrar `npm run test` en los pipelines de CI

**Files:**
- Modify: `.github/workflows/deploy.yml`
- Modify: `.github/workflows/deploy-staging.yml`

**Interfaces:**
- Consumes: script `npm run test` agregado a `web/package.json` en Task 1.
- Produces: nada consumido por tareas posteriores (última tarea del plan).

- [ ] **Step 1: Agregar el paso "Test" en `.github/workflows/deploy.yml`**

En `.github/workflows/deploy.yml`, el job `deploy` tiene hoy esta secuencia de steps (líneas ~19-29):

```yaml
      - name: Instalar dependencias
        working-directory: web
        run: npm ci

      - name: Lint
        working-directory: web
        run: npm run lint

      - name: Compilar el frontend
        working-directory: web
        run: npm run build
```

Insertar un nuevo step "Test" entre "Lint" y "Compilar el frontend", quedando:

```yaml
      - name: Instalar dependencias
        working-directory: web
        run: npm ci

      - name: Lint
        working-directory: web
        run: npm run lint

      - name: Test
        working-directory: web
        run: npm run test

      - name: Compilar el frontend
        working-directory: web
        run: npm run build
```

- [ ] **Step 2: Agregar el mismo paso "Test" en `.github/workflows/deploy-staging.yml`**

En `.github/workflows/deploy-staging.yml`, el job `deploy` tiene la misma secuencia (líneas ~18-28). Aplicar el mismo cambio: insertar el step "Test" entre "Lint" y "Compilar el frontend":

```yaml
      - name: Instalar dependencias
        working-directory: web
        run: npm ci

      - name: Lint
        working-directory: web
        run: npm run lint

      - name: Test
        working-directory: web
        run: npm run test

      - name: Compilar el frontend
        working-directory: web
        run: npm run build
```

- [ ] **Step 3: Verificar localmente que la suite completa pasa (simula lo que corre en CI)**

Run: `cd web && npm run test`
Expected: todos los tests de `cuit.test.ts`, `numeroEnLetras.test.ts` y `format.test.ts` en PASS (ningún test adicional, ya que el alcance de este plan es exactamente esos 3 archivos).

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/deploy.yml .github/workflows/deploy-staging.yml
git commit -m "CI: correr tests automaticos antes de compilar (ambos pipelines)"
```

**Nota de deploy:** este cambio toca workflows de CI pero no afecta runtime de producción directamente — igual que el gate de aprobación y el lint agregados en el eje anterior, seguir la disciplina ya establecida: merge a `staging` primero, verificar que el pipeline de staging corre el paso "Test" en verde, y solo después empujar a la rama de producción (con la confirmación correspondiente, dado que ese push queda bloqueado por el clasificador de auto-modo).

---

## Self-Review

**1. Cobertura del spec:** los 3 archivos y los 12 exports listados en el spec (`esCuitValido`, `tipoPersonaPorCuit`, `situacionADias`, `tipoSociedadDeDenominacion`, `extraerCandidatosCuit`, `extraerChequesDeLineas`, `importeEnLetras`, `money`, `isoDate`, `monthLabel`, `fechaHora`, `fechaSola`, más `uid` con test de formato) están cubiertos en las Tareas 1-3. El script `test` y su integración en ambos workflows están en las Tareas 1 y 4. Las exclusiones del spec (`categoriasTarifario.ts`, `direccionesSucursal.ts`, componentes React, `pb_hooks/`) no tienen ninguna tarea — correcto.

**2. Placeholders:** ninguno — todos los test cases tienen valores concretos, calculados y verificados ejecutando el código real contra Node antes de escribir este plan (no son casos inventados a mano).

**3. Consistencia de tipos:** las firmas usadas en los tests coinciden exactamente con los exports reales de `web/src/lib/cuit.ts`, `numeroEnLetras.ts` y `format.ts` leídos directamente del código fuente.

**Riesgo identificado y resuelto durante la escritura del plan:** `fechaHora()` y `money()` tienen dependencias de entorno (zona horaria del proceso, carácter NBSP del `Intl` de ICU) que podrían hacer que un test "obvio" pase en una máquina y falle en CI. Ambos casos están resueltos explícitamente: `fechaHora` fijando `process.env.TZ` al inicio del archivo de test, `money` usando `toContain` en vez de igualdad exacta. Ver Global Constraints.
