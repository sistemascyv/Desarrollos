/// <reference path="../pb_data/types.d.ts" />
// Primer sub-proyecto de la automatización de liquidación de sueldos de
// choferes (ver docs/superpowers/specs/2026-11-13-sueldos-categorias-ampliadas-design.md).
// Crea el módulo "Sueldos": colección nueva sueldos_tarifas_viaje (tarifas
// de viaje que NO dependen de la categoría del chofer: km, control carga y
// descarga, permanencia, cruce de frontera), corta el create/update de
// fichadas_categorias de "vacaciones" a "sueldos" (igual patrón que usó
// 1789470000 para pasar fichadas_legajos de "fichadas" a "personal"),
// agrega "sueldos" como alternativa de lectura, y carga las categorías/
// variantes por especialidad y las tarifas de viaje de la escala vigente
// desde el 1° de noviembre de 2026 (Planilla N° 248, CCT 40/89) que hoy
// faltan. plus_vacacional, divisor_mensual y los 6 pct_* son los mismos
// para todas las categorías (ver spec) -- no varían fila a fila.
migrate((db) => {
  const dao = new Dao(db);

  // --- 1) Colección nueva: sueldos_tarifas_viaje ---
  dao.saveCollection(new Collection({
    "id": "sld0tarifas01",
    "name": "sueldos_tarifas_viaje",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false, "id": "stv0nombre001", "name": "nombre", "type": "text",
        "required": true, "presentable": true, "unique": false,
        "options": { "min": null, "max": null, "pattern": "" }
      },
      {
        "system": false, "id": "stv0valor0001", "name": "valor", "type": "number",
        "required": false, "presentable": true, "unique": false,
        "options": { "min": 0, "max": null, "noDecimal": false }
      }
    ],
    "indexes": [],
    "listRule": "@request.auth.id != \"\" && (@request.auth.rol = \"admin\" || @request.auth.modulos ~ \"sueldos\")",
    "viewRule": "@request.auth.id != \"\" && (@request.auth.rol = \"admin\" || @request.auth.modulos ~ \"sueldos\")",
    "createRule": "@request.auth.id != \"\" && (@request.auth.rol = \"admin\" || @request.auth.modulos ~ \"sueldos\")",
    "updateRule": "@request.auth.id != \"\" && (@request.auth.rol = \"admin\" || @request.auth.modulos ~ \"sueldos\")",
    "deleteRule": "@request.auth.rol = \"admin\"",
    "options": {}
  }));

  // --- 2) fichadas_categorias: agregar "sueldos" a lectura, cortar create/update a "sueldos" ---
  const reglaLecturaConSueldos = '@request.auth.id != "" && (@request.auth.rol = "admin" || @request.auth.modulos ~ "vacaciones" || @request.auth.modulos ~ "fichadas" || @request.auth.modulos ~ "personal" || @request.auth.modulos ~ "sueldos")';
  const reglaEscrituraSueldos = '@request.auth.id != "" && (@request.auth.rol = "admin" || @request.auth.modulos ~ "sueldos")';
  const categorias = dao.findCollectionByNameOrId('fichadas_categorias');
  categorias.listRule = reglaLecturaConSueldos;
  categorias.viewRule = reglaLecturaConSueldos;
  categorias.createRule = reglaEscrituraSueldos;
  categorias.updateRule = reglaEscrituraSueldos;
  dao.saveCollection(categorias);

  // --- 3) Datos iniciales: categorías/variantes que faltan ---
  // nombre + plus_vacacional + divisor_mensual + los 6 pct_* (constantes para todas).
  const categoriasNuevas = [
    "Conductor de Primera Categoria",
    "Conductor de Primera Categoria - Local",
    "Conductor de Primera Categoria - Pinturas y Mat. Peligro",
    "Conductor de Segunda Categoria",
    "Conductor de Tercera Categoria",
    "Encargado",
    "Recibidor y/o Clasificador de guias",
    "Recibidor y/o Clasificador en Camara de Frio",
    "Peones Especializados",
    "Peones Especializados Camara de Frio",
    "Peones de Carga y Descarga",
    "Peones de Carga y Descarga en Camara de Frio",
    "Operadores de Autoelevadores",
    "Oficial de Primera +25%",
    "Oficial de Taller +25%",
    "Oficial +25%",
    "Medio Oficial +18%",
    "Oficial Gomero +25%",
    "Medio Oficial Gomero +18%",
    "Lavadores, Engrasadores",
    "Administrativo Primera Categoria",
    "Administrativo Segunda Categoria",
    "Administrativo Tercera Categoria",
    "Administrativo Cuarta Categoria",
    "Maestranza y/o Serenos",
  ];
  for (const nombre of categoriasNuevas) {
    let yaExiste = null;
    try { yaExiste = dao.findFirstRecordByFilter(categorias.id, "nombre = {:nombre}", { nombre }); } catch (e) { /* no existe, seguimos */ }
    if (yaExiste) continue;
    const record = new Record(categorias, {
      nombre: nombre,
      plus_vacacional: 26753.19,
      divisor_mensual: 24,
      pct_jubilacion: 11,
      pct_ley19032: 3,
      pct_obra_social: 2.55,
      pct_ansal: 0.45,
      pct_cuota_sindical: 3,
      pct_seguro_sepelio: 1.5,
    });
    dao.saveRecord(record);
  }

  // --- 4) Datos iniciales: tarifas de viaje ---
  const tarifas = dao.findCollectionByNameOrId('sueldos_tarifas_viaje');
  const tarifasNuevas = [
    { nombre: "Control Carga y Descarga", valor: 47720.58 },
    { nombre: "Kilometros recorridos (por km)", valor: 91.625 },
    { nombre: "Kilometros zona 1,20 (por km)", valor: 109.951 },
    { nombre: "Permanencia remunerativa (por dia y persona)", valor: 32418.56 },
    { nombre: "Permanencia viaticos (por dia y persona)", valor: 61847.64 },
    { nombre: "Cruce de frontera (por cada cruce)", valor: 42592.11 },
    { nombre: "Aguas y Gaseosas (FALTA CONFIRMAR VALOR)", valor: 0 },
    { nombre: "Feriados (FALTA CONFIRMAR VALOR)", valor: 0 },
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

  const reglaLecturaOriginal = '@request.auth.id != "" && (@request.auth.rol = "admin" || @request.auth.modulos ~ "vacaciones" || @request.auth.modulos ~ "fichadas" || @request.auth.modulos ~ "personal")';
  const reglaEscrituraOriginal = '@request.auth.id != "" && (@request.auth.rol = "admin" || @request.auth.modulos ~ "vacaciones")';
  const categorias = dao.findCollectionByNameOrId('fichadas_categorias');
  categorias.listRule = reglaLecturaOriginal;
  categorias.viewRule = reglaLecturaOriginal;
  categorias.createRule = reglaEscrituraOriginal;
  categorias.updateRule = reglaEscrituraOriginal;
  dao.saveCollection(categorias);

  const categoriasNuevas = [
    "Conductor de Primera Categoria", "Conductor de Primera Categoria - Local",
    "Conductor de Primera Categoria - Pinturas y Mat. Peligro", "Conductor de Segunda Categoria",
    "Conductor de Tercera Categoria", "Encargado", "Recibidor y/o Clasificador de guias",
    "Recibidor y/o Clasificador en Camara de Frio", "Peones Especializados",
    "Peones Especializados Camara de Frio", "Peones de Carga y Descarga",
    "Peones de Carga y Descarga en Camara de Frio", "Operadores de Autoelevadores",
    "Oficial de Primera +25%", "Oficial de Taller +25%", "Oficial +25%", "Medio Oficial +18%",
    "Oficial Gomero +25%", "Medio Oficial Gomero +18%", "Lavadores, Engrasadores",
    "Administrativo Primera Categoria", "Administrativo Segunda Categoria",
    "Administrativo Tercera Categoria", "Administrativo Cuarta Categoria", "Maestranza y/o Serenos",
  ];
  for (const nombre of categoriasNuevas) {
    try {
      const record = dao.findFirstRecordByFilter(categorias.id, "nombre = {:nombre}", { nombre });
      dao.deleteRecord(record);
    } catch (e) { /* ya no existía */ }
  }

  try { dao.deleteCollection(dao.findCollectionByNameOrId('sueldos_tarifas_viaje')); } catch (e) { /* no existía */ }

  return null;
})
