/// <reference path="../pb_data/types.d.ts" />
// Básico derivado de categoría + histórico de vigencia (ver
// docs/superpowers/specs/2026-11-18-basico-historial-vigencia-design.md).
// Colección nueva sueldos_basico_historial: un tramo de tiempo con un
// básico fijo por legajo (vigencia_hasta vacío = tramo vigente actual).
// Incluye el backfill: cada legajo que hoy ya tiene categoria+basico
// cargados recibe un tramo "vigente desde siempre" con el valor actual,
// para no perder nada y poder liquidar períodos pasados desde ya.
migrate((db) => {
  const dao = new Dao(db);

  dao.saveCollection(new Collection({
    "id": "sbh0historial1",
    "name": "sueldos_basico_historial",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false, "id": "sbh0legajo0001", "name": "legajo", "type": "relation",
        "required": true, "presentable": true, "unique": false,
        "options": { "collectionId": "fchd0legajos001", "cascadeDelete": true, "minSelect": null, "maxSelect": 1, "displayFields": ["nombre"] }
      },
      {
        "system": false, "id": "sbh0categoria1", "name": "categoria", "type": "relation",
        "required": true, "presentable": true, "unique": false,
        "options": { "collectionId": "fchd0categor01", "cascadeDelete": false, "minSelect": null, "maxSelect": 1, "displayFields": ["nombre"] }
      },
      {
        "system": false, "id": "sbh0basico0001", "name": "basico", "type": "number",
        "required": true, "presentable": true, "unique": false,
        "options": { "min": 0, "max": null, "noDecimal": false }
      },
      {
        "system": false, "id": "sbh0vigdesde01", "name": "vigencia_desde", "type": "text",
        "required": true, "presentable": true, "unique": false,
        "options": { "min": null, "max": null, "pattern": "" }
      },
      {
        "system": false, "id": "sbh0vighasta01", "name": "vigencia_hasta", "type": "text",
        "required": false, "presentable": true, "unique": false,
        "options": { "min": null, "max": null, "pattern": "" }
      }
    ],
    "indexes": [],
    "listRule": "@request.auth.id != \"\" && (@request.auth.rol = \"admin\" || @request.auth.modulos ~ \"vacaciones\" || @request.auth.modulos ~ \"fichadas\" || @request.auth.modulos ~ \"personal\" || @request.auth.modulos ~ \"sueldos\")",
    "viewRule": "@request.auth.id != \"\" && (@request.auth.rol = \"admin\" || @request.auth.modulos ~ \"vacaciones\" || @request.auth.modulos ~ \"fichadas\" || @request.auth.modulos ~ \"personal\" || @request.auth.modulos ~ \"sueldos\")",
    "createRule": "@request.auth.id != \"\" && (@request.auth.rol = \"admin\" || @request.auth.modulos ~ \"personal\" || @request.auth.modulos ~ \"sueldos\")",
    "updateRule": "@request.auth.id != \"\" && (@request.auth.rol = \"admin\" || @request.auth.modulos ~ \"personal\" || @request.auth.modulos ~ \"sueldos\")",
    "deleteRule": "@request.auth.rol = \"admin\"",
    "options": {}
  }));

  // --- Backfill: legajos con categoria+basico ya cargados reciben un tramo "vigente desde siempre" ---
  const historial = dao.findCollectionByNameOrId('sueldos_basico_historial');
  const legajosCol = dao.findCollectionByNameOrId('fichadas_legajos');
  let legajosConDatos = [];
  try { legajosConDatos = dao.findRecordsByFilter(legajosCol.id, "categoria != '' && basico > 0", '', 2000, 0); } catch (e) { /* ninguno */ }
  let creados = 0;
  for (const l of legajosConDatos) {
    let yaExiste = null;
    try { yaExiste = dao.findFirstRecordByFilter(historial.id, "legajo = {:legajo}", { legajo: l.id }); } catch (e) { /* no existe, seguimos */ }
    if (yaExiste) continue;
    const record = new Record(historial, {
      legajo: l.id,
      categoria: l.get('categoria'),
      basico: l.get('basico'),
      vigencia_desde: l.get('fecha_alta') || '2020-01-01',
      vigencia_hasta: '',
    });
    dao.saveRecord(record);
    creados++;
  }
  console.log('basico_historial_vigencia: ' + creados + ' tramos iniciales creados.');

  return null;
}, (db) => {
  const dao = new Dao(db);
  try { dao.deleteCollection(dao.findCollectionByNameOrId('sueldos_basico_historial')); } catch (e) { /* no existía */ }
  return null;
})
