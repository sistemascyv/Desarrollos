/// <reference path="../pb_data/types.d.ts" />
// En Seco, a partir de 1101 Kg el "Valor" deja de ser un monto fijo por
// banda y pasa a ser un precio POR KG (se multiplica por el peso real) --
// confirmado contra el sistema de ventas de terceros, que marca esas filas
// con un tilde propio ("es por unidad"). Se agrega el flag acá para poder
// distinguirlo en pantalla; no afecta el cálculo del % (sigue siendo el
// mismo valor_actual * factor para todas las filas por igual, solo cambia
// cómo se interpreta/muestra ese valor).
migrate((db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId('cuadro_tarifario');
  collection.schema.addField(new SchemaField({
    system: false, id: 'ctf0porunidad1', name: 'por_unidad', type: 'bool',
    required: false, presentable: false, unique: false, options: {},
  }));
  dao.saveCollection(collection);

  dao.findRecordsByFilter(
    'cuadro_tarifario',
    "categoria = 'seco' && rango_kg_desde >= 1101",
    '',
    500,
    0,
  ).forEach((r) => {
    r.set('por_unidad', true);
    dao.saveRecord(r);
  });

  return null;
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId('cuadro_tarifario');
  collection.schema.removeField('ctf0porunidad1');
  return dao.saveCollection(collection);
})
