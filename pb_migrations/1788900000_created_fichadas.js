/// <reference path="../pb_data/types.d.ts" />
// Módulo "Fichadas" (RRHH) — análisis del reloj biométrico, reemplaza el
// procesamiento que antes hacía CINTIA. Modelo simplificado respecto del
// export original de CINTIA: el horario semanal completo (7 días, con
// posibles turnos partidos) se guarda como UN campo json `dias` en vez de
// una fila por día — mismo comportamiento, muchas menos filas.
migrate((db) => {
  const dao = new Dao(db);
  dao.saveCollection(new Collection({
    "id": "fchd0empresas01",
    "name": "fichadas_empresas",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false,
        "id": "fce0nombre1",
        "name": "nombre",
        "type": "text",
        "required": true,
        "presentable": true,
        "unique": false,
        "options": {
          "min": null,
          "max": null,
          "pattern": ""
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
  dao.saveCollection(new Collection({
    "id": "fchd0horarios01",
    "name": "fichadas_horarios",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false,
        "id": "fch0nombre1",
        "name": "nombre",
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
        "id": "fch0dias001",
        "name": "dias",
        "type": "json",
        "required": true,
        "presentable": false,
        "unique": false,
        "options": {
          "maxSize": 200000
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
  dao.saveCollection(new Collection({
    "id": "fchd0legajos001",
    "name": "fichadas_legajos",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false,
        "id": "fcl0nrolegajo",
        "name": "nro_legajo",
        "type": "text",
        "required": false,
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
        "id": "fcl0nrotarj01",
        "name": "nro_tarjeta",
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
        "id": "fcl0nombre001",
        "name": "nombre",
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
        "id": "fcl0empresa01",
        "name": "empresa",
        "type": "relation",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": {
          "collectionId": "fchd0empresas01",
          "cascadeDelete": false,
          "minSelect": null,
          "maxSelect": 1,
          "displayFields": [
            "nombre"
          ]
        }
      },
      {
        "system": false,
        "id": "fcl0horario01",
        "name": "horario",
        "type": "relation",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": {
          "collectionId": "fchd0horarios01",
          "cascadeDelete": false,
          "minSelect": null,
          "maxSelect": 1,
          "displayFields": [
            "nombre"
          ]
        }
      },
      {
        "system": false,
        "id": "fcl0diasperso",
        "name": "dias_personalizados",
        "type": "json",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": {
          "maxSize": 200000
        }
      },
      {
        "system": false,
        "id": "fcl0estado001",
        "name": "estado",
        "type": "bool",
        "required": false,
        "presentable": true,
        "unique": false,
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
    "id": "fchd0marcas0001",
    "name": "fichadas_marcas",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false,
        "id": "fcm0legajo001",
        "name": "legajo",
        "type": "relation",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": {
          "collectionId": "fchd0legajos001",
          "cascadeDelete": false,
          "minSelect": null,
          "maxSelect": 1,
          "displayFields": [
            "nombre"
          ]
        }
      },
      {
        "system": false,
        "id": "fcm0tarjeta01",
        "name": "tarjeta",
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
        "id": "fcm0fecha0001",
        "name": "fecha",
        "type": "text",
        "required": true,
        "presentable": true,
        "unique": false,
        "options": {
          "min": 10,
          "max": 10,
          "pattern": ""
        }
      },
      {
        "system": false,
        "id": "fcm0hora00001",
        "name": "hora",
        "type": "text",
        "required": true,
        "presentable": false,
        "unique": false,
        "options": {
          "min": 5,
          "max": 5,
          "pattern": ""
        }
      },
      {
        "system": false,
        "id": "fcm0minutos01",
        "name": "minutos",
        "type": "number",
        "required": true,
        "presentable": false,
        "unique": false,
        "options": {
          "min": 0,
          "max": 1439,
          "noDecimal": true
        }
      },
      {
        "system": false,
        "id": "fcm0deposito1",
        "name": "deposito",
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
        "id": "fcm0reloj0001",
        "name": "reloj",
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
        "id": "fcm0archivo01",
        "name": "archivo_origen",
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
    "listRule": "@request.auth.id != \"\" && (@request.auth.rol = \"admin\" || @request.auth.modulos ?= \"fichadas\")",
    "viewRule": "@request.auth.id != \"\" && (@request.auth.rol = \"admin\" || @request.auth.modulos ?= \"fichadas\")",
    "createRule": "@request.auth.rol = \"admin\"",
    "updateRule": "@request.auth.id != \"\" && (@request.auth.rol = \"admin\" || @request.auth.modulos ?= \"fichadas\")",
    "deleteRule": "@request.auth.rol = \"admin\"",
    "options": {}
  }));
  dao.saveCollection(new Collection({
    "id": "fchd0novedades1",
    "name": "fichadas_novedades",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false,
        "id": "fcn0legajo001",
        "name": "legajo",
        "type": "relation",
        "required": true,
        "presentable": false,
        "unique": false,
        "options": {
          "collectionId": "fchd0legajos001",
          "cascadeDelete": true,
          "minSelect": null,
          "maxSelect": 1,
          "displayFields": [
            "nombre"
          ]
        }
      },
      {
        "system": false,
        "id": "fcn0fecha0001",
        "name": "fecha",
        "type": "text",
        "required": true,
        "presentable": true,
        "unique": false,
        "options": {
          "min": 10,
          "max": 10,
          "pattern": ""
        }
      },
      {
        "system": false,
        "id": "fcn0texto0001",
        "name": "texto",
        "type": "text",
        "required": true,
        "presentable": true,
        "unique": false,
        "options": {
          "min": null,
          "max": null,
          "pattern": ""
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
  dao.saveCollection(new Collection({
    "id": "fchd0feriados01",
    "name": "fichadas_feriados",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false,
        "id": "fcf0fecha0001",
        "name": "fecha",
        "type": "text",
        "required": true,
        "presentable": true,
        "unique": true,
        "options": {
          "min": 10,
          "max": 10,
          "pattern": ""
        }
      },
      {
        "system": false,
        "id": "fcf0nombre001",
        "name": "nombre",
        "type": "text",
        "required": false,
        "presentable": true,
        "unique": false,
        "options": {
          "min": null,
          "max": null,
          "pattern": ""
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
  try { dao.deleteCollection(dao.findCollectionByNameOrId("fichadas_feriados")); } catch (e) { /* no existía */ }
  try { dao.deleteCollection(dao.findCollectionByNameOrId("fichadas_novedades")); } catch (e) { /* no existía */ }
  try { dao.deleteCollection(dao.findCollectionByNameOrId("fichadas_marcas")); } catch (e) { /* no existía */ }
  try { dao.deleteCollection(dao.findCollectionByNameOrId("fichadas_legajos")); } catch (e) { /* no existía */ }
  try { dao.deleteCollection(dao.findCollectionByNameOrId("fichadas_horarios")); } catch (e) { /* no existía */ }
  try { dao.deleteCollection(dao.findCollectionByNameOrId("fichadas_empresas")); } catch (e) { /* no existía */ }
  return null;
})
