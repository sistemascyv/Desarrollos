/// <reference path="../pb_data/types.d.ts" />
// Ausentismo por causa: se agrega "causa" (lista fija, igual a la que ya
// usaba el Excel de RRHH) al lado del texto libre que ya existe en
// fichadas_novedades -- opcional, las novedades viejas quedan sin causa
// sin romper nada. Ver
// docs/superpowers/specs/2026-10-16-fichadas-ausentismo-estadistica-design.md.
migrate((db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId('fichadas_novedades');
  collection.schema.addField(new SchemaField({
    system: false, id: 'fcn0causa0001', name: 'causa', type: 'select',
    required: false, presentable: true, unique: false,
    options: {
      maxSelect: 1,
      values: [
        'Enfermedad', 'Accidente', 'COVID-19', 'Examen', 'Permiso Gremial', 'Capacitación',
        'Casamiento', 'Nacimiento', 'Fallecimiento de Familiar', 'Donación de Sangre', 'Mudanza',
        'Fam. Enfermo', 'Razones Particulares', 'Maternidad', 'Cuarentena', 'PARO', 'Suspendido',
      ],
    },
  }));
  return dao.saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId('fichadas_novedades');
  collection.schema.removeField('fcn0causa0001');
  return dao.saveCollection(collection);
})
