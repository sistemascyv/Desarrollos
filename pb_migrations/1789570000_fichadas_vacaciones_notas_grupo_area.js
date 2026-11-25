/// <reference path="../pb_data/types.d.ts" />
// Planificación por área real en vez de Administrativos/Choferes (pedido
// del usuario: "en el ver me deberías segmentar por area, asi desde rrhh
// se ve si se cruza algun compañero" -- Administrativos/Choferes era
// demasiado amplio para detectar cruces dentro de un mismo equipo real).
// `grupo` deja de ser un select fijo de 2 valores y pasa a ser una
// relación a fichadas_empresas, la misma tabla de áreas que ya usa el
// resto del sistema (Fichadas, Personal, Reportes) -- un chofer cae en
// la misma área que tenga asignada en Personal, igual que cualquier
// otro legajo.
//
// Esta colección ya se desplegó a staging con el schema viejo (select)
// en 1789560000_fichadas_vacaciones_notas.js -- por eso esto es una
// migración ALTER nueva en vez de editar esa migración: PocketBase no
// vuelve a correr una migración ya aplicada aunque se edite su contenido.
// Cualquier nota de prueba que haya quedado cargada en staging con
// grupo="administrativos"/"choferes" queda huérfana (el valor viejo ya
// no matchea ningún id real de fichadas_empresas) -- aceptable, son
// datos de prueba, no reales.
migrate((db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId('fichadas_vacaciones_notas');
  collection.schema.removeField('fvn0grupo0001');
  collection.schema.addField(new SchemaField({
    system: false, id: 'fvn0grupo0002', name: 'grupo', type: 'relation',
    required: true, presentable: true, unique: false,
    options: { collectionId: 'fchd0empresas01', cascadeDelete: true, minSelect: null, maxSelect: 1, displayFields: ['nombre'] },
  }));
  dao.saveCollection(collection);
  return null;
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId('fichadas_vacaciones_notas');
  collection.schema.removeField('fvn0grupo0002');
  collection.schema.addField(new SchemaField({
    system: false, id: 'fvn0grupo0001', name: 'grupo', type: 'select',
    required: true, presentable: true, unique: false,
    options: { maxSelect: 1, values: ['administrativos', 'choferes'] },
  }));
  dao.saveCollection(collection);
  return null;
})
