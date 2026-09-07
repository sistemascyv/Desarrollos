/// <reference path="../pb_data/types.d.ts" />
// La planilla actualizada (64 camiones) es la flota realmente activa
// hoy. De los 90 cargados originalmente del CSV, estos 31 no aparecen
// ahí — se desactivan (no se borran, por si hace falta reactivarlos)
// en vez de eliminarlos.
migrate((db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("vehiculos");

  const codigos = [
    "T073", "T079", "T081", "T082", "T083", "T084", "T085", "T086", "T087", "T088",
    "T089", "T090", "T091", "T092", "T093", "T094", "T095", "T097", "T099", "T101",
    "T102", "T103", "T105", "T110", "BROAST", "XYCA 1", "AGO 1", "ALO", "AB 936 SC",
    "AC 224 WW", "REPARTO",
  ];

  for (const codigo of codigos) {
    try {
      const record = dao.findFirstRecordByFilter(collection.id, "codigo = {:codigo}", { codigo });
      record.set("activo", false);
      dao.saveRecord(record);
    } catch (e) {
      // no existía (ya se había borrado a mano) — seguimos sin romper el deploy.
    }
  }

  return null;
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("vehiculos");

  const codigos = [
    "T073", "T079", "T081", "T082", "T083", "T084", "T085", "T086", "T087", "T088",
    "T089", "T090", "T091", "T092", "T093", "T094", "T095", "T097", "T099", "T101",
    "T102", "T103", "T105", "T110", "BROAST", "XYCA 1", "AGO 1", "ALO", "AB 936 SC",
    "AC 224 WW", "REPARTO",
  ];
  for (const codigo of codigos) {
    try {
      const record = dao.findFirstRecordByFilter(collection.id, "codigo = {:codigo}", { codigo });
      record.set("activo", true);
      dao.saveRecord(record);
    } catch (e) {}
  }

  return null;
})
