# Cotizador — diseño

## Contexto

El sistema de ventas de terceros tiene una pantalla de cotización que arma el
precio de un flete a partir del Cuadro Tarifario, aplica seguro/IVA, y la
imprime. El usuario pasó capturas de esa pantalla y de su impresión, y
señaló un problema concreto: hoy ese sistema **no aplica correctamente el
recargo de mínimo por sucursal** en la cotización. La idea es traer un
cotizador propio a Sistema CyV que, de mínima, resuelva bien ese cálculo —
usando el Cuadro Tarifario y los Mínimos por sucursal que ya están en
Sistema CyV.

De las 4 categorías tarifarias del sistema de terceros (Clientes con tarifa
negociada, Acuerdos Especiales, General por Tipo de Carga, Generales
Básicas), **ninguna salvo "General por Tipo de Carga" tiene hoy datos
cargados en Sistema CyV** — ni siquiera la colección `clientes` tiene campos
de tarifa, es solo nombre+activo. Por eso este primer cotizador se limita
a esa categoría general, y encima solo a **carga Seca** (Frío/Congelado
quedan para un sub-proyecto aparte). Tarifas por Cliente y Acuerdos
Especiales quedan completamente fuera: no hay ningún dato para construirlos
todavía.

Módulo de permiso propio: `cotizador` (label "Cotizador", grupo COMERCIAL,
ruta `comercial/cotizador`) — separado de `cuadro_tarifario` (decisión
posterior al deploy inicial: al principio compartían el mismo módulo, se
separaron para poder dar acceso al Cotizador sin dar acceso también al
Cuadro Tarifario, o viceversa).

## Sucursal del usuario

Se agrega `sucursal` (select: `cordoba`/`san_francisco`/`rosario`/
`buenos_aires`, **opcional**) a la colección `usuarios`. Se carga a mano
desde Administración → Usuarios (mismo lugar que `rol`/`modulos` hoy).
Migración de backfill: el usuario admin existente queda con
`san_francisco` (confirmado por el usuario).

Esto es la base mínima para numerar cotizaciones por sucursal — **no**
incluye ningún otro efecto (no restringe qué ve o puede hacer un usuario
según su sucursal). La segmentación completa de usuarios por sucursal
(permisos, visibilidad de datos, etc.) queda explícitamente fuera de
alcance, para un sub-proyecto futuro si hace falta.

Un usuario sin `sucursal` cargada no puede crear cotizaciones — mensaje
claro pidiendo que un admin se la cargue primero.

## Modelo de datos

### `cotizaciones`

Encabezado + totales ya calculados (se congelan al guardar, no se
recalculan solos si después cambia el Cuadro Tarifario):

- `numero`: text, requerido, único — ver "Numeración" abajo.
- `fecha`: text (`YYYY-MM-DD`), requerido, default hoy.
- `trafico_origen` / `trafico_destino`: select (`cordoba`/`san_francisco`/
  `rosario`/`buenos_aires`), requeridos.
- `paga_en`: select (`origen`/`destino`), requerido — de qué sucursal
  (origen o destino) sale el mínimo a aplicar.
- `cliente`: relation opcional a `clientes`.
- `solicitado_por` / `telefono` / `email`: text, opcionales — `solicitado_por`
  es también el "Remitente" de la impresión.
- `lugar_carga` / `lugar_descarga`: text, opcionales — texto libre (sin
  autocompletar por sucursal en este primer cotizador).
- `tipo_mercaderia` / `observacion`: text, opcionales.
- `seguro_activo`: bool, default true.
- `seguro_porcentaje`: number, default `0.7`.
- `contra_reembolso` / `taxi_flet`: number, default `0`.
- `sub_total` / `recargo` / `seguro` / `neto_gravado` / `iva` / `total`:
  number — resultado del cálculo, guardado tal cual al confirmar.
- `creado_por`: text, seteado server-side desde el usuario autenticado
  (mismo patrón que el resto del proyecto).

Permisos: lectura/escritura (list/view/create) para
`@request.auth.rol = "admin" || @request.auth.modulos ~ "cotizador"`
— todos los usuarios del módulo ven y cargan cotizaciones de todos (mismo
criterio que el historial de Bot Tarifas). `updateRule`: null (no son
editables). `deleteRule`: solo admin.

### `cotizacion_items`

Una fila por ítem de la tabla:

- `cotizacion`: relation requerida a `cotizaciones`, `cascadeDelete: true`.
- `kilos` / `m3` / `bultos` / `valor_declarado`: number, default `0`.
- `precio` / `total`: number — resultado del cálculo para esa fila.

`bultos` es un dato informativo (aparece en pantalla e impresión) — no
participa de ningún cálculo. Mismos permisos que `cotizaciones`.

## Lógica de cálculo

Por cada ítem:

1. Busca en `cuadro_tarifario` (`categoria = 'seco'`) la fila cuyo rango de
   `rango_kg_desde`/`rango_kg_hasta` contiene los `kilos` del ítem →
   `precioKg` (columna de zona según el Tráfico, ver abajo). Si el ítem
   también tiene `m3 > 0`, busca igual por `rango_m3_desde`/
   `rango_m3_hasta` → `precioM3`.
2. `precioFila = max(precioKg, precioM3)` (si solo cargaron uno de los dos,
   se usa ese). Esto es el "peso real vs. peso aforado" habitual en
   fletes: gana el que da más caro.
3. Columna de zona: `trafico_origen`/`trafico_destino` del encabezado
   (compartido por todos los ítems de la cotización) se mapean a una de las
   10 combinaciones `CC,CS,CR,CB,RR,RS,RB,SS,SB,BB` sin importar el orden
   (San Francisco=S, Córdoba=C, Rosario=R, Buenos Aires=B — mismo mapeo que
   ya usa Cuadro Tarifario).
4. Si la fila tiene `por_unidad = true` (desde 1101 Kg): `item.precio =
   precioFila`; `item.total = precioFila * kilos`. Si no: `item.precio =
   item.total = precioFila` (monto fijo de la banda, sin multiplicar).
   **Caso borde:** si la fila que ganó (`precioFila`) es `por_unidad` y
   `kilos = 0` (cargaron solo Mts³, y ese volumen cae en una banda "Por
   Kg"), no se puede calcular un Total sin un peso real — el ítem queda
   inválido y el formulario avisa que hace falta cargar los Kilos para ese
   rango (no se inventa un peso a partir del volumen).

Totales de la cotización (una sola vez, no por ítem):

- `sub_total` = suma de `item.total` de todos los ítems.
- `minimoAplicable` = el valor de `cuadro_tarifario_minimos` correspondiente
  a la sucursal de `paga_en` (si `paga_en = 'origen'`, la sucursal de
  `trafico_origen`; si `'destino'`, la de `trafico_destino`).
- `recargo` = `max(0, minimoAplicable - sub_total)`.
- `seguro` = `seguro_activo ? (suma de valor_declarado de todos los ítems) *
  (seguro_porcentaje / 100) : 0`.
- `neto_gravado` = `sub_total + recargo + seguro + contra_reembolso +
  taxi_flet`.
- `iva` = `neto_gravado * 0.21`.
- `total` = `neto_gravado + iva`.

Redondeo a 2 decimales en cada uno de estos pasos (`sub_total`, `recargo`,
`seguro`, `neto_gravado`, `iva`, `total` quedan todos ya redondeados al
guardar) — mismo criterio que Cuadro Tarifario.

No hay cargo por "Cambio de Zona" en este cotizador (fuera de alcance, sin
checkbox ni campo).

## Numeración

`numero = PREFIJO-00000001`: prefijo según la sucursal del usuario que
crea la cotización (`SAN`=San Francisco, `COR`=Córdoba, `ROS`=Rosario,
`BUE`=Buenos Aires), número de 8 dígitos con cero a la izquierda,
**correlativo separado por sucursal** (cada prefijo tiene su propio
contador, empieza en `00000001`) — mismo patrón que `vales_caja`/`recibos`
(buscar el último `numero` con ese prefijo, sumar 1), pero particionado por
prefijo en vez de global.

## Pantalla (`CotizadorPage.tsx`, ruta `/comercial/cotizador`)

Módulo propio (`cotizador`), con su propia entrada en el menú — y un link
cruzado entre esta página y Cuadro Tarifario para llegar de una a la otra
igual que antes.

- **Vista Lista** (default al entrar): tabla de cotizaciones guardadas
  (número, fecha, tráfico, cliente, total, estado), botón "Nueva
  Cotización", botón "Imprimir" por fila.
- **Vista Formulario** (nueva o click en una fila existente): campos del
  encabezado (Fecha, Tráfico Origen/Destino, Paga en Origen/Destino,
  Cliente, Solicitado Por, Teléfono, Email, Lugar de Carga/Descarga, Tipo
  de Mercadería, Observación) + tabla de Items editable (agregar/quitar
  filas; Kilos/Mts³/Bultos/Valor Declarado editables, Precio/Total de solo
  lectura recalculados al tipear) + controles de Seguro (checkbox + %),
  Contra Reembolso, Taxi-Flet, y el resumen de totales (Sub-Total/
  Recargo/Seguro/Neto Gravado/IVA/Total), todo recalculado en vivo.
  Botones Guardar/Cancelar. Una cotización ya guardada se abre de solo
  lectura (los montos quedan congelados — no hay "editar y recalcular").

## Impresión

Botón "Imprimir" en una cotización guardada: abre una vista A4 en una
pestaña nueva (para imprimir o guardar como PDF desde el navegador —
`window.print()`, sin librería nueva), con:

- `logo.jpg` (ya está en el repo) como marca de agua de fondo, baja
  opacidad, centrado.
- Encabezado fijo: Carossio, Vairolatti & Cía S.R.L. / San Lorenzo 31 / San
  Francisco / CUIT 30-54057342-1 / Ing. Brutos 904-249209-7 (mismos datos
  fijos para las 4 sucursales, igual que la captura de referencia).
- `Cotización: <numero>`, `Fecha`, `Estado` (Vigente/Vencido — comparación
  en el momento de ver la impresión, no se guarda), `Vencimiento` (`fecha +
  10 días`, con el texto fijo "(salvo incremento tarifario)").
- `Señor(es)` y `Atento` = nombre del `cliente`. `Remitente` =
  `solicitado_por`.
- Tabla de ítems (Kilos, Mts³, Bultos, Valor Declarado, Observación,
  Precio, Total).
- Líneas de totales, en este orden: SubTotal, **Recargo mínimo** (solo si
  es mayor a $0), Seguro, Taxi-Flet, **Contra Reembolso** (solo si es
  mayor a $0), Neto, IVA, Total. Decisión revisada después de la
  revisión final de rama completa: la primera versión las omitía siempre
  "igual que la captura de referencia", pero esa captura es del sistema
  de terceros con el bug que motivó este cotizador (nunca aplicaba el
  recargo, por eso nunca lo mostraba) — copiar ese layout copiaba la
  ausencia del dato, no una decisión de diseño real. Mostrarlas solo
  cuando > 0 evita un salto de monto sin explicar en el papel, sin
  ensuciar el recibo en el caso común (sin recargo ni contra reembolso).
- Lugar de Carga, Lugar de Descarga, Tipo de Mercadería, Observación.
- Leyenda fija: "En caso de que los datos informados por el cliente
  difieran de los datos reales, se procederá a realizar un ajuste en la
  tarifa."

## Fuera de alcance

- Frío/Congelado (solo Seco).
- Tarifas por Cliente y Acuerdos Especiales (sin datos hoy).
- Cargo por "Cambio de Zona".
- Segmentación completa de usuarios por sucursal (permisos/visibilidad
  restringida) — solo se agrega el campo `sucursal` para la numeración.
- Autocompletar Lugar de Carga/Descarga por sucursal (texto libre).
- Editar una cotización guardada para recalcularla.
- Enviar la cotización por mail (solo imprimir/PDF del navegador).

## Testing

Mismo criterio que el resto del proyecto: función de búsqueda de precio
(banda Kg/m³, mayor entre los dos, `por_unidad`) y cálculo de totales
(recargo de mínimo, seguro, IVA) probados con `tsx` contra casos sacados
de las capturas del usuario:

- Kilos=1, Tráfico San Francisco-San Francisco, paga en origen (o destino,
  da igual porque origen=destino acá) → `precioFila` (banda 0-30 Kg,
  columna SS) = $13.264,34 → `sub_total` = $13.264,34. Mínimo de San
  Francisco = $25.157,30 → `recargo` = $25.157,30 − $13.264,34 =
  $11.892,96. `neto_gravado` = $13.264,34 + $11.892,96 = $25.157,30
  (exactamente el mínimo). `iva` = $25.157,30 × 0,21 = $5.283,03. `total` =
  $30.440,33. Este es justo el caso que en la captura original salía sin
  recargo (bug del sistema de terceros que motivó este cotizador) — acá
  confirma que el mínimo queda respetado.
- Mts³=1, Tráfico San Francisco-San Francisco, Valor Declarado=2.000.000 →
  `precioFila` (banda 251-300 Kg / 0,834-1,000 Mts³, columna SS) =
  $65.790,87 (mismo valor que ya confirmamos antes en el Cuadro Tarifario
  para esta banda — la captura de impresión del usuario usa otra fecha con
  otra tarifa de ese momento, no sirve como caso de test exacto contra los
  datos actuales). `sub_total` = $65.790,87, sin recargo (ya supera
  cualquiera de los 2 mínimos). `seguro` = $2.000.000 × 0,7% = $14.000,00.
  `neto_gravado` = $65.790,87 + $14.000,00 = $79.790,87. `iva` =
  $79.790,87 × 0,21 = $16.756,08. `total` = $96.546,95.

Migraciones probadas contra una PocketBase local real. Build de `tsc`
limpio.
