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

  // --- Reconciliar `activo` con el estado real del legajo vinculado ---
  // Esta migración corre con Dao, no por una request HTTP real, así que
  // los hooks de pb_hooks/fichadas.pb.js (que sincronizan activo<->estado
  // en vivo) NO se disparan acá. Sin este paso, cualquier chofer vinculado
  // -- tanto los recién backfillados arriba como los que ya vinculó
  // 1789490000_liquidacion_choferes.js -- podría quedar con un `activo`
  // desincronizado del `estado` real de su legajo hasta que alguien lo
  // edite a mano por la API.
  let choferesConLegajoFinal = [];
  try { choferesConLegajoFinal = dao.findRecordsByFilter(choferesCol.id, "legajo != ''", '', 500, 0); } catch (e) { /* ninguno */ }
  let reconciliados = 0;
  choferesConLegajoFinal.forEach((c) => {
    let legajo = null;
    try { legajo = dao.findRecordById(legajosCol.id, c.get('legajo')); } catch (e) { return; }
    const activoReal = !legajo.get('fecha_baja');
    if (c.get('activo') !== activoReal) {
      c.set('activo', activoReal);
      dao.saveRecord(c);
      reconciliados++;
    }
  });
  console.log('choferes_backfill_legajo: ' + reconciliados + ' choferes con activo reconciliado contra el estado real de su legajo.');

  return null;
}, (db) => {
  // No se revierte: volver a dejar `legajo` en blanco perdería el vínculo
  // real recuperado, sin ningún beneficio (mismo criterio que
  // 1789180000_backfill_fecha_alta_desde_cintia.js y
  // 1789360000_backfill_fecha_alta_desde_ingreso.js).
  return null;
})
