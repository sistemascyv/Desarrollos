/// <reference path="../pb_data/types.d.ts" />
// Vale de Caja: agregar USD como tercera moneda disponible (hasta ahora
// solo ARS/BRL). Mismo tratamiento que BRL -- no cuenta para el total en
// pesos de Planilla Choferes (ver PlanillaChoferesPage.tsx).
migrate((db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId('vales_caja');
  const field = collection.schema.getFieldByName('moneda');
  field.options.values = ['ARS', 'BRL', 'USD'];
  return dao.saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId('vales_caja');
  const field = collection.schema.getFieldByName('moneda');
  field.options.values = ['ARS', 'BRL'];
  return dao.saveCollection(collection);
})
