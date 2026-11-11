/// <reference path="../pb_data/types.d.ts" />
// Vacaciones: carga de los períodos ya asignados para 2026, migrados
// desde GRAL VACACIONES.xlsx (fuente consolidada) -- generado una sola
// vez con un script temporal (ver
// docs/superpowers/plans/2026-11-11-fichadas-vacaciones-licencias.md).
// Match por nombre normalizado, mismo criterio que
// 1789360000_backfill_fecha_alta_desde_ingreso.js. No se migra ningún
// año anterior a 2026 (decidido con el usuario).
function normalizarNombre(nombre) {
  return (nombre || '').toUpperCase()
    .replace(/[ÁÀÂÄ]/g, 'A').replace(/[ÉÈÊË]/g, 'E').replace(/[ÍÌÎÏ]/g, 'I')
    .replace(/[ÓÒÔÖ]/g, 'O').replace(/[ÚÙÛÜ]/g, 'U').replace(/Ñ/g, 'N')
    .replace(/[,.]/g, ' ').replace(/\s+/g, ' ').trim()
    .split(' ').filter(Boolean).sort().join(' ');
}
migrate((db) => {
  const dao = new Dao(db);
  const legajosCol = dao.findCollectionByNameOrId('fichadas_legajos');
  const vacacionesCol = dao.findCollectionByNameOrId('fichadas_vacaciones');
  const todosLosLegajos = dao.findRecordsByFilter(legajosCol.id, "id != ''", '', 2000, 0);
  const porNombre = new Map();
  todosLosLegajos.forEach((r) => {
    const key = normalizarNombre(r.get('nombre'));
    if (!porNombre.has(key)) porNombre.set(key, []);
    porNombre.get(key).push(r);
  });
  const datos = [{"nombre_normalizado":"ACTIS TOBIAS","nombre_original":"Actis, Tobias","desde":"2026-09-28","hasta":"2026-10-11","comentario":null,"notificado":true},{"nombre_normalizado":"ARIEL FINO","nombre_original":"Fino, Ariel","desde":"2026-09-28","hasta":"2026-11-01","comentario":null,"notificado":true},{"nombre_normalizado":"CAROSSIO DAVID","nombre_original":"Carossio, David","desde":"2026-11-02","hasta":"2026-12-06","comentario":null,"notificado":true},{"nombre_normalizado":"MELANO OMAR","nombre_original":"Melano, Omar","desde":"2026-12-07","hasta":"2027-01-10","comentario":null,"notificado":true},{"nombre_normalizado":"CERGIO ESPINOSA","nombre_original":"Espinosa, Cergio","desde":"2026-12-14","hasta":"2027-01-10","comentario":null,"notificado":true},{"nombre_normalizado":"CHAVEZ MARTIN","nombre_original":"Chavez, Martin","desde":"2026-12-21","hasta":"2027-01-17","comentario":null,"notificado":true},{"nombre_normalizado":"GARRONE MAURO","nombre_original":"Garrone, Mauro","desde":"2026-12-28","hasta":"2027-01-24","comentario":null,"notificado":false},{"nombre_normalizado":"AGUIRRE CEFERINO","nombre_original":"Aguirre, Ceferino","desde":"2026-10-05","hasta":"2026-11-08","comentario":null,"notificado":true},{"nombre_normalizado":"CESAR MANGIAFICO","nombre_original":"Mangiafico, Cesar","desde":"2026-11-09","hasta":"2026-12-13","comentario":null,"notificado":true},{"nombre_normalizado":"CARLOS RAMALLO","nombre_original":"Ramallo, Carlos","desde":"2026-12-14","hasta":"2027-01-10","comentario":null,"notificado":true},{"nombre_normalizado":"BAZAN MAURICIO","nombre_original":"Bazan, Mauricio","desde":"2026-10-05","hasta":"2026-11-08","comentario":null,"notificado":false},{"nombre_normalizado":"ABRATE DIEGO","nombre_original":"Abrate, Diego","desde":"2026-10-12","hasta":"2026-11-08","comentario":null,"notificado":false},{"nombre_normalizado":"BOLZICCO ROBERT","nombre_original":"Bolzicco, Robert","desde":"2026-10-19","hasta":"2026-11-15","comentario":null,"notificado":false},{"nombre_normalizado":"ARGARANAZ JOAQUIN","nombre_original":"Argarañaz, Joaquín","desde":"2026-10-19","hasta":"2026-11-01","comentario":null,"notificado":false},{"nombre_normalizado":"FABIAN SALVA","nombre_original":"Salva, Fabian","desde":"2026-11-02","hasta":"2026-12-06","comentario":null,"notificado":false},{"nombre_normalizado":"MAURICIO MOYANO","nombre_original":"Moyano, Mauricio","desde":"2026-11-09","hasta":"2026-12-06","comentario":null,"notificado":false},{"nombre_normalizado":"COZZI RAUL","nombre_original":"Cozzi, Raul","desde":"2026-11-09","hasta":"2026-12-06","comentario":null,"notificado":false},{"nombre_normalizado":"CRISTIAN GHIGO","nombre_original":"Ghigo, Cristian","desde":"2026-11-16","hasta":"2026-12-06","comentario":null,"notificado":false},{"nombre_normalizado":"EZEQUIEL FUNES","nombre_original":"Funes, Ezequiel","desde":"2026-12-07","hasta":"2026-12-27","comentario":null,"notificado":false},{"nombre_normalizado":"GUILLERMO LEGUIZAMON","nombre_original":"Leguizamon, Guillermo","desde":"2026-12-07","hasta":"2026-12-27","comentario":null,"notificado":false},{"nombre_normalizado":"CAROSSIO PABLO","nombre_original":"Carossio, Pablo","desde":"2026-12-07","hasta":"2027-01-03","comentario":null,"notificado":false},{"nombre_normalizado":"CRAVERO DIEGO","nombre_original":"Cravero, Diego","desde":"2026-12-07","hasta":"2026-12-20","comentario":null,"notificado":false},{"nombre_normalizado":"JOSE MANELLI","nombre_original":"Manelli, Jose","desde":"2026-12-21","hasta":"2027-01-17","comentario":null,"notificado":false},{"nombre_normalizado":"ALVAREZ CRISTIAN","nombre_original":"Alvarez, Cristian","desde":"2026-12-28","hasta":"2027-01-10","comentario":null,"notificado":false},{"nombre_normalizado":"ALBANO NELSON","nombre_original":"Albano, Nelson","desde":"2026-12-28","hasta":"2027-01-17","comentario":null,"notificado":false}];
  let creados = 0, sinMatch = 0;
  for (const d of datos) {
    const candidatos = porNombre.get(d.nombre_normalizado) || [];
    if (candidatos.length !== 1) {
      sinMatch++;
      console.log('vacaciones 2026: sin match (' + candidatos.length + ' candidatos) para "' + d.nombre_original + '"');
      continue;
    }
    const record = new Record(vacacionesCol, {
      legajo: candidatos[0].id, desde: d.desde, hasta: d.hasta,
      comentario: d.comentario || '', notificado: !!d.notificado,
    });
    dao.saveRecord(record);
    creados++;
  }
  console.log('vacaciones 2026: ' + creados + ' períodos creados, ' + sinMatch + ' sin match por nombre.');
  return null;
}, (db) => {
  const dao = new Dao(db);
  const vacacionesCol = dao.findCollectionByNameOrId('fichadas_vacaciones');
  dao.findRecordsByFilter(vacacionesCol.id, "desde >= '2026-01-01' && desde <= '2026-12-31'", '', 2000, 0)
    .forEach((r) => dao.deleteRecord(r));
  return null;
})
