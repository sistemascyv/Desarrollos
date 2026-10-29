/// <reference path="../pb_data/types.d.ts" />
// Cotizador: agrega la categoria (seco/frio/congelado) a cada cotizacion --
// hoy el Cotizador solo cotiza Seco, con esto puede cotizar las 3. Una
// cotizacion es de UNA sola categoria completa, no por item (confirmado
// con el usuario, ver docs/superpowers/specs/2026-10-29-cotizador-frio-congelado-design.md).
// Backfill: las cotizaciones existentes (todas de antes de esta feature,
// todas Seco) quedan en 'seco' -- mismo patron que
// pb_migrations/1789270000_usuarios_sucursal.js. "required: false" a
// proposito aunque el formulario real siempre la manda -- mismo motivo que
// el resto de los campos de esta coleccion (ver
// pb_migrations/1789280000_created_cotizaciones.js): no hace falta volver
// a "required: true" despues.
migrate((db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId('cotizaciones01');
  collection.schema.addField(new SchemaField({
    system: false, id: 'cot0categoria1', name: 'categoria', type: 'select',
    required: false, presentable: true, unique: false,
    options: { maxSelect: 1, values: ['seco', 'frio', 'congelado'] },
  }));
  dao.saveCollection(collection);

  dao.findRecordsByFilter('cotizaciones', "categoria = ''", '', 500, 0).forEach((c) => {
    c.set('categoria', 'seco');
    dao.saveRecord(c);
  });

  return null;
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId('cotizaciones01');
  collection.schema.removeField('cot0categoria1');
  return dao.saveCollection(collection);
})
