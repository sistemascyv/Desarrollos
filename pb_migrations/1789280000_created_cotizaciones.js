/// <reference path="../pb_data/types.d.ts" />
// Cotizador: encabezado (cotizaciones) + items (cotizacion_items). Los
// montos se calculan en el frontend y se guardan ya resueltos -- no se
// recalculan solos si cambia despues el Cuadro Tarifario. No son
// editables despues de creadas (updateRule null en las 2) -- ver
// docs/superpowers/specs/2026-10-22-cotizador-design.md.
//
// Todos los campos number calculados (sub_total/recargo/seguro/
// neto_gravado/iva/total, precio/total de los items) son "required: false"
// a proposito, aunque la aplicacion siempre los manda: confirmado contra
// una PocketBase real que un campo number "required: true" RECHAZA el
// valor 0 por la API REST ("Missing required value") -- y 0 es un valor
// perfectamente legitimo para varios de estos (recargo=0 cuando el flete
// ya supera el minimo, seguro=0 sin seguro activo, etc).
migrate((db) => {
  const dao = new Dao(db);

  const cotizaciones = new Collection({
    "id": "cotizaciones01",
    "name": "cotizaciones",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false, "id": "cot0numero0001", "name": "numero", "type": "text",
        "required": true, "presentable": true, "unique": true,
        "options": { "min": null, "max": null, "pattern": "" },
      },
      {
        "system": false, "id": "cot0fecha00001", "name": "fecha", "type": "text",
        "required": true, "presentable": true, "unique": false,
        "options": { "min": null, "max": null, "pattern": "" },
      },
      {
        "system": false, "id": "cot0trfcorig01", "name": "trafico_origen", "type": "select",
        "required": true, "presentable": true, "unique": false,
        "options": { "maxSelect": 1, "values": ["cordoba", "san_francisco", "rosario", "buenos_aires"] },
      },
      {
        "system": false, "id": "cot0trfcdest1", "name": "trafico_destino", "type": "select",
        "required": true, "presentable": true, "unique": false,
        "options": { "maxSelect": 1, "values": ["cordoba", "san_francisco", "rosario", "buenos_aires"] },
      },
      {
        "system": false, "id": "cot0pagaen0001", "name": "paga_en", "type": "select",
        "required": true, "presentable": false, "unique": false,
        "options": { "maxSelect": 1, "values": ["origen", "destino"] },
      },
      {
        "system": false, "id": "cot0cliente001", "name": "cliente", "type": "relation",
        "required": false, "presentable": true, "unique": false,
        "options": { "collectionId": "ao9eo8ib8n0a6cp", "cascadeDelete": false, "minSelect": null, "maxSelect": 1, "displayFields": ["nombre"] },
      },
      {
        "system": false, "id": "cot0solicpor01", "name": "solicitado_por", "type": "text",
        "required": false, "presentable": false, "unique": false,
        "options": { "min": null, "max": null, "pattern": "" },
      },
      {
        "system": false, "id": "cot0telefono01", "name": "telefono", "type": "text",
        "required": false, "presentable": false, "unique": false,
        "options": { "min": null, "max": null, "pattern": "" },
      },
      {
        "system": false, "id": "cot0email00001", "name": "email", "type": "text",
        "required": false, "presentable": false, "unique": false,
        "options": { "min": null, "max": null, "pattern": "" },
      },
      {
        "system": false, "id": "cot0lugcarga01", "name": "lugar_carga", "type": "text",
        "required": false, "presentable": false, "unique": false,
        "options": { "min": null, "max": null, "pattern": "" },
      },
      {
        "system": false, "id": "cot0lugdescar1", "name": "lugar_descarga", "type": "text",
        "required": false, "presentable": false, "unique": false,
        "options": { "min": null, "max": null, "pattern": "" },
      },
      {
        "system": false, "id": "cot0tipomerc01", "name": "tipo_mercaderia", "type": "text",
        "required": false, "presentable": false, "unique": false,
        "options": { "min": null, "max": null, "pattern": "" },
      },
      {
        "system": false, "id": "cot0observac01", "name": "observacion", "type": "text",
        "required": false, "presentable": false, "unique": false,
        "options": { "min": null, "max": null, "pattern": "" },
      },
      {
        "system": false, "id": "cot0segactivo1", "name": "seguro_activo", "type": "bool",
        "required": false, "presentable": false, "unique": false, "options": {},
      },
      {
        "system": false, "id": "cot0segporc001", "name": "seguro_porcentaje", "type": "number",
        "required": false, "presentable": false, "unique": false,
        "options": { "min": 0, "max": null, "noDecimal": false },
      },
      {
        "system": false, "id": "cot0contraree1", "name": "contra_reembolso", "type": "number",
        "required": false, "presentable": false, "unique": false,
        "options": { "min": 0, "max": null, "noDecimal": false },
      },
      {
        "system": false, "id": "cot0taxiflet01", "name": "taxi_flet", "type": "number",
        "required": false, "presentable": false, "unique": false,
        "options": { "min": 0, "max": null, "noDecimal": false },
      },
      {
        "system": false, "id": "cot0subtotal01", "name": "sub_total", "type": "number",
        "required": false, "presentable": false, "unique": false,
        "options": { "min": 0, "max": null, "noDecimal": false },
      },
      {
        "system": false, "id": "cot0recargo001", "name": "recargo", "type": "number",
        "required": false, "presentable": false, "unique": false,
        "options": { "min": 0, "max": null, "noDecimal": false },
      },
      {
        "system": false, "id": "cot0seguro0001", "name": "seguro", "type": "number",
        "required": false, "presentable": false, "unique": false,
        "options": { "min": 0, "max": null, "noDecimal": false },
      },
      {
        "system": false, "id": "cot0netograva1", "name": "neto_gravado", "type": "number",
        "required": false, "presentable": false, "unique": false,
        "options": { "min": 0, "max": null, "noDecimal": false },
      },
      {
        "system": false, "id": "cot0iva0000001", "name": "iva", "type": "number",
        "required": false, "presentable": false, "unique": false,
        "options": { "min": 0, "max": null, "noDecimal": false },
      },
      {
        "system": false, "id": "cot0total00001", "name": "total", "type": "number",
        "required": false, "presentable": true, "unique": false,
        "options": { "min": 0, "max": null, "noDecimal": false },
      },
      {
        "system": false, "id": "cot0creadopor1", "name": "creado_por", "type": "text",
        "required": false, "presentable": true, "unique": false,
        "options": { "min": null, "max": null, "pattern": "" },
      },
    ],
    "indexes": [],
    "listRule": "@request.auth.id != \"\" && (@request.auth.rol = \"admin\" || @request.auth.modulos ~ \"cuadro_tarifario\")",
    "viewRule": "@request.auth.id != \"\" && (@request.auth.rol = \"admin\" || @request.auth.modulos ~ \"cuadro_tarifario\")",
    "createRule": "@request.auth.id != \"\" && (@request.auth.rol = \"admin\" || @request.auth.modulos ~ \"cuadro_tarifario\")",
    "updateRule": null,
    "deleteRule": "@request.auth.rol = \"admin\"",
    "options": {},
  });
  dao.saveCollection(cotizaciones);

  const items = new Collection({
    "id": "cotizacionitm1",
    "name": "cotizacion_items",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false, "id": "cit0cotizacio1", "name": "cotizacion", "type": "relation",
        "required": true, "presentable": true, "unique": false,
        "options": { "collectionId": "cotizaciones01", "cascadeDelete": true, "minSelect": null, "maxSelect": 1, "displayFields": ["numero"] },
      },
      {
        "system": false, "id": "cit0kilos00001", "name": "kilos", "type": "number",
        "required": false, "presentable": false, "unique": false,
        "options": { "min": 0, "max": null, "noDecimal": false },
      },
      {
        "system": false, "id": "cit0m300000001", "name": "m3", "type": "number",
        "required": false, "presentable": false, "unique": false,
        "options": { "min": 0, "max": null, "noDecimal": false },
      },
      {
        "system": false, "id": "cit0bultos0001", "name": "bultos", "type": "number",
        "required": false, "presentable": false, "unique": false,
        "options": { "min": 0, "max": null, "noDecimal": false },
      },
      {
        "system": false, "id": "cit0valordecl1", "name": "valor_declarado", "type": "number",
        "required": false, "presentable": false, "unique": false,
        "options": { "min": 0, "max": null, "noDecimal": false },
      },
      {
        "system": false, "id": "cit0precio0001", "name": "precio", "type": "number",
        "required": false, "presentable": false, "unique": false,
        "options": { "min": 0, "max": null, "noDecimal": false },
      },
      {
        "system": false, "id": "cit0total00001", "name": "total", "type": "number",
        "required": false, "presentable": false, "unique": false,
        "options": { "min": 0, "max": null, "noDecimal": false },
      },
    ],
    "indexes": [],
    "listRule": "@request.auth.id != \"\" && (@request.auth.rol = \"admin\" || @request.auth.modulos ~ \"cuadro_tarifario\")",
    "viewRule": "@request.auth.id != \"\" && (@request.auth.rol = \"admin\" || @request.auth.modulos ~ \"cuadro_tarifario\")",
    "createRule": "@request.auth.id != \"\" && (@request.auth.rol = \"admin\" || @request.auth.modulos ~ \"cuadro_tarifario\")",
    "updateRule": null,
    "deleteRule": "@request.auth.rol = \"admin\"",
    "options": {},
  });
  return dao.saveCollection(items);
}, (db) => {
  const dao = new Dao(db);
  try { dao.deleteCollection(dao.findCollectionByNameOrId('cotizacionitm1')); } catch (e) { /* no existía */ }
  try { dao.deleteCollection(dao.findCollectionByNameOrId('cotizaciones01')); } catch (e) { /* no existía */ }
  return null;
})
