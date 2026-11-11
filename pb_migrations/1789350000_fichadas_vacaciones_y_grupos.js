/// <reference path="../pb_data/types.d.ts" />
// Vacaciones/Licencias: reemplaza LIC-CHOF.xls + las 4 LICENCIA
// VACACIONES por grupo/sucursal + GRAL VACACIONES.xlsx (RRHH los
// llevaba 100% a mano). Ver
// docs/superpowers/specs/2026-11-11-fichadas-vacaciones-licencias-design.md.
migrate((db) => {
  const dao = new Dao(db);
  dao.saveCollection(new Collection({
    "id": "fchd0vacac001",
    "name": "fichadas_vacaciones",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false, "id": "fcv0legajo001", "name": "legajo", "type": "relation",
        "required": true, "presentable": false, "unique": false,
        "options": {
          "collectionId": "fchd0legajos001", "cascadeDelete": true,
          "minSelect": null, "maxSelect": 1, "displayFields": ["nombre"]
        }
      },
      {
        "system": false, "id": "fcv0desde0001", "name": "desde", "type": "text",
        "required": true, "presentable": true, "unique": false,
        "options": { "min": 10, "max": 10, "pattern": "" }
      },
      {
        "system": false, "id": "fcv0hasta0001", "name": "hasta", "type": "text",
        "required": true, "presentable": true, "unique": false,
        "options": { "min": 10, "max": 10, "pattern": "" }
      },
      {
        "system": false, "id": "fcv0coment001", "name": "comentario", "type": "text",
        "required": false, "presentable": false, "unique": false,
        "options": { "min": null, "max": null, "pattern": "" }
      },
      {
        "system": false, "id": "fcv0notific01", "name": "notificado", "type": "bool",
        "required": false, "presentable": true, "unique": false,
        "options": {}
      }
    ],
    "indexes": [],
    "listRule": "@request.auth.id != \"\" && (@request.auth.rol = \"admin\" || @request.auth.modulos ?= \"fichadas\")",
    "viewRule": "@request.auth.id != \"\" && (@request.auth.rol = \"admin\" || @request.auth.modulos ?= \"fichadas\")",
    "createRule": "@request.auth.id != \"\" && (@request.auth.rol = \"admin\" || @request.auth.modulos ?= \"fichadas\")",
    "updateRule": "@request.auth.id != \"\" && (@request.auth.rol = \"admin\" || @request.auth.modulos ?= \"fichadas\")",
    "deleteRule": "@request.auth.rol = \"admin\"",
    "options": {}
  }));
  dao.saveCollection(new Collection({
    "id": "fchd0grupos01",
    "name": "fichadas_grupos_restriccion",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false, "id": "fcg0nombre001", "name": "nombre", "type": "text",
        "required": false, "presentable": true, "unique": false,
        "options": { "min": null, "max": null, "pattern": "" }
      },
      {
        "system": false, "id": "fcg0legajos01", "name": "legajos", "type": "relation",
        "required": true, "presentable": false, "unique": false,
        "options": {
          "collectionId": "fchd0legajos001", "cascadeDelete": false,
          "minSelect": 2, "maxSelect": 50, "displayFields": ["nombre"]
        }
      }
    ],
    "indexes": [],
    "listRule": "@request.auth.id != \"\" && (@request.auth.rol = \"admin\" || @request.auth.modulos ?= \"fichadas\")",
    "viewRule": "@request.auth.id != \"\" && (@request.auth.rol = \"admin\" || @request.auth.modulos ?= \"fichadas\")",
    "createRule": "@request.auth.id != \"\" && (@request.auth.rol = \"admin\" || @request.auth.modulos ?= \"fichadas\")",
    "updateRule": "@request.auth.id != \"\" && (@request.auth.rol = \"admin\" || @request.auth.modulos ?= \"fichadas\")",
    "deleteRule": "@request.auth.rol = \"admin\"",
    "options": {}
  }));
  return null;
}, (db) => {
  const dao = new Dao(db);
  try { dao.deleteCollection(dao.findCollectionByNameOrId('fichadas_grupos_restriccion')); } catch (e) { /* no existía */ }
  try { dao.deleteCollection(dao.findCollectionByNameOrId('fichadas_vacaciones')); } catch (e) { /* no existía */ }
  return null;
})
