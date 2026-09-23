/// <reference path="../pb_data/types.d.ts" />
// Vale de Caja: numeración correlativa asignada por el servidor (nunca
// por el cliente) y creado_por desde el usuario autenticado. Ver
// docs/superpowers/specs/2026-09-23-vale-de-caja-design.md.
onRecordBeforeCreateRequest((e) => {
  const dao = e.dao || $app.dao();
  // Filtro real, no vacío -- un filtro "" rompe findRecordsByFilter en
  // esta versión de PocketBase (ya confirmado varias veces en este
  // proyecto).
  const ultimos = dao.findRecordsByFilter("vales_caja", "numero >= 0", "-numero", 1, 0);
  const siguiente = ultimos.length ? ultimos[0].getInt("numero") + 1 : 1;
  e.record.set("numero", siguiente);

  const auth = $apis.requestInfo(e.httpContext).authRecord;
  if (auth) {
    e.record.set("creado_por", auth.get("nombre") || auth.get("username") || auth.id);
  }
}, "vales_caja");

routerAdd("POST", "/api/vales-caja/:id/usar", (c) => {
  const info = $apis.requestInfo(c);
  const auth = info.authRecord;
  if (!auth) {
    throw new ForbiddenError("No tenés permiso para esto.");
  }
  const rawModulos = auth.get("modulos");
  const modulosTexto = (Array.isArray(rawModulos) ? String.fromCharCode.apply(null, rawModulos) : JSON.stringify(rawModulos || [])).toLowerCase();
  const tieneAcceso = auth.get("rol") === "admin" || modulosTexto.indexOf("planilla_choferes") !== -1 || modulosTexto.indexOf("vale_caja") !== -1;
  if (!tieneAcceso) {
    throw new ForbiddenError("No tenés permiso para esto.");
  }
  const dao = $app.dao();
  const id = c.pathParam("id");
  let record;
  try {
    record = dao.findRecordById("vales_caja", id);
  } catch (err) {
    throw new NotFoundError("Vale de caja no encontrado.");
  }
  record.set("usado", true);
  dao.saveRecord(record);
  return c.json(200, { usado: true });
});

routerAdd("POST", "/api/vales-caja/:id/liberar", (c) => {
  const info = $apis.requestInfo(c);
  const auth = info.authRecord;
  if (!auth) {
    throw new ForbiddenError("No tenés permiso para esto.");
  }
  const rawModulos = auth.get("modulos");
  const modulosTexto = (Array.isArray(rawModulos) ? String.fromCharCode.apply(null, rawModulos) : JSON.stringify(rawModulos || [])).toLowerCase();
  const tieneAcceso = auth.get("rol") === "admin" || modulosTexto.indexOf("planilla_choferes") !== -1 || modulosTexto.indexOf("vale_caja") !== -1;
  if (!tieneAcceso) {
    throw new ForbiddenError("No tenés permiso para esto.");
  }
  const dao = $app.dao();
  const id = c.pathParam("id");
  let record;
  try {
    record = dao.findRecordById("vales_caja", id);
  } catch (err) {
    throw new NotFoundError("Vale de caja no encontrado.");
  }
  record.set("usado", false);
  dao.saveRecord(record);
  return c.json(200, { usado: false });
});
