/// <reference path="../pb_data/types.d.ts" />
// El campo "Estado" de CINTIA resultó no servir como base: marcaba
// activos a ~257 legajos, pero cruzando TODO agosto/2026 (6 áreas) más
// el Parte Diario del 1/9 contra asistencia real, solo 61 legajos
// distintos marcaron alguna vez. La empresa tiene ~100 empleados sin
// contar choferes (confirmado con RRHH) -- 257 arrastraba años de gente
// que ya no trabaja acá y nunca se pasó a inactivo en CINTIA.
//
// Reset: inactivo por defecto para todos, activo solo para los 61
// confirmados por datos reales. Quien falte por licencia larga (no
// marcó en todo agosto) se reactiva a mano en Configuración > Empleados.
migrate((db) => {
  const dao = new Dao(db);
  const legajosColl = dao.findCollectionByNameOrId('fichadas_legajos');

  const confirmados = new Set(['10588','10622','10542','10246','20553','10407','30481','30480','30082','30401','30309','30380','30400','30388','30135','30300','30391','30087','30316','20249','20348','20614','629','20419','7007','20583','20605','20633','20297','20464','20284','630','20623','20615','20416','20363','20392','10606','10631','50445','10628','10425','10468','50484','634','50310','10600','50259','50325','50361','50301','50312','10576','60128','50287','10519','10502','10616','50435','10580','30302']);

  let activos = 0, inactivos = 0;
  dao.findRecordsByFilter(legajosColl.id, "nro_tarjeta != ''", '', 500, 0).forEach((r) => {
    const activo = confirmados.has(r.get('nro_tarjeta'));
    r.set('estado', activo);
    dao.saveRecord(r);
    if (activo) activos++; else inactivos++;
  });
  console.log('fichadas: reset de estado -- activos: ' + activos + ', inactivos: ' + inactivos);

  return null;
}, (db) => {
  return null; // no-op: corrección de datos
})
