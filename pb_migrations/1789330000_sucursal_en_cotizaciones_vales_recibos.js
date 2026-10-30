/// <reference path="../pb_data/types.d.ts" />
// Segmentacion por sucursal: agrega el campo `sucursal` a cotizaciones,
// vales_caja y recibos -- seteado server-side por cada hook (nunca por el
// cliente, ver pb_hooks/cotizaciones.pb.js/vales_caja.pb.js/recibos.pb.js)
// desde la sucursal del usuario que crea el registro. Esta migracion es
// solo el campo + backfill; el filtrado real por sucursal en listRule/
// viewRule va en la migracion siguiente (1789340000), para que agregar el
// campo y cambiar las reglas de visibilidad queden separados.
// Ver docs/superpowers/specs/2026-10-30-segmentacion-por-sucursal-design.md
migrate((db) => {
  const dao = new Dao(db);

  const cotizaciones = dao.findCollectionByNameOrId('cotizaciones01');
  cotizaciones.schema.addField(new SchemaField({
    system: false, id: 'cot0sucursal1', name: 'sucursal', type: 'select',
    required: false, presentable: false, unique: false,
    options: { maxSelect: 1, values: ['cordoba', 'san_francisco', 'rosario', 'buenos_aires'] },
  }));
  dao.saveCollection(cotizaciones);

  const valesCaja = dao.findCollectionByNameOrId('vales_caja');
  valesCaja.schema.addField(new SchemaField({
    system: false, id: 'vlc0sucursal1', name: 'sucursal', type: 'select',
    required: false, presentable: false, unique: false,
    options: { maxSelect: 1, values: ['cordoba', 'san_francisco', 'rosario', 'buenos_aires'] },
  }));
  dao.saveCollection(valesCaja);

  const recibos = dao.findCollectionByNameOrId('recibos');
  recibos.schema.addField(new SchemaField({
    system: false, id: 'rcb0sucursal1', name: 'sucursal', type: 'select',
    required: false, presentable: false, unique: false,
    options: { maxSelect: 1, values: ['cordoba', 'san_francisco', 'rosario', 'buenos_aires'] },
  }));
  dao.saveCollection(recibos);

  // Backfill cotizaciones: se deriva del prefijo de numero (COR-/SAN-/
  // ROS-/BUE-), que ya codifica la sucursal de quien la creo.
  const PREFIJO_A_SUCURSAL = { COR: 'cordoba', SAN: 'san_francisco', ROS: 'rosario', BUE: 'buenos_aires' };
  dao.findRecordsByFilter('cotizaciones', "sucursal = ''", '', 500, 0).forEach((c) => {
    const prefijo = String(c.get('numero')).split('-')[0];
    const sucursal = PREFIJO_A_SUCURSAL[prefijo];
    if (sucursal) {
      c.set('sucursal', sucursal);
      dao.saveRecord(c);
    }
  });

  // Backfill vales_caja/recibos: sin prefijo en el numero -- todo lo
  // existente lo cargo el unico usuario real de estos 2 modulos hasta
  // ahora (San Francisco), confirmado con el usuario.
  dao.findRecordsByFilter('vales_caja', "sucursal = ''", '', 500, 0).forEach((v) => {
    v.set('sucursal', 'san_francisco');
    dao.saveRecord(v);
  });
  dao.findRecordsByFilter('recibos', "sucursal = ''", '', 500, 0).forEach((r) => {
    r.set('sucursal', 'san_francisco');
    dao.saveRecord(r);
  });

  return null;
}, (db) => {
  const dao = new Dao(db);
  const cotizaciones = dao.findCollectionByNameOrId('cotizaciones01');
  cotizaciones.schema.removeField('cot0sucursal1');
  dao.saveCollection(cotizaciones);

  const valesCaja = dao.findCollectionByNameOrId('vales_caja');
  valesCaja.schema.removeField('vlc0sucursal1');
  dao.saveCollection(valesCaja);

  const recibos = dao.findCollectionByNameOrId('recibos');
  recibos.schema.removeField('rcb0sucursal1');
  dao.saveCollection(recibos);

  return null;
})
