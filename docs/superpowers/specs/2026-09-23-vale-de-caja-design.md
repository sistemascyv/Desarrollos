# Vale de Caja (Tesorería) — diseño

## Contexto y problema

Hoy los recibos de pago a choferes se generan con un ejecutable de Windows
(`Aplicacion Impresion Recibo`, C#/WinForms) que no guarda ningún dato: el
usuario completa un formulario y el botón "Imprimir" literalmente hace una
captura de pantalla de esa región y la manda a la impresora. No queda
ningún registro consultable — ni número de comprobante, ni historial, ni
forma de saber qué se pagó y cuándo.

En paralelo, Planilla Choferes ya tiene un concepto de "vale": cada
`tramo` tiene dos campos sueltos, `vale_nro` (texto) y `vale_importe`
(número), tipeados a mano por quien carga el viaje. El "Total Vales" de la
rendición de un chofer es la suma de `vale_importe` de todos sus tramos en
el rango de fechas elegido, y entra en la fórmula:

```
Total a liquidar = Monto alargue + Viáticos + Total gastos − Total vales
```

## Objetivo

Reemplazar el ejecutable por un módulo **Vale de Caja** dentro del grupo
TESORERIA (donde ya viven Control de Cheques y Central de Deudores),
que:

1. Genera e imprime el comprobante (mismo texto legal de siempre, mismo
   cálculo de importe en letras), en media hoja A4.
2. Guarda cada vale como un registro real: numerado, con historial,
   filtrable por chofer.
3. Reemplaza el mecanismo actual de `vale_nro`/`vale_importe` por tramo:
   de ahora en más, los vales se cargan siempre como Vale de Caja en
   Tesorería, y se aplican a una rendición tildándolos desde Planilla
   Choferes — no escribiendo un número y un importe a mano en el tramo.

## Fuera de alcance (explícitamente)

- El importe **no** se calcula solo a partir del "Total a liquidar" del
  chofer — se tipea a mano al crear el vale (confirmado con el usuario:
  un vale no siempre corresponde al total completo de un período).
- El campo "Recibí de" (pagador) no se vuelve a mostrar como selector:
  siempre es "Carossio Vairolatti y Cía SRL" — para pagos a choferes
  nunca paga Raúl o Carlos a título personal.
- Los `tramo.vale_nro`/`tramo.vale_importe` ya cargados **no se tocan** ni
  se migran — quedan como dato histórico. Solo cambia el flujo hacia
  adelante.
- El historial de vales **no** se muestra dentro de Planilla Choferes como
  una lista de consulta general — solo aparece ahí el panel puntual de
  "vales disponibles para tildar" de la sección siguiente. La consulta
  general (todos los vales, todos los choferes) vive únicamente en
  Tesorería.
- No hay edición de un vale ya creado. Un error se corrige borrando (solo
  admin) y cargando uno nuevo, que sale con el número siguiente.

## Modelo de datos

Nueva colección `vales_caja`:

| Campo | Tipo | Notas |
|---|---|---|
| `numero` | number | Correlativo, lo asigna un hook del servidor — nunca lo manda el cliente. Único. |
| `fecha` | date | Default hoy en el formulario. |
| `chofer` | relation → `choferes` | Requerido. |
| `nombre_firma` | text | Autocompletado con el nombre del chofer elegido, editable (puede cobrar otra persona en su nombre). |
| `importe` | number | Tipeado a mano. |
| `moneda` | select (`ARS`, `BRL`) | Default `ARS`. Reemplaza los checkboxes "Pesos Argentinos"/"Reales" del formulario viejo. |
| `observacion1` | text | Opcional, línea libre. |
| `observacion2` | text | Opcional, línea libre. |
| `usado` | bool | Default `false`. Se pone en `true` cuando se tilda en una rendición de Planilla Choferes (ver más abajo). No se toca desde el formulario de creación. |
| `creado_por` | text | Lo completa un hook desde `auth`, igual que en Planilla Choferes y Bot Tarifas — nunca lo manda el cliente. |

### Numeración correlativa

Un hook `onRecordBeforeCreateRequest` sobre `vales_caja`:
- Ignora cualquier `numero` que venga del cliente.
- Busca el último vale por `dao.findRecordsByFilter("vales_caja", "numero >= 0", "-numero", 1, 0)`
  (filtro real, no vacío — el filtro vacío rompe esta versión de
  PocketBase, ya confirmado en este proyecto) y usa `numero + 1`, o `1`
  si no hay ninguno.
- Completa `creado_por` desde `auth.get("nombre") || auth.get("username") || auth.id`.

### Permisos

- `listRule` / `viewRule` / `createRule`: admin **o** módulo `vale_caja`
  asignado (`@request.auth.modulos ~ "vale_caja"` — operador `~`, no
  `?=`; `modulos` es un campo `json`, y `?=` ya causó este mismo bug en
  Fichadas, Cheques y Reportes de Flota en este mismo proyecto).
- `updateRule`: `null` (nadie edita un vale por la API genérica — ni
  siquiera admin. El único cambio permitido después de creado, el flag
  `usado`, se hace por un endpoint aparte, ver abajo).
- `deleteRule`: admin únicamente.

### Marcar un vale como usado (sin abrir edición general)

Tildar/destildar un vale en Planilla Choferes lo hace alguien con el
módulo `planilla_choferes`, que normalmente **no** tiene el módulo
`vale_caja` — y como `updateRule` es `null`, no podría tocar el registro
por la vía normal. Se resuelve con dos rutas de hook chicas, igual que
`/api/deudores/bcra/...` o `/api/flota/pressa/...`:

- `POST /api/vales-caja/:id/usar` — exige `planilla_choferes` o
  `vale_caja` o admin, pone `usado = true`.
- `POST /api/vales-caja/:id/liberar` — mismo chequeo, pone `usado = false`.

Así el contenido del vale (importe, chofer, texto) sigue siendo
inmutable por API directa, pero el flag operativo sí se puede tocar
desde donde hace falta.

## Pantalla Tesorería → Vale de Caja

Página nueva en `finanzas/vale-de-caja` (grupo TESORERIA), con:

**Formulario de carga:**
- Chofer (select, de la colección `choferes`, solo activos).
- Fecha (default hoy).
- Importe.
- Moneda (Pesos Argentinos / Reales).
- Observación 1 y 2 (texto libre, opcionales).
- Nombre y Firma (autocompletado al elegir chofer, editable).
- Botón "Guardar" → crea el registro (el número lo asigna el servidor).
  Al guardar con éxito se habilita "Imprimir".

**Historial**, tabla con filtro por chofer: número, fecha, chofer,
importe, moneda, usado (sí/no), emitido por. Acción "Ver/Reimprimir" en
cada fila. Sin acción de editar. "Eliminar" solo visible para admin.

## Impresión

Mismo patrón ya usado para la rendición de chofer en Planilla Choferes
(una sección oculta que solo se muestra en `@media print`, sin
librerías nuevas). `@page { size: A4; }`, contenido en un bloque de
**210mm × 148mm** (mitad superior de una A4 vertical) — el resto de la
hoja queda en blanco.

Texto (título "VALE DE CAJA", no "Recibo"):

```
                                          VALE DE CAJA N° 0001

Recibí de Carossio Vairolatti y Cía SRL          [fecha]

la cantidad de pesos argentinos [importe en letras]

_________________________________________________
[observación 1]
_________________________________________________
[observación 2]

Son $ [importe numérico]              ____________________
                                        [Nombre y Firma]
```

El importe en letras se calcula con un port directo a TypeScript del
algoritmo ya usado en `Conversion.cs` (recursivo, UNO/DOS/TRES...
CIENTO/DOSCIENTOS... MIL/MILLÓN, con "CON NN/100" para los centavos) —
misma redacción en mayúsculas que ya conocen.

## Integración con Planilla Choferes

En la vista de rendición (chofer + rango de fechas ya seleccionados),
panel nuevo **"Vales de caja disponibles"**:

- Lista todos los `vales_caja` de ese chofer con `usado = false`
  (sin filtrar por el rango de fechas de la rendición — un vale pendiente
  de antes del rango elegido igual tiene que poder aplicarse), ordenados
  por fecha.
- Cada fila: fecha, importe, checkbox.
- Al tildar: llama a `/api/vales-caja/:id/usar`, y ese importe se suma al
  "Total Vales" del resumen en el momento (mismo lugar donde hoy se suma
  `tramo.vale_importe` — se reemplaza esa fuente por la suma de los vales
  tildados).
- Al destildar (antes de salir de la pantalla): llama a `/liberar`, vuelve
  a estar disponible.
- Los tramos con `vale_nro`/`vale_importe` cargados de antes siguen
  sumando igual que hoy (no se pierde nada histórico) — el "Total Vales"
  final es la suma de ambas fuentes: vales de caja tildados + los
  `vale_importe` de tramos que ya tenían ese dato cargado.

## Testing

Siguiendo la metodología ya usada en este proyecto: bajar el binario real
de PocketBase, correr las migraciones nuevas contra una base local,
levantar el server con los hooks reales, y probar por API antes de
desplegar — en particular:
- Que la numeración correlativa funciona y no se puede pisar desde el
  cliente.
- Que un usuario con `planilla_choferes` pero sin `vale_caja` puede
  usar/liberar un vale pero no puede verlo/crearlo/editarlo en Tesorería.
- Que las reglas de permiso realmente usan `~` (verificar leyendo el
  valor final guardado en la base, no solo el archivo de migración — en
  este proyecto ya pasó que una reescritura de reglas no persistía sin
  tirar error, hay que confirmarlo consultando el estado final).
