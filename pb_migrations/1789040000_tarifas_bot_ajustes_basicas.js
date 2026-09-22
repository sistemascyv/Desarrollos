/// <reference path="../pb_data/types.d.ts" />
// Bot Act Tarifas: además de comparar los mínimos de facturación por
// sucursal, ahora también compara antes/después las primeras filas de la
// tabla de Rangos de Tarifas Generales Básicas, para poder verificar a
// simple vista que esa tabla también se actualizó.
migrate((db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId('tarifas_bot_ajustes');
  collection.schema.addField(new SchemaField({
    // { "Kilogramos (Kg) 0-30": {"antes":"...", "despues":"...", "cambio_pct":5.0, "ok":true}, ... }
    system: false, id: 'bta0basicas01', name: 'basicas', type: 'json',
    required: false, presentable: false, unique: false, options: { maxSize: 200000 },
  }));
  return dao.saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId('tarifas_bot_ajustes');
  collection.schema.removeField('bta0basicas01');
  return dao.saveCollection(collection);
})
