# CyV — Rendiciones de Choferes (Fase 1)

Formulario web para que administración cargue las rendiciones de los choferes,
reemplazando el Excel actual. Es un único archivo HTML (`rendiciones.html`),
sin frameworks ni build step, que habla directamente con PocketBase vía REST
(`fetch`) y funciona offline con una cola en `localStorage`.

## Archivos

- `rendiciones.html` — la aplicación completa (abrir con doble clic o servir
  desde Caddy).
- `pb_schema.json` — definición de las colecciones para importar en PocketBase.

## 1. Crear las colecciones en PocketBase

Entrá al Admin UI de PocketBase (`http://localhost:8090/_/` en el servidor,
o vía túnel SSH) y usá **Settings → Import collections**, pegando el
contenido de `pb_schema.json`.

> **Importante — campo `chofer` (relación):** el importador necesita el
> `collectionId` real de `choferes`, que PocketBase genera al crearla. El
> JSON incluye el campo `chofer` como relación apuntando a `"choferes"` a
> modo de referencia, pero es posible que debas:
> 1. Importar primero `choferes`, `vehiculos` y `tarifas`.
> 2. Crear `tramos` y agregar manualmente el campo `chofer` como tipo
>    **Relation → choferes** (single select) desde el Admin UI, si el
>    import automático no lo resuelve.

Colecciones resultantes:

| Colección  | Campos clave |
|---|---|
| `choferes` | nombre, localidad, activo |
| `vehiculos` | codigo, marca_modelo, activo |
| `tarifas` | mes, tarifa_km |
| `tramos` | ver lista completa abajo |

### Reglas de acceso (API rules)

El schema trae las reglas de list/view/create/update/delete vacías (`""`),
es decir **abiertas a cualquiera con acceso a la API** — pensado para uso
interno detrás de Caddy/HTTPS en la red de la empresa. Si administración va
a acceder desde fuera de una red confiable, conviene:

- Crear una colección de usuarios (`_pb_users_auth_` o similar) para
  administración, y
- Cambiar las reglas a algo como `@request.auth.id != ""`.

La app ya soporta pegar un **token Bearer** en `⚙ Config` para ese caso;
si las reglas quedan abiertas, el campo de token se puede dejar vacío.

### Campos de `tramos`

```
tractor, dia_salida, hora_salida, dia_llegada, hora_llegada, origen, destino,
cliente, es_posicionamiento (bool), peajes, gastos_varios, km_alargue,
comida_viaje, comida_internacional, entrega_retiro_sfco, interrupcion,
cyd_manual, control_gral, descanso, vale_nro, vale_importe,
total_gastos (calculado por la app), km_recorridos, km_dobles, control (bool),
permanencia, cruce_frontera, chofer (relation → choferes), mes ("2026-08")
```

## 2. Publicar el HTML

Dos opciones:

- **Servido por Caddy** (recomendado): copiar `rendiciones.html` a la
  carpeta que sirve `app.carossiovairolatti.com.ar` (por ejemplo como
  `/rendiciones` o en la raíz), así administración entra por HTTPS y el
  campo "URL base de PocketBase" en `⚙ Config` puede quedar en blanco
  (usa el mismo origen).
- **Abrir localmente con doble clic**: funciona igual, pero hay que
  configurar en `⚙ Config` la URL pública de PocketBase, por ejemplo
  `https://app.carossiovairolatti.com.ar`, para que el navegador pueda
  llamar a la API (con CORS habilitado en PocketBase/Caddy).

## 3. Uso

1. Abrir el archivo / la URL.
2. `⚙ Config`: cargar la URL de PocketBase (si hace falta) y, opcionalmente,
   el **valor de viático por noche** (ver nota abajo).
3. Elegir **chofer** y **mes**, cargar/guardar la **tarifa por km** del mes
   (se usa para calcular el monto de alargue).
4. **+ Nuevo tramo** para cargar cada tramo del viaje. El total de gastos del
   tramo se calcula automáticamente mientras se completa el formulario.
5. El resumen del mes (arriba de la tabla) muestra: total de vales, km de
   alargue, monto de alargue, total de gastos, viáticos y saldo.

### Offline

Si no hay conexión al guardar un tramo o una tarifa, la operación se guarda
en una cola local (`localStorage`) y se ve reflejada igual en la pantalla
con una etiqueta **"pend."**. El botón **Sincronizar** (o la reconexión
automática) reintenta enviar todo lo pendiente a PocketBase.

## Cálculos automáticos

- `total_gastos` (por tramo) = suma de peajes + gastos_varios + comida_viaje
  + comida_internacional + entrega_retiro_sfco + interrupcion + cyd_manual
  + control_gral + descanso.
- `total_vales_mes` = suma de `vale_importe` de todos los tramos del mes.
- `total_km_alargue_mes` = suma de `km_alargue` del mes.
- `monto_alargue_mes` = `total_km_alargue_mes` × `tarifa_km` del mes.
- `total_gastos_mes` = suma de `total_gastos` de todos los tramos del mes.
- `saldo` = `total_vales_mes` − `total_gastos_mes`.
- `viaticos` = suma de `permanencia` (noches) de todos los tramos del mes ×
  **valor de viático por noche** configurado en `⚙ Config`.

> **Pendiente de confirmar con la empresa:** la regla exacta de cálculo de
> `viaticos` no estaba especificada. Se implementó como
> `noches de permanencia × valor fijo configurable`, con el valor editable
> en `⚙ Config` (se guarda en el navegador, no en PocketBase). Si la regla
> real es distinta (por ejemplo, distinto valor según destino, según
> chofer, o un tope), avisar para ajustar la fórmula.

## Próximos pasos sugeridos (fuera de fase 1)

- Autenticación real de administración (login) si el acceso deja de ser
  solo intra-red.
- Exportar la rendición del mes a PDF/Excel.
- Cierre de mes (bloquear edición de tramos de meses cerrados).
- Alta de choferes / vehículos desde la propia UI (hoy se cargan desde
  PocketBase Admin UI).
