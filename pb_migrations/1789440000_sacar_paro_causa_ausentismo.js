/// <reference path="../pb_data/types.d.ts" />
// El usuario pidió sacar también "PARO" de las causas de ausentismo,
// quedan 14. Ver web/src/pages/fichadas/motor.ts (CAUSAS_AUSENTISMO).
migrate((db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId('fichadas_novedades');
  const campo = collection.schema.getFieldById('fcn0causa0001');
  campo.options.values = [
    'Enfermedad', 'Accidente', 'Examen', 'Permiso Gremial', 'Capacitación',
    'Casamiento', 'Nacimiento', 'Fallecimiento de Familiar', 'Donación de Sangre', 'Mudanza',
    'Fam. Enfermo', 'Razones Particulares', 'Maternidad', 'Suspendido',
  ];
  return dao.saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId('fichadas_novedades');
  const campo = collection.schema.getFieldById('fcn0causa0001');
  campo.options.values = [
    'Enfermedad', 'Accidente', 'Examen', 'Permiso Gremial', 'Capacitación',
    'Casamiento', 'Nacimiento', 'Fallecimiento de Familiar', 'Donación de Sangre', 'Mudanza',
    'Fam. Enfermo', 'Razones Particulares', 'Maternidad', 'PARO', 'Suspendido',
  ];
  return dao.saveCollection(collection);
})
