/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const collection = new Collection({
    "id": "drkysi4dr66cl89",
    "created": "2026-08-27 18:48:37.159Z",
    "updated": "2026-08-27 18:48:37.159Z",
    "name": "vehiculos",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false,
        "id": "pmk29kao",
        "name": "codigo",
        "type": "text",
        "required": true,
        "presentable": false,
        "unique": false,
        "options": {
          "min": null,
          "max": null,
          "pattern": ""
        }
      },
      {
        "system": false,
        "id": "gplegbmj",
        "name": "marca_modelo",
        "type": "text",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": {
          "min": null,
          "max": null,
          "pattern": ""
        }
      },
      {
        "system": false,
        "id": "mjiwt13c",
        "name": "activo",
        "type": "bool",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": {}
      }
    ],
    "indexes": [],
    "listRule": "",
    "viewRule": "",
    "createRule": "",
    "updateRule": "",
    "deleteRule": "",
    "options": {}
  });

  return Dao(db).saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("drkysi4dr66cl89");

  return dao.deleteCollection(collection);
})
