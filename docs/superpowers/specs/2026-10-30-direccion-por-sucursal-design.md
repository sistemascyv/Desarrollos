# Dirección por sucursal en el membrete — Design

## Contexto

El logo + dirección que aparece en los documentos impresos (Vale de Caja, Recibos, Cotización, y la imagen descargable del Cuadro Tarifario) tiene hoy la dirección de San Francisco hardcodeada en todos los casos, sin importar de qué sucursal es el documento. Con la segmentación por sucursal ya en producción (ver `docs/superpowers/specs/2026-10-30-segmentacion-por-sucursal-design.md`), cada registro ya sabe de qué sucursal es — este proyecto usa ese dato para mostrar la dirección correcta en cada documento.

## Alcance

Las 5 ubicaciones donde aparece el logo/dirección hoy (confirmado por grep en todo `web/src`, no hay más):
- `web/src/components/MembreteImpreso.tsx` (componente compartido)
- `web/src/pages/tesoreria/ValeCajaPage.tsx` (usa `MembreteImpreso`)
- `web/src/pages/tesoreria/RecibosPage.tsx` (usa `MembreteImpreso`)
- `web/src/pages/tarifas/CuadroTarifarioExport.tsx` (usa `MembreteImpreso`)
- `web/src/pages/tarifas/CotizacionImprimirPage.tsx` (tiene su propio encabezado inline, sin logo, no usa `MembreteImpreso`)

## Fuera de alcance

- El logo en sí (la imagen `/vale-logo.jpg`) no cambia — es el mismo logo de la empresa en las 4 sucursales.
- CUIT / Ingresos Brutos (en `CotizacionImprimirPage.tsx`) no cambian — es la misma razón social/CUIT para toda la empresa, solo cambia la dirección del local.
- No se agregan códigos postales — no se tienen los de Córdoba/Rosario/Buenos Aires, así que se saca también el que tenía San Francisco (2400), para que las 4 direcciones queden con el mismo formato.

## Direcciones (confirmadas con el usuario)

| Sucursal | Calle | Localidad |
|---|---|---|
| `san_francisco` | San Lorenzo 31 | San Francisco |
| `cordoba` | Celso Barrios 3779 | Córdoba Capital |
| `rosario` | Centro 27 - San Nicolás 3151 | Rosario |
| `buenos_aires` | Av. 27 de Febrero 5631 | Villa Soldati (C.A.B.A.) |

(Buenos Aires tiene un segundo depósito, Cortejarena, para carga Frío/Congelado — confirmado con el usuario que NO se usa acá: Buenos Aires siempre muestra Villa Soldati, sin importar la categoría de la cotización.)

## Enfoque técnico

**Fuente única de datos:** `web/src/lib/direccionesSucursal.ts` (nuevo), exporta un `Record<Sucursal, { calle: string; localidad: string }>` con las 4 filas de la tabla de arriba. Los 2 componentes que muestran dirección (`MembreteImpreso` y el encabezado de `CotizacionImprimirPage`) leen de ahí — nunca se duplica el texto de una dirección en dos lugares.

**`MembreteImpreso` pasa a recibir una prop `sucursal?: Sucursal`.** Internamente hace `DIRECCION_SUCURSAL[sucursal || 'san_francisco']` y muestra `calle`/`localidad` en mayúsculas (vía `textTransform: 'uppercase'` en el estilo ya existente, no hace falta guardar el texto duplicado en mayúsculas). El default a `san_francisco` cubre el caso de un registro viejo sin sucursal, o un admin (sucursal vacía) descargando el Cuadro Tarifario.

**De dónde sale la sucursal en cada caso:**
- `ValeCajaPage.tsx` / `RecibosPage.tsx`: cada vale/recibo ya tiene su propio campo `sucursal` (agregado en el backend en el proyecto de segmentación) — hace falta agregarlo a los tipos TS `ValeCaja`/`Recibo` (`web/src/types.ts`), que hoy no lo tienen. Se pasa `v.sucursal`/`r.sucursal` a `<MembreteImpreso sucursal={...} />`.
- `CuadroTarifarioExport.tsx`: el Cuadro Tarifario es un catálogo compartido, sin sucursal propia — se usa la sucursal del usuario que está descargando la imagen (`usuario.sucursal` de `useAuth()`), confirmado con el usuario. `CuadroTarifarioPage.tsx` ya usa `useAuth()` (hoy solo para `isAdmin`) — se agrega `usuario` a esa misma desestructuración y se pasa como prop nueva a `CuadroTarifarioExport`.
- `CotizacionImprimirPage.tsx`: usa `cot.sucursal` (la interfaz `Cotizacion` ya tiene este campo, agregado en el proyecto de segmentación). No usa `MembreteImpreso` (no tiene logo, es texto solo) — su propio bloque de encabezado pasa a leer `DIRECCION_SUCURSAL[cot.sucursal || 'san_francisco']` directamente, manteniendo su estilo visual actual (texto normal, no mayúsculas — a diferencia de `MembreteImpreso`).

## Casos de borde

- Registro sin sucursal (viejo, o creado por un admin con sucursal vacía): muestra San Francisco, mismo criterio que el fallback de categoría ya usado en `CotizacionImprimirPage.tsx`.
- Buenos Aires: siempre Villa Soldati, sin excepción, sin importar la categoría de la cotización ni el módulo.

## Testing

- Build (`npm run build`) para confirmar que compila sin errores de tipos.
- No hay tests automatizados de frontend en este proyecto. Prueba manual (sin navegador disponible en este entorno de desarrollo, queda para una pasada del usuario): abrir la impresión de un Vale de Caja/Recibo/Cotización de cada una de las 4 sucursales y confirmar que la dirección coincide con la tabla de arriba; descargar la imagen del Cuadro Tarifario logueado como un usuario de Córdoba (`juanc`) y confirmar que sale la dirección de Córdoba.
