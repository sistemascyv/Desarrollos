/// <reference path="../pb_data/types.d.ts" />
// El papel real de Vale de Caja no tiene ningún nombre impreso debajo de
// las firmas -- el campo "nombre de quien firma" deja de pedirse en el
// formulario (Task 2). Mismo criterio que la migración 1789070000 para
// "numero": se saca el required, no se borra el dato de los vales viejos.
migrate((db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId('vales_caja');
  const campo = collection.schema.getFieldById('vlc0nomfirm1');
  campo.required = false;
  return dao.saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId('vales_caja');
  const campo = collection.schema.getFieldById('vlc0nomfirm1');
  campo.required = true;
  return dao.saveCollection(collection);
})
