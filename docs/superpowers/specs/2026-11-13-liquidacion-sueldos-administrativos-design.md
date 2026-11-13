# Liquidación de sueldos mensual — Administrativos — Diseño

## Contexto

Último sub-proyecto de la automatización de liquidación de sueldos (el de que el chofer cargue el viaje queda afuera, es aparte). Choferes ya tiene su liquidación (basada en Tramos de Planilla Choferes). Administrativos es un flujo distinto: parte de las fichadas (marcas del reloj), no de viajes.

Ya existe toda la lógica de cálculo de horas extra por día (`procesarPeriodo` en `web/src/pages/fichadas/motor.ts`, usada hoy por Fichadas → Resultados) y la fórmula de básico+horas extra+antigüedad−descuentos=neto (`calcularLiquidacionVacaciones`, ya probada contra el Excel real). Este sub-proyecto conecta ambas piezas para un sueldo MENSUAL (no una liquidación de vacaciones): básico + horas extra REALES de ese mes + antigüedad − descuentos = neto.

## Quién es "administrativo" (no hace falta campo nuevo)

`fichadas_legajos` no tiene un campo que diga "chofer" o "administrativo". Pero ahora `choferes.legajo` (sub-proyecto anterior) vincula cada chofer con su legajo — así que un legajo es "chofer" si algún `choferes` lo referencia, y es "administrativo" (o al menos, no-chofer) si no. El selector de esta pantalla excluye los legajos ya vinculados desde `choferes`, sin necesidad de agregar ningún campo.

## Alcance

**Fórmula nueva en `motor.ts`:** `calcularLiquidacionSueldoMensual` — misma mecánica que `calcularLiquidacionVacaciones` pero sin la parte de "por día × días" (el básico de un administrativo YA es el sueldo del mes completo, no se prorratea) y usando las horas extra REALES del mes (no un promedio de 6 meses):

```
antiguedadPct = (año del mes liquidado − año de fecha_alta) + 1   (misma fórmula ya usada en Vacaciones)
valorHoraExtra = basico / 24 / 8 * 1.5                             (misma fórmula ya usada en Vacaciones)
montoHorasExtra = valorHoraExtra × horasExtraDelMes                (horas reales de ESE mes, de procesarPeriodo)
montoAntiguedad = (basico + montoHorasExtra) × antiguedadPct / 100
bruto = basico + montoHorasExtra + montoAntiguedad
descuentos = 6 líneas, cada una bruto × su pct_* / 100 (misma categoría del legajo)
neto = bruto − descuentos
```

**Pantalla:** 4ª pestaña en Sueldos, "Liquidación — Administrativos" (y renombro la 3ª pestaña, hoy "Liquidación mensual", a "Liquidación — Choferes" para que no se confundan). Selector de legajo (sin los que ya están vinculados como chofer) + mes. Al calcular: trae marcas/novedades/feriados/empresas/historial del mes elegido (mismo patrón de fetch que ya usa Fichadas → Resultados, pero acotado a un mes en vez de un rango largo), corre `procesarPeriodo`, suma las horas extra del legajo elegido en ese mes, y muestra el mismo tipo de desglose que ya tiene Choferes (básico, horas extra, antigüedad, bruto, 6 descuentos, neto).

**No incluye:** nada de ausentismo/presentismo como descuento o plus (fuera de alcance, no se mencionó hasta ahora), ni ningún cambio a cómo Fichadas calcula horas extra día a día — se reusa tal cual está.

## Permisos

`fichadas_marcas`, `fichadas_novedades`, `fichadas_empresas`, `fichadas_legajo_historial` necesitan abrir lectura al módulo `sueldos` (hoy no lo tienen — solo `fichadas_categorias`, `tramos`, `fichadas_legajos` y `fichadas_feriados` se abrieron en sub-proyectos anteriores). Migración nueva, mismo patrón de siempre (agregar `sueldos` como alternativa, sin sacar nada a nadie).

## Testing

Sin tests automatizados de frontend. Build limpio + verificación manual con datos reales en staging (elegir un legajo administrativo con fichadas reales de un mes y confirmar que el número final tiene sentido).
