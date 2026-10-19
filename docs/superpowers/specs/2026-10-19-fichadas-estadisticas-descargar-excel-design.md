# Fichadas: Descargar Excel en Estadísticas — diseño

## Contexto

La pestaña Estadísticas de Fichadas (Horas Extras / Ausentismo / Rotación,
ya implementadas) reemplaza las planillas que RRHH armaba a mano en Excel
— pero hoy los datos solo se ven en pantalla, sin forma de bajarlos a una
hoja de cálculo real para archivar o compartir. El proyecto ya tiene la
librería `xlsx` instalada y un patrón establecido en
`ResultadosTab.tsx` (función `descargarFormato`): arma un array-de-arrays
por hoja, `XLSX.utils.aoa_to_sheet`, `XLSX.utils.book_append_sheet`,
`XLSX.writeFile` — este proyecto reusa exactamente ese mismo patrón, sin
agregar ninguna librería nueva.

Confirmado con el usuario: como las 3 vistas (Horas Extras, Ausentismo,
Rotación) ya se calculan juntas en un solo click de "Calcular" (y quedan
las 3 en memoria), el botón de descarga baja **un solo archivo con las 3
como hojas separadas**, no una descarga por vista.

## Qué se agrega

Un botón **"Descargar Excel"** al lado de "Calcular", en
`EstadisticasTab.tsx`. Deshabilitado hasta que se calculó algo (mismo
criterio que ya usa `hayDatos` para mostrar la tabla). Al apretarlo, arma
un workbook con 3 hojas a partir de los datos **ya calculados en
memoria** (`filasHorasExtras`/`totalHorasExtras`,
`filasAusentismo`/`totalAusentismo`, `rotacionMeses`/`rotacionMovimientos`)
— no vuelve a pedir nada a PocketBase ni recalcula nada — y lo descarga
como `estadisticas_fichadas_{año}.xlsx` (el año elegido en el selector al
momento de descargar).

## Contenido de cada hoja

Los números se exportan crudos (no el texto ya formateado que se ve en
pantalla, ej. `fmtHs`/`fmtPct`), para que RRHH pueda sumar/ordenar/filtrar
directamente en Excel.

**Hoja "Horas Extras"**: misma forma que la tabla en pantalla — por cada
área, 5 filas (Dotación, HS, HS sobre Total del mes, %, HS por Persona) ×
12 columnas de mes + Promedio + Total; al final, la fila TOTAL general con
las mismas 5 sub-filas. Encabezado: `['Área', '', 'Ene', ..., 'Dic',
'Prom.', 'Total']` (columna vacía para alinear con la etiqueta de
sub-fila, igual que en pantalla).

**Hoja "Ausentismo"**: por cada causa (las 17 + "Sin Justificar"), 2 filas
(Horas, %) × 12 meses + Promedio + Total; fila TOTAL general al final. Los
`%` se exportan como número ya multiplicado por 100 y redondeado a 1
decimal (ej. `12.8` para 12,8%), igual criterio que usa `ResultadosTab`
para redondear horas (`Math.round(x * 100) / 100`), no como fracción
0-1 ni como texto con el símbolo `%`.

**Hoja "Rotación"**: las 9 filas de métrica (Dotación Inicial, Ingresos,
Despidos, Renuncias, Acuerdos, Jubilación, Total Egresos, Dotación Final,
Índice de Rotación) × 12 meses + Promedio + Total — mismo criterio que la
tabla en pantalla sobre cuáles filas llevan Total (las de stock/índice:
Dotación Inicial, Dotación Final e Índice, no llevan Total, solo
Promedio). El Índice se exporta también como número ×100 (ej. `0.8` para
0,8%). Debajo de la tabla, separado por una fila en blanco, el listado de
movimientos del año: columnas Fecha, Nombre, Tipo (Alta/Baja), Motivo (solo
en bajas).

## Fuera de alcance

- Exportar una vista sola (confirmado: siempre las 3 juntas).
- Formato visual en el Excel (negritas, colores, anchos de columna) — como
  `ResultadosTab` tampoco lo hace, no se agrega acá.
- Exportación en otros formatos (CSV, PDF).
- Botón deshabilitado sin datos no muestra ningún mensaje — simplemente no
  se puede clickear.

## Testing

Sin lógica de agregación nueva (los datos ya están calculados y probados
por las estadísticas existentes) — se verifica con el build
(`npm run build`) y una descarga real de prueba en el navegador después
del deploy, abriendo el `.xlsx` resultante para confirmar que las 3 hojas
tienen el contenido esperado y los números son los mismos que se ven en
pantalla (sin el formato de texto).
