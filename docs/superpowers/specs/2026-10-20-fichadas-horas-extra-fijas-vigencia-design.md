# Fichadas: fecha de inicio para horas extra fijas — diseño

## Contexto

Las "horas extra fijas" (`fichadas_legajos.horas_extra_fijas: HoraExtraFija[]`,
un monto de horas por día de la semana que se suma siempre al cálculo de
horas extra de esa persona, haya fichado ese día o no — ej. un acuerdo
tipo Ludeña en Córdoba) se aplican hoy a **todo** el período que se
calcule, sin importar qué tan atrás vaya — porque no existe ninguna fecha
de inicio del acuerdo, solo el día de la semana y la cantidad de horas.
Si alguien mira Estadísticas o Resultados de un año anterior a que el
acuerdo real empezara a regir, el sistema inventa horas extra fijas que
esa persona nunca tuvo pactadas en ese momento.

Confirmado con el usuario: hoy **ningún legajo tiene horas extra fijas
configuradas en producción** (verificado por SQL directo) — este cambio
es puramente preventivo, no hace falta backfill de ningún dato real.

## Qué se agrega

Un campo nuevo en `fichadas_legajos`: `horas_extra_fijas_desde` (text,
`YYYY-MM-DD`, opcional) — **una sola fecha para todo el acuerdo** de esa
persona, no una por día. Un acuerdo de horas fijas es uno solo aunque
cubra varios días de la semana (ej. Ludeña: lunes a jueves 4,5hs + sábados
2,5hs, un único acuerdo con una única fecha de inicio).

## Motor de cálculo (`motor.ts`)

En `procesarPeriodo()`, el `horaFijaDelDia` encontrado (buscando por día
de la semana en `legajo.horas_extra_fijas`) deja de aplicarse
automáticamente: solo cuenta si la fecha del día que se está calculando
es **igual o posterior** a `legajo.horas_extra_fijas_desde`. Si ese campo
está vacío (cualquier legajo que no lo tenga cargado, incluyendo todos los
actuales), el comportamiento es **idéntico al de hoy** — se aplica
siempre, sin fecha de corte — por compatibilidad hacia atrás, nadie tiene
que cargar nada para que siga funcionando igual que ahora.

Esto también afecta la guarda que decide si un día "libre sin fichada" se
reporta o no: hoy, un día sin horario teórico y sin novedad SÍ genera una
fila si hay `horaFijaDelDia` configurado (porque la hora fija cuenta igual
ese día). Con este cambio, esa fila solo se genera si además la fecha ya
alcanzó `horas_extra_fijas_desde` — antes de esa fecha, el día se trata
como un día libre común, sin fila.

## Pantalla (`ConfiguracionTab.tsx`, sub-tab "Horas extra fijas")

Un campo de fecha "Vigente desde" (opcional) al lado del editor de horas
por día ya existente (`EditorHorasFijas`), que se guarda en el mismo
`pb.collection('fichadas_legajos').update(...)` que ya guarda
`horas_extra_fijas`.

## Fuera de alcance

- Una fecha de inicio por día individual (se descartó: un acuerdo es uno
  solo, no tiene sentido que un día del mismo acuerdo empiece en una fecha
  distinta a otro).
- Fecha de fin del acuerdo (si deja de regir, se borra la configuración de
  horas fijas directamente, como ya se hace hoy).
- Backfill de datos reales (no aplica, no hay ningún legajo configurado
  todavía).

## Testing

Mismo criterio que el resto del proyecto: cambio de `motor.ts` probado
con `tsx` (casos: fecha del día antes de `horas_extra_fijas_desde` no
aporta horas ni genera fila en un día libre; fecha igual o posterior sí
aporta las horas igual que antes; sin `horas_extra_fijas_desde` cargado,
comportamiento idéntico al actual). Migración probada contra una
PocketBase local real.
