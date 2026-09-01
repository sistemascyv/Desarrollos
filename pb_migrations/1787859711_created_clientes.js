/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const collection = new Collection({
    "id": "ao9eo8ib8n0a6cp",
    "created": "2026-08-27 19:41:51.602Z",
    "updated": "2026-08-27 19:41:51.602Z",
    "name": "clientes",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false,
        "id": "q79nwktk",
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
        "id": "lu7xumhk",
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
  const collection = dao.findCollectionByNameOrId("ao9eo8ib8n0a6cp");

  return dao.deleteCollection(collection);
})
