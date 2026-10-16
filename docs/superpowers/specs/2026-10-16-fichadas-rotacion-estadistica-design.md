# Fichadas: Rotación - Estadística — diseño

## Contexto

RRHH arma a mano, todos los años, un Excel ("ROTACIÓN - ESTADISTICA") con
altas y bajas mes a mes, desglosadas por motivo, y un índice de rotación —
este es el 4to y último de los sub-proyectos de Fichadas pedidos
(Horas Extra Fijas, Horas Extras - Estadística y Ausentismo - Estadística
ya están implementados).

De paso, este proyecto agrega **fecha de alta y fecha de baja reales** a
los legajos. Hoy no existe ese dato — solo un interruptor manual
`estado: true/false` — lo que dejó, en los dos sub-proyectos anteriores,
una limitación aceptada y diferida explícitamente a este proyecto: un
ex-empleado sigue contando (horas extra fijas, "Sin Justificar") después
de haberse ido, porque el sistema no sabe cuándo pasó eso. Agregar fecha
de baja real cierra esa limitación de raíz para cualquier legajo que la
tenga cargada.

Confirmado con el usuario:

- `estado` deja de ser un interruptor manual: se deriva de `fecha_baja`
  (activo = sin fecha de baja cargada). Un solo dato, no se puede
  desincronizar.
- Verificado en producción (SQL directo): **0 legajos inactivos hoy, 61
  activos** — no hace falta ningún backfill de `fecha_baja` para no
  romper nada al migrar. `fecha_alta` queda vacía para los legajos
  existentes (son de antes del sistema); RRHH puede completarla después
  si quiere, no es un requisito.
- Motivos de baja: los mismos 4 que ya usa el Excel — Despido, Renuncia,
  Acuerdo, Jubilación. Sin agregar "Otro".
- El índice de rotación se calcula con la fórmula estándar **Egresos ÷
  Dotación inicial** — no se reproduce el concepto de "Reemplazos" del
  Excel viejo (una decisión manual de RR HH sobre qué alta cubre qué
  baja, no derivable solo de fechas).
- Agrupado solo por mes, total empresa — sin desglose por área (la hoja
  del Excel que lo intentaba, `DIRECTOS_E_INDIRECTOS`, estaba vacía:
  RR HH no la mantenía).
- Va dentro de la misma pestaña "Estadísticas" ya existente, como tercera
  opción del selector "Ver" (Horas Extras / Ausentismo / Rotación), mismo
  año compartido con las otras dos.

## Modelo de datos

Nuevos campos en `fichadas_legajos`:

- `fecha_alta` (date, opcional).
- `fecha_baja` (date, opcional).
- `motivo_baja` (select, opcional, maxSelect 1): Despido, Renuncia,
  Acuerdo, Jubilación.

`estado` (bool, ya existente) pasa a ser un valor **calculado** en cada
guardado: `estado = !fecha_baja`. La UI ya no expone el campo como un
interruptor libre — ver sección "Pantalla: alta/baja de legajos".

## Motor de cálculo (`motor.ts`)

`procesarPeriodo` hoy itera cada legajo seleccionado sobre el rango
completo `[desde, hasta]` del período elegido, sin acotar por legajo. Pasa
a acotar la ventana de iteración de cada legajo a su período real de
actividad:

```
ventanaDesde = max(desde, legajo.fecha_alta || desde)
ventanaHasta = min(hasta, legajo.fecha_baja || hasta)
```

Si `ventanaDesde > ventanaHasta` (ej: alguien con fecha_baja anterior al
`desde` del período, o fecha_alta posterior al `hasta`), ese legajo no
aporta ningún `ResultadoDia` en el período.

Esto es un cambio en el motor compartido por Resultados, Horas Extras y
Ausentismo — para un legajo que SÍ tiene `fecha_baja` cargada, dejará de
contar ausentismo/horas extra fijas más allá de su baja real (hoy esto se
evitaba a medias con parches puntuales: filtrar `horas_extra_fijas` de
inactivos en Horas Extras, y la limitación aceptada de "Sin Justificar" en
Ausentismo). Para un legajo SIN `fecha_baja` cargada (los 61 actuales, y
cualquier alta futura que todavía no se dio de baja), el comportamiento no
cambia: sigue evaluándose como ya lo hace hoy.

Esto NO reemplaza el parche ya existente de Horas Extras (no inventar
horas fijas para inactivos) — simplemente deja de ser necesario para
legajos con `fecha_baja` real, porque la ventana ya los corta antes.

## Cálculo de la estadística de Rotación

Agrupado por mes (1-12), total empresa, usando `fichadas_legajos` directo
(no necesita `ResultadoDia` del motor — es conteo de altas/bajas, no de
fichadas):

- `dotacionInicial(mes)` = cantidad de legajos con `fecha_alta <= inicio
  del mes` (o sin fecha_alta, asumidos de antes) **y** (`fecha_baja` nula
  o posterior al inicio del mes).
- `ingresos(mes)` = legajos con `fecha_alta` dentro del mes.
- `egresosPorMotivo(mes)` = legajos con `fecha_baja` dentro del mes,
  agrupados por `motivo_baja` (4 categorías); fila `Total egresos` =
  suma.
- `dotacionFinal(mes)` = `dotacionInicial + ingresos - totalEgresos`.
- `indiceRotacion(mes)` = `totalEgresos / dotacionInicial` (0 si
  dotación inicial es 0), en %.
- Fila `TOTAL` anual (suma de ingresos/egresos de los 12 meses) + columna
  `PROMEDIO` (como ya hacen Horas Extras y Ausentismo), usando
  `mesesTranscurridos` para no promediar sobre meses futuros si el año
  elegido es el actual.
- Debajo de la tabla: listado auto-generado de movimientos del mes
  (nombre + fecha + motivo, para ingresos y egresos), reemplazando el log
  de texto libre manual del Excel con datos que el sistema ya tiene.

Mismo recorte que ya existe en Horas Extras/Ausentismo: si el año elegido
es el actual, se recorta al día de hoy (no se inventan meses futuros).

## Pantalla: alta/baja de legajos (`ConfiguracionTab.tsx`)

- Alta: al crear un legajo, campo opcional "Fecha de alta".
- Baja: el control actual (`<select>` Activo/Inactivo en la fila de la
  tabla) se reemplaza por un botón "Dar de baja" en los legajos activos.
  Abre un mini-formulario con "Fecha de baja" y "Motivo" (ambos
  requeridos) — al guardar, el backend recibe `fecha_baja` + `motivo_baja`
  y el `estado` calculado pasa a `false`.
- Reactivar: un legajo inactivo muestra un botón "Reactivar" que limpia
  `fecha_baja`/`motivo_baja` (vuelve a `estado=true`).

## Pantalla: Estadísticas

Tercera opción "Rotación" en el selector "Ver" ya existente. Misma
estructura visual que Horas Extras/Ausentismo: tabla de 12 meses +
promedio + total, con las filas Dotación Inicial / Ingresos / Despidos /
Renuncias / Acuerdos / Jubilación / Total Egresos / Dotación Final /
Índice de Rotación. Debajo, el listado de movimientos del mes
seleccionado (o del año completo — a definir en el plan de
implementación según cómo quede mejor la tabla).

## Fuera de alcance

- Desglose por área.
- Concepto de "Reemplazos" / vínculo manual alta↔baja.
- Migración del histórico del Excel viejo (años anteriores a la
  implementación).
- Exportación a Excel.
- Backfill de `fecha_alta` para los 61 legajos existentes (RR HH puede
  completarlo manualmente si quiere, no es parte de este proyecto).

## Testing

Mismo criterio de siempre: migración probada contra una PocketBase local
real, y las funciones de agregación (recorte de ventana en `motor.ts`,
agregación mensual de Rotación) probadas con `tsx` — incluyendo el caso
"legajo con fecha_baja antes del período" (no aporta resultados), "legajo
con fecha_alta después del período" (no aporta resultados), "legajo sin
fecha_alta/fecha_baja" (se comporta igual que hoy), y el cálculo de
dotación/índice mes a mes con altas y bajas mezcladas en el mismo mes.
