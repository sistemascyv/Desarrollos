/// <reference path="../pb_data/types.d.ts" />
// Sucursal del usuario -- base minima para que el Cotizador numere cada
// cotizacion con el prefijo de la sucursal de quien la crea (SAN/COR/ROS/
// BUE). NO implica ninguna restriccion de permisos ni visibilidad por
// sucursal (eso queda fuera de alcance, ver spec del Cotizador). Backfill:
// los usuarios admin existentes quedan con san_francisco (confirmado por
// el usuario).
migrate((db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId('usuarios');
  collection.schema.addField(new SchemaField({
    system: false, id: 'usr0sucursal01', name: 'sucursal', type: 'select',
    required: false, presentable: false, unique: false,
    options: { maxSelect: 1, values: ['cordoba', 'san_francisco', 'rosario', 'buenos_aires'] },
  }));
  dao.saveCollection(collection);

  dao.findRecordsByFilter('usuarios', "rol = 'admin'", '', 200, 0).forEach((u) => {
    if (!u.get('sucursal')) {
      u.set('sucursal', 'san_francisco');
      dao.saveRecord(u);
    }
  });

  return null;
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId('usuarios');
  collection.schema.removeField('usr0sucursal01');
  return dao.saveCollection(collection);
})
