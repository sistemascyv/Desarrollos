/// <reference path="../pb_data/types.d.ts" />
// Backfill de fecha_alta para los legajos activos que SÍ tenían una fecha
// de alta real y confiable en la base vieja de CINTIA (Cintia.mdb, tabla
// Legajos, campo FechaAlta) -- se excluyeron a propósito las fechas en
// bloque "2010-07-20" y "2012-04-13" que se repetían en decenas de
// legajos distintos (fecha en que cargaron el sistema por primera vez,
// no la fecha real de ingreso de cada persona). Los demás legajos activos
// no tenían ningún dato de alta en CINTIA -- quedan sin cambios, a
// completar a mano si se consigue el dato de otra forma.
migrate((db) => {
  const dao = new Dao(db);
  const datos = [
    { tarjeta: '20363', fecha_alta: '2011-03-01' },
    { tarjeta: '30082', fecha_alta: '1992-10-15' },
    { tarjeta: '30300', fecha_alta: '2006-04-13' },
    { tarjeta: '30380', fecha_alta: '2012-01-02' },
    { tarjeta: '30388', fecha_alta: '2012-07-02' },
    { tarjeta: '30391', fecha_alta: '2012-09-03' },
    { tarjeta: '20392', fecha_alta: '2012-10-01' },
    { tarjeta: '30401', fecha_alta: '2012-05-02' },
    { tarjeta: '10407', fecha_alta: '2013-12-11' },
    { tarjeta: '30481', fecha_alta: '2018-02-05' },
    { tarjeta: '10622', fecha_alta: '2025-11-10' },
    { tarjeta: '20623', fecha_alta: '2026-01-02' },
    { tarjeta: '10631', fecha_alta: '2026-06-01' },
    { tarjeta: '70004', fecha_alta: '2021-12-22' },
    { tarjeta: '10634', fecha_alta: '2026-08-25' },
  ];

  const legajos = dao.findCollectionByNameOrId('fichadas_legajos');
  let completados = 0;
  for (const d of datos) {
    try {
      const record = dao.findFirstRecordByFilter(legajos.id, 'nro_tarjeta = {:t}', { t: d.tarjeta });
      record.set('fecha_alta', d.fecha_alta);
      dao.saveRecord(record);
      completados++;
    } catch (e) { /* no existía este legajo */ }
  }
  console.log('fichadas: fecha_alta completada en ' + completados + ' legajos (CINTIA)');

  return null;
}, (db) => {
  // No se revierte: volver a dejar fecha_alta en blanco perdería el dato
  // real recuperado, sin ningún beneficio.
  return null;
})
