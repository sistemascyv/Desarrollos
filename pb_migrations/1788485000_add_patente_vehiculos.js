/// <reference path="../pb_data/types.d.ts" />
// Agrega el campo "patente" a vehículos y completa la de los 90
// camiones ya cargados (ver 1788484000_seed_vehiculos.js), que hasta
// ahora solo tenían el código interno de flota.
migrate((db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("vehiculos");

  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "veh0pat1",
    "name": "patente",
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
  { codigo: "T073", patente: "HGP 175" },
  { codigo: "T079", patente: "JQR 256" },
  { codigo: "T081", patente: "LJU 077" },
  { codigo: "T082", patente: "MCY 080" },
  { codigo: "T083", patente: "MCY 084" },
  { codigo: "T084", patente: "NEW 984" },
  { codigo: "T085", patente: "NEW 986" },
  { codigo: "T086", patente: "NWF 458" },
  { codigo: "T087", patente: "NTJ 067" },
  { codigo: "T088", patente: "NXU 548" },
  { codigo: "T089", patente: "NXU 547" },
  { codigo: "T090", patente: "NXU 546" },
  { codigo: "T091", patente: "NXU 561" },
  { codigo: "T092", patente: "NXU 562" },
  { codigo: "T093", patente: "OOD 781" },
  { codigo: "T094", patente: "OOD 837" },
  { codigo: "T095", patente: "OVL 560" },
  { codigo: "T097", patente: "OSV 139" },
  { codigo: "T099", patente: "PHK 387" },
  { codigo: "T101", patente: "PNC 476" },
  { codigo: "T102", patente: "PNC 478" },
  { codigo: "T103", patente: "AA 229 XU" },
  { codigo: "T104", patente: "AA 229 XX" },
  { codigo: "T105", patente: "AA 229 XY" },
  { codigo: "T106", patente: "AC 020 FG" },
  { codigo: "T107", patente: "AC 020 FI" },
  { codigo: "T108", patente: "AB 979 EX" },
  { codigo: "T109", patente: "AB 979 EY" },
  { codigo: "T110", patente: "AC 428 OP" },
  { codigo: "T111", patente: "AC 428 OS" },
  { codigo: "T112", patente: "AC 806 UX" },
  { codigo: "T113", patente: "AC 806 UZ" },
  { codigo: "ATEGO", patente: "IJX 154" },
  { codigo: "T114", patente: "AD 195 BC" },
  { codigo: "T115", patente: "AD 195 BD" },
  { codigo: "T116", patente: "AD 195 BE" },
  { codigo: "T117", patente: "AD 195 BH" },
  { codigo: "BROAST", patente: "BROAST 1" },
  { codigo: "XYCA 1", patente: "PBA 586" },
  { codigo: "AGO 1", patente: "AGO 1" },
  { codigo: "ALO", patente: "ALO 1" },
  { codigo: "T119", patente: "AD 401 ZG" },
  { codigo: "T120", patente: "AD 401 ZH" },
  { codigo: "T121", patente: "AD 580 ZA" },
  { codigo: "T122", patente: "AD 580 ZB" },
  { codigo: "T123", patente: "AD 807 PC" },
  { codigo: "T124", patente: "AD 807 PD" },
  { codigo: "T125", patente: "AD 807 PE" },
  { codigo: "T126", patente: "AE 272 GP" },
  { codigo: "T127", patente: "AE 272 GU" },
  { codigo: "T128", patente: "AE 298 IS" },
  { codigo: "T129", patente: "AE 494 KG" },
  { codigo: "T130", patente: "AE 494 KH" },
  { codigo: "T131", patente: "AE 709 MS" },
  { codigo: "AB 936 SC", patente: "AB 936 SC" },
  { codigo: "AC 224 WW", patente: "AC 224 WW" },
  { codigo: "T132", patente: "AF 287 SN" },
  { codigo: "T133", patente: "AF 531 GW" },
  { codigo: "T134", patente: "AF 683 NB" },
  { codigo: "T135", patente: "AG 130 ZA" },
  { codigo: "T136", patente: "AG399SJ" },
  { codigo: "T137", patente: "AG454OC" },
  { codigo: "T138", patente: "AG454OD" },
  { codigo: "T139", patente: "AG465PG" },
  { codigo: "T140", patente: "AG741EN" },
  { codigo: "T141", patente: "AG741EY" },
  { codigo: "T142", patente: "AG753QF" },
  { codigo: "T143", patente: "AG845NG" },
  { codigo: "T144", patente: "AG962DK" },
  { codigo: "T145", patente: "AH017PM" },
  { codigo: "T146", patente: "AH293UA" },
  { codigo: "T147", patente: "AH345XP" },
  { codigo: "T148", patente: "AH345XQ" },
  { codigo: "T149", patente: "AH183PN" },
  { codigo: "T150", patente: "AH183QT" },
  { codigo: "T151", patente: "AH457YQ" },
  { codigo: "T152", patente: "AH465RL" },
  { codigo: "T154", patente: "AH544TI" },
  { codigo: "T153", patente: "AH542PC" },
  { codigo: "REPARTO", patente: "GIU658" },
  { codigo: "T155", patente: "AH926VJ" },
  { codigo: "T156", patente: "AH926WX" },
  { codigo: "T157", patente: "AH820LD" },
  { codigo: "T158", patente: "AH806HP" },
  { codigo: "T159", patente: "AH806HQ" },
  { codigo: "T160", patente: "AH806HU" },
  { codigo: "T161", patente: "AH806HZ" },
  { codigo: "T162", patente: "AH806IA" },
  { codigo: "T163", patente: "AI197YF" },
  { codigo: "T164", patente: "AI197YE" },
  ];

  const fresh = dao.findCollectionByNameOrId("vehiculos");
  for (const d of datos) {
    try {
      const record = dao.findFirstRecordByFilter(fresh.id, "codigo = {:codigo}", { codigo: d.codigo });
      record.set("patente", d.patente);
      dao.saveRecord(record);
    } catch (e) {
      // no existía (se borró a mano después de la carga inicial) — seguimos.
    }
  }

  return null;
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("vehiculos");
  collection.schema.removeField("veh0pat1");
  return dao.saveCollection(collection);
})
