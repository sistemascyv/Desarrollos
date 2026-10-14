/// <reference path="../pb_data/types.d.ts" />
// Recibos: numeración correlativa asignada por el servidor (nunca por el
// cliente) y creado_por desde el usuario autenticado -- mismo patrón que
// pb_hooks/vales_caja.pb.js. Sin /usar ni /liberar: un recibo no se
// consume, solo se registra.
onRecordBeforeCreateRequest((e) => {
  const dao = e.dao || $app.dao();
  // Filtro real, no vacío -- un filtro "" rompe findRecordsByFilter en
  // esta versión de PocketBase (ya confirmado varias veces en este
  // proyecto).
  const ultimos = dao.findRecordsByFilter("recibos", "numero >= 0", "-numero", 1, 0);
  const siguiente = ultimos.length ? ultimos[0].getInt("numero") + 1 : 1;
  e.record.set("numero", siguiente);

  const auth = $apis.requestInfo(e.httpContext).authRecord;
  if (auth) {
    e.record.set("creado_por", auth.get("nombre") || auth.get("username") || auth.id);
  }
}, "recibos");
