/// <reference path="../pb_data/types.d.ts" />
// Bot Act Tarifas: además de test vs producción se puede correr contra
// distintos sitios (BOT_TARIFAS_BASE_URL) -- se guarda cuál de los dos fue,
// para que el historial en Sistema CyV lo muestre y no se confunda una
// prueba en test con un ajuste real.
migrate((db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId('tarifas_bot_ajustes');
  collection.schema.addField(new SchemaField({
    // "test" | "produccion"
    system: false, id: 'bta0entorno01', name: 'entorno', type: 'text',
    required: false, presentable: true, unique: false,
    options: { min: null, max: null, pattern: '' },
  }));
  return dao.saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId('tarifas_bot_ajustes');
  collection.schema.removeField('bta0entorno01');
  return dao.saveCollection(collection);
})
