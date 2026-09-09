/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const collection = new Collection({
    "id": "repflota0001hist",
    "created": "2026-09-09 00:00:00.000Z",
    "updated": "2026-09-09 00:00:00.000Z",
    "name": "reportes_archivo",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false,
        "id": "rpa0tipo1",
        "name": "tipo",
        "type": "select",
        "required": true,
        "presentable": true,
        "unique": false,
        "options": {
          "maxSelect": 1,
          "values": ["combustible", "cubiertas"]
        }
      },
      {
        "system": false,
        "id": "rpa0nomb1",
        "name": "nombre_archivo",
        "type": "text",
        "required": true,
        "presentable": true,
        "unique": false,
        "options": {
          "min": null,
          "max": null,
          "pattern": ""
        }
      },
      {
        "system": false,
        "id": "rpa0usua1",
        "name": "usuario",
        "type": "relation",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": {
          "collectionId": "tjsyat03iwz89tz",
          "cascadeDelete": false,
          "minSelect": null,
          "maxSelect": 1,
          "displayFields": ["nombre", "username"]
        }
      },
      {
        "system": false,
        "id": "rpa0dato1",
        "name": "datos",
        "type": "json",
        "required": true,
        "presentable": false,
        "unique": false,
        "options": {
          "maxSize": 8000000
        }
      }
    ],
    "indexes": [],
    "listRule": "@request.auth.id != \"\" && (@request.auth.rol = \"admin\" || @request.auth.modulos ?= \"consumo_combustible\" || @request.auth.modulos ?= \"panel_cubiertas\")",
    "viewRule": "@request.auth.id != \"\" && (@request.auth.rol = \"admin\" || @request.auth.modulos ?= \"consumo_combustible\" || @request.auth.modulos ?= \"panel_cubiertas\")",
    "createRule": "@request.auth.id != \"\" && (@request.auth.rol = \"admin\" || @request.auth.modulos ?= \"consumo_combustible\" || @request.auth.modulos ?= \"panel_cubiertas\")",
    "updateRule": null,
    "deleteRule": "@request.auth.rol = \"admin\"",
    "options": {}
  });

  return Dao(db).saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("repflota0001hist");

  return dao.deleteCollection(collection);
})
