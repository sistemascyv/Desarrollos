# Administración → Usuarios: cambiar contraseña — Design

## Contexto

Hoy, en Administración → Usuarios, no hay forma de resetear la contraseña de un usuario existente — si alguien la olvida, no hay cómo ayudarlo desde la pantalla. El usuario pidió agregar esa opción.

## Alcance

Un botón "Contraseña" por fila en la tabla de usuarios de `UsuariosTab.tsx`, que abre un modal chico para cargar una contraseña nueva (mínimo 8 caracteres, mismo criterio que al crear un usuario) y guardarla.

## Fuera de alcance

- No se pide la contraseña actual (no es autoservicio — es un admin reseteando la de otro usuario, o la propia, sin necesidad de conocer la vieja).
- No hay confirmación de contraseña por duplicado (un solo campo) — mismo criterio ya usado en el formulario de "crear usuario" de esta misma pantalla, que tampoco la tiene.
- No se envía ningún email/notificación al usuario avisándole del cambio — fuera de alcance, el admin se lo comunica por fuera del sistema.
- No se restringe para el propio usuario logueado (a diferencia de "Borrar"/"Desactivar", que sí bloquean actuar sobre uno mismo) — cambiar la propia contraseña desde acá es un caso válido.

## Enfoque técnico

**Por qué no alcanza un `pb.collection('usuarios').update(id, { password, passwordConfirm })` directo:** aunque el `updateRule` de la colección `usuarios` ya permite que un admin actualice cualquier registro (`@request.auth.rol = "admin"`), PocketBase valida el cambio de contraseña en una capa aparte del `updateRule`: por el endpoint normal de actualización de un registro exige `oldPassword` salvo que quien hace el pedido sea un superusuario real de PocketBase (la colección interna `_superusers`) — y los usuarios "admin" de este sistema son un rol de la aplicación, no superusuarios de PocketBase. Pedirle al admin la contraseña vieja del otro usuario no tiene sentido (frecuentemente ni la sabe, es justo el caso que se quiere resolver).

**Solución:** un endpoint propio en `pb_hooks/usuarios.pb.js` (archivo nuevo, no existe hoy) que corre a nivel `Dao` — esa capa no pasa por la validación de `oldPassword` del formulario REST estándar, mismo patrón ya usado en este proyecto para otras operaciones privilegiadas server-side (`/api/cuadro-tarifario/aplicar-porcentaje`, `/api/vales-caja/:id/usar`).

```
POST /api/usuarios/:id/cambiar-password
body: { password: string }
```

- Requiere usuario autenticado con `rol = "admin"` (`ForbiddenError` si no).
- Valida `password.length >= 8` (`BadRequestError` si no, mismo mínimo que el formulario de alta).
- Busca el registro por `:id` (`NotFoundError` si no existe).
- Le aplica la contraseña nueva vía el método nativo de PocketBase para registros de colecciones `auth` (`record.setPassword(nueva)`) y guarda.

## UI

En la tabla de `UsuariosTab.tsx`, se agrega un botón `Contraseña` (small secondary) en la celda de acciones de cada fila, junto a los que ya existen (Módulos / Hacer admin-operador / Desactivar / Borrar).

Al tocarlo se abre un modal (mismo patrón visual que el modal de "Módulos" que ya existe en esta pantalla):
- Título: "Cambiar contraseña de {nombre o username del usuario}".
- Un campo `Contraseña nueva` (`type="password"`, placeholder "mín. 8 caracteres").
- Botones Cancelar / Guardar.
- Al guardar: si tiene menos de 8 caracteres, toast de advertencia y no se envía nada. Si el servidor devuelve error, toast con el mensaje. Si sale bien: cierra el modal, limpia el campo, toast de confirmación ("Contraseña actualizada.").

## Testing

- `node --check` sobre el hook nuevo (sintaxis) — no hay PocketBase local en este entorno para probarlo de verdad.
- Build (`npm run build`) para el lado de frontend.
- Verificación manual (queda pendiente de una pasada del usuario, sin navegador en este entorno): cambiar la contraseña de un usuario de prueba y confirmar que puede loguearse con la nueva: probar también que un usuario NO admin no puede llamar al endpoint (403).
