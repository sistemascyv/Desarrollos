# Choferes siempre vinculados a un legajo de Personal — Diseño

## Contexto

Hoy `choferes` es un catálogo simple (`nombre`, `localidad`, `activo`, y un campo `legajo` OPCIONAL que vincula con `fichadas_legajos`). El alta/baja real de un empleado (fecha_alta, fecha_baja, motivo_baja, historial de reingresos) solo existe en `fichadas_legajos`/`fichadas_legajo_historial`, gestionado desde Personal. Un chofer sin ese vínculo completado no tiene ningún historial laboral en ningún lado del sistema — solo el tilde `activo`, sin fecha ni motivo.

El usuario confirmó: quiere que todo chofer tenga siempre un legajo vinculado, que el alta/baja se maneje en Personal (no se duplica un segundo sistema de alta/baja en Choferes), y que el tilde `activo` de Choferes se sincronice automáticamente desde el estado del legajo vinculado (no quede un segundo lugar para mantener a mano).

## Alcance

**1. Migración de backfill:** reintenta vincular por nombre (mismo criterio de `normalizarNombre` ya usado en `1789360000_backfill_fecha_alta_desde_ingreso.js`/`1789370000_seed_fichadas_vacaciones_2026.js`) cualquier `choferes` que hoy tenga `legajo` vacío contra `fichadas_legajos` sin vincular todavía a ningún otro chofer. Reporta por consola cuántos se vincularon y cuántos quedaron sin match (para que el admin los vincule a mano después desde la pantalla, como ya se puede hacer hoy).

**2. `ChoferesTab.tsx` (Administración):** crear un chofer nuevo pasa a exigir elegir un legajo existente (ya no se puede dejar vacío) — el selector solo lista legajos de `fichadas_legajos` que no estén ya vinculados a otro chofer. Si no existe el legajo todavía, el hint de la pantalla indica que hay que crearlo primero en Personal → Empleados. Los choferes ya existentes sin legajo (si el backfill no pudo matchearlos) muestran un aviso visible en la fila para que se vinculen a mano con el selector que ya existe hoy.

**3. Sincronización automática de `activo` (pb_hooks):** un hook `onRecordAfterUpdateRequest` sobre `fichadas_legajos` que, cuando cambia `estado`, busca si hay un `choferes` con `legajo` = ese legajo y le actualiza `activo` para que coincida. El alta/baja de un chofer pasa a hacerse 100% en Personal (Dar de baja / Reactivar, ya existente) — Choferes deja de tener un control de alta/baja propio, su `activo` es un espejo de solo lectura del legajo. El selector de "Legajo" en ChoferesTab se mantiene (para vincular/corregir el vínculo), pero el tilde `activo` deja de ser editable a mano en la UI de Choferes.

## Fuera de alcance

- No se migra el concepto de "localidad" de choferes a ningún lado de Personal — sigue siendo un campo propio de `choferes`.
- No se fuerza retroactivamente que CADA chofer existente tenga legajo si el backfill por nombre no encuentra match — queda pendiente de vinculación manual, visible en la pantalla.
- No se tocan los filtros existentes de `choferes` por `activo = true` (Sueldos, Planilla Choferes) — siguen funcionando igual, ahora con un dato más confiable porque se sincroniza solo.

## Testing

Sin tests automatizados de frontend. Verificación con PocketBase de prueba: confirmar que el backfill vincula por nombre correctamente, que crear un chofer sin elegir legajo bloquea, que dar de baja un legajo en Personal actualiza `activo=false` en el chofer vinculado (y Reactivar lo vuelve a poner en `true`), y que un legajo sin chofer vinculado no dispara nada (no debe fallar ni crear nada).
