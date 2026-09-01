/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const collection = new Collection({
    "id": "jn6m62976em4ip2",
    "created": "2026-08-27 18:48:37.193Z",
    "updated": "2026-08-27 18:48:37.193Z",
    "name": "tarifas",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false,
        "id": "lkcjd5bi",
        "name": "mes",
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
        "id": "kzvd6np9",
        "name": "tarifa_km",
        "type": "number",
        "required": true,
        "presentable": false,
        "unique": false,
        "options": {
          "min": null,
          "max": null,
          "noDecimal": false
        }
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
  const collection = dao.findCollectionByNameOrId("jn6m62976em4ip2");

  return dao.deleteCollection(collection);
})
