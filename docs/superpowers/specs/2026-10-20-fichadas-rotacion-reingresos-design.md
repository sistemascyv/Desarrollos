# Fichadas: Reingresos en Rotación — diseño

## Contexto

`fichadas_legajos` tiene un único par `fecha_alta`/`fecha_baja` por
legajo (agregado en el sub-proyecto Rotación - Estadística). Si alguien
se va (`fecha_baja` cargada, `estado=false`) y vuelve a entrar más
adelante, hoy "Reactivar" (`ConfiguracionTab.tsx`) solo limpia
`fecha_baja`/`motivo_baja` y pone `estado=true` — sin pedir una fecha de
alta nueva. Esto rompe dos cosas:

1. Se pierde el registro de que esa persona se fue en tal fecha con tal
   motivo — el egreso viejo desaparece de `calcularEstadisticaRotacion`,
   que lee directo de `fichadas_legajos.fecha_alta`/`fecha_baja`.
2. El hueco entre la baja vieja y el reingreso queda con
   `fecha_alta`/`fecha_baja` otra vez vacíos, lo que en `motor.ts` hace
   que la persona se evalúe como si estuviera "de antes del sistema"
   durante todo ese período intermedio — pudiendo generar "Sin
   Justificar" en días donde en realidad no trabajaba ahí.

Confirmado con el usuario: se construye la versión completa, que
resuelve los dos problemas de raíz (no solo el de Rotación) — aunque
toca el motor de cálculo compartido (`motor.ts`), no solo Rotación.

## Modelo de datos

Nueva colección `fichadas_legajo_historial`: una fila por cada etapa
laboral **ya cerrada** de un legajo — `legajo` (relación a
`fichadas_legajos`, requerida), `fecha_alta` (text, requerida),
`fecha_baja` (text, requerida — toda fila de historial es, por
definición, una etapa cerrada), `motivo_baja` (select, los mismos 4
valores ya usados: Despido/Renuncia/Acuerdo/Jubilación, requerida).

Los campos actuales en `fichadas_legajos` (`fecha_alta`, `fecha_baja`,
`motivo_baja`, `estado`) **no cambian de significado** — siguen
representando la etapa actual (la más reciente, posiblemente todavía
abierta). Para un legajo que nunca se fue y volvió, el historial queda
vacío y nada cambia respecto de hoy.

## Flujo de "Reactivar" (`ConfiguracionTab.tsx`)

Deja de ser un botón de un clic — pasa a abrir un mini-formulario (mismo
patrón que "Dar de baja" ya usa) que pide la **fecha de alta nueva**
(obligatoria). Al confirmar:

1. Crea una fila en `fichadas_legajo_historial` con la etapa que se
   cierra: `fecha_alta`/`fecha_baja`/`motivo_baja` actuales del legajo.
2. Actualiza el legajo: `fecha_alta` = la fecha nueva, `fecha_baja` =
   null, `motivo_baja` = null, `estado` = true.

Dos escrituras secuenciales (crear historial, luego actualizar legajo) —
no hace falta una transacción, mismo criterio que el resto de este
proyecto (herramienta interna, sin ese nivel de garantía en ningún otro
lado del código).

## Motor de cálculo (`motor.ts`)

`procesarPeriodo()` deja de calcular una sola ventana `[ventanaDesde,
ventanaHasta]` por legajo — calcula una **lista de ventanas**: una por
cada fila de `fichadas_legajo_historial` de ese legajo, más la etapa
actual (`fecha_alta`/`fecha_baja` del legajo). Cada ventana se recorta al
período pedido (`desde`/`hasta`) igual que hoy, y se descarta si queda
vacía (recorte deja el desde después del hasta). El día-por-día se
recorre para cada ventana por separado, reusando exactamente el mismo
cuerpo de cálculo de siempre (fichadas, novedades, feriados, causa, horas
fijas) — nada de eso cambia, solo cuántas ventanas de días se recorren
por legajo.

Efecto: un período de la primera etapa de alguien sigue mostrando datos
reales en Resultados/Horas Extras/Ausentismo aunque esa persona se haya
ido y vuelto después; el hueco entre una baja y la reincorporación nunca
se evalúa (no es parte de ninguna ventana), así que no genera "Sin
Justificar" donde la persona no trabajaba ahí.

La función que hoy construye `[ventanaDesde, ventanaHasta]` recibe
además la lista de filas de historial de ese legajo (ya cargadas por el
caller, como `marcas`/`novedades`/`feriados`) para armar las ventanas
extra.

## Estadística de Rotación (`calcularEstadisticaRotacion`)

Pasa a recibir también `historial: HistorialLegajo[]`. Cada etapa
cerrada del historial cuenta como su propio ingreso (`fecha_alta`) y
egreso (`fecha_baja`, con su `motivo_baja`) en el mes que corresponda —
además de la etapa actual del legajo, igual que antes. La dotación de
cada mes (`activoAl`) pasa a considerar **todas** las etapas de un
legajo (historial + actual), no solo la actual — alguien activo en un
mes viejo por su primera etapa cuenta igual, aunque después se haya ido
y vuelto. El listado de "Movimientos del año" combina las altas/bajas de
todas las etapas que caen en el año elegido.

## Pantalla

Sin cambios visuales nuevos en Estadísticas — ya funciona sola,
alimentada por el historial. El único cambio visible es el formulario de
"Reactivar" en Configuración descrito arriba.

## Fuera de alcance

- Una vista tipo "línea de tiempo" de las etapas de un legajo (hoy el
  historial solo se refleja en los números de Rotación, no hay una
  pantalla separada para verlo fila por fila) — se puede agregar después
  si hace falta.
- Editar o borrar una fila de historial ya creada (si hay un error de
  carga, se corrige a mano en el admin de PocketBase, mismo criterio que
  otros datos de corrección puntual en este proyecto).

## Testing

Migración probada contra una PocketBase local real. Las funciones
puras (`procesarPeriodo` con múltiples ventanas, `calcularEstadisticaRotacion`
con historial) probadas con `tsx` — casos: legajo con una etapa vieja
cerrada + una etapa actual abierta (cada una evaluada por separado,
hueco entre ambas sin resultados), legajo sin historial (comportamiento
idéntico al actual), dotación/ingresos/egresos de Rotación contando
correctamente ambas etapas en los meses que corresponden.
