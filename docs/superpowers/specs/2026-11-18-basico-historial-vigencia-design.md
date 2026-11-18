# Básico derivado de categoría + histórico de vigencia — Diseño

## Contexto

Hoy el campo `basico` de `fichadas_legajos` es un número de texto libre que carga el administrativo a mano. La categoría de convenio (`fichadas_categorias`) tiene un campo `basico_sugerido` (agregado en el sub-proyecto de Sueldos) que es **solo de referencia** — no impacta nada, así lo dice el propio hint de la pantalla de Categorías.

El usuario pidió dos cambios relacionados:

1. El básico de un legajo debería **derivarse** de la categoría asignada (tomar el `basico_sugerido` de esa categoría) y dejar de poder editarse a mano, línea por línea.
2. El básico necesita **historial por rango de fechas**: cuando cambia (por cambio de categoría de un legajo, o porque se actualiza la escala salarial de una categoría entera), el valor viejo tiene que quedar guardado con su rango de vigencia. Toda liquidación de un período pasado (ej. vacaciones de hace 2 meses) tiene que usar el básico que regía en ESE período, no el actual.

Se relevó el código real y se confirmó que **3 pantallas** leen `legajo.basico` directamente hoy, sin ninguna noción de fecha: Liquidación — Administrativos, Liquidación — Choferes, y **Vacaciones → Asignar/Liquidar** (`AsignarVacacionesSub.tsx`, ya en producción). Las tres quedan dentro del alcance de este cambio.

## Decisiones del usuario

- La fecha de vigencia de un cambio de básico **la elige el usuario en el momento** (no siempre "hoy") — por defecto hoy, pero editable, para poder cargar una escala días después y marcarla retroactiva al 1° del mes, como pasa en la realidad con el convenio.
- Cuando se actualiza el "Básico sugerido" de una categoría completa en Sueldos → Categorías, el cambio se **propaga automáticamente** a todos los legajos que tengan esa categoría asignada (no hay que tocarlos uno por uno).

## Alcance

### 1. Colección nueva: `sueldos_basico_historial`

Un tramo de tiempo con un básico fijo, por legajo.

| Campo | Tipo | Notas |
|---|---|---|
| `legajo` | relation → `fichadas_legajos` | requerido, 1, cascadeDelete: true |
| `categoria` | relation → `fichadas_categorias` | requerido, 1 — queda para auditoría, aunque el valor ya está congelado en `basico` |
| `basico` | number | requerido, min 0 — el valor congelado de ese tramo |
| `vigencia_desde` | text "YYYY-MM-DD" | requerido |
| `vigencia_hasta` | text "YYYY-MM-DD" | opcional — vacío = tramo vigente actual (abierto) |

Permisos: lectura igual que `fichadas_categorias` hoy (`admin` || `vacaciones` || `fichadas` || `personal` || `sueldos`) — son los mismos módulos que ya leen categorías y van a necesitar resolver básico histórico. Escritura: `admin` || `personal` || `sueldos` (las dos pantallas que la escriben). Borrado: `admin`.

No hay UI para editar o borrar un tramo ya cargado — si se carga mal, corrección manual en la base (fuera de alcance, ver abajo).

### 2. Personal → Empleados: categoría con vigencia, básico de solo lectura

- La columna "Básico" de la tabla de empleados pasa a ser texto de solo lectura (ya no hay `<input>` editable) — muestra `legajo.basico`, que queda como caché del valor actual.
- La columna "Categoría" deja de ser un `<select>` de cambio directo. Pasa a mostrar el nombre de la categoría actual + un botón "Cambiar categoría" (o "Asignar categoría" si el legajo no tiene ninguna todavía) que abre un modal, con el mismo patrón ya usado en este archivo para "Dar de baja" (estado `idEnBaja`/`fechaBaja`/`motivoBaja`).
- El modal pide: nueva categoría (select) + "Vigente desde" (date, por defecto hoy; si el legajo no tiene categoría previa, por defecto su `fecha_alta` si existe). Al confirmar:
  1. Si la categoría elegida no tiene `basico_sugerido` cargado, bloquea con aviso ("Esta categoría no tiene Básico sugerido cargado — completalo primero en Sueldos → Categorías.").
  2. Si existe un tramo abierto para ese legajo (`vigencia_hasta` vacío) y la nueva fecha de vigencia es anterior o igual a su `vigencia_desde`, bloquea con aviso ("La fecha de vigencia no puede ser anterior al inicio del tramo actual.").
  3. Si existe un tramo abierto, lo cierra (`vigencia_hasta` = día anterior a la nueva fecha de vigencia).
  4. Crea un tramo nuevo: `legajo`, `categoria` = la elegida, `basico` = `basico_sugerido` de esa categoría, `vigencia_desde` = la fecha elegida, `vigencia_hasta` vacío.
  5. Actualiza `fichadas_legajos.categoria` y `fichadas_legajos.basico` con los mismos valores (caché del "actual", para no tener que tocar cada pantalla que hoy solo muestra el básico de un vistazo).

### 3. Sueldos → Categorías: cascada al actualizar el Básico sugerido

- El formulario de edición de una categoría (no el de creación) gana un campo "Vigente desde" (date), que se vuelve requerido únicamente cuando el valor de "Básico sugerido" cambió respecto al que tenía la categoría antes de abrir la edición.
- Al guardar, si `basico_sugerido` cambió:
  1. Actualiza la categoría como ya hace hoy.
  2. Busca todos los legajos con `categoria` = esa categoría.
  3. Para cada uno, repite los pasos 3–5 de la sección anterior (cerrar tramo abierto si existe, abrir uno nuevo con el nuevo básico desde la fecha indicada, actualizar el caché en `fichadas_legajos`).
- Si `basico_sugerido` no cambió (se edita solo un %, por ejemplo), no se toca ningún legajo ni se pide fecha.

### 4. Consumidores: resolver el básico vigente al período, no el actual

Se agrega a `motor.ts` una función compartida:

```ts
function basicoVigente(historial: SueldosBasicoHistorial[], legajoId: string, fecha: string): number | null
```

Filtra el historial de ese legajo a los tramos donde `vigencia_desde <= fecha && (!vigencia_hasta || vigencia_hasta >= fecha)`, y devuelve el `basico` del más reciente (por si hubiera superposición). Devuelve `null` si no hay ningún tramo que cubra esa fecha.

Las 3 pantallas pasan de usar `legajo.basico` a:
- **Liquidación — Administrativos** y **Liquidación — Choferes**: resuelven el básico vigente al primer día del mes elegido (`anioMes-01`).
- **Vacaciones → liquidar período**: resuelve el básico vigente a la fecha de inicio del período de vacaciones (`v.desde`).

Si `basicoVigente` devuelve `null`, la pantalla muestra un aviso ("No se encontró un básico vigente para este período — revisá el historial en Personal → Empleados.") y no calcula nada — mismo criterio ya establecido en este proyecto de no inventar números de plata.

### 5. Migración de datos existentes (backfill)

Para cada `fichadas_legajos` que hoy ya tiene `categoria` y `basico` cargados, se crea un tramo inicial: `legajo`, `categoria` = la actual, `basico` = el actual, `vigencia_desde` = `fecha_alta` del legajo (o `"2020-01-01"` si no tiene fecha de alta cargada, para cubrir cualquier período pasado que se quiera liquidar), `vigencia_hasta` vacío (abierto). Esto preserva el valor actual como válido "desde siempre" — no hay forma de reconstruir cambios de básico que pasaron antes de este cambio y no quedaron registrados.

Legajos sin `categoria` o sin `basico` cargado hoy no reciben ningún tramo (quedan sin histórico hasta que se les asigne categoría por primera vez con el flujo nuevo).

## Fuera de alcance

- Editar o borrar un tramo de vigencia ya cargado desde la interfaz.
- Prorratear el básico cuando un cambio cae a mitad de un período de liquidación (igual que hoy, que tampoco prorratea el básico por días trabajados).
- Permitir cargar un básico que no coincida con ninguna categoría (un "override" manual por legajo) — si hace falta en el futuro, se revisa aparte.
- Reportes o pantallas nuevas para visualizar el historial de básico de un legajo (se puede agregar después si hace falta).

## Testing

Sin tests automatizados de frontend (igual que el resto del proyecto). Verificación manual:
- Migración: levantar PocketBase de prueba, confirmar que cada legajo con categoría+básico cargado tiene exactamente un tramo abierto con el valor y fecha esperados.
- Personal: cambiar la categoría de un legajo con una fecha de vigencia futura/pasada, confirmar que el tramo viejo se cierra el día anterior y el nuevo queda abierto, y que la tabla muestra el básico actualizado.
- Categorías: editar el Básico sugerido de una categoría con legajos asignados, confirmar que todos reciben un tramo nuevo y su básico en Personal se actualiza.
- Liquidación (Administrativos, Choferes, Vacaciones): liquidar un período anterior a un cambio de básico y confirmar que usa el valor viejo, no el actual.
