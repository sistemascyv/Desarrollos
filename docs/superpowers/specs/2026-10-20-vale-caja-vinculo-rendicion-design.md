# Vale de Caja: vincular vale usado a su rendición — diseño

## Contexto

En Planilla Choferes, al armar la rendición de un chofer para un rango de
fechas, se pueden tildar vales de caja disponibles (`vales_caja`) para
sumarlos al total a liquidar. Hoy "usado" es un simple booleano
(`usado: true/false`) en el propio vale — no queda registrado **para qué
rendición** se usó. El tildado en pantalla (`valesTildados`) vive solo en
el estado de React: si se recarga la página o se vuelve a entrar más
adelante con el mismo chofer y el mismo rango de fechas, los vales que ya
están `usado=true` simplemente desaparecen de la lista de disponibles, y
no hay forma de reconstruir cuáles habían formado el total.

## Qué se agrega

Dos campos nuevos en `vales_caja`: `periodo_desde` y `periodo_hasta`
(texto `YYYY-MM-DD`, mismo formato que ya usa toda la Planilla), opcionales,
vacíos para los vales que nunca se usaron. El campo `chofer` que ya tiene
cada vale no se toca — no hace falta uno nuevo, ya alcanza para filtrar.

## Cambios de comportamiento

- **`POST /api/vales-caja/:id/usar`** (`pb_hooks/vales_caja.pb.js`): pasa a
  recibir `{ desde, hasta }` en el body (el rango de fechas de la
  rendición que se está viendo en pantalla en ese momento) y los guarda en
  el vale junto con `usado: true`.
- **`POST /api/vales-caja/:id/liberar`**: además de `usado: false`, limpia
  `periodo_desde`/`periodo_hasta` — el vale vuelve a quedar completamente
  libre para cualquier rendición futura.
- **`loadValesDisponibles()`** (`PlanillaChoferesPage.tsx`): en vez de
  traer solo `chofer = {:c} && usado = false`, trae también los vales
  usados **en este mismo rango exacto** (`chofer = {:c} && usado = true &&
  periodo_desde = {:d} && periodo_hasta = {:h}`) y los muestra ya
  tildados desde el arranque — el total se reconstruye solo al recargar,
  sin que el usuario tenga que volver a tildar nada.
- **`toggleVale()`**: al tildar, manda `desde`/`hasta` (el rango
  actualmente elegido en pantalla) al endpoint `/usar`. Al destildar, sigue
  llamando `/liberar` sin cambios.

## Export a Excel

El archivo que genera `exportExcel()` gana una tercera hoja "Vales de
Caja" (además de "Resumen" y "Tramos" que ya existen), con el detalle de
los vales tildados en esa rendición: Número, Fecha, Importe, Observación
— mismo criterio visual que ya usa la hoja "Tramos" (encabezados,
columnas con ancho ajustado, formato de plata en el importe).

## Fuera de alcance

- Un historial navegable de rendiciones pasadas como entidad propia (sería
  la alternativa más grande, no elegida).
- Manejo de rangos de fechas que se solapan parcialmente entre sí (ej.
  reabrir con un rango distinto al original) — la reconstrucción es por
  coincidencia exacta de `periodo_desde`/`periodo_hasta`, que es el caso de
  uso real (se vuelve a entrar con el mismo rango).

## Testing

Migración probada contra una PocketBase local real (campos opcionales,
sin romper vales existentes). Los 2 endpoints (`/usar` con body nuevo,
`/liberar`) y la query de reconstrucción se prueban con `curl` contra un
servidor local real, igual que se hizo para los hooks de Fichadas en este
mismo proyecto. Sin lógica de agregación nueva que necesite `tsx`.
