/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const collection = new Collection({
    "id": "cheqctrl0001pnd",
    "created": "2026-09-03 00:00:00.000Z",
    "updated": "2026-09-03 00:00:00.000Z",
    "name": "cheques",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false,
        "id": "chq0img1",
        "name": "imagen",
        "type": "file",
        "required": true,
        "presentable": false,
        "unique": false,
        "options": {
          "maxSelect": 1,
          "maxSize": 8388608,
          "mimeTypes": ["image/jpeg", "image/png", "image/webp", "image/heic"],
          "thumbs": [],
          "protected": false
        }
      },
      {
        "system": false,
        "id": "chq0cuit",
        "name": "cuit_emisor",
        "type": "text",
        "required": true,
        "presentable": true,
        "unique": false,
        "options": {
          "min": 11,
          "max": 11,
          "pattern": "^[0-9]{11}$"
        }
      },
      {
        "system": false,
        "id": "chq0nomb",
        "name": "emisor_nombre",
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
        "id": "chq0nche",
        "name": "numero_cheque",
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
        "id": "chq0mont",
        "name": "monto",
        "type": "number",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": {
          "min": 0,
          "max": null,
          "noDecimal": false
        }
      },
      {
        "system": false,
        "id": "chq0esta",
        "name": "estado",
        "type": "select",
        "required": true,
        "presentable": true,
        "unique": false,
        "options": {
          "maxSelect": 1,
          "values": ["pendiente", "aceptado", "rechazado"]
        }
      },
      {
        "system": false,
        "id": "chq0bcra",
        "name": "bcra_consultado",
        "type": "bool",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": {}
      },
      {
        "system": false,
        "id": "chq0rech",
        "name": "bcra_tiene_rechazados",
        "type": "bool",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": {}
      },
      {
        "system": false,
        "id": "chq0deta",
        "name": "bcra_detalle",
        "type": "json",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": {
          "maxSize": 2000000
        }
      },
      {
        "system": false,
        "id": "chq0fcon",
        "name": "bcra_fecha_consulta",
        "type": "date",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": {
          "min": "",
          "max": ""
        }
      },
      {
        "system": false,
        "id": "chq0nota",
        "name": "notas",
        "type": "text",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": {
          "min": null,
          "max": null,
          "pattern": ""
        }
      }
    ],
    "indexes": [],
    "listRule": "@request.auth.id != \"\" && (@request.auth.rol = \"admin\" || @request.auth.modulos ?= \"control_cheques\")",
    "viewRule": "@request.auth.id != \"\" && (@request.auth.rol = \"admin\" || @request.auth.modulos ?= \"control_cheques\")",
    "createRule": "@request.auth.id != \"\" && (@request.auth.rol = \"admin\" || @request.auth.modulos ?= \"control_cheques\")",
    "updateRule": "@request.auth.id != \"\" && (@request.auth.rol = \"admin\" || @request.auth.modulos ?= \"control_cheques\")",
    "deleteRule": "@request.auth.rol = \"admin\"",
    "options": {}
  });

  return Dao(db).saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("cheqctrl0001pnd");

  return dao.deleteCollection(collection);
})
