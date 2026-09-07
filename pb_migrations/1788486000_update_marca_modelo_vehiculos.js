/// <reference path="../pb_data/types.d.ts" />
// Completa marca/modelo/año en los vehículos ya cargados, con una
// planilla más actualizada que trajo estos datos para los tractores que
// no los tenían (o los tenían viejos). Se matchea por patente,
// ignorando espacios y mayúsculas/minúsculas, porque el CSV original
// guardó algunas patentes con espacios ("AA 229 XX") y otras sin
// espacios ("AG399SJ") según cómo venían cargadas ahí.
migrate((db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("vehiculos");

  const datos = [
    { patente: "IJX 154", marca_modelo: "M. BENZ ATEGO 1725 S", anio: "2010" },
    { patente: "AA 229 XX", marca_modelo: "VOLVO FM 380", anio: "2016" },
    { patente: "AC 020 FG", marca_modelo: "VOLVO FM 380", anio: "2017" },
    { patente: "AC 020 FI", marca_modelo: "VOLVO FM 380", anio: "2017" },
    { patente: "AB 979 EX", marca_modelo: "M. BENZ ACTROS 1846", anio: "2017" },
    { patente: "AB 979 EY", marca_modelo: "M. BENZ AXOR 2036", anio: "2017" },
    { patente: "AC 428 OS", marca_modelo: "M. BENZ ATEGO 1726 S", anio: "2018" },
    { patente: "AC 806 UX", marca_modelo: "SCANIA P 310", anio: "2018" },
    { patente: "AC 806 UZ", marca_modelo: "SCANIA P 310", anio: "2018" },
    { patente: "AD 195 BC", marca_modelo: "M. BENZ ACTROS 2645", anio: "2018" },
    { patente: "AD 195 BD", marca_modelo: "M. BENZ AXOR 2036", anio: "2018" },
    { patente: "AD 195 BE", marca_modelo: "M. BENZ ACTROS 2645", anio: "2018" },
    { patente: "AD 195 BH", marca_modelo: "M. BENZ AXOR 2036", anio: "2018" },
    { patente: "AD 401 ZG", marca_modelo: "VOLVO FM 330", anio: "2019" },
    { patente: "AD 401 ZH", marca_modelo: "VOLVO FM 330", anio: "2019" },
    { patente: "AD 580 ZA", marca_modelo: "VOLVO FM 330", anio: "2019" },
    { patente: "AD 580 ZB", marca_modelo: "VOLVO FM 330", anio: "2019" },
    { patente: "AD 807 PC", marca_modelo: "VOLVO FH 420", anio: "2019" },
    { patente: "AD 807 PD", marca_modelo: "VOLVO FH 420", anio: "2019" },
    { patente: "AD 807 PE", marca_modelo: "VOLVO FH 420", anio: "2019" },
    { patente: "AE 272 GP", marca_modelo: "VOLVO FM 370", anio: "2020" },
    { patente: "AE 272 GU", marca_modelo: "VOLVO FM 370", anio: "2020" },
    { patente: "AE 298 IS", marca_modelo: "VOLVO FM 370", anio: "2020" },
    { patente: "AE 494 KG", marca_modelo: "VOLVO FM 370", anio: "2020" },
    { patente: "AE 494 KH", marca_modelo: "VOLVO FM 370", anio: "2020" },
    { patente: "AE 709 MS", marca_modelo: "VOLVO FM 370", anio: "2021" },
    { patente: "AF 287 SN", marca_modelo: "VOLVO FM 370", anio: "2022" },
    { patente: "AF 531 GW", marca_modelo: "VOLVO FH 500", anio: "2022" },
    { patente: "AF 683 NB", marca_modelo: "SCANIA P 340", anio: "2022" },
    { patente: "AG 130 ZA", marca_modelo: "M. BENZ AXOR 2036", anio: "2023" },
    { patente: "AG 399 SJ", marca_modelo: "M. BENZ ATEGO 1729 S", anio: "2024" },
    { patente: "AG 454 OC", marca_modelo: "IVECO STRALIS", anio: "2024" },
    { patente: "AG 454 OD", marca_modelo: "IVECO STRALIS", anio: "2024" },
    { patente: "AG 465 PG", marca_modelo: "M. BENZ AXOR 2036 S", anio: "2024" },
    { patente: "AG 741 EN", marca_modelo: "M. BENZ AXOR 2036 S", anio: "2024" },
    { patente: "AG 741 EY", marca_modelo: "M. BENZ AXOR 2036 S", anio: "2024" },
    { patente: "AG 753 QF", marca_modelo: "M. BENZ AXOR 2036 S", anio: "2024" },
    { patente: "AG 845 NG", marca_modelo: "M. BENZ ACTROS 2045 LS", anio: "2024" },
    { patente: "AG 962 DK", marca_modelo: "M. BENZ AXOR 2036 S", anio: "2024" },
    { patente: "AH 017 PM", marca_modelo: "M. BENZ AXOR 2544 LS", anio: "2025" },
    { patente: "AH 293 UA", marca_modelo: "M. BENZ AXOR 2544 LS", anio: "2025" },
    { patente: "AH 345 XP", marca_modelo: "M. BENZ ACTROS 2045 LS", anio: "2025" },
    { patente: "AH 345 XQ", marca_modelo: "M. BENZ AXOR 2536 LS", anio: "2025" },
    { patente: "AH 183 PN", marca_modelo: "SCANIA G 360 A4X2", anio: "2025" },
    { patente: "AH 183 QT", marca_modelo: "SCANIA G 420 A4X2", anio: "2025" },
    { patente: "AH 457 YQ", marca_modelo: "M. BENZ ATEGO 1932 LS", anio: "2025" },
    { patente: "AH 465 RL", marca_modelo: "M. BENZ ACTROS 2045 LS", anio: "2025" },
    { patente: "AH 542 PC", marca_modelo: "M. BENZ ACTROS 2045 LS", anio: "2025" },
    { patente: "AH 544 TI", marca_modelo: "M. BENZ ACTROS 2045 LS", anio: "2025" },
    { patente: "AH 926 VJ", marca_modelo: "M. BENZ ACTROS 2545 LS", anio: "2025" },
    { patente: "AH 926 WX", marca_modelo: "M. BENZ ACTROS 2545 LS", anio: "2025" },
    { patente: "AH 820 LD", marca_modelo: "M. BENZ ACTROS 2545 LS", anio: "2025" },
    { patente: "AH 806 HP", marca_modelo: "VOLVO FM 420", anio: "2026" },
    { patente: "AH 806 HQ", marca_modelo: "VOLVO FM 420", anio: "2026" },
    { patente: "AH 806 HU", marca_modelo: "VOLVO FM 420", anio: "2026" },
    { patente: "AH 806 HZ", marca_modelo: "VOLVO FM 420", anio: "2026" },
    { patente: "AH 806 IA", marca_modelo: "VOLVO FM 420", anio: "2026" },
    { patente: "AI 197 YF", marca_modelo: "M. BENZ ACTROS 2545 LS", anio: "2026" },
    { patente: "AI 197 YE", marca_modelo: "M. BENZ ACTROS 2045 LS", anio: "2026" },
  ];

  const todos = dao.findRecordsByFilter(collection.id, "", "", 500, 0);
  const porPatente = new Map();
  for (const r of todos) {
    const p = (r.get("patente") || "").replace(/\s+/g, "").toUpperCase();
    if (p) porPatente.set(p, r);
  }

  let sinMatch = 0;
  for (const d of datos) {
    const key = d.patente.replace(/\s+/g, "").toUpperCase();
    const record = porPatente.get(key);
    if (!record) { sinMatch++; continue; } // no lo encontramos, seguimos sin romper el deploy
    record.set("marca_modelo", `${d.marca_modelo} (${d.anio})`);
    dao.saveRecord(record);
  }
  // sinMatch: si algo no matcheó, no rompemos la migración por eso —
  // simplemente ese vehículo se queda como estaba.

  return null;
}, (db) => {
  // No revertimos marca_modelo (es un dato descriptivo, no crítico) —
  // volver a poner el valor viejo exacto de cada uno no vale la pena.
  return null;
})
