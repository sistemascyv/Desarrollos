/// <reference path="../pb_data/types.d.ts" />
// Planilla Choferes: hasta ahora tramos/tarifas dejaban leer, editar y borrar
// a CUALQUIER usuario logueado por API (el módulo solo se chequeaba en el
// frontend). Esta migración:
//  1) pasa las reglas a "admin o tiene el módulo" (Combustible sigue leyendo
//     tramos, por eso su módulo entra solo en las reglas de lectura);
//  2) agrega auditoría (creado_por / editado_por, los completa el hook
//     pb_hooks/planilla.pb.js, no el cliente);
//  3) crea periodos_cerrados: un mes cerrado no admite cambios en tramos ni
//     tarifas hasta que un admin lo reabra;
//  4) suma un índice por (chofer, dia_salida), el filtro de cada búsqueda.
migrate((db) => {
  const dao = new Dao(db);
  const BASE = '@request.auth.id != "" && (@request.auth.rol = "admin" || @request.auth.modulos ~ "planilla_choferes"';
  const R_ESCRITURA = BASE + ')';
  const R_LECTURA = BASE + ' || @request.auth.modulos ~ "consumo_combustible")';

  function campoTexto(id, name) {
    return new SchemaField({
      system: false, id: id, name: name, type: 'text', required: false, presentable: false, unique: false,
      options: { min: null, max: null, pattern: '' },
    });
  }

  const tramos = dao.findCollectionByNameOrId('tramos');
  tramos.schema.addField(campoTexto('trm0credpor01', 'creado_por'));
  tramos.schema.addField(campoTexto('trm0edipor001', 'editado_por'));
  tramos.listRule = R_LECTURA;
  tramos.viewRule = R_LECTURA;
  tramos.createRule = R_ESCRITURA;
  tramos.updateRule = R_ESCRITURA;
  tramos.deleteRule = R_ESCRITURA;
  const idxTramos = [];
  for (const i of tramos.indexes) idxTramos.push(i);
  idxTramos.push('CREATE INDEX `idx_tramos_chofer_dia` ON `tramos` (`chofer`, `dia_salida`)');
  tramos.indexes = idxTramos;
  dao.saveCollection(tramos);

  const tarifas = dao.findCollectionByNameOrId('tarifas');
  tarifas.schema.addField(campoTexto('trf0credpor01', 'creado_por'));
  tarifas.schema.addField(campoTexto('trf0edipor001', 'editado_por'));
  tarifas.listRule = R_LECTURA;
  tarifas.viewRule = R_LECTURA;
  tarifas.createRule = R_ESCRITURA;
  tarifas.updateRule = R_ESCRITURA;
  tarifas.deleteRule = R_ESCRITURA;
  dao.saveCollection(tarifas);

  const periodos = new Collection({
    id: 'pcrpl0periodos1',
    name: 'periodos_cerrados',
    type: 'base',
    system: false,
    schema: [
      {
        system: false, id: 'pcp0mes00001', name: 'mes', type: 'text', required: true, presentable: true, unique: false,
        options: { min: 7, max: 7, pattern: '^[0-9]{4}-[0-9]{2}$' },
      },
      {
        system: false, id: 'pcp0cerrpor01', name: 'cerrado_por', type: 'text', required: false, presentable: false, unique: false,
        options: { min: null, max: null, pattern: '' },
      },
    ],
    indexes: ['CREATE UNIQUE INDEX `idx_periodos_cerrados_mes` ON `periodos_cerrados` (`mes`)'],
    listRule: R_LECTURA,
    viewRule: R_LECTURA,
    createRule: '@request.auth.rol = "admin"',
    updateRule: null,
    deleteRule: '@request.auth.rol = "admin"',
    options: {},
  });
  dao.saveCollection(periodos);

  return null;
}, (db) => {
  const dao = new Dao(db);
  try { dao.deleteCollection(dao.findCollectionByNameOrId('periodos_cerrados')); } catch (e) { /* no existía */ }

  const abierta = '@request.auth.id != ""';
  const tarifas = dao.findCollectionByNameOrId('tarifas');
  tarifas.schema.removeField('trf0credpor01');
  tarifas.schema.removeField('trf0edipor001');
  tarifas.listRule = abierta; tarifas.viewRule = abierta; tarifas.createRule = abierta;
  tarifas.updateRule = abierta; tarifas.deleteRule = abierta;
  dao.saveCollection(tarifas);

  const tramos = dao.findCollectionByNameOrId('tramos');
  tramos.schema.removeField('trm0credpor01');
  tramos.schema.removeField('trm0edipor001');
  tramos.listRule = abierta; tramos.viewRule = abierta; tramos.createRule = abierta;
  tramos.updateRule = abierta; tramos.deleteRule = abierta;
  tramos.indexes = [];
  dao.saveCollection(tramos);
  return null;
})
