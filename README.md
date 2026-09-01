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
`fields`). Esto crea `choferes`, `vehiculos`, `clientes`, `rutas`, `tarifas`
y `tramos` con todos los campos **excepto** la relación `chofer`.

> **Ya en el servidor de producción** las colecciones se crearon vía API con
> `curl` (usuario admin creado con `./pocketbase admin create`, login con
> `/api/admins/auth-with-password`, y un `POST /api/collections` por cada
> colección) porque no había forma de abrir el Admin UI en el navegador sin
> túnel SSH. El resultado final es el mismo que importando este JSON.

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
| `clientes` | nombre, activo |
| `rutas` | origen, destino, cliente (opcional), activo |
| `tarifas` | mes, tarifa_km |
| `tramos` | ver lista completa abajo |

`clientes` y `rutas` son catálogos de uso rápido: se cargan desde el panel
**👤 Administración** de la propia app y alimentan el autocompletado de
"Cliente" y el selector de "Ruta rápida" al cargar un tramo nuevo, para no
tener que tipear origen/destino/cliente de memoria cada vez.

### Login y roles de usuario

La app requiere iniciar sesión: no se puede ver ni cargar nada sin loguearse.
Hay una colección de autenticación `usuarios` (además del `email`/`password`
que trae cualquier colección `auth` de PocketBase, tiene `nombre`, `rol` y
`activo`) y dos roles:

- **`operador`**: puede cargar, editar y borrar tramos y tarifas (el uso
  diario de rendiciones). No ve el botón "👤 Administración".
- **`admin`**: además de lo anterior, entra al panel de Administración
  completo — choferes, vehículos, clientes, rutas **y usuarios** (crear
  cuentas nuevas, cambiar de rol, desactivar, borrar).

Reglas de API por colección:

| Colección | Leer (list/view) | Crear/editar/borrar |
|---|---|---|
| `tramos`, `tarifas` | cualquier usuario logueado | cualquier usuario logueado |
| `choferes`, `vehiculos`, `clientes`, `rutas` | cualquier usuario logueado | solo `admin` |
| `usuarios` | cualquier usuario logueado (ve la lista); el registro propio o cualquiera si es `admin` | solo `admin` (ver [Bootstrap](#bootstrap-primer-usuario-admin) para crear el primero) |

Todas estas reglas ya están en `pb_schema.json`. Como las colecciones base
(`choferes`, `vehiculos`, `clientes`, `rutas`, `tarifas`, `tramos`) **ya
existen** en el servidor de producción con reglas abiertas (`""`), hay que
actualizarlas — ver el script de la siguiente sección.

#### Crear la colección `usuarios` y actualizar las reglas (servidor ya en marcha)

Con `$TOKEN` = token de admin de PocketBase (ver sección de admin más abajo
o el historial de este README/chat para cómo obtenerlo con
`./pocketbase admin create` + `/api/admins/auth-with-password`):

> **⚠️ Bug detectado en PocketBase 0.22.20:** al crear una colección `auth`
> vía `POST /api/collections` sin especificar `options`, PocketBase la crea
> con `allowEmailAuth: false` **y** `allowUsernameAuth: false` — es decir,
> ningún método de login queda habilitado, y `auth-with-password` falla
> siempre con "Failed to authenticate" aunque el usuario y la contraseña
> sean correctos. El comando de abajo ya incluye el bloque `"options"` con
> ambos en `true` para evitar este problema. Si de todos modos vuelve a
> pasar, arreglalo con:
> ```bash
> curl -s -X PATCH http://localhost:8090/api/collections/usuarios \
>   -H "Authorization: $TOKEN" -H "Content-Type: application/json" \
>   -d '{"options":{"allowEmailAuth":true,"allowUsernameAuth":true,"allowOAuth2Auth":false,"onlyVerified":false,"requireEmail":false,"minPasswordLength":8}}'
> ```

```bash
# 1) Crear la colección de usuarios con roles
curl -s -X POST http://localhost:8090/api/collections \
  -H "Authorization: $TOKEN" -H "Content-Type: application/json" \
  -d '{
    "name":"usuarios","type":"auth",
    "listRule":"@request.auth.id != \"\"",
    "viewRule":"@request.auth.id != \"\" && (@request.auth.id = id || @request.auth.rol = \"admin\")",
    "createRule":"@request.auth.rol = \"admin\"",
    "updateRule":"@request.auth.rol = \"admin\"",
    "deleteRule":"@request.auth.rol = \"admin\"",
    "options":{
      "allowEmailAuth":true,
      "allowUsernameAuth":true,
      "allowOAuth2Auth":false,
      "onlyVerified":false,
      "requireEmail":false,
      "minPasswordLength":8
    },
    "schema":[
      {"name":"nombre","type":"text","required":false,"options":{}},
      {"name":"rol","type":"select","required":true,"options":{"maxSelect":1,"values":["admin","operador"]}},
      {"name":"activo","type":"bool","required":false,"options":{}}
    ]
  }'

# 2) Restringir choferes/vehiculos/clientes/rutas a "solo admin escribe"
for COL in choferes vehiculos clientes rutas; do
  curl -s -X PATCH "http://localhost:8090/api/collections/$COL" \
    -H "Authorization: $TOKEN" -H "Content-Type: application/json" \
    -d '{
      "listRule":"@request.auth.id != \"\"",
      "viewRule":"@request.auth.id != \"\"",
      "createRule":"@request.auth.rol = \"admin\"",
      "updateRule":"@request.auth.rol = \"admin\"",
      "deleteRule":"@request.auth.rol = \"admin\""
    }'
done

# 3) tramos y tarifas: cualquier usuario logueado puede leer y escribir
for COL in tramos tarifas; do
  curl -s -X PATCH "http://localhost:8090/api/collections/$COL" \
    -H "Authorization: $TOKEN" -H "Content-Type: application/json" \
    -d '{
      "listRule":"@request.auth.id != \"\"",
      "viewRule":"@request.auth.id != \"\"",
      "createRule":"@request.auth.id != \"\"",
      "updateRule":"@request.auth.id != \"\"",
      "deleteRule":"@request.auth.id != \"\""
    }'
done
```

#### Bootstrap: primer usuario admin

El `createRule` de `usuarios` exige ser `admin` — pero todavía no hay
ningún usuario. Se resuelve creando el primero **con el token de admin de
PocketBase** (el superusuario, que se salta todas las reglas de API):

```bash
curl -s -X POST http://localhost:8090/api/collections/usuarios/records \
  -H "Authorization: $TOKEN" -H "Content-Type: application/json" \
  -d '{
    "email":"carossiosistemas@gmail.com",
    "password":"UNA_CONTRASEÑA_SEGURA",
    "passwordConfirm":"UNA_CONTRASEÑA_SEGURA",
    "nombre":"Administración CyV",
    "rol":"admin",
    "activo":true,
    "emailVisibility":true
  }'
```

Con esa cuenta ya se puede loguear en `rendiciones.html` y, desde el panel
de Administración → pestaña **Usuarios**, crear el resto (operadores y
otros admins) sin volver a tocar la terminal.

> Nota: el token de admin de PocketBase (superusuario, `./pocketbase admin
> create` / `/api/admins/auth-with-password`) es distinto del login de la
> app (`usuarios` / `/api/collections/usuarios/auth-with-password`). El
> primero es para administrar el propio PocketBase (colecciones, reglas);
> el segundo es el que usa la gente para entrar al formulario.

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
cp rendiciones.html /home/ubuntu/pocketbase/pb_public/index.html
sudo systemctl restart pocketbase   # por si hace falta que detecte la carpeta nueva
```

Se copia dos veces (mismo contenido, dos nombres) para que la app quede
disponible tanto en la raíz del dominio como en la URL con nombre:

```
https://app.carossiovairolatti.com.ar/
https://app.carossiovairolatti.com.ar/rendiciones.html
```

Como se sirve desde el mismo origen que la API, el campo **"URL base de
PocketBase"** en `⚙ Config` puede quedar en blanco.

Si en algún momento se prefiere abrir el archivo localmente con doble clic en
vez de por HTTPS, hay que configurar ahí mismo la URL pública
(`https://app.carossiovairolatti.com.ar`).

## 3. Uso

1. Abrir el archivo / la URL. Pide **login** (email + contraseña) — ver
   [Bootstrap](#bootstrap-primer-usuario-admin) para la primera cuenta.
2. `⚙ Config`: cargar la URL de PocketBase, solo si hace falta (normalmente
   no, porque se sirve del mismo origen).
3. Elegir **chofer** y **mes**, cargar/guardar la **tarifa por km** y el
   **valor de viático por noche** del mes (ver nota abajo) — "Guardar
   valores del mes".
4. **+ Nuevo tramo** para cargar cada tramo del viaje. El total de gastos del
   tramo se calcula automáticamente mientras se completa el formulario.
5. El resumen del mes (arriba de la tabla) muestra: total de vales, km de
   alargue, monto de alargue, total de gastos, viáticos y saldo. Al pie de
   la tabla de tramos hay una fila de **totales**.
6. **⬇ Exportar CSV** descarga todos los campos de los tramos cargados
   (para abrir en Excel); **🖨 Imprimir** genera una vista limpia para
   imprimir o guardar como PDF, con todos los tramos expandidos.

### Panel de Administración (solo rol `admin`)

Botón **👤 Administración** en el header (no aparece para usuarios con rol
`operador`). Cinco pestañas:

- **Choferes** y **Vehículos / Tractores**: para no depender del Admin UI de
  PocketBase para altas de rutina.
- **Clientes**: catálogo de nombres de cliente, se usa como autocompletado
  (datalist) en el campo "Cliente" del formulario de tramo.
- **Rutas frecuentes**: origen + destino (+ cliente habitual opcional).
  Aparecen en el desplegable **"Ruta rápida"** dentro de "Nuevo tramo": al
  elegir una, completa origen, destino y cliente de un clic.
- **Usuarios**: alta de cuentas (email, contraseña, nombre, rol), cambiar
  el rol de un usuario existente (Hacer admin / Hacer operador), desactivar
  y borrar. No se puede desactivar ni borrar el propio usuario logueado
  (evita quedarse afuera por error).

Cada fila (salvo Usuarios) tiene **Desactivar/Reactivar** (no aparece más en
los selectores pero no se pierde el historial de tramos que la usaron) y
**Borrar** (elimina el registro; no borra los tramos que ya lo referencian).

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
  `valor_viatico_noche` del mes (campo de la colección `tarifas`, se carga
  junto con la tarifa por km en la pantalla principal).

> **Pendiente de confirmar con la empresa:** la regla exacta de cálculo de
> `viaticos` no estaba especificada. Se implementó como
> `noches de permanencia × valor fijo por mes`, guardado en PocketBase
> (compartido por todos los usuarios, no por navegador). Si la regla real
> es distinta (por ejemplo, distinto valor según destino, según chofer, o
> un tope), avisar para ajustar la fórmula.

## Próximos pasos sugeridos (fuera de fase 1)

- Exportar la rendición del mes a PDF/Excel.
- Cierre de mes (bloquear edición de tramos de meses cerrados).
- "Olvidé mi contraseña" / cambio de contraseña propio (hoy solo un `admin`
  puede resetear la contraseña de otro usuario, editándolo en PocketBase
  Admin UI o vía API — no hay flujo de auto-servicio en la app).
- Refresh automático del token de sesión (PocketBase expira los tokens;
  hoy si expira, la app fuerza el logout y hay que volver a loguearse).
