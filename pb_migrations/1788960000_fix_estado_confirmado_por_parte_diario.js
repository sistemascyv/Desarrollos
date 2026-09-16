/// <reference path="../pb_data/types.d.ts" />
// El campo "Estado" del export de CINTIA no es confiable (ver commits
// anteriores): encontramos 12 legajos marcados como inactivos que en
// realidad SÍ marcaron ese mismo día según los Parte Diario reales que
// genera CINTIA (carpeta FICHADAS REPORTES, 01-09-2026) — prueba directa
// de que están activos. Se corrigen puntualmente.
migrate((db) => {
  const dao = new Dao(db);
  const legajosColl = dao.findCollectionByNameOrId('fichadas_legajos');

  const tarjetas = ['10588', '10622', '30481', '30302', '20249', '20348', '10606', '10631', '50310', '10600', '10502', '10616'];
  let corregidos = 0;
  for (const t of tarjetas) {
    try {
      const record = dao.findFirstRecordByFilter(legajosColl.id, 'nro_tarjeta = {:t}', { t });
      record.set('estado', true);
      dao.saveRecord(record);
      corregidos++;
    } catch (e) { /* no existía */ }
  }
  console.log('fichadas: estado corregido a activo en ' + corregidos + ' legajos (confirmados por Parte Diario real)');

  return null;
}, (db) => {
  return null; // no-op: corrección de datos
})
