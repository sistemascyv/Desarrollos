# Sueldos: módulo nuevo + Categorías ampliadas + Tarifas de viaje — Diseño

## Contexto

Este es el primer sub-proyecto de una iniciativa más grande: automatizar la liquidación de sueldos mensual de choferes, que hoy se arma a mano cruzando dos Excel (`PLANILLA SUELDOS 2026.xls` y `novedades-chof2026.xls`, ambos en `docs/superpowers/EJEMPLOS/SUELDOS/`) contra el km del satelital (Flota/Pressa/Megatrans) y un papel que llena cada chofer por viaje.

Orden acordado con el usuario para toda la iniciativa:
1. **Este sub-proyecto:** módulo "Sueldos" + Categorías de convenio ampliadas + Tarifas de viaje.
2. Cruce automático de km cargado vs. km real de Flota (satelital).
3. Pantalla para que el administrativo cargue las novedades mensuales de viajes por chofer, reemplazando el Excel.
4. Liquidación de sueldos mensual — choferes (básico + especialidad + variable − descuentos = neto).
5. Liquidación de sueldos — administrativos (flujo aparte, parte de fichadas/horas trabajadas, no de viajes).
6. Que el chofer cargue el viaje él mismo (login propio, reemplaza el papel) — **lo último**, fuera de alcance de este spec y de los siguientes 3 sub-proyectos.

Este spec cubre **solo el punto 1**.

## Qué vi en el Excel real (fuente de verdad)

`PLANILLA SUELDOS 2026.xls`, hoja `noviembre 2026 ` (vigente desde 1° de noviembre de 2026, Planilla N° 248 del sindicato, CCT 40/89): una fila por categoría/variante con su básico, y filas aparte con tarifas de viaje que no dependen de la categoría del chofer. Crucé los valores contra la escala oficial publicada en camioneros-ba.org.ar y contra los totales ya calculados en `novedades-chof2026.xls` (hoja `10-26`) para confirmar cuáles son los que realmente se usan.

## Alcance

**Incluye:**
- Módulo nuevo "Sueldos" en el menú (grupo RRHH), mismo patrón que Vacaciones/Reportes/Personal.
- La pantalla "Categorías de convenio" (hoy en Vacaciones) se muda a Sueldos. Vacaciones sigue pudiendo leerla (Liquidación de Vacaciones la necesita) — solo cambia quién la edita y dónde vive en el menú.
- Datos iniciales: cargo como filas nuevas de Categorías las variantes por especialidad que hoy no existen (Conductor 1ª Local, Conductor 1ª Pinturas y Mat. Peligro, Conductor 1ª/2ª Cámara de Frío, etc.) — **no es un cambio de modelo de datos**, son filas nuevas en la misma tabla que ya existe, igual que ya está armado el Excel.
- Colección nueva `sueldos_tarifas_viaje`: tarifas de viaje que son un valor único por evento (no varían por categoría del chofer) — Control Carga y Descarga, Kilómetros recorridos, Kilómetros zona 1,20, Permanencia remunerativa, Permanencia viáticos, Cruce de frontera. Pantalla nueva en Sueldos para editarlas, mismo patrón simple que Categorías (nombre + valor).

**No incluye (queda para los sub-proyectos 2 a 6):**
- Cruce con el km del satelital.
- Carga de novedades mensuales por chofer.
- Cualquier cálculo de liquidación (ni choferes ni administrativos).
- Login de choferes.

## Datos iniciales que cargo yo

Extraje estos valores directo de la hoja `noviembre 2026 ` del Excel y los crucé contra la escala oficial del sindicato (coinciden). Los cargo como parte de la migración:

**Categorías — básicos (ya existen como concepto, agrego las filas que faltan):**
Conductor 1ª/2ª/3ª, Conductor 1ª Local (+18%), Conductor 1ª Pinturas y Mat. Peligro (+20%), Encargado, Recibidor/Clasificador (+16%), Recibidor en Cámara de Frío (+18%), Peones Especializados, Peones Especializados Cámara de Frío (+18%), Peones Carga y Descarga (+16%), Peones Carga y Descarga Cámara de Frío (+18%), Operadores de Autoelevadores, Oficial de Primera (+25%), Oficial de Taller (+25%), Oficial (+25%), Medio Oficial (+18%), Oficial Gomero (+25%), Medio Oficial Gomero (+18%), Lavadores/Engrasadores, Administrativo 1ª/2ª/3ª/4ª, Maestranza y/o Serenos — básico y plus vacacional ($26.753,19, igual para todas) de cada una.

**Tarifas de viaje:**
- Control Carga y Descarga: $47.720,58
- Kilómetros recorridos: $91,625 (por km)
- Kilómetros zona 1,20: $109,951 (por km)
- Permanencia remunerativa: $32.418,56 (por día y persona)
- Permanencia viáticos: $61.847,64 (por día y persona)
- Cruce de frontera: $42.592,11 (por cada cruce)

**Lo que NO cargo porque no pude confirmar el valor exacto con una fuente cruzada:** la tarifa de "Aguas y Gaseosas" y la de "Feriados" que aparecen en los totales de `novedades-chof2026.xls` (rates $14.773,04 y $51.615,18 respectivamente en los totales de octubre) no coinciden con ninguna celda que haya podido identificar con certeza en `PLANILLA SUELDOS 2026.xls` ni en la escala del sindicato — pueden salir de una fórmula o de otra hoja que no revisé. Dejo esas 2 filas creadas con valor $0 y un nombre claro, para que las completes vos (o las revisemos juntos) antes de usarlas en ningún cálculo real.

## Modelo de datos

`fichadas_categorias` — sin cambios de esquema. Solo cambian las reglas de acceso (ver abajo) y se agregan filas.

`sueldos_tarifas_viaje` (colección nueva):
- `nombre` (text, requerido)
- `valor` (number, requerido en la app aunque el campo quede `required:false` en PocketBase — mismo motivo que en `fichadas_categorias`: un 0 real debe poder guardarse, la validación de "no vacío" la hace la pantalla)

## Permisos

- Módulo nuevo `sueldos` en `MODULES` (`web/src/types.ts`).
- `fichadas_categorias`: `listRule`/`viewRule` agregan `sueldos` a la lista de módulos que ya puede leer (admin, vacaciones, fichadas, personal). `createRule`/`updateRule` pasan de ser solo `vacaciones` a ser solo `sueldos` (mismo corte limpio que se hizo con Personal). `deleteRule` sigue siendo solo admin.
- `sueldos_tarifas_viaje`: listRule/viewRule/createRule/updateRule = admin o módulo `sueldos`. deleteRule = solo admin.
- Nota operativa (ya pasó con Vacaciones/Reportes/Personal): ningún usuario existente recibe el módulo `sueldos` automáticamente — hay que asignarlo a mano en Administración → Usuarios a quien vaya a cargar esto.

## UI

- `web/src/pages/sueldos/SueldosPage.tsx` (nuevo): layout con pestañas "Categorías de convenio" y "Tarifas de viaje", mismo patrón visual que las demás páginas con pestañas (Fichadas, Personal).
- `CategoriasSub.tsx` se mueve de `web/src/pages/vacaciones/` a `web/src/pages/sueldos/` sin cambios de lógica.
- `TarifasViajeSub.tsx` (nuevo): tabla simple nombre + valor, alta/edición/borrado — copia directa del patrón de `CategoriasSub.tsx` pero con 2 columnas en vez de 8.
- `web/src/pages/vacaciones/VacacionesPage.tsx`: hoy tiene una pestaña "Categorías" (línea 19) que renderiza `<CategoriasSub />` directo (línea 25) y el tipo `Vista` incluye `'categorias'` (línea 6). Se saca esa pestaña, esa rama de render y ese valor del tipo — Vacaciones queda con las pestañas que no son de categorías (vacaciones/grupos). `AsignarVacacionesSub.tsx` sigue leyendo `fichadas_categorias` igual que hoy (sigue teniendo permiso de lectura), no cambia.

## Testing

Sin tests automatizados de frontend en este proyecto (ya establecido). Cada tarea del plan termina con `npm run build` limpio + verificación manual paso a paso, más prueba en vivo contra una instancia de PocketBase de testing con un usuario no-admin que solo tenga el módulo `sueldos` (mismo patrón de verificación que se usó en Personal/Liquidación de Vacaciones) para confirmar que los permisos cortan donde deben.
