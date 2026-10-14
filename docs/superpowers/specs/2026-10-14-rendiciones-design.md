# Rendiciones: vincular los Vales de Caja a una rendición real — diseño

## Contexto y problema

Hoy, en Planilla Choferes, al elegir un chofer aparecen sus vales de caja
disponibles (`usado = false`). Tildar uno llama a
`POST /api/vales-caja/:id/usar`, que marca `usado = true` al instante. Una
vez usado, el vale desaparece de la lista de disponibles — pero **no queda
ningún registro de para qué rendición (qué chofer, qué período) se usó**.
Si más adelante hace falta reconstruir "¿qué vales se usaron en la
rendición de tal chofer del 1 al 15 de octubre?", esa información ya no
existe en ningún lado.

Tampoco existe hoy un concepto de "rendición" como registro propio: el
rango de fechas (desde/hasta) en Planilla Choferes es algo que se elige
cada vez en la pantalla, no se guarda.

Confirmado con el usuario: los vales se usan todos los días, con
seguimiento real — esto no es un caso raro, es el flujo normal.

## Objetivo

- Desde el historial de Vale de Caja, poder ver en qué rendición (chofer +
  período) se usó cada vale.
- Desde Planilla Choferes, poder reabrir una rendición ya generada para un
  chofer y ver exactamente los mismos vales y el mismo total que se vieron
  el día que se generó — aunque después se hayan editado tramos de esas
  mismas fechas.

## Modelo de datos

### Nueva colección `rendiciones`

Un registro por cada rendición generada (no por cada vista de la
pantalla — ver más abajo cuándo se crea):

- `chofer` (relación a `choferes`, igual que `vales_caja.chofer`)
- `desde`, `hasta` (fechas, el rango elegido en pantalla)
- `creado_por` (texto, server-side desde el usuario autenticado — mismo
  patrón que el resto del proyecto)
- Totales **congelados** en el momento de generar (números, iguales a los
  que ya calcula `summary` en `PlanillaChoferesPage.tsx`):
  `total_vales`, `total_gastos`, `saldo`, `monto_alargue`, `viaticos`,
  `total_a_liquidar`

`listRule`/`viewRule`: mismo criterio que `vales_caja`
(`rol = "admin" || modulos ~ "planilla_choferes" || modulos ~ "vale_caja"`).
`createRule`: `null` — solo se crea server-side, vía el endpoint nuevo
(mismo criterio que `vales_caja.updateRule = null` hoy). `deleteRule`:
`rol = "admin"` (para corregir un error de carga, igual que los Vales de
Caja).

### `vales_caja`: nuevo campo `rendicion`

Relación opcional a `rendiciones` (`maxSelect: 1`). Se completa junto con
`usado = true`, nunca antes. Si un vale se libera (ver más abajo), este
campo se vuelve a vaciar.

## El flujo: "Generar Rendición"

Cambia el comportamiento actual de "tildar = se guarda al instante":

1. En Planilla Choferes, tildar un vale deja de llamar a `/usar` — pasa a
   ser selección **solo local** (estado de React), igual que ya es hoy el
   checkbox visualmente, pero sin tocar el servidor.
2. Aparece un botón nuevo, **"Generar Rendición"**, al lado de "Exportar
   Excel" / "Imprimir". Deshabilitado si no hay chofer elegido, o si no
   hay tramos ni vales tildados (nada que generar).
3. Al apretarlo, se llama a un endpoint nuevo
   `POST /api/rendiciones` con body
   `{ chofer, desde, hasta, vale_ids: [...], totales: {...} }`. El hook,
   en una sola operación:
   - Valida permisos (mismo chequeo de `modulos`/`rol` que ya usan
     `/usar`/`/liberar`).
   - Crea el registro `rendiciones` con los totales recibidos (confiando
     en el valor que manda el cliente para los totales -- igual de
     confiable que el resto de este formulario, que ya construye tramos y
     gastos en el cliente; no hay nada más sensible acá que en el resto de
     Planilla Choferes).
   - Para cada `vale_id`: busca el vale, confirma que sigue
     `usado = false` (por si alguien más lo usó en el medio — si ya está
     usado, se lo salta y lo reporta en la respuesta en vez de
     reventar toda la operación), y si está libre lo marca
     `usado = true` + `rendicion = <id nuevo>`.
   - Devuelve el id de la rendición creada y la lista de vales que
     efectivamente se enlazaron (y cuáles se saltearon, si alguno ya
     estaba usado).
4. El frontend muestra un toast de éxito (o aviso si algún vale se
   salteó), y recarga `valesDisponibles` (para que los recién usados
   desaparezcan de la lista, igual que hoy).
5. Si el usuario tilda vales y se va de la pantalla sin generar, no pasa
   nada — ningún vale se tocó.

**Nota:** "Exportar Excel" e "Imprimir" siguen funcionando exactamente
igual que hoy (datos en vivo de la pantalla actual) — son independientes
de "Generar Rendición". No hace falta haber generado la rendición para
exportar o imprimir.

## `/usar` y `/liberar`: qué cambia

- `POST /api/vales-caja/:id/usar` **se elimina** — ya nadie lo llama (era
  exclusivo del tildado instantáneo de Planilla Choferes, que ahora pasa
  por `/api/rendiciones`).
- `POST /api/vales-caja/:id/liberar` (usado hoy desde el botón "Liberar"
  en el historial de Vale de Caja, `ValeCajaPage.tsx`) seguimos
  necesitándolo tal cual — pero además de `usado = false` también limpia
  `rendicion` (vacío), para que el vale no quede con un enlace fantasma a
  una rendición de la que en teoría ya no forma parte. Esto **no borra**
  el registro de `rendiciones` en sí (puede haber quedado con otros vales
  enlazados) — solo desvincula ese vale puntual.

## Las dos vistas nuevas

### Desde Vale de Caja (`ValeCajaPage.tsx`)

En el historial, cada fila con `usado = true` y `rendicion` presente
muestra algo como "Usado en rendición de Pérez, Juan — 01/10 al 15/10"
(resuelto vía `expand` de la relación `rendicion.chofer`, mismo mecanismo
de expand que ya usa este proyecto en otras pantallas).

### Desde Planilla Choferes

Al elegir un chofer, además de "Vales de caja disponibles" (que sigue
igual), aparece una sección nueva **"Rendiciones anteriores"**: lista de
las rendiciones ya generadas para ese chofer (fecha de generación,
período, total a liquidar), ordenadas por fecha descendente. Al hacer clic
en una, se expande mostrando el detalle congelado: los totales guardados
en el registro (no recalculados) y la lista de vales que se enlazaron a
esa rendición (buscados por `rendicion = <id>`). Es una vista de **solo
lectura** — no se puede editar una rendición ya generada desde acá (si
hace falta corregir algo, se libera el vale puntual desde Vale de Caja,
igual que hoy, y eso lo desvincula).

## Fuera de alcance

- No se toca `periodos_cerrados` (el cierre mensual global) — es un
  concepto distinto, no se mezclan.
- No hay forma de "deshacer" una rendición completa de una sola vez
  (borrar el registro `rendiciones` y liberar todos sus vales de un
  golpe) — si hace falta corregir, se libera vale por vale desde Vale de
  Caja. Si en el uso real esto resulta tedioso, se puede agregar después.
- No se valida que `desde`/`hasta` no se superpongan con otra rendición ya
  generada para el mismo chofer — se confía en el criterio de quien genera
  (mismo nivel de confianza que ya existe hoy en el resto de esta
  pantalla).

## Testing

Mismo criterio que el resto de este proyecto: antes de dar por terminado,
probar contra una PocketBase local con las migraciones y hooks reales —
crear vales de prueba, generar una rendición, confirmar que los vales
quedan enlazados y marcados, que "Generar Rendición" no haga nada si
alguien más ya usó un vale en el medio (condición de carrera), que
"Liberar" desde Vale de Caja limpia el enlace correctamente, y que las dos
vistas nuevas muestran los datos esperados.
