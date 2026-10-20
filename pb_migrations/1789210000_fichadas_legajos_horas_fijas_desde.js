/// <reference path="../pb_data/types.d.ts" />
// Fecha desde la cual rige el acuerdo de horas extra fijas de un legajo
// (ej: Ludeña en Córdoba) -- una sola fecha para todo el acuerdo, no una
// por día. Opcional: sin cargar, el motor sigue aplicando las horas fijas
// siempre, igual que hoy (compatibilidad hacia atrás, confirmado por SQL
// directo: 0 legajos con horas extra fijas configuradas en producción,
// no hace falta backfill). Ver
// docs/superpowers/specs/2026-10-20-fichadas-horas-extra-fijas-vigencia-design.md.
migrate((db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId('fichadas_legajos');
  collection.schema.addField(new SchemaField({
    system: false, id: 'fcl0hefijdesd1', name: 'horas_extra_fijas_desde', type: 'text',
    required: false, presentable: false, unique: false,
    options: { min: null, max: null, pattern: '' },
  }));
  return dao.saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId('fichadas_legajos');
  collection.schema.removeField('fcl0hefijdesd1');
  return dao.saveCollection(collection);
})
