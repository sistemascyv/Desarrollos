# Cruce automático de km con el satelital — Diseño

## Contexto

Sub-proyecto 2 de la automatización de liquidación de sueldos de choferes (sub-proyecto 1, "Sueldos: Categorías ampliadas + Tarifas de viaje", ya en staging). El usuario pidió avanzar con el resto de la cadena (sub-proyectos 2 a 5) con menos idas y vueltas de preguntas — este spec documenta las decisiones que tomé yo, a corregir después si algo no es como se esperaba.

Hoy, un administrativo carga a mano en `PlanillaChoferesPage` (módulo "Planilla Choferes", ya existente) los km recorridos por tramo/viaje, y por separado consulta el km real del satelital (Pressa/Megatrans, vía el módulo "Posición de Flota") para corroborar a ojo que coincida — un paso manual, lento, viaje por viaje.

## Alcance

**Incluye:** un botón nuevo "Verificar con satelital" en `PlanillaChoferesPage`, visible cuando hay un chofer y un rango de fechas seleccionados (reusa el `desde`/`hasta` que la página ya maneja). Al tocarlo: agrupa los tramos del chofer en ese rango por `tractor`, suma los km reportados por unidad, llama una vez al endpoint ya existente `GET /api/flota/km-real/:desde/:hasta` (combina Pressa+Megatrans, ya usado por Posición de Flota), cruza cada unidad usada por el chofer contra el km real que devuelve ese endpoint, y muestra una tabla comparativa: unidad, km cargados, km real (satelital), diferencia (km y %), con un aviso visual si la diferencia supera un umbral.

**No incluye:** no modifica ni bloquea nada de lo que ya carga el administrativo — es solo informativo, el administrativo decide si corrige algo. No agrega ningún llamado automático/periódico (es bajo demanda, con un botón, porque el endpoint de Megatrans es lento — hasta ~60 llamadas secuenciales con un circuit breaker ya implementado).

## Decisiones que tomé (corregibles)

- **Qué km se suma por tramo:** `km_recorridos + km_alargue` (ambos están marcados como "se suma al total" en `COLUMNAS_EXCEL` de `PlanillaChoferesPage.tsx`, y ambos representan distancia real recorrida). **`km_dobles` NO se suma** al total que se compara contra el satelital — interpreté que es un conteo duplicado para otro fin (pago), no distancia física adicional que el GPS vaya a medir dos veces. Si esto está mal, es un cambio de una línea.
- **Se incluyen los tramos de posicionamiento** (`es_posicionamiento: true`) en la suma — mueven el camión y generan km real igual que cualquier otro viaje.
- **Cómo se cruza `tractor` (texto libre en Tramo) contra la unidad del satelital:** busco en `vehiculos` el registro cuyo `codigo` coincide (sin importar mayúsc./espacios) con el `tractor` cargado; si lo encuentro, intento matchear la respuesta del satelital primero por `alias` (= `codigo` para las unidades de Megatrans) y si no, por `patente` normalizada del vehículo. Si no hay vehículo con ese código, o el satelital no devolvió esa unidad en el período, la fila se muestra como "Sin dato satelital para esta unidad" en vez de inventar un cero.
- **Umbral de aviso:** diferencia absoluta mayor al 10% se marca con un ícono de advertencia (color de alerta ya usado en el resto de la app) — no bloquea nada, es solo una señal visual para que el administrativo mire esa unidad primero.
- **No se guarda nada en la base** — el resultado del cruce vive solo en el estado de la pantalla mientras está abierta; si se quiere, se puede agregar más adelante un botón para "copiar" el km real sobre `km_recorridos`, pero no lo armo ahora para no sobrepasarme del pedido.

## UI

Nuevo bloque en `PlanillaChoferesPage.tsx`, debajo del selector de chofer/fechas y encima de la tabla de tramos: botón "Verificar con satelital" (deshabilitado mientras no haya chofer+fechas elegidos, con texto "Verificando..." mientras espera la respuesta — el endpoint puede tardar, ya que Megatrans es secuencial). Al responder, una tabla chica: Unidad | Km cargados | Km satelital | Diferencia. Si el backend devuelve `megatransFallidos`/`megatransOmitidos` > 0, un aviso aparte avisando que algunas unidades no se pudieron verificar (mismo patrón que ya debe mostrar Posición de Flota, a revisar al implementar).

## Backend

No hace falta ningún endpoint nuevo — se reusa `GET /api/flota/km-real/:desde/:hasta` tal cual existe hoy en `pb_hooks/km_real.pb.js`. Requiere que el usuario tenga el módulo `flota_posicion` (así lo exige ese endpoint ya hoy) además de `planilla_choferes` — si un usuario de Planilla Choferes no tiene `flota_posicion`, el botón debe mostrar el error 403 real del endpoint ("No tenés acceso al módulo de Posición de Flota"), no fallar en silencio. No se abre el endpoint a `planilla_choferes` como alternativa — mismo permiso que ya exige, sin aflojar nada, a menos que el usuario corrija esto después.

## Testing

Sin tests automatizados de frontend (ya establecido en este proyecto). Build limpio + verificación manual (no hay forma de probar el cruce real contra Pressa/Megatrans sin pegarle a los proveedores de verdad — eso se confirma al probar en staging con datos reales, no con una instancia de PocketBase de prueba vacía).
