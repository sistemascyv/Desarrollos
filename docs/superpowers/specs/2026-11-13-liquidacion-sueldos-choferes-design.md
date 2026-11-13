# Liquidación de sueldos mensual — Choferes — Diseño

## Contexto

Sub-proyectos 3+4 fusionados (con tu acuerdo) de la automatización de liquidación de sueldos de choferes. Sub-proyecto 1 (Categorías ampliadas + Tarifas de viaje) y sub-proyecto 2 (cruce con satelital) ya están en staging.

Como "Planilla Choferes" (módulo `planilla_choferes`, ya existente) ya captura casi todos los datos de viaje por chofer y por mes, lo que falta no es una pantalla nueva de carga — es: completar los 2-3 datos que todavía no se cargan, vincular cada chofer con su legajo de Personal (para saber su categoría y básico real), y construir la vista de liquidación mensual que hace el cálculo.

Confirmaste que los choferes **ya están cargados como legajo en Personal**, con categoría y básico — así que no hace falta duplicar esos datos, solo vincular el registro de `choferes` (que usa Planilla Choferes) con su `fichadas_legajos` correspondiente.

## Lo que encontré revisando Tramo (`web/src/pages/planilla/PlanillaChoferesPage.tsx`, `TramoModal.tsx`, `types.ts`)

Cada campo de Tramo tiene una de estas 2 naturalezas, y es importante no mezclarlas:
- **Montos ya calculados a mano** (`peajes`, `comida_viaje`, `comida_internacional`, `entrega_retiro_sfco`, `interrupcion`, `cyd_manual`, `control_gral`, `descanso`, `vale_importe`): el administrativo ya tipea el $ final. **No se multiplican por ninguna tarifa** — se suman directo. En particular `cyd_manual` ("CyD manual") es el monto de Control Carga y Descarga ya calculado a mano, pese a que "Sueldos" ahora tiene una tarifa con ese mismo nombre — **no la uso para recalcularlo, sumo `cyd_manual` tal cual está**, porque no tengo claro el criterio real con el que se carga hoy ese campo. A revisar si esto está mal.
- **Conteos crudos** (`km_recorridos`, `km_alargue`, `km_dobles`, `permanencia`, `cruce_frontera`): estos sí se multiplican por las Tarifas de viaje de Sueldos.

**Lo que falta y no existe en ningún lado hoy:**
- "Aguas y Gaseosas" (viajes de distribución de bebidas, tienen tarifa propia) — no hay ningún campo que lo marque.
- "Km zona 1,20" (coeficiente de zona, tarifa propia, ya cargada en Sueldos) — no hay campo separado de `km_recorridos` para esto.
- "Feriados trabajados" — **no hace falta campo nuevo**: ya existe `fichadas_feriados` (colección de fechas feriado, usada por Fichadas/Reportes) — un tramo "trabajó un feriado" si su `dia_salida` coincide con una fecha de esa colección. Reutilizo esa tabla en vez de duplicar fechas de feriados en otro lado.

## Alcance

**1) Vincular `choferes` con `fichadas_legajos`:**
- Campo nuevo `legajo` (relation, opcional, 1 solo, → `fichadas_legajos`) en la colección `choferes`.
- Migración: intenta auto-vincular por nombre exacto (sin importar mayúsculas/espacios) contra `fichadas_legajos.nombre`; lo que no matchee queda sin vincular, para completar a mano.
- UI: en `web/src/pages/admin/ChoferesTab.tsx` (donde ya se crean/editan choferes), agrego una columna "Legajo" editable como desplegable. Esto requiere ampliar `AdminSimpleTab.tsx` (componente genérico ya usado por varias pestañas de Administración) para soportar un tipo de columna `'select'` además de los `'text'`/`'number'` que ya tiene — una ampliación chica y reusable, no es exclusiva de Choferes.

**2) Completar Tramo:**
- Campo nuevo `es_aguas_gaseosas` (boolean, default false) — mismo patrón que `es_posicionamiento`.
- Campo nuevo `km_zona_120` (number, opcional) — mismo patrón que `km_alargue`.
- Se agregan al formulario de `TramoModal.tsx` y a la exportación a Excel (`COLUMNAS_EXCEL`).

**3) Vista "Liquidación mensual" (pestaña nueva en Sueldos):**
Por chofer + mes elegido, usando los Tramos de ese chofer en ese mes + la categoría/básico de su legajo vinculado + las Tarifas de viaje de Sueldos:

```
variable =
    (Σ km_recorridos + Σ km_alargue) × tarifa["Kilometros recorridos"]
  + Σ km_zona_120 × tarifa["Kilometros zona 1,20"]
  + Σ permanencia × tarifa["Permanencia remunerativa"]
  + Σ permanencia × tarifa["Permanencia viaticos"]
  + Σ cruce_frontera × tarifa["Cruce de frontera"]
  + (cantidad de tramos con es_aguas_gaseosas=true) × tarifa["Aguas y Gaseosas"]
  + (cantidad de tramos cuyo dia_salida está en fichadas_feriados) × tarifa["Feriados"]
  + Σ cyd_manual   (ya es plata, no se multiplica por nada)

bruto = legajo.basico + variable
descuentos = bruto × (suma de los 6 pct_* de la categoría del legajo) / 100
neto = bruto − descuentos
```

**NO incluye antigüedad (1% por año) en este cálculo mensual** — el convenio la prevé, pero no encontré ningún Excel real de sueldo MENSUAL (solo el de vacaciones) para confirmar que se aplica igual acá y sobre qué base exacta. Lo dejo afuera a propósito, marcado en la pantalla como "antigüedad: no incluida todavía", en vez de adivinar la fórmula con dinero real de por medio.

**Pantalla:** selector de chofer + mes (mismo patrón que Planilla Choferes), y un desglose: Básico, cada ítem del variable (con su cantidad y tarifa), Bruto, cada descuento (6 líneas), Neto. Si el chofer no tiene legajo vinculado, o el legajo no tiene categoría/básico cargado, mostrar un aviso claro en vez de calcular con ceros.

**No incluye:** antigüedad (ver arriba), liquidación de administrativos (eso es otro sub-proyecto, basado en fichadas/horas trabajadas, no en tramos), ningún cambio a cómo se cargan/editan los tramos existentes más allá de los 2 campos nuevos.

## Permisos

- `choferes.legajo`: de lectura/escritura igual que el resto de `choferes` hoy (módulo `planilla_choferes` + admin) — no hace falta un permiso nuevo.
- `tramos`: los 2 campos nuevos se crean/editan con el mismo permiso que ya tiene `tramos` hoy — no cambia nada de permisos.
- La pestaña "Liquidación mensual" vive en Sueldos → requiere módulo `sueldos`, y necesita leer `tramos`/`choferes`/`fichadas_legajos`/`fichadas_feriados` — hay que revisar si esas 4 colecciones ya permiten lectura a `sueldos` o si hace falta una migración de permisos cruzados (mismo patrón que se usó varias veces en este proyecto).

## Testing

Sin tests automatizados de frontend (ya establecido). Build limpio + verificación manual con datos reales, incluyendo probar la fórmula a mano contra 1-2 choferes reales del mes actual para confirmar que el número final tiene sentido antes de confiarlo.
