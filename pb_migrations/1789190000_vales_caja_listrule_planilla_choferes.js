/// <reference path="../pb_data/types.d.ts" />
// Un usuario con solo el módulo "planilla_choferes" (sin "vale_caja") no
// podía ver los vales disponibles al rendir -- fallaba en silencio (200
// OK, 0 resultados) porque listRule/viewRule solo admitían admin o
// vale_caja. El hook /api/vales-caja/:id/usar (vales_caja.pb.js) ya
// permite planilla_choferes para marcar un vale como usado -- esto
// alinea la lectura con lo que ya estaba permitido para la escritura.
// createRule/deleteRule no se tocan: crear/eliminar vales sigue siendo
// solo de vale_caja/admin.
migrate((db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId('vales_caja');
  collection.listRule = '@request.auth.id != "" && (@request.auth.rol = "admin" || @request.auth.modulos ~ "vale_caja" || @request.auth.modulos ~ "planilla_choferes")';
  collection.viewRule = '@request.auth.id != "" && (@request.auth.rol = "admin" || @request.auth.modulos ~ "vale_caja" || @request.auth.modulos ~ "planilla_choferes")';
  return dao.saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId('vales_caja');
  collection.listRule = '@request.auth.id != "" && (@request.auth.rol = "admin" || @request.auth.modulos ~ "vale_caja")';
  collection.viewRule = '@request.auth.id != "" && (@request.auth.rol = "admin" || @request.auth.modulos ~ "vale_caja")';
  return dao.saveCollection(collection);
})
