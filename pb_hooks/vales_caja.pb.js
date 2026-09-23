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
