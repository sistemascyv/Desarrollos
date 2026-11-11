# Fichadas: Vacaciones/Licencias — diseño

## Contexto

RRHH lleva hoy, 100% a mano en Excel, las vacaciones de todo el personal:
`LIC-CHOF.xls` (choferes) y `LICENCIA VACACIONES - {ADMINISTRATIVOS, BSAS,
CBA, OPERATIVOS}.xls` (un archivo por grupo/sucursal), más
`GRAL VACACIONES.xlsx` (consolidado de todos los grupos, con una columna
"NOT." de notificado). Cada archivo repite, por legajo, las mismas fechas
Desde/Hasta en 2-3 hojas distintas ("hoja del año", "lista vac", "calculo
vac"), y los días que le corresponden a cada persona salen de una fórmula
de antigüedad que ya está bien resuelta en el Excel — lo único que falta es
sacarla de ahí y dejar de tipear la misma fecha en 3 lugares.

Esto es un tema separado de Horas Extras/Ausentismo/Rotación, que ya están
implementados en la pestaña "Estadísticas" de Fichadas (specs del
2026-10-16 y 2026-10-20) — ninguno de esos tres toca vacaciones: la lista
de causas de Ausentismo a propósito no incluye "Vacaciones" (es un
beneficio programado, no una ausencia a justificar).

Confirmado con el usuario:

- Cubre a todo el personal de una (choferes + administrativos + operativos
  de las 3 sucursales), no por grupos separados.
- No se migra el historial 2002-2025 de los Excel — se carga únicamente lo
  ya asignado para 2026, y de ahí en adelante todo se asigna en la app.
- El sistema avisa (no bloquea) si una asignación hace que la persona se
  pase de los días que le corresponden ese año.
- "Notificado" queda como casillero manual — el personal no tiene usuario
  en el sistema, no hay forma de avisarle automáticamente.
- Las restricciones tipo "Julian y Diego no pueden salir al mismo tiempo"
  se modelan como grupos armados a mano por RRHH, y el sistema avisa (no
  bloquea) si una asignación se solapa con la de alguien de su mismo
  grupo.
- Para antigüedad menor a 1 año, se replica tal cual la fórmula que ya
  usaba el Excel (ver más abajo), aunque da un resultado muy por debajo
  del proporcional real que marca la ley — no se "corrige", para no
  cambiar los números que RRHH ya conoce.

## Qué ya existe y se reutiliza

- `fichadas_legajos`: ya tiene `nro_legajo`, `nombre`, `empresa` (relación
  a `fichadas_empresas` — ya separa CBA/BS AS/ROSARIO/ADMINISTRATIVOS/
  OPERATIVOS - CARGA GENERAL/ADM. TRAFICO/MANTENIMIENTO), `estado`,
  `fecha_alta`, `fecha_baja`. No hace falta ninguna colección nueva para
  "quién es quién" ni para agrupar por sucursal/área — ya está.
- **Gap real encontrado:** `fecha_alta` está vacío para la mayoría del
  personal con antigüedad vieja (solo se completó para 15 legajos puntuales
  vía la migración `1789180000_backfill_fecha_alta_desde_cintia.js`, que
  dice explícitamente "los demás legajos activos no tenían ningún dato de
  alta en CINTIA — quedan sin cambios"). Sin `fecha_alta` no se puede
  calcular "días que corresponden". La columna "Ingreso" de los 5 Excel de
  licencias SÍ tiene esa fecha para prácticamente todo el personal activo
  — se usa como fuente para completar `fecha_alta` donde falte (ver
  Migración).

## Modelo de datos nuevo

### `fichadas_vacaciones`

| Campo | Tipo | Notas |
|---|---|---|
| `legajo` | relation → `fichadas_legajos` | requerido, 1 |
| `desde` | text (`YYYY-MM-DD`, min/max 10, igual convención que `fichadas_marcas.fecha`) | requerido |
| `hasta` | text (`YYYY-MM-DD`) | requerido |
| `comentario` | text | opcional — nota libre sobre ese período |
| `notificado` | bool | opcional, default false — casillero manual |

Reglas:
- Un período "pertenece" al año de su fecha `desde` (igual criterio que las
  columnas por año del Excel: un período que arranca en diciembre y
  termina en enero cuenta para el año en que arranca).
- `listRule`/`viewRule`/`createRule`/`updateRule` igual patrón que
  `fichadas_novedades` (`@request.auth.rol = "admin" || @request.auth.modulos ?= "fichadas"`),
  `deleteRule` solo admin.

### `fichadas_grupos_restriccion`

| Campo | Tipo | Notas |
|---|---|---|
| `nombre` | text | opcional, para identificar el grupo (ej. "Julian y Diego") |
| `legajos` | relation → `fichadas_legajos`, múltiple (mínimo 2) | las personas que no pueden coincidir entre sí |

Mismas reglas de acceso que `fichadas_vacaciones`.

## Cálculo: días que corresponden

Igual fórmula que ya usaba el Excel (`LIC-CHOF.xls`, hoja de cada año,
columna A), con fecha de referencia el **31/12 del año elegido**:

```
antiguedadAnios = (refFinDeAnio - fecha_alta) en días / 365

si antiguedadAnios > 1:
    < 5   años → 14 días
    < 10  años → 21 días
    < 20  años → 28 días
    >= 20 años → 35 días
si antiguedadAnios <= 1:
    antiguedadAnios * 14 / 100   // tal cual el Excel; no es el proporcional legal real
```

Legajos sin `fecha_alta` cargada (y sin poder completarla por la
migración): "días que corresponden" se muestra como "—" (no calculable),
no se avisa de exceso para esos casos.

## Cálculo: días asignados / restantes (por legajo y año)

- `díasAsignados` = suma de `(hasta - desde + 1)` de cada período de
  `fichadas_vacaciones` de ese legajo cuyo `desde` cae en el año elegido.
- `díasRestantes` = `díasQueCorresponden - díasAsignados` (puede ser
  negativo).
- Si al guardar un período nuevo `díasAsignados` (incluyendo el nuevo
  período) supera `díasQueCorresponden`: guardar igual, mostrar aviso
  (toast `warn`), no bloquear.

## Cálculo: solapamiento de grupo de restricción

Al guardar un período para `legajoX` con fechas `[desde, hasta]`:
1. Buscar los grupos de `fichadas_grupos_restriccion` donde `legajoX` esté
   en `legajos`.
2. Para cada otro legajo del mismo grupo, buscar sus períodos de
   `fichadas_vacaciones` (cualquier año) donde `desde_otro <= hasta` **y**
   `hasta_otro >= desde` (solapamiento de rangos).
3. Si hay alguno: guardar igual, mostrar aviso (toast `warn`) nombrando a
   la persona y el período con el que se solapa. No bloquea.

## Pantalla

Nueva pestaña **"Vacaciones"** en Fichadas, al lado de Carga/Configuración/
Resultados/Estadísticas.

- Selector de año arriba (mismo estilo que Estadísticas).
- Tabla principal, una fila por legajo activo (+ los que tuvieron algún
  período ese año aunque ya estén de baja): Legajo, Nombre, Área (de
  `empresa.nombre`), Antigüedad, Días que corresponden, Días asignados,
  Días restantes, y debajo de cada fila sus períodos del año
  (Desde/Hasta/Comentario/casillero Notificado editable inline).
- Botón "Asignar período": formulario con selector de legajo (buscar por
  nombre/legajo), fecha Desde, fecha Hasta, comentario opcional. Al
  guardar, corre las dos validaciones de arriba (exceso de días,
  solapamiento de grupo) y muestra los avisos que correspondan sin
  impedir guardar.
- Vista de lista consolidada (reemplaza `GRAL VACACIONES.xlsx`): todos los
  períodos del año elegido, ordenados por fecha Desde, con filtro por
  Área.
- Pantalla chica para armar los grupos de restricción (listado +
  crear/editar/borrar grupo, elegir sus legajos).

## Migración inicial (2026)

Un único paso de datos, hecho como migración de PocketBase (mismo patrón
ya usado para `fichadas_legajos` en
`1788920000_seed_fichadas_legajos_1.js`/`..._2.js`: parsear los datos una
vez con un script aparte y embeber el resultado como JSON literal en el
archivo de migración, para que sea reproducible en cualquier entorno
— local, staging, producción):

1. **Backfill de `fecha_alta`**: para cada legajo activo con `fecha_alta`
   vacío, buscar su fecha "Ingreso" en los 5 Excel de licencias (match por
   `nro_legajo`, con fallback por nombre si no matchea) y completarla.
2. **Carga de períodos 2026**: leer `GRAL VACACIONES.xlsx` (hojas
   `SUCURSALES` y `CHOFERES`, que ya están consolidadas con columna
   "NOT.") y crear un registro en `fichadas_vacaciones` por cada fila con
   Desde en 2026, con `notificado = true` si la columna dice "SI".
   Match por `nro_legajo`. Las filas que no matcheen ningún legajo
   existente se reportan en el log de la migración, no se inventan
   legajos nuevos.

## Fuera de alcance

- No se migra el histórico 2002-2025 de ningún archivo — queda en los
  Excel viejos como archivo de consulta.
- No hay autoservicio ni notificación automática al empleado — "Notificado"
  es un casillero manual.
- El chequeo de solapamiento de grupo y el de exceso de días son solo
  avisos (toast), nunca bloquean el guardado.
- No se corrige la fórmula de antigüedad menor a 1 año — se replica tal
  cual, aunque no coincida con el proporcional real de la ley.
- No se valida ninguna relación entre el campo `comentario` libre y los
  grupos de restricción — son independientes.
- No se toca nada de Horas Extras/Ausentismo/Rotación (ya implementados).

## Testing

Mismo criterio que el resto de Fichadas: funciones de cálculo (días que
corresponden, días asignados/restantes, detección de solapamiento de
grupo) probadas con `tsx` de forma aislada (sin PocketBase), cubriendo:
antigüedad en cada uno de los 4 escalones + el caso <1 año, período que
cruza fin de año (cuenta para el año de su `desde`), exceso de días
(avisa, no bloquea), solapamiento dentro del mismo grupo vs. entre
legajos sin relación (no avisa), y legajo sin `fecha_alta` (muestra "—").
La migración de backfill + carga 2026 se prueba contra una PocketBase
local real, igual que las demás migraciones de este módulo.
