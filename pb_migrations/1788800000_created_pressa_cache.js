/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const collection = new Collection({
    "id": "prscache0001hst",
    "created": "2026-09-11 00:00:00.000Z",
    "updated": "2026-09-11 00:00:00.000Z",
    "name": "pressa_cache",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false,
        "id": "prc0clave1",
        "name": "clave",
        "type": "text",
        "required": true,
        "presentable": true,
        "unique": true,
        "options": {
          "min": null,
          "max": null,
          "pattern": ""
        }
      },
      {
        "system": false,
        "id": "prc0datos1",
        "name": "datos",
        "type": "json",
        "required": true,
        "presentable": false,
        "unique": false,
        "options": {
          "maxSize": 2000000
        }
      },
      {
        "system": false,
        "id": "prc0actua1",
        "name": "actualizado",
        "type": "number",
        "required": true,
        "presentable": false,
        "unique": false,
        "options": {
          "min": null,
          "max": null,
          "noDecimal": true
        }
      }
    ],
    "indexes": [],
    "listRule": null,
    "viewRule": null,
    "createRule": null,
    "updateRule": null,
    "deleteRule": null,
    "options": {}
  });

  return Dao(db).saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("prscache0001hst");

  return dao.deleteCollection(collection);
})
