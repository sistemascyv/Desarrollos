/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const collection = new Collection({
    "id": "henbj40l3bk5gl8",
    "created": "2026-08-27 18:48:37.108Z",
    "updated": "2026-08-27 18:48:37.108Z",
    "name": "choferes",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false,
        "id": "u6rpfp2h",
        "name": "nombre",
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
        "id": "72vad4tn",
        "name": "localidad",
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
        "id": "a3w5ktec",
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
  const collection = dao.findCollectionByNameOrId("henbj40l3bk5gl8");

  return dao.deleteCollection(collection);
})
