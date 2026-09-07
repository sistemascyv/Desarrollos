/// <reference path="../pb_data/types.d.ts" />
// Agrega km_reales y km_convenio a rutas — vienen de una planilla con
// ~6.600 rutas reales (distancia recorrida vs. la pactada), útil para
// el cálculo de pago por km en Planilla Choferes.
migrate((db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("rutas");

  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "rut0kmre1",
    "name": "km_reales",
    "type": "number",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": { "min": 0, "max": null, "noDecimal": false }
  }));
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "rut0kmco1",
    "name": "km_convenio",
    "type": "number",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": { "min": 0, "max": null, "noDecimal": false }
  }));

  return dao.saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("rutas");
  collection.schema.removeField("rut0kmre1");
  collection.schema.removeField("rut0kmco1");
  return dao.saveCollection(collection);
})
