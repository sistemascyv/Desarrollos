/// <reference path="../pb_data/types.d.ts" />
// Historial de corridas del "Bot Act Tarifas" (Python + Selenium, corre en
// una PC de la oficina, NO en este servidor -- ver pb_hooks/bot_tarifas.pb.js
// para el porqué). Cada corrida del bot manda acá su resultado por HTTPS
// directo con el token del usuario que la disparó desde Sistema CyV.
migrate((db) => {
  const collection = new Collection({
    "id": "bottrf0ajustes1",
    "name": "tarifas_bot_ajustes",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false, "id": "bta0porc00001", "name": "porcentaje", "type": "number",
        "required": true, "presentable": true, "unique": false,
        "options": { "min": 0, "max": 50, "noDecimal": false },
      },
      {
        "system": false, "id": "bta0exito0001", "name": "exito", "type": "bool",
        "required": false, "presentable": true, "unique": false, "options": {},
      },
      {
        // { "1": {"antes":"...", "despues":"...", "cambio_pct":5.0, "ok":true}, "2": {...}, ... }
        "system": false, "id": "bta0sucursal1", "name": "sucursales", "type": "json",
        "required": false, "presentable": false, "unique": false, "options": { "maxSize": 200000 },
      },
      {
        "system": false, "id": "bta0error0001", "name": "error", "type": "text",
        "required": false, "presentable": false, "unique": false,
        "options": { "min": null, "max": null, "pattern": "" },
      },
      {
        "system": false, "id": "bta0ejecpor01", "name": "ejecutado_por", "type": "text",
        "required": false, "presentable": true, "unique": false,
        "options": { "min": null, "max": null, "pattern": "" },
      },
    ],
    "indexes": [],
    "listRule": "@request.auth.id != \"\" && (@request.auth.rol = \"admin\" || @request.auth.modulos ~ \"bot_tarifas\")",
    "viewRule": "@request.auth.id != \"\" && (@request.auth.rol = \"admin\" || @request.auth.modulos ~ \"bot_tarifas\")",
    "createRule": "@request.auth.id != \"\" && (@request.auth.rol = \"admin\" || @request.auth.modulos ~ \"bot_tarifas\")",
    "updateRule": null,
    "deleteRule": "@request.auth.rol = \"admin\"",
    "options": {},
  });
  return Dao(db).saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  return dao.deleteCollection(dao.findCollectionByNameOrId("bottrf0ajustes1"));
})
