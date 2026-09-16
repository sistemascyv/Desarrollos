/// <reference path="../pb_data/types.d.ts" />
// Los excel "* AGOSTO.xlsx" (carpeta FICHADAS REPORTES) son el Informe de
// Entradas y Salidas REAL que generó CINTIA para agosto/2026, área por
// área -- o sea, prueba directa de quién marcó ese mes. Cruzando esas
// ~2000 filas contra fichadas_legajos aparecieron dos problemas:
//
// 1) 42 legajos que sí marcaron en agosto están con estado=false (el
//    campo Estado de CINTIA, ya sabemos que no es confiable).
// 2) 7 tarjetas que marcaron en agosto directamente no existen en
//    fichadas_legajos (nunca se cargaron desde el export original).
//
// (Nota sobre el rango de los xlsx: el atributo interno "!ref" de esos
// archivos viene mal grabado -- dice A1:P4 pero tienen ~600 filas reales
// por área -- por eso una primera lectura los había visto "vacíos".)
migrate((db) => {
  const dao = new Dao(db);
  const legajosColl = dao.findCollectionByNameOrId('fichadas_legajos');
  const empresasColl = dao.findCollectionByNameOrId('fichadas_empresas');

  const empresaIdPorNombre = {};
  dao.findRecordsByFilter(empresasColl.id, "nombre != ''", '', 200, 0).forEach((r) => {
    empresaIdPorNombre[r.get('nombre')] = r.id;
  });

  const corregirEstado = ['10246','20553','10407','30082','30401','30309','30380','30400','30388','30135','30300','30391','30087','30316','20614','20419','20583','20605','20297','20464','20284','20623','20615','20416','20363','20392','50445','10628','10425','10468','50484','50259','50325','50361','50301','50312','10576','60128','50287','10519','50435','10580'];
  let corregidos = 0;
  for (const t of corregirEstado) {
    try {
      const record = dao.findFirstRecordByFilter(legajosColl.id, 'nro_tarjeta = {:t}', { t });
      record.set('estado', true);
      dao.saveRecord(record);
      corregidos++;
    } catch (e) { /* no existía */ }
  }

  const altas = [
    { tarjeta: '10542', nombre: 'JUAREZ AGOSTINA', empresaNombre: 'ADMINISTRATIVOS' },
    { tarjeta: '30480', nombre: 'ARES LUCAS', empresaNombre: 'C. V. BS AS' },
    { tarjeta: '629', nombre: 'CARLINI DIEGO NICOLAS', empresaNombre: 'C. V. CORDOBA' },
    { tarjeta: '7007', nombre: 'CAROSSIO JUAN', empresaNombre: 'C. V. CORDOBA' },
    { tarjeta: '20633', nombre: 'GULLE MELISA', empresaNombre: 'C. V. CORDOBA' },
    { tarjeta: '630', nombre: 'NIETO FABIO GERARDO', empresaNombre: 'C. V. CORDOBA' },
    { tarjeta: '634', nombre: 'TESSIO, JOSUÉ MAXIMILIANO', empresaNombre: 'MANTENIMIENTO' },
  ];
  let altas_creadas = 0;
  for (const a of altas) {
    try {
      dao.findFirstRecordByFilter(legajosColl.id, 'nro_tarjeta = {:t}', { t: a.tarjeta });
      continue; // ya existe (no debería, pero por las dudas no duplicamos)
    } catch (e) { /* no existía, seguimos */ }
    const record = new Record(legajosColl, {
      nro_legajo: a.tarjeta,
      nro_tarjeta: a.tarjeta,
      nombre: a.nombre,
      empresa: empresaIdPorNombre[a.empresaNombre] || '',
      estado: true,
    });
    dao.saveRecord(record);
    altas_creadas++;
  }

  console.log('fichadas: estado corregido en ' + corregidos + ' legajos, altas nuevas: ' + altas_creadas);
  return null;
}, (db) => {
  return null; // no-op: corrección de datos
})
