/// <reference path="../pb_data/types.d.ts" />
// Fichadas: "horas posibles mensuales" -- el denominador para calcular el
// % de horas extra sobre el total posible (ej: HS extra / (dotación ×
// horas posibles)). Un único valor configurable, no una tabla por mes.
// Esta colección tiene exactamente UN registro -- se crea acá con el
// valor inicial y después solo se edita (nunca se crea uno nuevo ni se
// borra), por eso createRule/deleteRule quedan en null.
migrate((db) => {
  const dao = new Dao(db);
  const collection = new Collection({
    "id": "fchdconfig0001",
    "name": "fichadas_configuracion",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false, "id": "fcf0horasposi1", "name": "horas_posibles_mensuales", "type": "number",
        "required": true, "presentable": true, "unique": false,
        "options": { "min": 1, "max": null, "noDecimal": false },
      },
    ],
    "indexes": [],
    "listRule": "@request.auth.id != \"\" && (@request.auth.rol = \"admin\" || @request.auth.modulos ~ \"fichadas\")",
    "viewRule": "@request.auth.id != \"\" && (@request.auth.rol = \"admin\" || @request.auth.modulos ~ \"fichadas\")",
    "createRule": null,
    "updateRule": "@request.auth.id != \"\" && (@request.auth.rol = \"admin\" || @request.auth.modulos ~ \"fichadas\")",
    "deleteRule": null,
    "options": {},
  });
  dao.saveCollection(collection);

  const record = new Record(collection, { horas_posibles_mensuales: 192 });
  dao.saveRecord(record);

  return null;
}, (db) => {
  const dao = new Dao(db);
  return dao.deleteCollection(dao.findCollectionByNameOrId("fichadas_configuracion"));
})
