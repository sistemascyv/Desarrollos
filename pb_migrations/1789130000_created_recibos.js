/// <reference path="../pb_data/types.d.ts" />
// Recibos: registro de plata que la empresa RECIBE de un tercero (ej:
// venta de un camión) -- separado de vales_caja (que es plata que la
// empresa DA a un chofer). Ver
// docs/superpowers/specs/2026-10-14-vale-caja-rediseno-y-recibos-design.md.
// numero ya arranca con required:false (bug ya conocido en este proyecto
// con vales_caja -- PocketBase valida "required" antes de que corra el
// hook que lo asigna).
migrate((db) => {
  const collection = new Collection({
    "id": "recibos0001reg",
    "name": "recibos",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false, "id": "rcb0numero001", "name": "numero", "type": "number",
        "required": false, "presentable": true, "unique": true,
        "options": { "min": 1, "max": null, "noDecimal": true },
      },
      {
        "system": false, "id": "rcb0fecha0001", "name": "fecha", "type": "date",
        "required": true, "presentable": true, "unique": false,
        "options": { "min": "", "max": "" },
      },
      {
        "system": false, "id": "rcb0recibide1", "name": "recibido_de", "type": "text",
        "required": true, "presentable": true, "unique": false,
        "options": { "min": null, "max": null, "pattern": "" },
      },
      {
        "system": false, "id": "rcb0importe01", "name": "importe", "type": "number",
        "required": true, "presentable": true, "unique": false,
        "options": { "min": 0, "max": null, "noDecimal": false },
      },
      {
        "system": false, "id": "rcb0moneda001", "name": "moneda", "type": "select",
        "required": true, "presentable": false, "unique": false,
        "options": { "maxSelect": 1, "values": ["ARS", "USD"] },
      },
      {
        "system": false, "id": "rcb0concepto1", "name": "concepto", "type": "text",
        "required": false, "presentable": false, "unique": false,
        "options": { "min": null, "max": null, "pattern": "" },
      },
      {
        "system": false, "id": "rcb0creapor01", "name": "creado_por", "type": "text",
        "required": false, "presentable": true, "unique": false,
        "options": { "min": null, "max": null, "pattern": "" },
      },
    ],
    "indexes": [],
    "listRule": "@request.auth.id != \"\" && (@request.auth.rol = \"admin\" || @request.auth.modulos ~ \"recibos\")",
    "viewRule": "@request.auth.id != \"\" && (@request.auth.rol = \"admin\" || @request.auth.modulos ~ \"recibos\")",
    "createRule": "@request.auth.id != \"\" && (@request.auth.rol = \"admin\" || @request.auth.modulos ~ \"recibos\")",
    "updateRule": null,
    "deleteRule": "@request.auth.rol = \"admin\"",
    "options": {},
  });
  return Dao(db).saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  return dao.deleteCollection(dao.findCollectionByNameOrId("recibos0001reg"));
})
