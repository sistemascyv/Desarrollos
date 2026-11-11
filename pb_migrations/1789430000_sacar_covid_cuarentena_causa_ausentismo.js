/// <reference path="../pb_data/types.d.ts" />
// La leyenda real del Excel de RRHH (AUSENTISMO - ESTADISTICA.xls, hoja
// de referencias) no tiene "COVID-19" ni "Cuarentena" -- esas dos se
// habían agregado sin que estuvieran en la planilla real. Se sacan de
// la lista de causas, dejando las 15 que sí están en la leyenda real.
// Ver web/src/pages/fichadas/motor.ts (CAUSAS_AUSENTISMO).
migrate((db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId('fichadas_novedades');
  const campo = collection.schema.getFieldById('fcn0causa0001');
  campo.options.values = [
    'Enfermedad', 'Accidente', 'Examen', 'Permiso Gremial', 'Capacitación',
    'Casamiento', 'Nacimiento', 'Fallecimiento de Familiar', 'Donación de Sangre', 'Mudanza',
    'Fam. Enfermo', 'Razones Particulares', 'Maternidad', 'PARO', 'Suspendido',
  ];
  return dao.saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId('fichadas_novedades');
  const campo = collection.schema.getFieldById('fcn0causa0001');
  campo.options.values = [
    'Enfermedad', 'Accidente', 'COVID-19', 'Examen', 'Permiso Gremial', 'Capacitación',
    'Casamiento', 'Nacimiento', 'Fallecimiento de Familiar', 'Donación de Sangre', 'Mudanza',
    'Fam. Enfermo', 'Razones Particulares', 'Maternidad', 'Cuarentena', 'PARO', 'Suspendido',
  ];
  return dao.saveCollection(collection);
})
