/// <reference path="../pb_data/types.d.ts" />
// La cascada de "Básico sugerido" (Sueldos → Categorías → cambiarBasicoLegajo)
// termina actualizando fichadas_legajos.categoria/.basico como caché del
// valor vigente. Un usuario que solo tiene el módulo "sueldos" (el caso
// normal de quien usa esa pantalla) no podía completar ese update porque
// updateRule de fichadas_legajos solo incluía "personal". Se agrega
// "sueldos" como alternativa de escritura, sin sacarle nada a "personal".
migrate((db) => {
  const dao = new Dao(db);

  const reglaEscrituraConSueldos = '@request.auth.id != "" && (@request.auth.rol = "admin" || @request.auth.modulos ~ "personal" || @request.auth.modulos ~ "sueldos")';
  const collection = dao.findCollectionByNameOrId('fichadas_legajos');
  collection.updateRule = reglaEscrituraConSueldos;
  dao.saveCollection(collection);

  return null;
}, (db) => {
  const dao = new Dao(db);

  const reglaEscrituraOriginal = '@request.auth.id != "" && (@request.auth.rol = "admin" || @request.auth.modulos ~ "personal")';
  const collection = dao.findCollectionByNameOrId('fichadas_legajos');
  collection.updateRule = reglaEscrituraOriginal;
  dao.saveCollection(collection);

  return null;
})
