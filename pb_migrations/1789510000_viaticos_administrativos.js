/// <reference path="../pb_data/types.d.ts" />
// Liquidación — Administrativos: faltaban los viáticos 4.1.12 (Comida) y
// 4.1.13 (Especial), por día trabajado, exentos de los 6 descuentos --
// detectado comparando contra recibos de sueldo reales (ver
// docs/superpowers/specs/2026-11-18-viaticos-administrativos-design.md).
// sueldos_tarifas_viaje ya existe (creada en 1789480000, ya desplegada en
// staging) -- esta migración solo agrega 2 filas más, mismo patrón
// idempotente que ya usó esa migración (no duplica si ya existen). Valores
// de la escala vigente desde 1° de noviembre de 2026, misma fuente que el
// resto de Sueldos.
migrate((db) => {
  const dao = new Dao(db);
  const tarifas = dao.findCollectionByNameOrId('sueldos_tarifas_viaje');

  const tarifasNuevas = [
    { nombre: "Viaticos 4.1.12 - Comida (por dia trabajado)", valor: 17524.83 },
    { nombre: "Viaticos 4.1.13 - Especial (por dia trabajado)", valor: 8793.93 },
  ];
  for (const t of tarifasNuevas) {
    let yaExiste = null;
    try { yaExiste = dao.findFirstRecordByFilter(tarifas.id, "nombre = {:nombre}", { nombre: t.nombre }); } catch (e) { /* no existe, seguimos */ }
    if (yaExiste) continue;
    const record = new Record(tarifas, { nombre: t.nombre, valor: t.valor });
    dao.saveRecord(record);
  }

  return null;
}, (db) => {
  const dao = new Dao(db);
  const tarifas = dao.findCollectionByNameOrId('sueldos_tarifas_viaje');

  const nombres = [
    "Viaticos 4.1.12 - Comida (por dia trabajado)",
    "Viaticos 4.1.13 - Especial (por dia trabajado)",
  ];
  for (const nombre of nombres) {
    try {
      const record = dao.findFirstRecordByFilter(tarifas.id, "nombre = {:nombre}", { nombre });
      dao.deleteRecord(record);
    } catch (e) { /* ya no existía */ }
  }

  return null;
})
