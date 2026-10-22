/// <reference path="../pb_data/types.d.ts" />
// Cotizador: permite cargar el nombre de un cliente a mano (texto libre)
// en vez de elegir uno de la lista -- para cuando es un cliente nuevo que
// todavia no esta en la coleccion `clientes`. Si `cliente` (la relation)
// esta vacio, la pantalla y la impresion usan `cliente_nombre` en su
// lugar. No se crea un registro nuevo en `clientes` automaticamente --
// eso se sigue haciendo a mano desde Administracion si hace falta.
migrate((db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId('cotizaciones01');
  collection.schema.addField(new SchemaField({
    system: false, id: 'cot0clienom001', name: 'cliente_nombre', type: 'text',
    required: false, presentable: false, unique: false,
    options: { min: null, max: null, pattern: '' },
  }));
  return dao.saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId('cotizaciones01');
  collection.schema.removeField('cot0clienom001');
  return dao.saveCollection(collection);
})
