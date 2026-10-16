/// <reference path="../pb_data/types.d.ts" />
// Fichadas: horas extra fijas por persona (ej: Ludeña en Córdoba, 4,5h
// lunes a jueves + 2,5h sábados). Mismo patrón que dias_personalizados --
// json opcional, nadie lo tiene configurado por defecto. Ver
// docs/superpowers/specs/2026-10-16-fichadas-horas-extra-fijas-design.md.
migrate((db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId('fichadas_legajos');
  collection.schema.addField(new SchemaField({
    // [{ "dia": 1, "horas": 4.5 }, ...] -- dia: 1=lunes..7=domingo, mismo
    // criterio que DiaHorario.
    system: false, id: 'fcl0horexfij1', name: 'horas_extra_fijas', type: 'json',
    required: false, presentable: false, unique: false, options: { maxSize: 200000 },
  }));
  return dao.saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId('fichadas_legajos');
  collection.schema.removeField('fcl0horexfij1');
  return dao.saveCollection(collection);
})
