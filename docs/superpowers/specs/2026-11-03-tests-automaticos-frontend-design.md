# Tests automáticos (frontend, primera vuelta) — Diseño

**Contexto:** Sistema CyV no tiene hoy ningún test automatizado (ni frontend ni backend). Es el segundo de 3 ejes acordados con el usuario (seguridad del CI/CD, tests automáticos, arquitectura), después de completar el gate de aprobación manual + lint en CI.

## Decisión de alcance

Se investigaron dos frentes posibles por separado, porque corren en runtimes muy distintos:

- **`pb_hooks/` (backend, JSVM de PocketBase/Goja):** el patrón estándar de "extraer lógica pura a una función y testearla aparte" ya demostró ser riesgoso en este proyecto — hay un bug documentado en `pb_hooks/cheques.pb.js` donde declarar una función fuera del callback de `routerAdd` y llamarla desde adentro tiró `ReferenceError` **en producción** (aunque funcionaba en local). Testear este backend bien requeriría tests de integración contra una instancia real de PocketBase, un esfuerzo bastante mayor. **Queda explícitamente fuera de este spec**, para una vuelta separada.
- **Frontend (`web/src/lib/`):** ya existen funciones puras, sin dependencia de React/DOM/PocketBase, listas para testear sin modificarlas. Este spec cubre solo este frente.

## Herramienta

**Vitest**, devDependency nueva. Se confirmó compatibilidad: Vitest 5.1.0 declara soporte de peer `vite: "^6.4.0 || ^7.0.0 || ^8.0.0"`, y el proyecto usa Vite 8.2.2 — sin conflicto. No se agrega `jsdom` ni `@testing-library/react`: las funciones en alcance no renderizan componentes ni tocan el DOM, así que no hace falta un entorno de navegador simulado.

## Alcance: archivos a cubrir

Tests nuevos, co-ubicados junto al archivo fuente (`<nombre>.test.ts` al lado de `<nombre>.ts`), consistente con cómo Vitest arma su glob de test files por convención sin configuración extra:

1. **`src/lib/cuit.ts`** (292 líneas, el de mayor valor):
   - `esCuitValido(cuit: string): boolean` — algoritmo módulo 11 de AFIP.
   - `tipoPersonaPorCuit(cuit: string): 'Física' | 'Jurídica' | null`
   - `situacionADias(situacion: number): string`
   - `tipoSociedadDeDenominacion(denominacion: string | null): string | null`
   - `extraerCandidatosCuit(textoOcr: string): CandidatoCuit[]`
   - `extraerChequesDeLineas(lineas: string[]): ChequeDetectado[]` — parseo de texto OCR de cheques, la lógica más compleja del archivo; el tipo de código que se rompe en silencio si una regex cambia sin querer.
2. **`src/lib/numeroEnLetras.ts`**:
   - `importeEnLetras(importe: number): string` — monto a texto en mayúsculas para recibos.
3. **`src/lib/format.ts`**:
   - `money(n: unknown): string`
   - `isoDate(d: Date): string`
   - `monthLabel(ym: string): string`
   - `fechaHora(pbDate: string | undefined | null): string`
   - `fechaSola(pbDate: string | undefined | null): string`
   - `uid()` se deja sin testear más allá de validar el formato del string que devuelve (no es determinístico: usa `Date.now()`/`Math.random()`).

**Explícitamente fuera de este spec** (no es que no tengan valor, es que no son parte de esta primera vuelta): `categoriasTarifario.ts` y `direccionesSucursal.ts` (son solo constantes, no hay lógica que testear), cualquier componente o página de React, y todo `pb_hooks/`.

## Integración en CI

Se agrega un script `"test": "vitest run"` a `web/package.json`, y un paso `npm run test` en ambos workflows de GitHub Actions (`deploy.yml` y `deploy-staging.yml`), inmediatamente después del paso de `lint` y antes de `build` — si un test falla, el pipeline se corta ahí, no llega a compilar ni a deployar (mismo lugar/criterio que el lint, agregado en el eje anterior).

## Convención a futuro (no forzada por esta spec)

Cuando se agregue lógica pura nueva a `src/lib/`, lo natural es sumarle su test ahí mismo siguiendo este mismo patrón. No hay ninguna herramienta que lo exija — queda como criterio para las próximas veces, no como una regla de CI.
