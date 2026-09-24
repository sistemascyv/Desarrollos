# Km real: sumar Megatrans a Posición de Flota — diseño

## Contexto y objetivo

Hoy la pestaña "Km real" de Posición de Flota (`web/src/pages/flota/satelital/KmRealTab.tsx`)
muestra, para un rango de fechas, los kilómetros recorridos por cada
vehículo según Pressa (`GET /api/flota/pressa/distancia/:desde/:hasta`,
implementado en `pb_hooks/pressa.pb.js`). Parte de la flota usa un segundo
proveedor de GPS, Megatrans, que expone su propio web service:

```
GET https://admws.megatrans.com.ar/services/CarossioVairolattiKmsRecorridosEntreFechasv2/AcumuladoUnidadv2
    ?CodigoEntidad=nnnnnnnn&FechaHoraDesde=YYYYMMDDHHMM&FechaHoraHasta=YYYYMMDDHHMM
```

que devuelve `{"Dato": {"Patente": "...", "CodigoEntidad": "...", "KmRecorridos": "..."}}`
para **un** vehículo por llamada, identificado por un `CodigoEntidad`
numérico propio de Megatrans (no existe hoy en Sistema CyV).

Objetivo: que "Km real" muestre los kilómetros de **toda la flota**, sin
importar de qué proveedor sea cada vehículo — una sola tabla, sin que el
usuario tenga que pensar en Pressa vs. Megatrans.

## Fuera de alcance

- El documento "Comunicado empresas AVL" (protocolo TCP de Koandina) **no
  se implementa** — es la especificación de cómo los proveedores de GPS le
  mandan datos a una plataforma externa, no algo que Sistema CyV consuma
  directamente. Confirmado con el usuario.
- Megatrans solo ofrece este único endpoint (km acumulados entre fechas).
  No hay posición en vivo, mapa, eventos ni cadena de frío para vehículos
  de Megatrans — esas pestañas siguen siendo exclusivas de Pressa.
- No se valida ni se divide automáticamente un rango de más de un año
  calendario (restricción documentada de Megatrans) — si eso llega a
  pasar, que la propia API de Megatrans lo rechace con su error; no vale
  la pena anticiparlo para el uso real de esta pantalla (rangos típicos de
  un mes).

## Modelo de datos

Nuevo campo en `vehiculos`: `codigo_megatrans` (texto, opcional) — el
`CodigoEntidad` de Megatrans para ese vehículo, cuando corresponde.

### Siembra

El usuario pasó la lista completa de códigos de flota (`vehiculos.codigo`,
ej. "T136") con su `CodigoEntidad` de Megatrans correspondiente (columna
numérica más larga, ej. "46401210" — confirmado contra el propio ejemplo
del documento de Megatrans, que usa `CodigoEntidad=40030510` y ese mismo
valor aparece en la lista para el código T105). La migración de siembra
cruza por `vehiculos.codigo` (no por patente: el formato de patente en la
lista es inconsistente — con espacios en algunas, sin espacio en otras —
mientras que el código interno de flota es estable y ya es la clave que
usa el resto del sistema).

Tabla completa código→CodigoEntidad (66 filas):

```
T136=46401210  T142=45520410  T139=45511110  T141=44695910  T143=44643410
T140=44631010  T135=44619810  T138=44607110  T137=44603110  T133=44476310
T134=44476310  T092=44328210  T091=44312010  T090=44299510  T089=44285110
T088=44278310  T087=44212010  T086=44127510  T084=43718610  T085=43704310
T132=43123110  T081=43121010  T131=42756710  T130=42661010  T129=42660010
T128=42624110  T127=42617710  T126=42616610  T125=42485410  T124=42485310
T123=42480710  T121=42405810  T122=42405410  T120=42339910  T118=42337810
T119=42337610  T117=42315010  T116=42314910  T114=42313810  T115=42313610
T113=42266510  T112=42265510  T111=42170510  T110=42168910  T107=42072310
T106=42069410  T108=42051910  T109=42051310  T079=41688410  T083=41444410
T082=41441410  T075=41160810  T099=40998110  T073=40751710  T098=40570610
T097=40554910  T102=40542510  T101=40541510  T096=40536410  T095=40402910
T104=40352710  T094=40312110  T093=40226710  T103=40074010  T105=40030510
```

Dos excepciones a resolver al implementar (no bloquean el diseño):

- La fila con código de flota `ATEGO` (patente `IJX 154`, CodigoEntidad
  `41463410`) no tiene un código `T0xx` como las demás — no hay forma
  automática de saber a qué `vehiculos.codigo` corresponde. Se deja sin
  sembrar y se reporta como advertencia; el usuario confirma después cuál
  vehículo es.
- `T133` y `T134` tienen el mismo `CodigoEntidad` (`44476310`) en la lista
  — probable error de carga del lado de Megatrans/origen. Se siembra tal
  cual viene (no es responsabilidad de esta migración corregir datos de
  origen), pero se deja una nota en el mensaje de la migración para que
  quede visible.
- Cualquier código de la lista que no tenga un `vehiculos.codigo`
  coincidente en la base real se reporta (no falla la migración).

## Endpoint

`GET /api/flota/pressa/distancia/:desde/:hasta` se **reemplaza** por
`GET /api/flota/km-real/:desde/:hasta` (nuevo archivo
`pb_hooks/km_real.pb.js`; dentro de un único callback de `routerAdd`, sin
funciones sueltas, mismo patrón que el resto de los hooks de este
proyecto). Recibe los mismos `:desde`/`:hasta` en segundos unix que ya
arma `KmRealTab.tsx`.

Lógica, todo dentro del mismo callback:

1. La misma consulta a Pressa que ya hace `pressa.pb.js` (login + endpoint
   de distancia) — se traslada tal cual a este archivo nuevo.
2. `dao.findRecordsByFilter("vehiculos", "codigo_megatrans != ''", "", 0, 0)`
   (filtro real, no vacío) para traer los vehículos con Megatrans
   configurado.
3. Por cada uno, `$http.send(...)` a la URL de Megatrans, convirtiendo
   `:desde`/`:hasta` (segundos unix, UTC) al formato `yyyyMMddHHmm` que
   pide Megatrans **en hora local Argentina (UTC-3), no en UTC ni en la
   zona horaria del servidor** — hay que restar 3 horas explícitamente
   antes de formatear, no asumir que el servidor ya corre en esa zona
   horaria (esta clase exacta de bug de huso horario ya apareció y se
   corrigió más de una vez en este proyecto).
4. Si una consulta a Megatrans falla (error de red, `CodigoEntidad`
   inválido, lo que sea), se salta ese vehículo y se sigue con los demás
   — no se cae todo el reporte por un vehículo con problemas. Se cuenta
   cuántos fallaron para poder mostrarlo si hace falta.
5. Se devuelve una sola lista combinada `{ unidades: [...] }`, mismo shape
   que hoy (`alias`, `patente`, `distanciaKm`) pero **sin** `velocidadMin`/
   `velocidadMax` (Megatrans no los tiene — se sacan de la respuesta para
   los dos proveedores, ver siguiente sección). Para las filas de
   Megatrans: `alias` = `vehiculos.codigo` (Megatrans no manda ningún
   alias propio, así que se usa el código interno de flota, igual que se
   ve en el resto del sistema); `patente` = el campo `Patente` que
   devuelve Megatrans; `distanciaKm` = `parseFloat(Dato.KmRecorridos)`
   (Megatrans lo manda como texto, ej. `"76.56"`, no como número).

`pb_hooks/pressa.pb.js` pierde su ruta `/distancia/:desde/:hasta` (se
reemplaza, no convive con la nueva) — sus otras rutas (`/monitor`,
`/historico/...`) quedan intactas, siguen siendo exclusivas de Pressa.

## Frontend

`KmRealTab.tsx`:
- Cambia la URL de `pb.send(...)` a `/api/flota/km-real/${desdeUnix}/${hastaUnix}`.
- Se saca la columna "Velocidad máx." de la tabla (y el campo
  `velocidadMax`/`velocidadMin` de `UnidadDistancia`, ya que ningún
  proveedor la va a tener de forma consistente en la respuesta
  combinada).
- El resto de la pantalla (selector de fechas, totales, orden por km
  descendente) no cambia.

## Testing

Mismo criterio ya establecido en este proyecto: antes de dar por
terminado, probar contra una PocketBase local con las migraciones y
hooks reales, y además — porque esto depende de un proveedor externo de
verdad, no hay forma de simular esto de manera significativa — hacer al
menos una llamada real a la API de Megatrans con un `CodigoEntidad` real
de la lista de arriba, confirmar que responde con el shape esperado, y
confirmar que el endpoint combinado de Sistema CyV junta ese resultado
con el de Pressa correctamente. Si la llamada real a Megatrans falla
(por ejemplo, si hiciera falta una credencial que el documento no
menciona), reportarlo como bloqueante antes de desplegar — no asumir que
"probablemente funciona".
