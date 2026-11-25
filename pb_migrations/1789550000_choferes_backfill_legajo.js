/// <reference path="../pb_data/types.d.ts" />
// Choferes vinculados a Personal (ver
// docs/superpowers/specs/2026-11-25-choferes-vinculo-legajo-design.md).
// Reintenta vincular por nombre cualquier chofer que todavía tenga
// `legajo` vacío -- mismo criterio normalizarNombre ya usado en
// 1789360000/1789370000/1789490000. Solo toca choferes sin legajo, y
// solo contra legajos que ningún otro chofer tenga ya vinculado -- no
// pisa ningún vínculo ya hecho a mano. Los que no matcheen quedan para
// vincular a mano desde Administración → Choferes (el selector de
// Legajo ya existe hoy).
function normalizarNombre(nombre) {
  return (nombre || '').toUpperCase()
    .replace(/[ÁÀÂÄ]/g, 'A').replace(/[ÉÈÊË]/g, 'E').replace(/[ÍÌÎÏ]/g, 'I')
    .replace(/[ÓÒÔÖ]/g, 'O').replace(/[ÚÙÛÜ]/g, 'U').replace(/Ñ/g, 'N')
    .replace(/[,.]/g, ' ').replace(/\s+/g, ' ').trim()
    .split(' ').filter(Boolean).sort().join(' ');
}
migrate((db) => {
  const dao = new Dao(db);
  const choferesCol = dao.findCollectionByNameOrId('choferes');
  const legajosCol = dao.findCollectionByNameOrId('fichadas_legajos');

  let choferesSinLegajo = [];
  try { choferesSinLegajo = dao.findRecordsByFilter(choferesCol.id, "legajo = ''", '', 500, 0); } catch (e) { /* ninguno */ }

  let choferesConLegajo = [];
  try { choferesConLegajo = dao.findRecordsByFilter(choferesCol.id, "legajo != ''", '', 500, 0); } catch (e) { /* ninguno */ }
  const legajosYaVinculados = new Set(choferesConLegajo.map((c) => c.get('legajo')));

  const todosLosLegajos = dao.findRecordsByFilter(legajosCol.id, "id != ''", '', 2000, 0);
  const legajoPorNombre = new Map();
  todosLosLegajos.forEach((l) => {
    const key = normalizarNombre(l.get('nombre'));
    if (!legajoPorNombre.has(key)) legajoPorNombre.set(key, []);
    legajoPorNombre.get(key).push(l);
  });

  let vinculados = 0, sinMatch = 0;
  choferesSinLegajo.forEach((c) => {
    const key = normalizarNombre(c.get('nombre'));
    const candidatos = (legajoPorNombre.get(key) || []).filter((l) => !legajosYaVinculados.has(l.id));
    if (candidatos.length !== 1) { sinMatch++; return; }
    c.set('legajo', candidatos[0].id);
    dao.saveRecord(c);
    legajosYaVinculados.add(candidatos[0].id);
    vinculados++;
  });
  console.log('choferes_backfill_legajo: ' + vinculados + ' vinculados por nombre, ' + sinMatch + ' sin match (quedan para vincular a mano en Administración → Choferes).');

  return null;
}, (db) => {
  // No se revierte: volver a dejar `legajo` en blanco perdería el vínculo
  // real recuperado, sin ningún beneficio (mismo criterio que
  // 1789180000_backfill_fecha_alta_desde_cintia.js y
  // 1789360000_backfill_fecha_alta_desde_ingreso.js).
  return null;
})
