# Fichadas: Ausentismo - Estadística — diseño

## Contexto

RRHH arma a mano, todos los años, un Excel ("Ausentismo por Causa - Año
NNNN") con el ausentismo agrupado por causa (Enfermedad, Accidente,
COVID-19, etc.), mes a mes, con un % sobre las horas posibles. El sistema
ya sabe, día por día, quién faltó y si tiene una justificación cargada
(`fichadas_novedades`) — lo que falta es que esa justificación tenga una
**causa** de una lista fija (hoy es texto libre) y una pantalla que
arme el resumen mensual/anual, igual que ya se hizo para Horas Extras
(spec `2026-10-16-fichadas-horas-extras-estadistica-design.md`, ya
implementada).

Confirmado con el usuario:

- La lista de causas es la misma que ya usaba el Excel, sin cambios:
  Enfermedad, Accidente, COVID-19, Examen, Permiso Gremial,
  Capacitación, Casamiento, Nacimiento, Fallecimiento de Familiar,
  Donación de Sangre, Mudanza, Fam. Enfermo, Razones Particulares,
  Maternidad, Cuarentena, PARO, Suspendido (17 causas).
- El campo de texto libre que ya existe ("Motivo") se mantiene como
  detalle opcional, al lado de la causa nueva (no se reemplaza) — las
  novedades viejas quedan sin causa asignada, sin romper nada.
- Las ausencias **sin ninguna justificación cargada** (lo que el motor ya
  marca como `ausente`) aparecen como una causa más en la tabla, con la
  etiqueta "Sin Justificar" — para que RRHH vea de un vistazo cuánto
  ausentismo todavía no tiene motivo cargado.
- Va dentro de la misma pestaña "Estadísticas" ya existente, con un
  selector arriba (Horas Extras / Ausentismo) que cambia qué tabla se
  ve — mismo año elegido para las dos.

## Modelo de datos

Nuevo campo en `fichadas_novedades`: `causa` (select, opcional, las 17
causas de arriba). El campo `texto` existente no se toca.

No se agrega ninguna otra colección — reutiliza `fichadas_configuracion`
(horas posibles mensuales) ya creada para Horas Extras.

## Qué cuenta como "ausencia" para esta estadística

Un día puntual de un legajo cuenta si:

1. El motor ya lo marca `ausente` (estaba programado para trabajar, cero
   fichadas reales, sin ninguna justificación) → causa = **"Sin
   Justificar"**.
2. Hay una novedad cargada ese día para ese legajo, con una `causa` de la
   lista → cuenta con esa causa.
3. Hay una novedad cargada pero **sin** causa asignada (novedades viejas,
   o alguien que cargó solo el texto libre sin elegir causa) → no entra
   en el agrupado por causa (no se puede clasificar), pero tampoco
   figura como "Sin Justificar" (sí está justificado, solo que sin
   categoría todavía).

**Los feriados quedan completamente afuera** de esta estadística — un
feriado no es la ausencia de una persona puntual, es que no labora nadie
ese día. (El motor ya distingue esto: un feriado se guarda como novedad
con el prefijo `"FERIADO — "`, no como una `fichadas_novedades` real con
`causa`.)

Las "horas ausentes" de un día se miden como las horas que esa persona
tenía programado trabajar ese día (`paresEsperados` — ya lo calcula el
motor para cada `ResultadoDia`, no hace falta ningún dato nuevo), no
horas fichadas (que son cero, justamente por eso es una ausencia).

## Cálculo

Igual que Horas Extras: se agrupa por causa y mes, sumando horas
ausentes de cada causa, y se calcula:

- `Horas` = suma de horas ausentes de esa causa ese mes.
- `%` = `Horas` ÷ (dotación total de la empresa × horas posibles
  mensuales) — mismo denominador que ya existe, reutilizado. A
  diferencia de Horas Extras (que agrupa por área), acá se agrupa por
  **causa** — la dotación usada es el total de la empresa (todas las
  áreas sumadas), no una por causa (una causa no tiene "dotación" propia).
- Fila `TOTAL`: suma de todas las causas.
- Columnas `PROMEDIO` y `TOTAL` anual al final de cada fila, igual que
  Horas Extras.

Mismas reglas ya acordadas para Horas Extras, aplicadas acá también: no
se inventan ausencias de meses futuros (se recorta al día de hoy si el
año elegido es el actual), y las ausencias de ex-empleados en meses
pasados sí cuentan (igual que las horas extra).

## Pantalla

Dentro de la pestaña "Estadísticas" ya existente: un selector arriba
("Horas Extras" / "Ausentismo") que cambia la tabla mostrada, compartiendo
el mismo selector de año y el mismo campo de "horas posibles mensuales"
(un solo valor, usado por las dos estadísticas). La tabla de Ausentismo
tiene una fila por causa (de las 17 + "Sin Justificar") × 12 meses +
promedio + total, más la fila TOTAL — mismo estilo visual que la tabla de
Horas Extras.

En "Asignar novedad" (pestaña Carga y novedades), se agrega un selector
de "Causa" (opcional) al lado del campo de texto libre que ya existe.

## Fuera de alcance

- No se migra el histórico del Excel viejo.
- No hay exportación a Excel todavía (igual que Horas Extras).
- No se valida que la causa elegida tenga sentido con el texto libre
  (son dos campos independientes, sin relación forzada entre sí).

## Testing

Mismo criterio de siempre: migración probada contra una PocketBase local
real, y la función de agregación probada con `tsx` igual que la de Horas
Extras (incluyendo el caso "ausente sin novedad" → causa "Sin
Justificar", el caso "novedad sin causa" → no entra en ninguna causa, y
el caso "feriado" → no cuenta como ausencia de nadie).
