/// <reference path="../pb_data/types.d.ts" />
// Vacaciones: un período pertenece a la "temporada" que arma RRHH (ej. la
// temporada 2026 corre de set/2026 a ago/2027), no al año calendario de su
// fecha "desde" -- se descubrió en la revisión final de la rama que
// GRAL VACACIONES.xlsx es una sola tanda continua por temporada, no por
// año calendario, y filtrar por "desde" perdía en silencio buena parte de
// los períodos ya asignados. Se agrega el campo explícito en vez de
// derivarlo de la fecha. Ver
// docs/superpowers/plans/2026-11-11-fichadas-vacaciones-licencias.md.
migrate((db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId('fichadas_vacaciones');
  collection.schema.addField(new SchemaField({
    system: false, id: 'fcv0anio00001', name: 'anio', type: 'number',
    required: true, presentable: true, unique: false,
    options: { min: 2000, max: 2100, noDecimal: true },
  }));
  return dao.saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId('fichadas_vacaciones');
  collection.schema.removeField('fcv0anio00001');
  return dao.saveCollection(collection);
})
