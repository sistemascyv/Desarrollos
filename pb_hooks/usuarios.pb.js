/// <reference path="../pb_data/types.d.ts" />
// Cambiar la contraseña de un usuario, solo para administradores -- no
// usa el flujo de autoservicio normal de PocketBase (que exige
// oldPassword, pensado para que el propio usuario cambie su
// contraseña sabiendo la actual): un admin reseteando la de otro no
// tiene por qué conocerla. Corre a nivel Dao, que no pasa por esa
// validación del formulario REST estándar -- mismo patrón ya usado en
// pb_hooks/vales_caja.pb.js (/usar, /liberar) y el endpoint
// aplicar-porcentaje del Cuadro Tarifario.
routerAdd("POST", "/api/usuarios/:id/cambiar-password", (c) => {
  const info = $apis.requestInfo(c);
  const auth = info.authRecord;
  if (!auth || auth.get("rol") !== "admin") {
    throw new ForbiddenError("No tenés permiso para esto.");
  }
  const body = info.data || {};
  const nueva = String(body.password || "");
  if (nueva.length < 8) {
    throw new BadRequestError("La contraseña debe tener al menos 8 caracteres.");
  }
  const dao = $app.dao();
  const id = c.pathParam("id");
  let record;
  try {
    record = dao.findRecordById("usuarios", id);
  } catch (err) {
    throw new NotFoundError("Usuario no encontrado.");
  }
  record.setPassword(nueva);
  dao.saveRecord(record);
  return c.json(200, { ok: true });
});
