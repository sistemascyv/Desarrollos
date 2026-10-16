# Fichadas: Horas Extras - Estadística — diseño

## Contexto

RRHH arma a mano, todos los meses, un Excel con el resumen anual de horas
extra por área (archivo de referencia: `HORAS EXTRAS - Estadisticas.xlsx`,
una hoja por año): por cada área, 5 filas (Dotación, HS, HS/Total del mes,
% sobre horas posibles, Hs/Persona) × 12 meses + promedio + total anual,
más una fila de TOTAL general. Los datos de origen (horas extra por
empleado por mes) ya los calcula Sistema CyV — lo que falta es la vista
que arma el resumen mensual/anual por área con esos porcentajes, en vez de
copiarlo a mano a un Excel.

Confirmado con el usuario:

- Se agrupa por las áreas que ya existen en `fichadas_empresas`
  (Configuración → Áreas) — no se arma una clasificación paralela nueva.
- "Horas posibles mensuales" (el denominador del %) es un valor único
  configurable (no una tabla de 12 valores por mes).
- La "dotación" (cantidad de gente) usa el conteo de legajos activos
  **actual** de cada área — no la dotación histórica de ese mes puntual
  (eso vendrá con el proyecto de Rotación, que va a agregar fecha de
  alta/baja; cuando exista, esta pantalla se puede mejorar para usar
  dotación exacta por mes).
- Va como pestaña nueva "Estadísticas" al lado de Resultados, dentro de
  Fichadas.

## Modelo de datos

Nueva colección `fichadas_configuracion` — un único registro (no hay CRUD,
se crea una vez con una migración de semilla y solo se edita, nunca se
borra ni se crea uno nuevo):

- `horas_posibles_mensuales` (number) — ej. 192. Editable desde la propia
  pantalla de Estadísticas (no hace falta una pantalla de configuración
  aparte para un solo valor).

No se toca ninguna otra colección — todo lo demás (legajos, marcas,
novedades, feriados, áreas) ya existe y ya tiene lo necesario.

## Cálculo

Reutiliza `procesarPeriodo()` (el mismo motor que ya usa la pestaña
Resultados) — nada de lógica de cálculo nueva. Al elegir un año y apretar
"Calcular":

1. Se cargan, para TODO el año elegido (1 de enero a 31 de diciembre):
   `fichadas_legajos` (activos, con `expand: 'empresa,horario'`),
   `fichadas_marcas`, `fichadas_novedades`, `fichadas_feriados` — mismo
   patrón de carga que ya usa `ResultadosTab.tsx`, solo que con un rango
   de fechas de un año completo en vez de un período corto.
2. Se corre `procesarPeriodo()` sobre todo ese rango (una sola vez, no 12
   veces) y se agrupan los `ResultadoDia` resultantes por mes (los
   primeros 7 caracteres de `fecha`) y por área.
3. Por cada área y cada mes:
   - `HS` = suma de `hE` de todos los `ResultadoDia` de esa área en ese
     mes.
   - `Dot.` = cantidad de legajos activos de esa área (constante para
     los 12 meses, es la dotación actual).
   - `HS/To` = `HS` del área ÷ `HS` de todas las áreas ese mismo mes.
   - `%` = `HS` ÷ (`Dot.` × `horas_posibles_mensuales`).
   - `Hs/P.` = `HS` ÷ `Dot.`.
4. Fila `TOTAL`: mismo cálculo pero sumando todas las áreas (dotación =
   suma de dotaciones, HS = suma de HS de todas, % y Hs/P sobre esos
   totales).
5. Columnas `PROMEDIO` (promedio de los 12 meses) y `TOTAL` (suma de los
   12 meses) al final de cada fila, igual que el Excel viejo.

Si un área no tiene ningún legajo activo hoy, igual se muestra (con
Dotación 0) si tuvo horas extra registradas ese año — para no esconder
datos históricos de un área que después se vació o se renombró.

## Pantalla

Pestaña nueva "Estadísticas" en `FichadasPage.tsx`, al lado de
Carga/Resultados/Configuración.

- Selector de año (dropdown con los últimos ~8 años, o un campo numérico
  simple) + botón "Calcular" — no se recalcula solo al entrar a la
  pantalla, porque procesar un año completo de fichadas puede tardar
  unos segundos.
- Campo editable "Horas posibles por mes" (carga el valor de
  `fichadas_configuracion`, se guarda al cambiarlo).
- Tabla: una fila de encabezado con ENE..DIC + PROMEDIO + TOTAL, y debajo
  un bloque de 5 filas por área (Dot./HS/HS-To/%/Hs-P), en el mismo orden
  que ya tienen las áreas en Configuración, terminando con la fila TOTAL
  general — mismo formato visual que el Excel de referencia.
- Sin exportación a Excel en esta primera versión (se puede agregar
  después si hace falta; por ahora la pantalla reemplaza la carga manual,
  no necesariamente el archivo Excel en sí).

## Fuera de alcance

- No se migra ni se importa el histórico del Excel viejo (años
  2019-2024) — la pantalla nueva solo calcula a partir de las fichadas
  que ya están cargadas en el sistema.
- No hay exportación a Excel todavía (ver arriba).
- La dotación no es exacta por mes histórico — usa la dotación actual
  para todo el año, hasta que exista el proyecto de Rotación.

## Testing

Mismo criterio de siempre: probar la migración de
`fichadas_configuracion` contra una PocketBase local real, y una prueba
de la lógica de agregación (agrupar por mes/área y calcular los 5
indicadores) con un caso sintético chico, corrida con `tsx` igual que la
prueba de horas extra fijas.
