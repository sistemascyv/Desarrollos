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

Servidor actual: PocketBase **0.22.20**, corriendo como servicio systemd
(`pocketbase.service`) en `127.0.0.1:8090`. Admin UI: `http://localhost:8090/_/`
(entrar vía túnel SSH o desde el propio servidor con `curl`, ya que el puerto
8090 no está expuesto públicamente — Caddy solo expone 443/80).

Para entrar al Admin UI desde tu navegador sin abrir el puerto, hacé un túnel
SSH desde tu máquina:

```bash
ssh -L 8090:localhost:8090 ubuntu@44.204.212.111
```

y después abrí `http://localhost:8090/_/` en tu navegador (la primera vez va
a pedir crear el usuario admin).

Una vez adentro, **Settings → Import collections**, pegá el contenido de
`pb_schema.json` (formato compatible con 0.22.x, usa `schema` en vez de
`fields`). Esto crea `choferes`, `vehiculos`, `tarifas` y `tramos` con todos
los campos **excepto** la relación `chofer`.

> **Campo `chofer` (relación) — agregar a mano:** el importador necesita el
> `collectionId` real de `choferes`, que PocketBase recién genera al
> crearla, así que no viene en el JSON. Después de importar:
> 1. Entrá a la colección `tramos` → **New field**.
> 2. Nombre: `chofer`. Tipo: **Relation**.
> 3. Colección relacionada: `choferes`. **Max select: 1** (single).
> 4. Marcalo como **Required**.
> 5. Guardar.

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

El Caddyfile actual del servidor es:

```
app.carossiovairolatti.com.ar {
    reverse_proxy localhost:8090
}
```

Es decir, **todo** el dominio ya apunta a PocketBase. PocketBase sirve
archivos estáticos automáticamente desde su carpeta `pb_public` (al lado del
binario), así que no hace falta tocar Caddy: alcanza con copiar el HTML ahí.

```bash
mkdir -p /home/ubuntu/pocketbase/pb_public
cp rendiciones.html /home/ubuntu/pocketbase/pb_public/rendiciones.html
sudo systemctl restart pocketbase   # por si hace falta que detecte la carpeta nueva
```

Con eso queda disponible en:

```
https://app.carossiovairolatti.com.ar/rendiciones.html
```

Como se sirve desde el mismo origen que la API, el campo **"URL base de
PocketBase"** en `⚙ Config` puede quedar en blanco.

Si en algún momento se prefiere abrir el archivo localmente con doble clic en
vez de por HTTPS, hay que configurar ahí mismo la URL pública
(`https://app.carossiovairolatti.com.ar`).

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
