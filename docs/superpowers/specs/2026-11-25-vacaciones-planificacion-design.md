# Planificación de vacaciones (cuadro día por día) — Diseño

## Contexto

El usuario armaba a mano una "PLANILLA DE COMUNICADOS" (confirmado en el Excel real `LIC-CHOF.xls`, hoja "DETALLE 2026 (3)"): un cuadro día por día donde se ve quién está de vacaciones ese día, para poder organizar sin pisar a demasiada gente junta, más una columna de notas operativas libres (ej. "2 ABIERTOS 2 FURGONES", "CEBALLES Y CHIATELLINO FINALIZA VAC 2025"). Hoy el sistema (módulo Vacaciones) ya guarda los períodos asignados (`fichadas_vacaciones`) pero solo se ven como lista de períodos, no como un cuadro de planificación día por día.

Confirmado con el usuario: el cuadro se arma solo con los períodos que ya existen (no hay que cargar nada de más para que aparezca gente), separado en dos vistas — Administrativos y Choferes — y además necesita poder anotarse una nota libre por día (no ligada a ningún chofer puntual), igual que en el Excel.

## Alcance

**1. Colección nueva `fichadas_vacaciones_notas`:** una nota de texto libre por día+grupo. Campos: `fecha` (text "YYYY-MM-DD", requerido), `grupo` (select, valores `administrativos`/`choferes`, requerido), `texto` (text, requerido). Permisos: lectura y escritura solo para `admin` o módulo `vacaciones` (son notas operativas de esa única pantalla, no hace falta que otro módulo las lea).

**2. Pestaña nueva "Planificación" en `VacacionesPage.tsx`** (al lado de "Vacaciones" y "Grupos de restricción"), con:
- Un selector "Ver" (Administrativos / Choferes).
- Un rango de fechas Desde/Hasta (por defecto, el mes calendario actual) + botón "Generar".
- Una tabla con una fila por día del rango elegido: columna "Día" (nombre + fecha), columna "De vacaciones" (nombres de los legajos del grupo elegido cuyo período de `fichadas_vacaciones` cubre ese día, como lista de nombres separados por coma — no se replica el formato de columnas crecientes del Excel, es más simple y se lee igual de bien), columna "Nota" (texto editable en el lugar, clic para escribir/editar — mismo patrón ya usado en Fichadas → Resultados para "Cargar horario"/"Asignar novedad": upsert por fecha+grupo contra `fichadas_vacaciones_notas`, sin bloquear nada si queda vacía).

**3. Separación Administrativos/Choferes:** mismo criterio ya usado en el resto del sistema — un legajo es "chofer" si aparece en `choferes.legajo` (de choferes activos, considerando el otro sub-proyecto de vínculo obligatorio), el resto son "administrativos".

## Fuera de alcance

- No se construye ningún cálculo nuevo de "días que corresponden" ni de solapamiento (eso ya existe en la pestaña "Vacaciones" via `detectarSolapamientoGrupo`) — Planificación es solo una vista distinta de los mismos datos, más las notas.
- No se permite asignar o editar un período de vacaciones desde esta pestaña — para eso se usa la pestaña "Vacaciones" existente.
- No se exporta a Excel en esta primera versión (se puede agregar después si hace falta, mismo patrón que ya usan Fichadas/Reportes).

## Testing

Sin tests automatizados de frontend. Verificación con datos reales de prueba: generar un rango de un mes con al menos un legajo administrativo y un chofer de vacaciones superpuestos, confirmar que cada uno aparece en su vista correspondiente (y no en la otra), que un día con 2+ personas de vacaciones las lista a todas, y que escribir/editar/borrar una nota en un día persiste y vuelve a aparecer al regenerar el cuadro.
