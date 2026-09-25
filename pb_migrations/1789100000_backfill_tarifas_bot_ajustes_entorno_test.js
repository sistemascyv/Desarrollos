/// <reference path="../pb_data/types.d.ts" />
// Todas las corridas del bot antes de hoy fueron contra el sitio de TEST
// (recién hoy se configuró BOT_TARIFAS_BASE_URL para apuntar a producción)
// -- se completa el entorno de esos registros viejos para que el
// historial en Sistema CyV los muestre como "Test" en vez de "—".
migrate((db) => {
  const dao = new Dao(db);
  const coll = dao.findCollectionByNameOrId('tarifas_bot_ajustes');

  let corregidos = 0;
  dao.findRecordsByFilter(coll.id, "entorno = ''", '', 5000, 0).forEach((r) => {
    r.set('entorno', 'test');
    dao.saveRecord(r);
    corregidos++;
  });
  console.log('tarifas_bot_ajustes: entorno completado como "test" en ' + corregidos + ' registros viejos.');

  return null;
}, (db) => {
  return null; // no-op: corrección de datos
})
