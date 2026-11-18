# Viáticos 4.1.12/4.1.13 en Liquidación — Administrativos — Diseño

## Contexto

El usuario comparó el cálculo de Liquidación — Administrativos (ya en staging) contra 4 recibos de sueldo reales de un empleado administrativo (Actis Tobías, legajo real). Confirmó que la antigüedad (2%) y los 6 descuentos (calculados sobre Básico+Antigüedad, exacto a los 6 % ya cargados) están bien. Pero encontró un componente que falta por completo: **Viáticos 4.1.12 ("Comida") y 4.1.13 ("Especial")**, que en los recibos reales se pagan por cada día trabajado del mes, no llevan ningún descuento (van en "Total Exento" del recibo), y representan una parte grande del sueldo en mano — en el recibo de un mes completo (septiembre 2026, 21 días), $572.732,93 sobre un neto total de $1.424.808,68, casi el 40%.

Verificado cruzando 2 recibos reales distintos (septiembre y octubre 2026): `Haberes = (Básico + Antigüedad − 6 descuentos calculados sobre Básico+Antigüedad) + Viáticos 4.1.12 + Viáticos 4.1.13`. Coincide centavo a centavo en los dos meses.

**Esto NO afecta a Choferes** — ahí "comida_viaje"/"comida_internacional" ya son montos que el administrativo calcula y carga a mano por tramo (decisión ya tomada en ese sub-proyecto: no se recalculan). El hueco es específico de Administrativos, que hoy no tiene ningún campo ni cálculo para esto.

## Alcance

**Datos iniciales (2 filas nuevas en `sueldos_tarifas_viaje`, migración nueva — la tabla de Tarifas ya está en staging, no se edita la migración vieja):**
- "Viáticos 4.1.12 - Comida (por día trabajado)": $17.524,83 (valor de la escala vigente desde 1° de noviembre de 2026, misma fuente que ya usé para el resto de Sueldos).
- "Viáticos 4.1.13 - Especial (por día trabajado)": $8.793,93 (misma fuente).

**Días trabajados:** se cuentan de los mismos `ResultadoDia` que ya trae `procesarPeriodo` para el mes elegido — un día cuenta si tenía horario esperado (`paresEsperados.length > 0`) y no está marcado `ausente`. No hace falta ningún dato nuevo ni ningún cambio a Fichadas.

**Fórmula actualizada en `calcularLiquidacionSueldoMensual` (`motor.ts`):**
```
brutoSujetoRetencion = basico + montoHorasExtra + montoAntiguedad   (sin cambios — es la base de los 6 descuentos, ya confirmada correcta)
descuentos = brutoSujetoRetencion × cada pct_* / 100                 (sin cambios)
montoViaticos = diasTrabajados × (tarifaComida + tarifaEspecial)     (nuevo — NO entra en la base de los descuentos)
bruto = brutoSujetoRetencion + montoViaticos                         (nuevo, para mostrar el total antes de descuentos)
neto = brutoSujetoRetencion − totalDescuentos + montoViaticos        (equivalente a bruto − totalDescuentos, ya que montoViaticos no se descuenta)
```

**Pantalla:** la tabla de "Variable"/desglose de Liquidación — Administrativos agrega 2 filas nuevas (Comida y Especial, con cantidad=días trabajados, tarifa, monto) antes de la tabla de Descuentos, y los `summary-grid` de arriba muestran "Viáticos (exento)" además de Básico/Horas extra/Antigüedad/Bruto/Neto.

**No incluye:** "ASIG. EXT." (un adicional de $18.000 que aparece en uno de los recibos) — parece un bono puntual de una paritaria específica, no un componente fijo mensual confirmado; se deja afuera a propósito, igual criterio que con antigüedad en Choferes (no inventar sin un patrón confirmado en más de un mes). Tampoco se toca nada de Choferes.

## Testing

Sin tests automatizados de frontend. Verificación con los mismos 2 recibos reales que ya trajo el usuario (septiembre y octubre 2026, Actis Tobías) — si el legajo y el mes están cargados en staging, recalcular y confirmar que el neto coincide con "Haberes" del recibo real.
