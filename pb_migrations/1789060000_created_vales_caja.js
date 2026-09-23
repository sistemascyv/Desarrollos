/// <reference path="../pb_data/types.d.ts" />
// Vale de Caja: reemplaza el ejecutable manual "Aplicacion Impresion
// Recibo" (captura de pantalla, sin guardar nada) por un registro real.
// Ver docs/superpowers/specs/2026-09-23-vale-de-caja-design.md.
migrate((db) => {
  const collection = new Collection({
    "id": "valcaja0001reg",
    "name": "vales_caja",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false, "id": "vlc0numero01", "name": "numero", "type": "number",
        "required": true, "presentable": true, "unique": true,
        "options": { "min": 1, "max": null, "noDecimal": true },
      },
      {
        "system": false, "id": "vlc0fecha001", "name": "fecha", "type": "date",
        "required": true, "presentable": true, "unique": false,
        "options": { "min": "", "max": "" },
      },
      {
        "system": false, "id": "vlc0chofer01", "name": "chofer", "type": "relation",
        "required": true, "presentable": true, "unique": false,
        "options": { "collectionId": "henbj40l3bk5gl8", "cascadeDelete": false, "minSelect": null, "maxSelect": 1, "displayFields": ["nombre"] },
      },
      {
        "system": false, "id": "vlc0nomfirm1", "name": "nombre_firma", "type": "text",
        "required": true, "presentable": true, "unique": false,
        "options": { "min": null, "max": null, "pattern": "" },
      },
      {
        "system": false, "id": "vlc0importe1", "name": "importe", "type": "number",
        "required": true, "presentable": true, "unique": false,
        "options": { "min": 0, "max": null, "noDecimal": false },
      },
      {
        "system": false, "id": "vlc0moneda01", "name": "moneda", "type": "select",
        "required": true, "presentable": false, "unique": false,
        "options": { "maxSelect": 1, "values": ["ARS", "BRL"] },
      },
      {
        "system": false, "id": "vlc0observa1", "name": "observacion1", "type": "text",
        "required": false, "presentable": false, "unique": false,
        "options": { "min": null, "max": null, "pattern": "" },
      },
      {
        "system": false, "id": "vlc0observa2", "name": "observacion2", "type": "text",
        "required": false, "presentable": false, "unique": false,
        "options": { "min": null, "max": null, "pattern": "" },
      },
      {
        "system": false, "id": "vlc0usado001", "name": "usado", "type": "bool",
        "required": false, "presentable": true, "unique": false, "options": {},
      },
      {
        "system": false, "id": "vlc0creapor1", "name": "creado_por", "type": "text",
        "required": false, "presentable": true, "unique": false,
        "options": { "min": null, "max": null, "pattern": "" },
      },
    ],
    "indexes": [],
    "listRule": "@request.auth.id != \"\" && (@request.auth.rol = \"admin\" || @request.auth.modulos ~ \"vale_caja\")",
    "viewRule": "@request.auth.id != \"\" && (@request.auth.rol = \"admin\" || @request.auth.modulos ~ \"vale_caja\")",
    "createRule": "@request.auth.id != \"\" && (@request.auth.rol = \"admin\" || @request.auth.modulos ~ \"vale_caja\")",
    "updateRule": null,
    "deleteRule": "@request.auth.rol = \"admin\"",
    "options": {},
  });
  return Dao(db).saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  return dao.deleteCollection(dao.findCollectionByNameOrId("valcaja0001reg"));
})
