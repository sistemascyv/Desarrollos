/// <reference path="../pb_data/types.d.ts" />
// Vale de Caja: periodo_desde/periodo_hasta registran el rango de fechas
// de la rendición que marcó este vale como "usado" (completados por los
// endpoints /usar y /liberar en pb_hooks/vales_caja.pb.js, no se cargan a
// mano) -- permiten reconstruir, al recargar la pantalla de Planilla
// Choferes, cuáles vales formaban el total de una rendición ya armada.
// Texto plano YYYY-MM-DD, igual formato que los estados desde/hasta del
// componente -- comparación de igualdad simple, sin usar el tipo date
// nativo. Ver docs/superpowers/specs/2026-10-20-vale-caja-vinculo-rendicion-design.md.
migrate((db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId('vales_caja');
  collection.schema.addField(new SchemaField({
    system: false, id: 'vlc0perdesde1', name: 'periodo_desde', type: 'text',
    required: false, presentable: false, unique: false,
    options: { min: null, max: null, pattern: '' },
  }));
  collection.schema.addField(new SchemaField({
    system: false, id: 'vlc0perhasta1', name: 'periodo_hasta', type: 'text',
    required: false, presentable: false, unique: false,
    options: { min: null, max: null, pattern: '' },
  }));
  return dao.saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId('vales_caja');
  collection.schema.removeField('vlc0perdesde1');
  collection.schema.removeField('vlc0perhasta1');
  return dao.saveCollection(collection);
})
