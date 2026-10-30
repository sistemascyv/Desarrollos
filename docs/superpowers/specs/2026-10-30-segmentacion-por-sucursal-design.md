# Segmentación por sucursal: Cotizador, Vale de Caja y Recibos — Design

## Contexto

El sistema ya tiene usuarios reales de más de una sucursal (`marcos`, `agostina`, `rrhh`, `cargageneral`: San Francisco; `juanc`: Córdoba, cargado sin que mediara esta conversación). Hoy, Cotizador/Vale de Caja/Recibos no filtran por sucursal en absoluto: cualquier usuario con el módulo correspondiente ve TODOS los registros de TODAS las sucursales. El disparador fue Juan Carossio (Córdoba) viendo en su lista de Cotizador una cotización de San Francisco (`SAN-00000001`) además de la propia (`COR-00000001`).

## Alcance

Segmentar por sucursal del **usuario que creó el registro** (no por tráfico origen/destino) en 3 colecciones: `cotizaciones` (+ `cotizacion_items`, ver abajo), `vales_caja`, `recibos`. Un usuario no-admin solo ve los registros creados por alguien de su misma sucursal. Admin sigue viendo todo, sin excepción.

## Fuera de alcance

- Cualquier otro módulo (Cheques, Fichadas, Combustible, Cubiertas, Planilla Choferes en sí misma, etc.) — quedan para un proyecto aparte si hace falta.
- Mezclar sucursales dentro de un mismo registro, o permitir elegir "crear para otra sucursal" — la sucursal del registro es siempre la del creador, no editable.
- Cambiar el formato de numeración de Vale de Caja/Recibos (siguen sin prefijo de sucursal, a diferencia de Cotizador) — no se pidió y no hace falta para este alcance.

## Enfoque técnico

**Campo nuevo `sucursal`** (select, mismos 4 valores que `usuarios.sucursal`: `cordoba`/`san_francisco`/`rosario`/`buenos_aires`) agregado a `cotizaciones`, `vales_caja` y `recibos`.

**Seteado server-side, no por el cliente.** Los 3 hooks (`pb_hooks/cotizaciones.pb.js`, `vales_caja.pb.js`, `recibos.pb.js`) ya corren en `onRecordBeforeCreateRequest` y ya setean `creado_por` leyendo al usuario autenticado — se extienden para que también seteen `sucursal` ahí mismo, desde `auth.get("sucursal")`. El cliente nunca la manda ni la puede falsear (mismo criterio ya usado para `numero`/`creado_por`).

**Vale de Caja y Recibos hoy NO bloquean la creación si al usuario le falta `sucursal`** (`cotizaciones.pb.js` sí lo hace, con `ForbiddenError`). Se iguala el criterio: los 3 hooks tiran `ForbiddenError` si `auth.get("sucursal")` está vacío. Hoy esto no afecta a nadie real — el único usuario con módulos `vale_caja`/`recibos` (Marcos) ya tiene sucursal cargada.

**Reglas de permiso** (`listRule`/`viewRule`), por colección:

- `cotizaciones` y `cotizacion_items` (estas dos comparten regla hoy, ver `pb_migrations/1789300000_cotizador_modulo_propio.js`):
  ```
  @request.auth.id != "" && (@request.auth.rol = "admin" || (@request.auth.modulos ~ "cotizador" && sucursal = @request.auth.sucursal))
  ```
  `cotizacion_items` no tiene su propio campo `sucursal` (sería redundante con el de su `cotizacion` padre) — usa la relación: `sucursal` arriba se reemplaza por `cotizacion.sucursal` en esta colección puntual. Esto lo encontré recién al escribir la spec: sin este chequeo, alguien podría listar `cotizacion_items` directo y ver ítems de una cotización de otra sucursal aunque no pueda ver el encabezado — lo agrego a este mismo alcance porque es el mismo filtro, solo que a través de la relación, no una decisión nueva.
- `vales_caja` (hoy ya tiene una condición extra por Planilla Choferes, ver `pb_migrations/1789190000_vales_caja_listrule_planilla_choferes.js`):
  ```
  @request.auth.id != "" && (@request.auth.rol = "admin" || @request.auth.modulos ~ "planilla_choferes" || (@request.auth.modulos ~ "vale_caja" && sucursal = @request.auth.sucursal))
  ```
  Quien tiene `planilla_choferes` ve TODOS los vales sin filtrar (confirmado con el usuario: los vales siempre se cargan en San Francisco, así que Planilla Choferes tiene que poder levantarlos todos). `createRule`/`deleteRule` de `vales_caja` no se tocan.
- `recibos`:
  ```
  @request.auth.id != "" && (@request.auth.rol = "admin" || (@request.auth.modulos ~ "recibos" && sucursal = @request.auth.sucursal))
  ```

`createRule` de las 3 no necesita el chequeo de `sucursal` (el hook la setea de forma autoritativa antes de guardar, no hay nada que el cliente pueda mandar ahí que importe).

## Backfill

- **`cotizaciones`**: se deriva del prefijo de `numero` (ya codifica la sucursal de quien la creó): `COR-*` → `cordoba`, `SAN-*` → `san_francisco`, `ROS-*` → `rosario`, `BUE-*` → `buenos_aires`.
- **`vales_caja`** y **`recibos`**: sin prefijo en `numero`. Todos los registros existentes se backfillean a `san_francisco` (único usuario real de estos 2 módulos hasta ahora).

## Casos de borde

- Un admin sin `sucursal` cargada (caso real: `sistemas`) que cree un registro directamente (no vía el formulario normal, que ya bloquea esto en Cotizador) quedaría con `sucursal=""` — invisible para cualquier no-admin de cualquier sucursal, visible solo para otros admin. Aceptado: en la práctica el formulario ya impide esto en Cotizador, y se extiende el mismo bloqueo a Vale de Caja/Recibos con este cambio.
- Si en el futuro se agrega una 5ta sucursal o un usuario cambia de sucursal, los registros ya creados quedan con la sucursal de cuando se crearon (no se "mueven" retroactivamente) — es el comportamiento esperado, coherente con cómo ya funciona el prefijo de numeración del Cotizador.

## Testing

- Build (`npm run build`) no aplica cambios de frontend en este proyecto — es 100% backend (migraciones + hooks). Verificación: sintaxis de cada migración/hook con `node --check`.
- No hay forma de ejecutar esto contra una base real en este entorno (sin PocketBase local) — mismo criterio que la migración de categoría del Cotizador (ver plan del mismo día). El despliegue real (vía el pipeline de CI/CD, que ya sincroniza `pb_migrations/`/`pb_hooks/` y reinicia PocketBase en cada push) y su verificación en producción quedan a cargo del controller después del merge.
- Verificación manual post-deploy (por el usuario, con los 2 usuarios reales que ya existen): Juan Carossio (Córdoba) debería ver solo `COR-00000001` en Cotizador; Marcos (San Francisco) debería seguir viendo lo suyo de Vale de Caja/Recibos/Cotizador sin cambios; admin (`sistemas`) debería seguir viendo todo en los 3 módulos.
