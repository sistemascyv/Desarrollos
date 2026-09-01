/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const collection = new Collection({
    "id": "tjsyat03iwz89tz",
    "created": "2026-08-28 17:22:08.305Z",
    "updated": "2026-08-28 17:22:08.305Z",
    "name": "usuarios",
    "type": "auth",
    "system": false,
    "schema": [
      {
        "system": false,
        "id": "hodhoczj",
        "name": "nombre",
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
        "id": "3pfrfijl",
        "name": "rol",
        "type": "select",
        "required": true,
        "presentable": false,
        "unique": false,
        "options": {
          "maxSelect": 1,
          "values": [
            "admin",
            "operador"
          ]
        }
      },
      {
        "system": false,
        "id": "sztkhr1m",
        "name": "activo",
        "type": "bool",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": {}
      }
    ],
    "indexes": [],
    "listRule": "@request.auth.id != \"\"",
    "viewRule": "@request.auth.id != \"\" && (@request.auth.id = id || @request.auth.rol = \"admin\")",
    "createRule": "@request.auth.rol = \"admin\"",
    "updateRule": "@request.auth.rol = \"admin\"",
    "deleteRule": "@request.auth.rol = \"admin\"",
    "options": {
      "allowEmailAuth": false,
      "allowOAuth2Auth": false,
      "allowUsernameAuth": false,
      "exceptEmailDomains": null,
      "manageRule": null,
      "minPasswordLength": 0,
      "onlyEmailDomains": null,
      "onlyVerified": false,
      "requireEmail": false
    }
  });

  return Dao(db).saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("tjsyat03iwz89tz");

  return dao.deleteCollection(collection);
})
