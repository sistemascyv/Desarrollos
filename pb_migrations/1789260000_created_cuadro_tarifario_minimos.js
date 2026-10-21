/// <reference path="../pb_data/types.d.ts" />
// Minimo de flete por sucursal -- un valor fijo que no depende de ningun
// rango de peso (a diferencia de cuadro_tarifario). Coleccion de UN solo
// registro (mismo criterio que fichadas_configuracion): se crea aca con
// los valores reales y despues solo la actualiza el endpoint de aplicar-%
// (pb_hooks/cuadro_tarifario.pb.js), nunca se crea uno nuevo ni se borra
// -- por eso createRule/updateRule/deleteRule quedan en null, igual que
// cuadro_tarifario.
migrate((db) => {
  const dao = new Dao(db);
  const collection = new Collection({
    "id": "ctfminimos0001",
    "name": "cuadro_tarifario_minimos",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false, "id": "ctm0cordoba001", "name": "cordoba", "type": "number",
        "required": true, "presentable": true, "unique": false,
        "options": { "min": 0, "max": null, "noDecimal": false },
      },
      {
        "system": false, "id": "ctm0sanfranci1", "name": "san_francisco", "type": "number",
        "required": true, "presentable": true, "unique": false,
        "options": { "min": 0, "max": null, "noDecimal": false },
      },
      {
        "system": false, "id": "ctm0rosario001", "name": "rosario", "type": "number",
        "required": true, "presentable": true, "unique": false,
        "options": { "min": 0, "max": null, "noDecimal": false },
      },
      {
        "system": false, "id": "ctm0buenosair1", "name": "buenos_aires", "type": "number",
        "required": true, "presentable": true, "unique": false,
        "options": { "min": 0, "max": null, "noDecimal": false },
      },
    ],
    "indexes": [],
    "listRule": "@request.auth.id != \"\" && (@request.auth.rol = \"admin\" || @request.auth.modulos ~ \"cuadro_tarifario\")",
    "viewRule": "@request.auth.id != \"\" && (@request.auth.rol = \"admin\" || @request.auth.modulos ~ \"cuadro_tarifario\")",
    "createRule": null,
    "updateRule": null,
    "deleteRule": null,
    "options": {},
  });
  dao.saveCollection(collection);

  const record = new Record(collection, {
    cordoba: 33543.05,
    san_francisco: 25157.30,
    rosario: 33543.05,
    buenos_aires: 33543.05,
  });
  dao.saveRecord(record);

  return null;
}, (db) => {
  const dao = new Dao(db);
  return dao.deleteCollection(dao.findCollectionByNameOrId("ctfminimos0001"));
})
