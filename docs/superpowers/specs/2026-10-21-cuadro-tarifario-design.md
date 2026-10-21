# Cuadro Tarifario — diseño

## Contexto

El cuadro tarifario de fletes (valores por rango de peso, zona de origen/destino
y tipo de carga) hoy solo se puede ver desde el administrador del sistema de
ventas de terceros (ventascyv...) — el mismo sistema al que ya apunta "Bot
Tarifas" (`BotTarifasPage.tsx`), un bot en Python + Selenium que corre en una
PC de la oficina y aplica un % de aumento directo en ese sistema externo. Ese
bot solo reporta un resumen (antes/después por sucursal) al terminar, no el
detalle línea por línea — así que no puede alimentar automáticamente una copia
completa del cuadro.

Se decidió traer el cuadro a Sistema CyV como una **copia propia e
independiente**, con su propio control de "% de actualización" — no ligada al
bot ni al sistema de terceros. Sirve tanto para que el personal de ventas
cotice rápido como para referencia general, y a futuro va a ser la base de un
cotizador (sub-proyecto aparte).

## Módulo de permiso

Módulo nuevo e independiente: id interno `cuadro_tarifario`, label "Tarifas"
(grupo COMERCIAL, ruta `comercial/tarifas`) — separado de `bot_tarifas` (que
sigue existiendo tal cual, para correr el bot). El futuro cotizador se cuelga
del mismo permiso `cuadro_tarifario` sin cambios acá.

El id interno NO puede ser simplemente `tarifas`: el campo `modulos` es un
campo `json` (no un multi-select real), así que sus reglas de permiso usan el
operador `~` (substring/LIKE sobre el texto serializado), no `?=` — y
`"tarifas"` es substring literal de `"bot_tarifas"`. Con id `tarifas`,
cualquier usuario con el módulo del Bot de Tarifas matchearía también
`modulos ~ "tarifas"` y vería el Cuadro Tarifario sin que se lo asignaran
explícitamente (encontrado en la revisión de la Task 1). El label visible
sigue siendo "Tarifas" — el cambio es solo en el id interno de permiso.

- Lectura del cuadro: cualquier usuario con el módulo `cuadro_tarifario` (o admin).
- Aplicar el %: solo `rol = "admin"` — verificado en el servidor, no alcanza
  con tener el módulo `tarifas` (que solo da acceso de lectura).

## Modelo de datos

Colección nueva `cuadro_tarifario`, una fila por rango de peso dentro de cada
categoría:

- `categoria`: select (`seco`, `frio`, `congelado`), requerido.
- `rango_kg_desde` / `rango_kg_hasta`: number, requeridos.
- `rango_m3_desde` / `rango_m3_hasta`: number, **opcionales** — solo se cargan
  en `seco` (el rango equivalente en metros cúbicos); quedan vacíos en
  `frio`/`congelado`.
- `valores`: JSON, solo para `seco` — objeto con las 10 combinaciones de zona:
  `{"CC":.., "CS":.., "CR":.., "CB":.., "RR":.., "RS":.., "RB":.., "SS":..,
  "SB":.., "BB":..}` (C=Córdoba, S=San Francisco, R=Rosario, B=Buenos Aires —
  las sucursales; se muestran las siglas tal cual, sin nombre completo).
- `valor`: number, solo para `frio`/`congelado` — un único precio por rango,
  sin zonas.

Se separa `valores` (JSON, multi-zona) de `valor` (número simple) en vez de
forzar todo a un único JSON, porque Frío/Congelado son un solo número por
rango — tipado más simple, sin indirección innecesaria para leer un valor
único. Nueva interfaz TS `CuadroTarifarioFila` en `types.ts`.

Permisos de la colección: `listRule`/`viewRule` = `@request.auth.id != "" &&
(@request.auth.rol = "admin" || @request.auth.modulos ~ "cuadro_tarifario")`
(mismo operador `~` que ya usa `tarifas_bot_ajustes`, la colección hermana).
Sin
`createRule`/`updateRule`/`deleteRule` para usuarios normales — la única
escritura posible es a través del endpoint de aplicar-%, que corre con
privilegios de servidor (Dao directo, sin pasar por las reglas de la
colección).

## Endpoint: aplicar porcentaje

`POST /api/cuadro-tarifario/aplicar-porcentaje`, body `{ porcentaje: number }`:

1. Verifica `auth.rol === "admin"` (vía `$apis.requestInfo`) — si no, 403.
   Mismo patrón que los endpoints custom de `vales_caja.pb.js`.
2. Valida que `porcentaje` sea un número > 0 y <= 50 (mismo rango ya usado por
   Bot Tarifas, para frenar un typo tipo "500" en vez de "5").
3. Trae todas las filas de `cuadro_tarifario` y recalcula cada una:
   - `seco`: cada clave de `valores` → `valor_actual * (1 + porcentaje/100)`,
     redondeada a 2 decimales.
   - `frio`/`congelado`: `valor * (1 + porcentaje/100)`, redondeado a 2
     decimales.
4. Guarda todas las filas actualizadas (secuencial, sin transacción — mismo
   criterio que el resto de este proyecto).
5. Responde `{ ok: true, filas_actualizadas: N }`.

El % se aplica siempre a las 3 categorías juntas, en una sola acción — no hay
un % independiente por categoría. No se guarda historial de cada aplicación
(se evaluó y se descartó a pedido del usuario): el cuadro solo refleja los
valores vigentes. Esta acción no toca el sistema de ventas de terceros ni al
Bot Tarifas — son completamente independientes.

## Pantalla (`CuadroTarifarioPage.tsx`, ruta `/comercial/tarifas`)

Sub-tabs internos (mismo patrón que `ConfiguracionTab.tsx`): Seco / Frío /
Congelado, arranca en Seco.

- **Seco**: tabla con columnas Rango (Kg), Rango (m³) y las 10 combinaciones
  de zona, en este orden exacto (igual que el sistema de terceros, no es un
  orden alfabético): `C⇄C, C⇄S, C⇄R, C⇄B, R⇄R, R⇄S, R⇄B, S⇄S, S⇄B, B⇄B`
  (claves `CC, CS, CR, CB, RR, RS, RB, SS, SB, BB` en `valores`). Ordenada por
  `rango_kg_desde` ascendente, valores formateados con `money()`
  (`lib/format.ts`).
- **Frío** / **Congelado**: tabla simple Desde/Hasta (Kg) + Valor, mismo
  formato.

Arriba de todo, visible solo si `auth.rol === "admin"`: campo "% de
actualización" + botón "Aplicar", con confirmación (`useConfirm`, mismo patrón
que Bot Tarifas) aclarando que el % se aplica a las 3 categorías juntas. Al
confirmar, llama al endpoint y refresca las 3 tablas con los valores nuevos.
Para el resto de los usuarios con el módulo `cuadro_tarifario`, la pantalla es
de solo lectura — ven las 3 tablas, sin el control de %.

Nueva entrada en `MODULES` (`types.ts`): `{ id: 'cuadro_tarifario', label:
'Tarifas', group: 'COMERCIAL', path: 'comercial/tarifas' }`. Nueva ruta en
`App.tsx` gateada con `<RequireModule moduleId="cuadro_tarifario">`.

## Carga inicial

Sin pantalla de importar — los valores reales se cargan una sola vez vía
migración (mismo criterio que el backfill de fechas de CINTIA), con los datos
que el usuario pasa directamente por chat (Seco en texto plano, Frío y
Congelado desde un Excel), evitando transcribir a mano desde capturas de
pantalla (riesgo de error de tipeo en números muy apretados, sin forma de
corregir después salvo por una nueva migración, ya que no hay edición celda
por celda).

## Fuera de alcance

- Edición celda por celda (se eligió actualizar solo por %).
- Historial de cada % aplicado (se eligió no guardarlo).
- Herramienta de importar reutilizable desde Excel/CSV (se puede agregar
  después si hace falta resincronizar todo de una).
- Cualquier vínculo con el Bot Tarifas o el sistema de ventas de terceros —
  acciones y datos completamente separados.
- El cotizador en sí (sub-proyecto aparte, que va a reusar el módulo
  `tarifas`).

## Testing

Mismo criterio que el resto del proyecto: migración probada contra una
PocketBase local real (filas creadas, visibles vía API). El endpoint de
aplicar-% probado contra esa misma PocketBase local con un request real —
un caso de `seco` (recalcula las 10 claves de `valores`) y uno de
`frio`/`congelado` (recalcula `valor`), redondeo a 2 decimales verificado,
y el rechazo con `rol != "admin"` confirmado (403). Build de `tsc` limpio.
