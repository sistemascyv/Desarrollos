/// <reference path="../pb_data/types.d.ts" />
// Agrega los campos de combustible a tramos, para el nuevo reporte de
// Consumo de Combustible (rendimiento por camión/chofer, costo por km,
// repostajes). Todos opcionales: los tramos ya cargados quedan sin estos
// datos, y el reporte los excluye del cálculo de L/100km en vez de romper.
migrate((db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("tramos");

  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "trm0litc1",
    "name": "litros_consumidos",
    "type": "number",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": { "min": 0, "max": null, "noDecimal": false }
  }));
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "trm0liti1",
    "name": "litros_intermedios",
    "type": "number",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": { "min": 0, "max": null, "noDecimal": false }
  }));
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "trm0litf1",
    "name": "litros_equipo_frio",
    "type": "number",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": { "min": 0, "max": null, "noDecimal": false }
  }));

  return dao.saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("tramos");
  collection.schema.removeField("trm0litc1");
  collection.schema.removeField("trm0liti1");
  collection.schema.removeField("trm0litf1");
  return dao.saveCollection(collection);
})
