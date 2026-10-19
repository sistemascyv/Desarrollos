/// <reference path="../pb_data/types.d.ts" />
// Rotación: fecha de alta/baja real por legajo, para reemplazar el
// interruptor manual "estado" (que ahora se deriva: activo = sin
// fecha_baja) y para que Horas Extras/Ausentismo dejen de contar a un
// ex-empleado después de su baja real. Verificado en producción: 0
// legajos inactivos hoy, 61 activos -- no hace falta backfill. Ver
// docs/superpowers/specs/2026-10-16-fichadas-rotacion-estadistica-design.md.
migrate((db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId('fichadas_legajos');
  collection.schema.addField(new SchemaField({
    system: false, id: 'fcl0fechaalta1', name: 'fecha_alta', type: 'text',
    required: false, presentable: true, unique: false,
    options: { min: null, max: null, pattern: '' },
  }));
  collection.schema.addField(new SchemaField({
    system: false, id: 'fcl0fechabaja1', name: 'fecha_baja', type: 'text',
    required: false, presentable: true, unique: false,
    options: { min: null, max: null, pattern: '' },
  }));
  collection.schema.addField(new SchemaField({
    system: false, id: 'fcl0motivobaj1', name: 'motivo_baja', type: 'select',
    required: false, presentable: true, unique: false,
    options: { maxSelect: 1, values: ['Despido', 'Renuncia', 'Acuerdo', 'Jubilación'] },
  }));
  return dao.saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId('fichadas_legajos');
  collection.schema.removeField('fcl0fechaalta1');
  collection.schema.removeField('fcl0fechabaja1');
  collection.schema.removeField('fcl0motivobaj1');
  return dao.saveCollection(collection);
})
