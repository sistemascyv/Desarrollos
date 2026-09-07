/// <reference path="../pb_data/types.d.ts" />
// Carga inicial de camiones activos, exportados de la base del otro
// sistema (camiones.csv) — mismo criterio que choferes: se filtran los
// que tienen Inactivo=1 (InactivoFecha distinta de "0001-01-01"). Se
// incluyen los marcados como EsExterno=1 (BROAST, XYCA 1, AGO 1, ALO),
// mismo criterio ya usado para choferes.
//
// "codigo" es el código interno de flota (ej. "T073") cuando existe,
// que es lo que ya usa CyV día a día y lo que aparece en el
// autocompletado de "Tractor" al cargar un tramo — si no había código
// interno, se usa la patente. "marca_modelo" junta Marca + Modelo +
// Año cuando el dato está cargado en el CSV; muchos camiones más
// nuevos no lo tenían cargado ahí, quedan sin ese dato (se puede
// completar a mano después).
migrate((db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("vehiculos");

  const camiones = [
  { codigo: "T073", marca_modelo: "SCANIA P 310 (2008)" },
  { codigo: "T079", marca_modelo: "SCANIA P 310 (2011)" },
  { codigo: "T081", marca_modelo: "SCANIA G 340 (2012)" },
  { codigo: "T082", marca_modelo: "SCANIA G 360 (2013)" },
  { codigo: "T083", marca_modelo: "SCANIA G 360 (2013)" },
  { codigo: "T084", marca_modelo: "VOLVO FH 440 (2013)" },
  { codigo: "T085", marca_modelo: "VOLVO FH 440 (2013)" },
  { codigo: "T086", marca_modelo: "VOLVO FH 440 (2014)" },
  { codigo: "T087", marca_modelo: "VOLVO FH 440 (2014)" },
  { codigo: "T088", marca_modelo: "VOLVO FH 440 (2014)" },
  { codigo: "T089", marca_modelo: "VOLVO FH 440 (2014)" },
  { codigo: "T090", marca_modelo: "VOLVO FH 440 (2014)" },
  { codigo: "T091", marca_modelo: "VOLVO FH 440 (2014)" },
  { codigo: "T092", marca_modelo: "VOLVO FH 440 (2014)" },
  { codigo: "T093", marca_modelo: "MERCEDES BENZ AXOR 1933 (2015)" },
  { codigo: "T094", marca_modelo: "MERCEDES BENZ AXOR 1933 (2015)" },
  { codigo: "T095", marca_modelo: "MERCEDES BENZ AXOR 1933 (2015)" },
  { codigo: "T097", marca_modelo: "MERCEDES BENZ AXOR 2035 (2015)" },
  { codigo: "T099", marca_modelo: "MERCEDES BENZ AXOR 2035 (2015)" },
  { codigo: "T101", marca_modelo: "MERCEDES BENZ AXOR 2036 (2016)" },
  { codigo: "T102", marca_modelo: "MERCEDES BENZ AXOR 2036 (2016)" },
  { codigo: "T103", marca_modelo: "VOLVO FM 380 (2016)" },
  { codigo: "T104", marca_modelo: "VOLVO FM 380 (2016)" },
  { codigo: "T105", marca_modelo: "VOLVO FM 380 (2016)" },
  { codigo: "T106", marca_modelo: "VOLVO FM 380 (2017)" },
  { codigo: "T107", marca_modelo: "VOLVO FM 380 (2017)" },
  { codigo: "T108", marca_modelo: "MERCEDES BENZ ACTROS 1846 (2017)" },
  { codigo: "T109", marca_modelo: "" },
  { codigo: "T110", marca_modelo: "" },
  { codigo: "T111", marca_modelo: "MERCEDES BENZ ATEGO 1726 S (2018)" },
  { codigo: "T112", marca_modelo: "SCANIA P 310 (2018)" },
  { codigo: "T113", marca_modelo: "SCANIA P 310 (2018)" },
  { codigo: "ATEGO", marca_modelo: "" },
  { codigo: "T114", marca_modelo: "" },
  { codigo: "T115", marca_modelo: "" },
  { codigo: "T116", marca_modelo: "" },
  { codigo: "T117", marca_modelo: "" },
  { codigo: "BROAST", marca_modelo: "" },
  { codigo: "XYCA 1", marca_modelo: "" },
  { codigo: "AGO 1", marca_modelo: "" },
  { codigo: "ALO", marca_modelo: "" },
  { codigo: "T119", marca_modelo: "" },
  { codigo: "T120", marca_modelo: "" },
  { codigo: "T121", marca_modelo: "" },
  { codigo: "T122", marca_modelo: "" },
  { codigo: "T123", marca_modelo: "" },
  { codigo: "T124", marca_modelo: "" },
  { codigo: "T125", marca_modelo: "" },
  { codigo: "T126", marca_modelo: "" },
  { codigo: "T127", marca_modelo: "VOLVO FM 370 (2020)" },
  { codigo: "T128", marca_modelo: "" },
  { codigo: "T129", marca_modelo: "" },
  { codigo: "T130", marca_modelo: "" },
  { codigo: "T131", marca_modelo: "" },
  { codigo: "AB 936 SC", marca_modelo: "" },
  { codigo: "AC 224 WW", marca_modelo: "" },
  { codigo: "T132", marca_modelo: "" },
  { codigo: "T133", marca_modelo: "" },
  { codigo: "T134", marca_modelo: "" },
  { codigo: "T135", marca_modelo: "" },
  { codigo: "T136", marca_modelo: "" },
  { codigo: "T137", marca_modelo: "" },
  { codigo: "T138", marca_modelo: "" },
  { codigo: "T139", marca_modelo: "" },
  { codigo: "T140", marca_modelo: "" },
  { codigo: "T141", marca_modelo: "" },
  { codigo: "T142", marca_modelo: "" },
  { codigo: "T143", marca_modelo: "" },
  { codigo: "T144", marca_modelo: "" },
  { codigo: "T145", marca_modelo: "" },
  { codigo: "T146", marca_modelo: "" },
  { codigo: "T147", marca_modelo: "" },
  { codigo: "T148", marca_modelo: "" },
  { codigo: "T149", marca_modelo: "" },
  { codigo: "T150", marca_modelo: "" },
  { codigo: "T151", marca_modelo: "" },
  { codigo: "T152", marca_modelo: "" },
  { codigo: "T154", marca_modelo: "" },
  { codigo: "T153", marca_modelo: "" },
  { codigo: "REPARTO", marca_modelo: "" },
  { codigo: "T155", marca_modelo: "" },
  { codigo: "T156", marca_modelo: "" },
  { codigo: "T157", marca_modelo: "" },
  { codigo: "T158", marca_modelo: "" },
  { codigo: "T159", marca_modelo: "" },
  { codigo: "T160", marca_modelo: "" },
  { codigo: "T161", marca_modelo: "" },
  { codigo: "T162", marca_modelo: "" },
  { codigo: "T163", marca_modelo: "" },
  { codigo: "T164", marca_modelo: "" },
  ];

  for (const c of camiones) {
    const record = new Record(collection, {
      codigo: c.codigo,
      marca_modelo: c.marca_modelo,
      activo: true,
    });
    dao.saveRecord(record);
  }

  return null;
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("vehiculos");
  const codigos = [
    "T073", "T079", "T081", "T082", "T083", "T084", "T085", "T086", "T087", "T088",
    "T089", "T090", "T091", "T092", "T093", "T094", "T095", "T097", "T099", "T101",
    "T102", "T103", "T104", "T105", "T106", "T107", "T108", "T109", "T110", "T111",
    "T112", "T113", "ATEGO", "T114", "T115", "T116", "T117", "BROAST", "XYCA 1", "AGO 1",
    "ALO", "T119", "T120", "T121", "T122", "T123", "T124", "T125", "T126", "T127",
    "T128", "T129", "T130", "T131", "AB 936 SC", "AC 224 WW", "T132", "T133", "T134", "T135",
    "T136", "T137", "T138", "T139", "T140", "T141", "T142", "T143", "T144", "T145",
    "T146", "T147", "T148", "T149", "T150", "T151", "T152", "T154", "T153", "REPARTO",
    "T155", "T156", "T157", "T158", "T159", "T160", "T161", "T162", "T163", "T164",
  ];
  for (const codigo of codigos) {
    try {
      const record = dao.findFirstRecordByFilter(collection.id, "codigo = {:codigo}", { codigo });
      dao.deleteRecord(record);
    } catch (e) {
      // no existía — seguimos.
    }
  }

  return null;
})
