# Carossio Vairolatti — Sistema Integral

Aplicación web interna de la empresa, pensada como un **shell con módulos**:
login único, un panel de Inicio con los módulos habilitados para cada
usuario, y una barra lateral para navegar entre ellos. El primer módulo
construido es **Planilla Choferes** (grupo "Liquidación"), que reemplaza el
Excel de rendiciones. Es un único archivo HTML (`rendiciones.html`), sin
frameworks ni build step, que habla directamente con PocketBase vía REST
(`fetch`) y funciona offline con una cola en `localStorage`.

## Arquitectura de módulos

Los módulos se definen en un solo lugar del código, la constante `MODULES`
(al principio del `<script>`):

```js
const MODULES = [
  { id: 'planilla_choferes', label: 'Planilla Choferes', group: 'Liquidación', icon: '🚛' },
];
```

Para agregar un módulo nuevo:
1. Sumar una entrada acá (`id` único, `label`, `group` — la sección donde
   aparece en la barra lateral —, `icon`).
2. Agregar su link en el sidebar (`<a class="nav-item" id="navMod_<id>">`)
   y su vista (`<main id="...">`, siguiendo el patrón de `mainView`).
3. Sumar el caso correspondiente en `openModule(id)`.

El resto —tarjeta en el Inicio, aparición/ocultamiento en el sidebar según
permisos, checklist en el alta de usuarios y en "Módulos" por usuario— sale
solo del registro `MODULES`, no hace falta tocarlo aparte.

**Permisos por usuario:** cada usuario con rol `operador` tiene un array
`modulos` (campo de la colección `usuarios`) con los ids de los módulos que
puede ver. Un `admin` ve todos los módulos siempre, sin necesidad de
asignárselos. Se administra desde 👤 Administración → pestaña Usuarios
(al crear la cuenta, o después con el botón "Módulos" en cada fila).

## Archivos

- `rendiciones.html` — la aplicación completa (abrir con doble clic o servir
  desde Caddy). El nombre del archivo quedó así por continuidad con la fase
  1, aunque ya no es solo "rendiciones" — es el shell completo de la app.
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

#### Agregar el campo `modulos` (si la colección `usuarios` ya existía)

El sistema de módulos agrega un campo `modulos` (JSON, array de ids) a
`usuarios`. Si la colección se creó en el servidor **antes** de esta
funcionalidad, hay que agregarle el campo a mano:

```bash
curl -s http://localhost:8090/api/collections/usuarios -H "Authorization: $TOKEN" > /tmp/usuarios_schema.json
python3 -c "
import json
d = json.load(open('/tmp/usuarios_schema.json'))
names = [f['name'] for f in d['schema']]
if 'modulos' not in names:
    d['schema'].append({'name':'modulos','type':'json','required':False,'options':{}})
print(json.dumps(d))
" > /tmp/usuarios_schema_new.json
curl -s -X PATCH http://localhost:8090/api/collections/usuarios -H "Authorization: $TOKEN" -H "Content-Type: application/json" -d @/tmp/usuarios_schema_new.json
```

Los usuarios ya logueados en el navegador antes de este cambio no van a
tener `modulos` en su sesión guardada hasta que vuelvan a loguearse
(cerrar sesión y entrar de nuevo alcanza).

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

La app usa **rutas reales** (History API — `/inicio`,
`/liquidacion/planilla-choferes`, `/administracion/usuarios`, etc., sin
`#`), así que Caddy tiene que saber devolver `index.html` para cualquier
ruta que no sea la API o el Admin UI de PocketBase (si no, F5 en
`/administracion` da 404). El Caddyfile actual del servidor es:

```
app.carossiovairolatti.com.ar {
    handle /api/* {
        reverse_proxy localhost:8090
    }
    handle /_/* {
        reverse_proxy localhost:8090
    }
    handle {
        root * /home/ubuntu/pocketbase/pb_public
        try_files {path} /index.html
        file_server
    }
}

:80 {
    reverse_proxy localhost:8090
}
```

`/api/*` (REST + realtime) y `/_/*` (Admin UI de PocketBase) se siguen
proxeando a PocketBase. Todo lo demás lo sirve Caddy directo desde
`pb_public`, y si el archivo pedido no existe (porque es una ruta de la
app, no un archivo real) cae en `index.html` — ahí arranca la app y su
router de JS (`routeFromPath()`) decide qué mostrar según la URL.

Copiar el HTML sigue siendo así:

```bash
mkdir -p /home/ubuntu/pocketbase/pb_public
cp rendiciones.html /home/ubuntu/pocketbase/pb_public/rendiciones.html
cp rendiciones.html /home/ubuntu/pocketbase/pb_public/index.html
```

(los dos nombres tienen el mismo contenido; `index.html` es el que usa el
`try_files` de Caddy como fallback, `rendiciones.html` queda como alias por
compatibilidad con links viejos).

**Permisos:** Caddy corre como usuario `caddy`, que necesita poder leer
`pb_public` y atravesar las carpetas hasta ahí:

```bash
sudo chmod o+x /home/ubuntu /home/ubuntu/pocketbase
sudo chmod -R o+rX /home/ubuntu/pocketbase/pb_public
```

**Al editar el Caddyfile:** siempre `sudo caddy validate --config
/etc/caddy/Caddyfile` antes de `sudo systemctl reload caddy` — si la config
tiene un error, `reload` no tira el servicio actual, pero mejor no
arriesgar. Backup rápido antes de tocarlo: `sudo cp /etc/caddy/Caddyfile
/etc/caddy/Caddyfile.bak`.

## 2b. Publicar la app React (`web/`)

El frontend se migró de un único HTML a una app **React + TypeScript +
Vite** que vive en `web/`. Mantiene el mismo diseño, las mismas rutas
limpias (`/inicio`, `/liquidacion/planilla-choferes`,
`/administracion/:tab`) y habla con PocketBase con el SDK oficial
(`pocketbase` npm), así que el Caddyfile de arriba (proxy de `/api/*` y
`/_/*`, `try_files` a `index.html` para todo lo demás) sigue sirviendo tal
cual — no hay que tocarlo.

Compilar y publicar:

```bash
cd web
npm install      # solo la primera vez o si cambió package.json
npm run build     # tsc -b && vite build -> genera web/dist/
```

Copiar el resultado a `pb_public` (reemplaza el contenido, no lo mezcla):

```bash
rm -rf /home/ubuntu/pocketbase/pb_public/assets
cp -r web/dist/* /home/ubuntu/pocketbase/pb_public/
sudo chmod -R o+rX /home/ubuntu/pocketbase/pb_public
```

`web/dist/index.html` reemplaza al `index.html` viejo (el que era una
copia de `rendiciones.html`); `rendiciones.html` puede quedar en
`pb_public` como referencia/fallback mientras se termina de validar la
migración en producción, pero ya no es lo que sirve la app en `/`.

## 2c. Cambios de estructura en la base (`pb_migrations/`)

PocketBase versiona los cambios de esquema (crear una colección, agregar
un campo, etc.) como archivos JavaScript en una carpeta `pb_migrations/`.
Con `--automigrate` activado (es el default), cada vez que se edita una
colección desde el panel (`/_/`), PocketBase escribe solo el archivo de
migración correspondiente en `/home/ubuntu/pocketbase/pb_migrations/` —
y al arrancar, aplica automáticamente cualquier migración nueva que
encuentre ahí.

Esa carpeta del servidor está versionada en este repo (`pb_migrations/`
en la raíz) para tener el historial completo de la estructura de la base
a salvo y poder trabajarla como código, en vez de perder cambios como
pasó una vez con el campo `modulos` de `usuarios` (quedó declarado en
PocketBase pero la columna real nunca se creó, hasta que se lo volvió a
agregar desde el panel).

**Flujo para un cambio de estructura nuevo** (agregar un campo/colección):

1. Se escribe el archivo de migración (mismo formato que los que ya hay
   en `pb_migrations/`) y se sube al repo.
2. En el servidor:
   ```bash
   cd ~/cyv-app
   git pull
   cp pb_migrations/<archivo_nuevo>.js /home/ubuntu/pocketbase/pb_migrations/
   sudo systemctl restart pocketbase   # o como esté corriendo el proceso
   ```
   Al reiniciar, PocketBase aplica la migración sola.
3. Si en cambio el cambio se hizo primero a mano desde el panel (`/_/`),
   el archivo nuevo aparece solo en `/home/ubuntu/pocketbase/pb_migrations/`
   — en ese caso el paso es al revés: copiarlo al repo y subirlo:
   ```bash
   cp /home/ubuntu/pocketbase/pb_migrations/<archivo_nuevo>.js ~/cyv-app/pb_migrations/
   cd ~/cyv-app
   git add pb_migrations/<archivo_nuevo>.js
   git commit -m "..."
   git push
   ```

**Nunca** se versiona `pb_data/` (la base de datos real, con información
de la empresa y hashes de contraseñas) — el `.gitignore` de la raíz ya lo
excluye explícitamente.

## 3. Uso

1. Abrir la URL. Pide **login** (usuario/email + contraseña) — ver
   [Bootstrap](#bootstrap-primer-usuario-admin) para la primera cuenta.
2. **Filtrar tramos**: elegir **chofer** y un rango **Desde / Hasta**, y
   "Buscar". Por defecto arranca en el mes actual (día 1 a hoy), pero se
   puede pedir cualquier rango — un día suelto, una quincena, varios meses.
3. **Tarifa y viático por mes**: independiente del filtro de arriba. Se
   elige el mes y se carga/guarda la **tarifa por km** y el **valor de
   viático por noche** de ese mes (ver nota abajo) — "Guardar valores del
   mes". Cada tramo usa automáticamente la tarifa del mes al que pertenece
   su fecha, así que un rango que cruce varios meses calcula bien aunque
   haya cambiado la tarifa en el medio.
4. **+ Nuevo tramo** para cargar cada tramo del viaje — pide **día, mes y
   año completos** (fecha de salida y de llegada). El "mes" que antes se
   elegía aparte ya no existe como campo separado: se calcula solo a partir
   de la fecha de salida. El total de gastos del tramo se calcula
   automáticamente mientras se completa el formulario.
5. El resumen (arriba de la tabla) muestra: total de vales, km de alargue,
   monto de alargue, total de gastos, viáticos y saldo, para todos los
   tramos que entran en el filtro Desde/Hasta. Al pie de la tabla de tramos
   hay una fila de **totales**.
6. **Exportar CSV** descarga todos los campos de los tramos filtrados
   (para abrir en Excel); **Imprimir** genera una vista limpia para
   imprimir o guardar como PDF, con todos los tramos expandidos.

### Panel de Administración (solo rol `admin`)

Link **👤 Administración** en la barra lateral (no aparece para usuarios con
rol `operador`). Cinco pestañas:

- **Choferes** y **Vehículos / Tractores**: para no depender del Admin UI de
  PocketBase para altas de rutina.
- **Clientes**: catálogo de nombres de cliente, se usa como autocompletado
  (datalist) en el campo "Cliente" del formulario de tramo.
- **Rutas frecuentes**: origen + destino (+ cliente habitual opcional).
  Aparecen en el desplegable **"Ruta rápida"** dentro de "Nuevo tramo": al
  elegir una, completa origen, destino y cliente de un clic.
- **Usuarios**: alta de cuentas (usuario, contraseña, nombre, email
  opcional, rol y **módulos habilitados**), cambiar el rol (Hacer admin /
  Hacer operador), editar los módulos de un usuario existente (botón
  "Módulos" en su fila), desactivar y borrar. No se puede desactivar ni
  borrar el propio usuario logueado (evita quedarse afuera por error).

Cada fila (salvo Usuarios) tiene **Desactivar/Reactivar** (no aparece más en
los selectores pero no se pierde el historial de tramos que la usaron) y
**Borrar** (elimina el registro; no borra los tramos que ya lo referencian).

### Offline

Si no hay conexión al guardar un tramo o una tarifa, la operación se guarda
en una cola local (`localStorage`) y se ve reflejada igual en la pantalla
con una etiqueta **"pend."**. El botón **Sincronizar** (o la reconexión
automática) reintenta enviar todo lo pendiente a PocketBase.

## Cálculos automáticos

Todo se calcula sobre los tramos que entran en el filtro **Desde/Hasta**
actual (no un mes fijo). Cada tramo guarda su propio campo `mes` (calculado
solo, `YYYY-MM` de su `dia_salida`) y usa la tarifa/viático **de ese mes**
— si el rango filtrado cruza dos meses con tarifas distintas, cada tramo
aporta con la que corresponde a su propia fecha.

- `total_gastos` (por tramo) = suma de peajes + gastos_varios + comida_viaje
  + comida_internacional + entrega_retiro_sfco + interrupcion + cyd_manual
  + control_gral + descanso.
- `total_vales` = suma de `vale_importe` de los tramos filtrados.
- `total_km_alargue` = suma de `km_alargue` de los tramos filtrados.
- `monto_alargue` = suma, por cada tramo, de `km_alargue × tarifa_km` del
  mes de ese tramo.
- `total_gastos` (resumen) = suma de `total_gastos` de los tramos filtrados.
- `saldo` = `total_vales` − `total_gastos`.
- `viaticos` = suma, por cada tramo, de `permanencia × valor_viatico_noche`
  del mes de ese tramo (`tarifas.valor_viatico_noche`, se carga en la
  sección "Tarifa y viático por mes", separada del filtro de tramos).
- Si a algún tramo del filtro le falta la tarifa de su mes, el resumen
  muestra qué mes falta configurar en vez de calcular mal.

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
