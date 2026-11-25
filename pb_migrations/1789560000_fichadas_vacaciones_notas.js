/// <reference path="../pb_data/types.d.ts" />
// Planificación de vacaciones (ver
// docs/superpowers/specs/2026-11-25-vacaciones-planificacion-design.md):
// notas operativas libres por día+grupo para el cuadro de planificación,
// equivalente a la columna de comentarios de "PLANILLA DE COMUNICADOS"
// (LIC-CHOF.xls, hoja "DETALLE 2026 (3)"). No se liga a ningún legajo
// puntual -- es una nota del día en general (ej: "2 abiertos 2 furgones").
migrate((db) => {
  const dao = new Dao(db);
  dao.saveCollection(new Collection({
    "id": "fvn0notas001",
    "name": "fichadas_vacaciones_notas",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false, "id": "fvn0fecha0001", "name": "fecha", "type": "text",
        "required": true, "presentable": true, "unique": false,
        "options": { "min": 10, "max": 10, "pattern": "" }
      },
      {
        "system": false, "id": "fvn0grupo0001", "name": "grupo", "type": "select",
        "required": true, "presentable": true, "unique": false,
        "options": { "maxSelect": 1, "values": ["administrativos", "choferes"] }
      },
      {
        "system": false, "id": "fvn0texto0001", "name": "texto", "type": "text",
        "required": true, "presentable": false, "unique": false,
        "options": { "min": null, "max": null, "pattern": "" }
      }
    ],
    "indexes": [],
    "listRule": "@request.auth.id != \"\" && (@request.auth.rol = \"admin\" || @request.auth.modulos ~ \"vacaciones\")",
    "viewRule": "@request.auth.id != \"\" && (@request.auth.rol = \"admin\" || @request.auth.modulos ~ \"vacaciones\")",
    "createRule": "@request.auth.id != \"\" && (@request.auth.rol = \"admin\" || @request.auth.modulos ~ \"vacaciones\")",
    "updateRule": "@request.auth.id != \"\" && (@request.auth.rol = \"admin\" || @request.auth.modulos ~ \"vacaciones\")",
    "deleteRule": "@request.auth.rol = \"admin\"",
    "options": {}
  }));
  return null;
}, (db) => {
  const dao = new Dao(db);
  try { dao.deleteCollection(dao.findCollectionByNameOrId('fichadas_vacaciones_notas')); } catch (e) { /* no existía */ }
  return null;
})
