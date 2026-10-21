/// <reference path="../pb_data/types.d.ts" />
// Cuadro tarifario de fletes (Seco/Frío/Congelado) -- copia propia e
// independiente del sistema de ventas de terceros, para consulta rápida y
// como base de un futuro cotizador. Se actualiza solo por % (ver
// pb_hooks/cuadro_tarifario.pb.js), nunca celda por celda -- por eso la
// carga inicial de valores reales va acá, a mano, verificada contra el
// Excel/texto que pasó el usuario (mismo criterio que el backfill de
// fechas de CINTIA).
migrate((db) => {
  const collection = new Collection({
    "id": "cuadrotarifa01",
    "name": "cuadro_tarifario",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false, "id": "ctf0categoria1", "name": "categoria", "type": "select",
        "required": true, "presentable": true, "unique": false,
        "options": { "maxSelect": 1, "values": ["seco", "frio", "congelado"] },
      },
      {
        "system": false, "id": "ctf0kgdesde001", "name": "rango_kg_desde", "type": "number",
        "required": true, "presentable": true, "unique": false,
        "options": { "min": 0, "max": null, "noDecimal": true },
      },
      {
        "system": false, "id": "ctf0kghasta001", "name": "rango_kg_hasta", "type": "number",
        "required": true, "presentable": true, "unique": false,
        "options": { "min": 0, "max": null, "noDecimal": true },
      },
      {
        "system": false, "id": "ctf0m3desde001", "name": "rango_m3_desde", "type": "number",
        "required": false, "presentable": false, "unique": false,
        "options": { "min": 0, "max": null, "noDecimal": false },
      },
      {
        "system": false, "id": "ctf0m3hasta001", "name": "rango_m3_hasta", "type": "number",
        "required": false, "presentable": false, "unique": false,
        "options": { "min": 0, "max": null, "noDecimal": false },
      },
      {
        // solo categoria="seco": {"CC":N,"CS":N,"CR":N,"CB":N,"RR":N,"RS":N,"RB":N,"SS":N,"SB":N,"BB":N}
        "system": false, "id": "ctf0valores001", "name": "valores", "type": "json",
        "required": false, "presentable": false, "unique": false, "options": { "maxSize": 5000 },
      },
      {
        // solo categoria="frio"/"congelado": un unico precio por rango
        "system": false, "id": "ctf0valor00001", "name": "valor", "type": "number",
        "required": false, "presentable": false, "unique": false,
        "options": { "min": 0, "max": null, "noDecimal": false },
      },
    ],
    "indexes": [],
    "listRule": "@request.auth.id != \"\" && (@request.auth.rol = \"admin\" || @request.auth.modulos ~ \"tarifas\")",
    "viewRule": "@request.auth.id != \"\" && (@request.auth.rol = \"admin\" || @request.auth.modulos ~ \"tarifas\")",
    "createRule": null,
    "updateRule": null,
    "deleteRule": "@request.auth.rol = \"admin\"",
    "options": {},
  });
  const dao = new Dao(db);
  dao.saveCollection(collection);

  const seco = [
    {"rango_kg_desde": 0, "rango_kg_hasta": 30, "rango_m3_desde": 0.0, "rango_m3_hasta": 0.1, "valores": {"CC": 13264.34, "CS": 13264.34, "CR": 16580.42, "CB": 16580.42, "RR": 16580.42, "RS": 16580.42, "RB": 16580.42, "SS": 13264.34, "SB": 16580.42, "BB": 16580.42}},
    {"rango_kg_desde": 31, "rango_kg_hasta": 40, "rango_m3_desde": 0.101, "rango_m3_hasta": 0.133, "valores": {"CC": 18372.47, "CS": 18372.47, "CR": 22965.59, "CB": 22965.59, "RR": 22965.59, "RS": 22965.59, "RB": 22965.59, "SS": 18372.47, "SB": 22965.59, "BB": 22965.59}},
    {"rango_kg_desde": 41, "rango_kg_hasta": 50, "rango_m3_desde": 0.134, "rango_m3_hasta": 0.166, "valores": {"CC": 21290.66, "CS": 21290.66, "CR": 26613.33, "CB": 26613.33, "RR": 26613.33, "RS": 26613.33, "RB": 26613.33, "SS": 21290.66, "SB": 26613.33, "BB": 26613.33}},
    {"rango_kg_desde": 51, "rango_kg_hasta": 60, "rango_m3_desde": 0.167, "rango_m3_hasta": 0.2, "valores": {"CC": 25910.52, "CS": 25910.52, "CR": 32388.15, "CB": 32388.15, "RR": 32388.15, "RS": 32388.15, "RB": 32388.15, "SS": 25910.52, "SB": 32388.15, "BB": 32388.15}},
    {"rango_kg_desde": 61, "rango_kg_hasta": 70, "rango_m3_desde": 0.201, "rango_m3_hasta": 0.233, "valores": {"CC": 27414.11, "CS": 27414.11, "CR": 34267.64, "CB": 34267.64, "RR": 34267.64, "RS": 34267.64, "RB": 34267.64, "SS": 27414.11, "SB": 34267.64, "BB": 34267.64}},
    {"rango_kg_desde": 71, "rango_kg_hasta": 80, "rango_m3_desde": 0.234, "rango_m3_hasta": 0.266, "valores": {"CC": 29359.64, "CS": 29359.64, "CR": 36699.55, "CB": 36699.55, "RR": 36699.55, "RS": 36699.55, "RB": 36699.55, "SS": 29359.64, "SB": 36699.55, "BB": 36699.55}},
    {"rango_kg_desde": 81, "rango_kg_hasta": 90, "rango_m3_desde": 0.267, "rango_m3_hasta": 0.3, "valores": {"CC": 32387.84, "CS": 32387.84, "CR": 40484.8, "CB": 40484.8, "RR": 40484.8, "RS": 40484.8, "RB": 40484.8, "SS": 32387.84, "SB": 40484.8, "BB": 40484.8}},
    {"rango_kg_desde": 91, "rango_kg_hasta": 100, "rango_m3_desde": 0.301, "rango_m3_hasta": 0.333, "valores": {"CC": 34841.38, "CS": 34841.38, "CR": 43551.72, "CB": 43551.72, "RR": 43551.72, "RS": 43551.72, "RB": 43551.72, "SS": 34841.38, "SB": 43551.72, "BB": 43551.72}},
    {"rango_kg_desde": 101, "rango_kg_hasta": 150, "rango_m3_desde": 0.334, "rango_m3_hasta": 0.5, "valores": {"CC": 44767.97, "CS": 44767.97, "CR": 55959.96, "CB": 55959.96, "RR": 55959.96, "RS": 55959.96, "RB": 55959.96, "SS": 44767.97, "SB": 55959.96, "BB": 55959.96}},
    {"rango_kg_desde": 151, "rango_kg_hasta": 200, "rango_m3_desde": 0.501, "rango_m3_hasta": 0.666, "valores": {"CC": 52260.88, "CS": 52260.88, "CR": 65326.1, "CB": 65326.1, "RR": 65326.1, "RS": 65326.1, "RB": 65326.1, "SS": 52260.88, "SB": 65326.1, "BB": 65326.1}},
    {"rango_kg_desde": 201, "rango_kg_hasta": 250, "rango_m3_desde": 0.667, "rango_m3_hasta": 0.833, "valores": {"CC": 56415.3, "CS": 56415.3, "CR": 70519.13, "CB": 70519.13, "RR": 70519.13, "RS": 70519.13, "RB": 70519.13, "SS": 56415.3, "SB": 70519.13, "BB": 70519.13}},
    {"rango_kg_desde": 251, "rango_kg_hasta": 300, "rango_m3_desde": 0.834, "rango_m3_hasta": 1.0, "valores": {"CC": 65790.87, "CS": 65790.87, "CR": 82238.59, "CB": 82238.59, "RR": 82238.59, "RS": 82238.59, "RB": 82238.59, "SS": 65790.87, "SB": 82238.59, "BB": 82238.59}},
    {"rango_kg_desde": 301, "rango_kg_hasta": 350, "rango_m3_desde": 1.001, "rango_m3_hasta": 1.166, "valores": {"CC": 69354.03, "CS": 69354.03, "CR": 86692.54, "CB": 86692.54, "RR": 86692.54, "RS": 86692.54, "RB": 86692.54, "SS": 69354.03, "SB": 86692.54, "BB": 86692.54}},
    {"rango_kg_desde": 351, "rango_kg_hasta": 400, "rango_m3_desde": 1.167, "rango_m3_hasta": 1.333, "valores": {"CC": 72917.04, "CS": 72917.04, "CR": 91146.3, "CB": 91146.3, "RR": 91146.3, "RS": 91146.3, "RB": 91146.3, "SS": 72917.04, "SB": 91146.3, "BB": 91146.3}},
    {"rango_kg_desde": 401, "rango_kg_hasta": 450, "rango_m3_desde": 1.334, "rango_m3_hasta": 1.5, "valores": {"CC": 76480.46, "CS": 76480.46, "CR": 95600.57, "CB": 95600.57, "RR": 95600.57, "RS": 95600.57, "RB": 95600.57, "SS": 76480.46, "SB": 95600.57, "BB": 95600.57}},
    {"rango_kg_desde": 451, "rango_kg_hasta": 500, "rango_m3_desde": 1.501, "rango_m3_hasta": 1.666, "valores": {"CC": 80042.82, "CS": 80042.82, "CR": 100053.53, "CB": 100053.53, "RR": 100053.53, "RS": 100053.53, "RB": 100053.53, "SS": 80042.82, "SB": 100053.53, "BB": 100053.53}},
    {"rango_kg_desde": 501, "rango_kg_hasta": 550, "rango_m3_desde": 1.667, "rango_m3_hasta": 1.833, "valores": {"CC": 83606.27, "CS": 83606.27, "CR": 104507.84, "CB": 104507.84, "RR": 104507.84, "RS": 104507.84, "RB": 104507.84, "SS": 83606.27, "SB": 104507.84, "BB": 104507.84}},
    {"rango_kg_desde": 551, "rango_kg_hasta": 600, "rango_m3_desde": 1.834, "rango_m3_hasta": 2.0, "valores": {"CC": 87169.63, "CS": 87169.63, "CR": 108962.04, "CB": 108962.04, "RR": 108962.04, "RS": 108962.04, "RB": 108962.04, "SS": 87169.63, "SB": 108962.04, "BB": 108962.04}},
    {"rango_kg_desde": 601, "rango_kg_hasta": 650, "rango_m3_desde": 2.001, "rango_m3_hasta": 2.166, "valores": {"CC": 90732.59, "CS": 90732.59, "CR": 113415.74, "CB": 113415.74, "RR": 113415.74, "RS": 113415.74, "RB": 113415.74, "SS": 90732.59, "SB": 113415.74, "BB": 113415.74}},
    {"rango_kg_desde": 651, "rango_kg_hasta": 700, "rango_m3_desde": 2.167, "rango_m3_hasta": 2.333, "valores": {"CC": 94296.41, "CS": 94296.41, "CR": 117870.51, "CB": 117870.51, "RR": 117870.51, "RS": 117870.51, "RB": 117870.51, "SS": 94296.41, "SB": 117870.51, "BB": 117870.51}},
    {"rango_kg_desde": 701, "rango_kg_hasta": 750, "rango_m3_desde": 2.334, "rango_m3_hasta": 2.5, "valores": {"CC": 97860.21, "CS": 97860.21, "CR": 122325.26, "CB": 122325.26, "RR": 122325.26, "RS": 122325.26, "RB": 122325.26, "SS": 97860.21, "SB": 122325.26, "BB": 122325.26}},
    {"rango_kg_desde": 751, "rango_kg_hasta": 800, "rango_m3_desde": 2.501, "rango_m3_hasta": 2.666, "valores": {"CC": 101422.8, "CS": 101422.8, "CR": 126778.5, "CB": 126778.5, "RR": 126778.5, "RS": 126778.5, "RB": 126778.5, "SS": 101422.8, "SB": 126778.5, "BB": 126778.5}},
    {"rango_kg_desde": 801, "rango_kg_hasta": 850, "rango_m3_desde": 2.667, "rango_m3_hasta": 2.833, "valores": {"CC": 104985.22, "CS": 104985.22, "CR": 131231.53, "CB": 131231.53, "RR": 131231.53, "RS": 131231.53, "RB": 131231.53, "SS": 104985.22, "SB": 131231.53, "BB": 131231.53}},
    {"rango_kg_desde": 851, "rango_kg_hasta": 900, "rango_m3_desde": 2.834, "rango_m3_hasta": 3.0, "valores": {"CC": 108549.32, "CS": 108549.32, "CR": 135686.65, "CB": 135686.65, "RR": 135686.65, "RS": 135686.65, "RB": 135686.65, "SS": 108549.32, "SB": 135686.65, "BB": 135686.65}},
    {"rango_kg_desde": 901, "rango_kg_hasta": 950, "rango_m3_desde": 3.001, "rango_m3_hasta": 3.166, "valores": {"CC": 112111.74, "CS": 112111.74, "CR": 140139.67, "CB": 140139.67, "RR": 140139.67, "RS": 140139.67, "RB": 140139.67, "SS": 112111.74, "SB": 140139.67, "BB": 140139.67}},
    {"rango_kg_desde": 951, "rango_kg_hasta": 1100, "rango_m3_desde": 3.167, "rango_m3_hasta": 3.666, "valores": {"CC": 115675.39, "CS": 115675.39, "CR": 144594.24, "CB": 144594.24, "RR": 144594.24, "RS": 144594.24, "RB": 144594.24, "SS": 115675.39, "SB": 144594.24, "BB": 144594.24}},
    {"rango_kg_desde": 1101, "rango_kg_hasta": 1400, "rango_m3_desde": 3.667, "rango_m3_hasta": 4.667, "valores": {"CC": 112.18, "CS": 112.18, "CR": 140.23, "CB": 140.23, "RR": 140.23, "RS": 140.23, "RB": 140.23, "SS": 112.18, "SB": 140.23, "BB": 140.23}},
    {"rango_kg_desde": 1401, "rango_kg_hasta": 2000, "rango_m3_desde": 4.668, "rango_m3_hasta": 6.667, "valores": {"CC": 103.18, "CS": 103.18, "CR": 128.98, "CB": 128.98, "RR": 128.98, "RS": 128.98, "RB": 128.98, "SS": 103.18, "SB": 128.98, "BB": 128.98}},
    {"rango_kg_desde": 2001, "rango_kg_hasta": 3500, "rango_m3_desde": 6.668, "rango_m3_hasta": 11.667, "valores": {"CC": 95.01, "CS": 95.01, "CR": 118.76, "CB": 118.76, "RR": 118.76, "RS": 118.76, "RB": 118.76, "SS": 95.01, "SB": 118.76, "BB": 118.76}},
    {"rango_kg_desde": 3501, "rango_kg_hasta": 5000, "rango_m3_desde": 11.668, "rango_m3_hasta": 16.667, "valores": {"CC": 88.5, "CS": 88.5, "CR": 110.62, "CB": 110.62, "RR": 110.62, "RS": 110.62, "RB": 110.62, "SS": 88.5, "SB": 110.62, "BB": 110.62}},
    {"rango_kg_desde": 5001, "rango_kg_hasta": 7000, "rango_m3_desde": 16.668, "rango_m3_hasta": 23.333, "valores": {"CC": 81.46, "CS": 81.46, "CR": 101.83, "CB": 101.83, "RR": 101.83, "RS": 101.83, "RB": 101.83, "SS": 81.46, "SB": 101.83, "BB": 101.83}},
    {"rango_kg_desde": 7001, "rango_kg_hasta": 10000, "rango_m3_desde": 23.334, "rango_m3_hasta": 33.333, "valores": {"CC": 73.67, "CS": 73.67, "CR": 92.09, "CB": 92.09, "RR": 92.09, "RS": 92.09, "RB": 92.09, "SS": 73.67, "SB": 92.09, "BB": 92.09}},
    {"rango_kg_desde": 10001, "rango_kg_hasta": 13000, "rango_m3_desde": 33.334, "rango_m3_hasta": 43.333, "valores": {"CC": 70.34, "CS": 70.34, "CR": 87.93, "CB": 87.93, "RR": 87.93, "RS": 87.93, "RB": 87.93, "SS": 70.34, "SB": 87.93, "BB": 87.93}},
  ];

  const frio = [
    {"rango_kg_desde": 0, "rango_kg_hasta": 30, "valor": 22837.76}, {"rango_kg_desde": 31, "rango_kg_hasta": 40, "valor": 31632.66},
    {"rango_kg_desde": 41, "rango_kg_hasta": 50, "valor": 36657.04}, {"rango_kg_desde": 51, "rango_kg_hasta": 60, "valor": 44611.24},
    {"rango_kg_desde": 61, "rango_kg_hasta": 70, "valor": 47200.03}, {"rango_kg_desde": 71, "rango_kg_hasta": 80, "valor": 50549.75},
    {"rango_kg_desde": 81, "rango_kg_hasta": 90, "valor": 55763.5}, {"rango_kg_desde": 91, "rango_kg_hasta": 100, "valor": 59987.87},
    {"rango_kg_desde": 101, "rango_kg_hasta": 150, "valor": 77078.89}, {"rango_kg_desde": 151, "rango_kg_hasta": 200, "valor": 89979.78},
    {"rango_kg_desde": 201, "rango_kg_hasta": 250, "valor": 97132.61}, {"rango_kg_desde": 251, "rango_kg_hasta": 300, "valor": 113274.9},
    {"rango_kg_desde": 301, "rango_kg_hasta": 350, "valor": 119409.74}, {"rango_kg_desde": 351, "rango_kg_hasta": 400, "valor": 125544.32},
    {"rango_kg_desde": 401, "rango_kg_hasta": 450, "valor": 131679.6}, {"rango_kg_desde": 451, "rango_kg_hasta": 500, "valor": 137813.1},
    {"rango_kg_desde": 501, "rango_kg_hasta": 550, "valor": 143948.43}, {"rango_kg_desde": 551, "rango_kg_hasta": 600, "valor": 150083.61},
    {"rango_kg_desde": 601, "rango_kg_hasta": 650, "valor": 156218.11}, {"rango_kg_desde": 651, "rango_kg_hasta": 700, "valor": 162354.1},
    {"rango_kg_desde": 701, "rango_kg_hasta": 750, "valor": 168490.05}, {"rango_kg_desde": 751, "rango_kg_hasta": 800, "valor": 174623.92},
    {"rango_kg_desde": 801, "rango_kg_hasta": 850, "valor": 180757.47}, {"rango_kg_desde": 851, "rango_kg_hasta": 900, "valor": 186893.95},
    {"rango_kg_desde": 901, "rango_kg_hasta": 950, "valor": 193027.5}, {"rango_kg_desde": 951, "rango_kg_hasta": 1000, "valor": 199163.19},
  ];

  const congelado = [
    {"rango_kg_desde": 0, "rango_kg_hasta": 30, "valor": 31139.06}, {"rango_kg_desde": 31, "rango_kg_hasta": 40, "valor": 43130.82},
    {"rango_kg_desde": 41, "rango_kg_hasta": 50, "valor": 49981.5}, {"rango_kg_desde": 51, "rango_kg_hasta": 60, "valor": 60826.98},
    {"rango_kg_desde": 61, "rango_kg_hasta": 70, "valor": 64356.77}, {"rango_kg_desde": 71, "rango_kg_hasta": 80, "valor": 68924.07},
    {"rango_kg_desde": 81, "rango_kg_hasta": 90, "valor": 76032.98}, {"rango_kg_desde": 91, "rango_kg_hasta": 100, "valor": 81792.86},
    {"rango_kg_desde": 101, "rango_kg_hasta": 150, "valor": 105096.29}, {"rango_kg_desde": 151, "rango_kg_hasta": 200, "valor": 122686.53},
    {"rango_kg_desde": 201, "rango_kg_hasta": 250, "valor": 132439.34}, {"rango_kg_desde": 251, "rango_kg_hasta": 300, "valor": 154449.19},
    {"rango_kg_desde": 301, "rango_kg_hasta": 350, "valor": 162813.98}, {"rango_kg_desde": 351, "rango_kg_hasta": 400, "valor": 171178.42},
    {"rango_kg_desde": 401, "rango_kg_hasta": 450, "valor": 179543.82}, {"rango_kg_desde": 451, "rango_kg_hasta": 500, "valor": 187906.78},
    {"rango_kg_desde": 501, "rango_kg_hasta": 550, "valor": 196272.24}, {"rango_kg_desde": 551, "rango_kg_hasta": 600, "valor": 204637.5},
    {"rango_kg_desde": 601, "rango_kg_hasta": 650, "valor": 213001.82}, {"rango_kg_desde": 651, "rango_kg_hasta": 700, "valor": 221368.19},
    {"rango_kg_desde": 701, "rango_kg_hasta": 750, "valor": 229734.49}, {"rango_kg_desde": 751, "rango_kg_hasta": 800, "valor": 238097.96},
    {"rango_kg_desde": 801, "rango_kg_hasta": 850, "valor": 246460.99}, {"rango_kg_desde": 851, "rango_kg_hasta": 900, "valor": 254828.02},
    {"rango_kg_desde": 901, "rango_kg_hasta": 950, "valor": 263191.05}, {"rango_kg_desde": 951, "rango_kg_hasta": 1000, "valor": 271557.01},
  ];

  seco.forEach((f) => {
    const r = new Record(collection, Object.assign({ categoria: 'seco' }, f));
    dao.saveRecord(r);
  });
  frio.forEach((f) => {
    const r = new Record(collection, Object.assign({ categoria: 'frio' }, f));
    dao.saveRecord(r);
  });
  congelado.forEach((f) => {
    const r = new Record(collection, Object.assign({ categoria: 'congelado' }, f));
    dao.saveRecord(r);
  });

  return null;
}, (db) => {
  const dao = new Dao(db);
  return dao.deleteCollection(dao.findCollectionByNameOrId("cuadrotarifa01"));
})
