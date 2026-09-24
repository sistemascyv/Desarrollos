/// <reference path="../pb_data/types.d.ts" />
// Agrega el CodigoEntidad de Megatrans (segundo proveedor de GPS) a cada
// vehículo que lo tiene, para poder consultar sus km recorridos. Ver
// docs/superpowers/specs/2026-09-24-megatrans-km-real-design.md.
migrate((db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("vehiculos");

  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "veh0megat1",
    "name": "codigo_megatrans",
    "type": "text",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "min": null,
      "max": null,
      "pattern": ""
    }
  }));
  dao.saveCollection(collection);

  const datos = [
    { codigo: "T136", codigo_megatrans: "46401210" },
    { codigo: "T142", codigo_megatrans: "45520410" },
    { codigo: "T139", codigo_megatrans: "45511110" },
    { codigo: "T141", codigo_megatrans: "44695910" },
    { codigo: "T143", codigo_megatrans: "44643410" },
    { codigo: "T140", codigo_megatrans: "44631010" },
    { codigo: "T135", codigo_megatrans: "44619810" },
    { codigo: "T138", codigo_megatrans: "44607110" },
    { codigo: "T137", codigo_megatrans: "44603110" },
    { codigo: "T133", codigo_megatrans: "44476310" },
    { codigo: "T134", codigo_megatrans: "44476310" },
    { codigo: "T092", codigo_megatrans: "44328210" },
    { codigo: "T091", codigo_megatrans: "44312010" },
    { codigo: "T090", codigo_megatrans: "44299510" },
    { codigo: "T089", codigo_megatrans: "44285110" },
    { codigo: "T088", codigo_megatrans: "44278310" },
    { codigo: "T087", codigo_megatrans: "44212010" },
    { codigo: "T086", codigo_megatrans: "44127510" },
    { codigo: "T084", codigo_megatrans: "43718610" },
    { codigo: "T085", codigo_megatrans: "43704310" },
    { codigo: "T132", codigo_megatrans: "43123110" },
    { codigo: "T081", codigo_megatrans: "43121010" },
    { codigo: "T131", codigo_megatrans: "42756710" },
    { codigo: "T130", codigo_megatrans: "42661010" },
    { codigo: "T129", codigo_megatrans: "42660010" },
    { codigo: "T128", codigo_megatrans: "42624110" },
    { codigo: "T127", codigo_megatrans: "42617710" },
    { codigo: "T126", codigo_megatrans: "42616610" },
    { codigo: "T125", codigo_megatrans: "42485410" },
    { codigo: "T124", codigo_megatrans: "42485310" },
    { codigo: "T123", codigo_megatrans: "42480710" },
    { codigo: "T121", codigo_megatrans: "42405810" },
    { codigo: "T122", codigo_megatrans: "42405410" },
    { codigo: "T120", codigo_megatrans: "42339910" },
    { codigo: "T118", codigo_megatrans: "42337810" },
    { codigo: "T119", codigo_megatrans: "42337610" },
    { codigo: "T117", codigo_megatrans: "42315010" },
    { codigo: "T116", codigo_megatrans: "42314910" },
    { codigo: "T114", codigo_megatrans: "42313810" },
    { codigo: "T115", codigo_megatrans: "42313610" },
    { codigo: "T113", codigo_megatrans: "42266510" },
    { codigo: "T112", codigo_megatrans: "42265510" },
    { codigo: "T111", codigo_megatrans: "42170510" },
    { codigo: "T110", codigo_megatrans: "42168910" },
    { codigo: "T107", codigo_megatrans: "42072310" },
    { codigo: "T106", codigo_megatrans: "42069410" },
    { codigo: "T108", codigo_megatrans: "42051910" },
    { codigo: "T109", codigo_megatrans: "42051310" },
    { codigo: "T079", codigo_megatrans: "41688410" },
    { codigo: "ATEGO", codigo_megatrans: "41463410" },
    { codigo: "T083", codigo_megatrans: "41444410" },
    { codigo: "T082", codigo_megatrans: "41441410" },
    { codigo: "T075", codigo_megatrans: "41160810" },
    { codigo: "T099", codigo_megatrans: "40998110" },
    { codigo: "T073", codigo_megatrans: "40751710" },
    { codigo: "T098", codigo_megatrans: "40570610" },
    { codigo: "T097", codigo_megatrans: "40554910" },
    { codigo: "T102", codigo_megatrans: "40542510" },
    { codigo: "T101", codigo_megatrans: "40541510" },
    { codigo: "T096", codigo_megatrans: "40536410" },
    { codigo: "T095", codigo_megatrans: "40402910" },
    { codigo: "T104", codigo_megatrans: "40352710" },
    { codigo: "T094", codigo_megatrans: "40312110" },
    { codigo: "T093", codigo_megatrans: "40226710" },
    { codigo: "T103", codigo_megatrans: "40074010" },
    { codigo: "T105", codigo_megatrans: "40030510" },
  ];

  const fresh = dao.findCollectionByNameOrId("vehiculos");
  const noEncontrados = [];
  for (const d of datos) {
    try {
      const record = dao.findFirstRecordByFilter(fresh.id, "codigo = {:codigo}", { codigo: d.codigo });
      record.set("codigo_megatrans", d.codigo_megatrans);
      dao.saveRecord(record);
    } catch (e) {
      noEncontrados.push(d.codigo);
    }
  }
  if (noEncontrados.length) {
    console.log("codigo_megatrans: no se encontró vehiculos.codigo para: " + noEncontrados.join(", "));
  }
  console.log("codigo_megatrans: nota -- T133 y T134 comparten el mismo CodigoEntidad (44476310) en los datos de origen, revisar con Megatrans si es un error de ellos.");

  return null;
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("vehiculos");
  collection.schema.removeField("veh0megat1");
  return dao.saveCollection(collection);
})
