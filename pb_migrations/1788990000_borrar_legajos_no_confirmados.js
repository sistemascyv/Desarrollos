/// <reference path="../pb_data/types.d.ts" />
// Sistema Fichadas nuevo, no hace falta arrastrar el historial completo
// de CINTIA (255 legajos de más de una década) -- solo importa lo que
// sí trabaja hoy. Se borran los legajos que no están entre los 61
// confirmados por asistencia real (ver 1788980000).
migrate((db) => {
  const dao = new Dao(db);
  const legajosColl = dao.findCollectionByNameOrId('fichadas_legajos');

  const confirmados = new Set(['10588','10622','10542','10246','20553','10407','30481','30480','30082','30401','30309','30380','30400','30388','30135','30300','30391','30087','30316','20249','20348','20614','629','20419','7007','20583','20605','20633','20297','20464','20284','630','20623','20615','20416','20363','20392','10606','10631','50445','10628','10425','10468','50484','634','50310','10600','50259','50325','50361','50301','50312','10576','60128','50287','10519','10502','10616','50435','10580','30302']);

  let borrados = 0;
  dao.findRecordsByFilter(legajosColl.id, "nro_tarjeta != ''", '', 500, 0).forEach((r) => {
    if (confirmados.has(r.get('nro_tarjeta'))) return;
    dao.deleteRecord(r);
    borrados++;
  });
  console.log('fichadas: legajos no confirmados borrados: ' + borrados);

  return null;
}, (db) => {
  return null; // no-op: los datos originales de CINTIA quedan en el commit de la migración de seed si hiciera falta reconstruir
})
