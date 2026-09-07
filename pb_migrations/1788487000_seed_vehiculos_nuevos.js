/// <reference path="../pb_data/types.d.ts" />
// 5 camiones nuevos que aparecen en la planilla actualizada y todavía
// no estaban cargados (el CSV original llegaba hasta T164).
migrate((db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("vehiculos");

  const camiones = [
    { codigo: "T165", patente: "AI 279 DL", marca_modelo: "VOLVO FM 420 (2026)" },
    { codigo: "T166", patente: "AI 416 LX", marca_modelo: "VOLVO FM 420 (2026)" },
    { codigo: "T167", patente: "AI 416 MA", marca_modelo: "VOLVO FM 420 (2026)" },
    { codigo: "T168", patente: "AI 509 CS", marca_modelo: "VOLVO FM 420 (2026)" },
    { codigo: "T169", patente: "AI 509 CU", marca_modelo: "VOLVO FM 420 (2026)" },
  ];

  for (const c of camiones) {
    const record = new Record(collection, {
      codigo: c.codigo,
      patente: c.patente,
      marca_modelo: c.marca_modelo,
      activo: true,
    });
    dao.saveRecord(record);
  }

  return null;
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("vehiculos");
  const codigos = ["T165", "T166", "T167", "T168", "T169"];
  for (const codigo of codigos) {
    try {
      const record = dao.findFirstRecordByFilter(collection.id, "codigo = {:codigo}", { codigo });
      dao.deleteRecord(record);
    } catch (e) {}
  }

  return null;
})
