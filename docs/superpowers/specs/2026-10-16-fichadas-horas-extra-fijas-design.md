# Fichadas: horas extra fijas por persona — diseño

## Contexto

Revisión completa de las 12 reglas de cálculo de horas extras que trajo el
usuario (ver foto de referencia "Cálculo de horas extras") contra el motor
real (`web/src/pages/fichadas/motor.ts`). 11 de las 12 ya están
correctamente implementadas:

- El cálculo usa el horario asignado a cada persona (plantilla o
  `dias_personalizados`).
- El tiempo fichado antes del ingreso y después de la salida ya se cuenta
  — `worked` se calcula entre las marcas REALES, no el horario teórico, así
  que llegar antes o quedarse después ya suma a `hE` (`hE = max(0, worked -
  teoricoTotal)`).
- Solo se cuentan bloques completos de redondeo (`Math.floor`, nunca
  redondea para arriba).
- 15 minutos en Córdoba, 30 en el resto (`incrementoRedondeo`).
- Los casos de 2 entradas/2 salidas por día (operarios que vuelven más
  tarde, mantenimiento que vuelve después de las 16:00) ya están cubiertos
  por la lógica de "tramos extra" (hasta 4 pares reales por día).
- Qué días trabaja cada área (Córdoba/Buenos Aires de lunes a viernes,
  mantenimiento y sereno de Córdoba incluyendo sábados) es una cuestión de
  qué plantilla de horario tiene asignada cada quien — ya soportado por el
  modelo de datos existente (`dias.trabaja` por día de la semana), no
  requiere cambios de código.

**La única regla sin soporte hoy (N°12):** en Córdoba, Ludeña tiene 4,5h
extra fijas de lunes a jueves y 2,5h los sábados, que se suman a lo que el
sistema calcule por sus fichadas reales. Hoy no existe ningún concepto de
"horas extra fijas por persona" en el modelo de datos ni en el motor.

Confirmado con el usuario: puede haber más casos como este en el futuro
(no es exclusivo de Ludeña), el acuerdo no tiene fecha de vencimiento
(queda activo hasta que un admin lo cambie a mano), y las horas fijas se
suman **siempre**, haya fichado ese día o no — es un monto por acuerdo, no
condicionado a la asistencia real de ese día puntual.

## Modelo de datos

Nuevo campo en `fichadas_legajos`: `horas_extra_fijas` (json, opcional) —
una lista de `{ dia: number, horas: number }`, mismo criterio de `dia` que
ya usa `DiaHorario` (1=lunes .. 7=domingo). Para Ludeña:

```json
[
  { "dia": 1, "horas": 4.5 },
  { "dia": 2, "horas": 4.5 },
  { "dia": 3, "horas": 4.5 },
  { "dia": 4, "horas": 4.5 },
  { "dia": 6, "horas": 2.5 }
]
```

Nadie tiene nada configurado por defecto (campo vacío/null) — es opt-in,
solo para los casos puntuales que un admin cargue a mano.

## Motor de cálculo

En `procesarPeriodo()`, después de calcular `hE` (el valor ya redondeado
por bloques, a partir de las fichadas reales) para cada día del período,
se busca si el legajo tiene `horas_extra_fijas` configurado para el `dia`
de la semana correspondiente. Si lo tiene, se suma esa cantidad (en
minutos: `horas * 60`) a `hE`, **sin pasar por el redondeo de bloques**
(es un monto fijo por acuerdo, no algo derivado de fichadas reales) y
**sin importar si ese día resultó `ausente`** — se suma siempre que el
`dia` de la semana coincida, independientemente de si hubo fichadas ese
día puntual.

Como `hE` es el único valor que leen tanto los totales en pantalla
(`ResultadosTab`) como los 4 formatos de exportación a Excel, sumar ahí
alcanza — no hace falta tocar ningún otro lugar del código que consuma
`ResultadoDia`.

## Pantalla

Nueva pestaña "Horas extra fijas" en Configuración, al lado de "Horario
personalizado" (mismo lugar, mismo estilo: selector de empleado + editor
de días de la semana). A diferencia de `EditorDias` (que edita pares
entrada/salida), este editor es más simple: un campo numérico de horas
por cada uno de los 7 días de la semana, vacío por defecto. Guardar manda
la lista completa `{dia, horas}` (solo los días con horas > 0) al campo
`horas_extra_fijas` del legajo elegido; dejar todos los días en 0 y
guardar equivale a borrar la configuración de esa persona (se guarda como
`null` o lista vacía).

## Fuera de alcance

- No se valida que la persona tenga asignado un horario de trabajo ese
  día de la semana — si se configuran horas fijas para un día en que la
  plantilla de esa persona dice que no trabaja, igual se suman (es una
  decisión de un admin cargando el acuerdo, no algo que el sistema deba
  impedir).
- No hay fecha de inicio/fin para el acuerdo — confirmado con el usuario,
  es indefinido hasta que se edite o borre a mano.

## Testing

Mismo criterio de siempre: probar contra una PocketBase local real
(migración del campo nuevo), y una prueba del motor con un caso
sintético equivalente al de Ludeña — un legajo con `horas_extra_fijas`
configurado, procesando un período que incluya un día de la semana con
fichadas reales normales (confirmar que se suman arriba de lo calculado)
y un día de la semana configurado sin ninguna fichada real (confirmar que
igual se suman las horas fijas, aunque el día quede `ausente`).
