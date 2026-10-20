/// <reference path="../pb_data/types.d.ts" />
// Historial de etapas laborales cerradas de un legajo (reingresos) --
// cada vez que alguien se reincorpora después de haberse ido, se guarda
// acá la etapa que se cierra (fecha_alta/fecha_baja/motivo_baja de ese
// momento) antes de abrir una nueva en el propio fichadas_legajos. Ver
// docs/superpowers/specs/2026-10-20-fichadas-rotacion-reingresos-design.md.
migrate((db) => {
  const dao = new Dao(db);
  const collection = new Collection({
    id: 'fchd0histlegaj1',
    name: 'fichadas_legajo_historial',
    type: 'base',
    system: false,
    schema: [
      {
        system: false, id: 'fhl0legajo001', name: 'legajo', type: 'relation',
        required: true, presentable: true, unique: false,
        options: { collectionId: 'fchd0legajos001', cascadeDelete: true, minSelect: null, maxSelect: 1, displayFields: ['nombre'] },
      },
      {
        system: false, id: 'fhl0fechaalta1', name: 'fecha_alta', type: 'text',
        required: false, presentable: true, unique: false,
        options: { min: null, max: null, pattern: '' },
      },
      {
        system: false, id: 'fhl0fechabaja1', name: 'fecha_baja', type: 'text',
        required: true, presentable: true, unique: false,
        options: { min: null, max: null, pattern: '' },
      },
      {
        system: false, id: 'fhl0motivobaj1', name: 'motivo_baja', type: 'select',
        required: true, presentable: true, unique: false,
        options: { maxSelect: 1, values: ['Despido', 'Renuncia', 'Acuerdo', 'Jubilación'] },
      },
    ],
    indexes: [],
    listRule: '@request.auth.id != "" && (@request.auth.rol = "admin" || @request.auth.modulos ?= "fichadas")',
    viewRule: '@request.auth.id != "" && (@request.auth.rol = "admin" || @request.auth.modulos ?= "fichadas")',
    createRule: '@request.auth.id != "" && (@request.auth.rol = "admin" || @request.auth.modulos ?= "fichadas")',
    updateRule: '@request.auth.id != "" && (@request.auth.rol = "admin" || @request.auth.modulos ?= "fichadas")',
    deleteRule: '@request.auth.rol = "admin"',
    options: {},
  });
  return dao.saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  try { dao.deleteCollection(dao.findCollectionByNameOrId('fichadas_legajo_historial')); } catch (e) { /* no existía */ }
  return null;
})
