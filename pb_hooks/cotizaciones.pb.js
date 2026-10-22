/// <reference path="../pb_data/types.d.ts" />
// Cotizador: numeracion correlativa por sucursal (PREFIJO-00000001),
// asignada por el servidor -- nunca por el cliente, mismo criterio que
// vales_caja.pb.js/recibos.pb.js. El prefijo sale de la sucursal del
// usuario autenticado (fichadas: ver pb_migrations/1789270000_usuarios_sucursal.js);
// sin sucursal cargada no se puede crear una cotizacion.
onRecordBeforeCreateRequest((e) => {
  const dao = e.dao || $app.dao();
  const auth = $apis.requestInfo(e.httpContext).authRecord;
  if (!auth) {
    throw new ForbiddenError("No tenés permiso para esto.");
  }
  const sucursal = auth.get("sucursal");
  const PREFIJOS = { cordoba: "COR", san_francisco: "SAN", rosario: "ROS", buenos_aires: "BUE" };
  const prefijo = PREFIJOS[sucursal];
  if (!prefijo) {
    throw new ForbiddenError("Tu usuario no tiene sucursal asignada -- pedile a un administrador que te la cargue en Administración → Usuarios.");
  }

  // Filtro real, no vacío -- un filtro "" rompe findRecordsByFilter en
  // esta versión de PocketBase (ya confirmado varias veces en este
  // proyecto). "~" alcanza porque los 4 prefijos (COR/SAN/ROS/BUE) son
  // todos distintos entre sí, ninguno substring de otro.
  const ultimos = dao.findRecordsByFilter("cotizaciones", "numero ~ {:prefijo}", "-numero", 1, 0, { prefijo: prefijo + "-" });
  let siguiente = 1;
  if (ultimos.length) {
    const partes = ultimos[0].get("numero").split("-");
    siguiente = parseInt(partes[partes.length - 1], 10) + 1;
  }
  e.record.set("numero", prefijo + "-" + String(siguiente).padStart(8, "0"));
  e.record.set("creado_por", auth.get("nombre") || auth.get("username") || auth.id);
}, "cotizaciones");
