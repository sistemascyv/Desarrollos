# Liquidación de Vacaciones — diseño

## Contexto

Vacaciones ya calcula bien **cuántos días** le corresponden a cada legajo y permite asignarle períodos. Falta la parte de **cuánta plata se le paga** por esos días — hoy RRHH arma esto a mano, un Excel por persona y por período (ej. `ACTIS TOBIAS.xls`, dentro de `FICHADAS REPORTES/estadisticas/`). Se leyeron todas las fórmulas reales de ese archivo para este diseño.

Esto NO existe hoy en ningún lado del sistema — no hay sueldo, antigüedad %, categoría de convenio ni porcentajes de descuento cargados en ningún lado (se revisó Planilla Choferes, que es otra cosa — partes/tramos de viaje, no liquidación de sueldos).

## Lo que dice el Excel real (`ACTIS TOBIAS.xls`)

Un período de vacaciones que cruza de un mes a otro (ej. 28/09 al 11/10 = 14 días) se liquida en **2 tramos**, uno por cada mes que toca (3 días de septiembre + 11 días de octubre en el ejemplo) — mismo Básico/antigüedad en los dos tramos, solo cambian los días de cada uno.

Por tramo:
1. **Básico** (sueldo mensual, manual) + **Horas Extra** (promedio de horas extra de los 6 meses calendario anteriores al mes en que arranca el período × valor hora = Básico/24/8×1.5) + **Antigüedad** (% sobre Básico+Horas Extra) = **Total mensual**.
2. Total mensual ÷ **Divisor** (24 en este ejemplo) × días del tramo = **Vacaciones** (base).
3. **Plus Vacacional** = un monto fijo por día × días del tramo, más su propio adicional de antigüedad (mismo % que el punto 1, aplicado sobre el Plus Vacacional).
4. **Bruto** = Vacaciones + Plus Vacacional + Antigüedad del Plus Vacacional.
5. Descuentos sobre el Bruto: Jubilación 11%, Ley 19032 3%, Obra Social 2.55%, ANSSAL 0.45%, Cuota Sindical 3%, Seguro de Sepelio 1.5%.
6. **Neto** = Bruto − descuentos.

El neto total del período es la suma de los netos de cada tramo mensual.

## Confirmado con el usuario

- Alcance: todo el personal (no solo administrativos).
- **Categoría de convenio** (ej. "Administ 2da"): es un campo nuevo, no existe hoy. Se carga a mano por legajo. El Plus Vacacional, el Divisor y los 6 % de descuento se configuran **por categoría** (no son un valor único para toda la empresa) — RRHH arma la lista de categorías una sola vez.
- **% de antigüedad**: se calcula solo, no se tipea. Regla confirmada (investigada y validada contra el ejemplo real: Actis, ingresó 2025, liquidación 2026, da 2% exacto): `antigüedad % = (año de la liquidación − año de fecha_alta) + 1`. Se cuenta por años calendario que abarca, no por años cumplidos.
- **Horas extra promedio (6 meses)**: se calcula solo a partir de las fichadas reales (marcas/horarios/novedades, lo mismo que ya usa Reportes) — no se tipea mes a mes. Se toman los 6 meses calendario anteriores al mes en que arranca el período (sin contar el mes de inicio).
- **Partir por mes**: si el período cruza de un mes a otro, se calculan los tramos por separado (mismo Básico/antigüedad/categoría, solo cambian los días de cada tramo), igual que el Excel.
- No se migra ningún cálculo viejo — se arranca de cero, no hay liquidaciones previas que migrar.
- No se toca Planilla Choferes.

## Modelo de datos nuevo

### `fichadas_categorias` (nueva colección)

| Campo | Tipo | Notas |
|---|---|---|
| `nombre` | text | requerido, ej. "Administ 2da" |
| `plus_vacacional` | number | requerido, monto $ por día |
| `divisor_mensual` | number | requerido, default 24 |
| `pct_jubilacion` | number | requerido |
| `pct_ley19032` | number | requerido |
| `pct_obra_social` | number | requerido |
| `pct_ansal` | number | requerido |
| `pct_cuota_sindical` | number | requerido |
| `pct_seguro_sepelio` | number | requerido |

Reglas de acceso: mismo patrón que `fichadas_grupos_restriccion` (módulo `vacaciones`).

### `fichadas_legajos` (campos nuevos)

- `categoria`: relation → `fichadas_categorias`, opcional (los legajos existentes no la tienen cargada todavía).
- `basico`: number, opcional.

Se cargan a mano en Configuración → Empleados (junto a Área/Horario/Fecha de alta, mismo patrón).

## Cálculo (funciones puras nuevas en `motor.ts`)

- `calcularAntiguedadPctLiquidacion(fechaAlta: string, anioLiquidacion: number): number` → `(anioLiquidacion - Number(fechaAlta.slice(0,4))) + 1`. Sin `fechaAlta`: no calculable.
- `calcularHorasExtraPromedioPorLegajo(resultados: ResultadoDia[], idLegajo: string, mesInicioExclusive: string /* "YYYY-MM" */, meses = 6): number` — promedio en horas (no minutos) de `hE` de ese legajo, sumado por cada uno de los `meses` meses calendario inmediatamente anteriores a `mesInicioExclusive` (sin incluirlo). Reutiliza `ResultadoDia[]` de `procesarPeriodo` (igual fuente que ya usa Reportes), filtrando por `idLegajo`.
- `partirPeriodoPorMes(desde: string, hasta: string): { anioMes: string; desde: string; hasta: string; dias: number }[]` — parte un rango de fechas en tramos por mes calendario (cada tramo no cruza de mes).
- `calcularLiquidacionVacaciones(params: { basico: number; fechaAlta: string | null | undefined; categoria: FichadasCategoria; horasExtraPromedio: number; desde: string; hasta: string }): { tramos: TramoLiquidacion[]; bruto: number; totalDescuentos: number; neto: number }` donde cada `TramoLiquidacion` trae: `anioMes`, `dias`, `antiguedadPct`, `totalMensual`, `porDia`, `vacacionesBase`, `plusVacacional`, `antiguedadPlusVacacional`, `bruto`, los 6 descuentos individuales, `totalDescuentos`, `neto`.

Esta función orquesta `partirPeriodoPorMes` + `calcularAntiguedadPctLiquidacion` (una vez por tramo, con el año de ese tramo) + las fórmulas de arriba, replicando el Excel real exactamente.

## Pantalla

Dentro de la pestaña "Vacaciones" (vista "Lista por fecha"), un botón **"Liquidar"** en cada período ya asignado. Abre un panel con:
- Categoría y Básico del legajo (si no están cargados, aviso para completarlos en Configuración antes de poder liquidar).
- El desglose completo por tramo (igual estructura que el Excel: Básico, Horas Extra, Antigüedad, Total mensual, Por día, Vacaciones, Plus Vacacional + su antigüedad, Bruto, cada descuento, Neto), y el Neto total del período (suma de tramos) bien visible.

Una pantalla nueva (sub-vista dentro de Vacaciones, o sub-tab de Configuración de Vacaciones) para que RRHH arme las categorías: crear/editar/borrar, con sus 8 valores (Plus Vacacional, Divisor, 6 %).

## Fuera de alcance

- No se migra ningún cálculo histórico.
- No se toca Planilla Choferes.
- No se valida que la Categoría elegida "tenga sentido" para el puesto del legajo — es una elección libre de RRHH.
- No hay exportación a Excel de la liquidación todavía (se puede agregar después si hace falta).
- No se guarda la liquidación calculada (se recalcula cada vez que se abre, no es un registro persistente) — si esto hiciera falta más adelante (ej. para un historial de pagos), es un proyecto aparte.

## Testing

Funciones puras probadas con `tsx` de forma aislada, usando el propio ejemplo real de `ACTIS TOBIAS.xls` como caso de prueba (antigüedad 2%, básico 1216186.92, horas extra promedio ≈0.083, período 28/09 al 11/10/2026 partido en 3+11 días) y verificando que los montos calculados coincidan con los valores reales del Excel (ej. total mensual 1240510.6584, neto del tramo de 3 días 183182.4284985, neto del tramo de 11 días 671668.9044945).
