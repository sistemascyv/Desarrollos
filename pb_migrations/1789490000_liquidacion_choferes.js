/// <reference path="../pb_data/types.d.ts" />
// Liquidación de sueldos mensual de choferes (sub-proyectos 3+4 fusionados,
// ver docs/superpowers/specs/2026-11-13-liquidacion-sueldos-choferes-design.md).
// Vincula cada chofer con su legajo de Personal (categoría/básico reales),
// agrega a Tramo los 2 datos que faltaban para el cálculo (aguas y gaseosas,
// km zona 1,20 -- "feriados trabajados" se deriva comparando dia_salida
// contra fichadas_feriados, sin campo nuevo), y abre lectura cruzada al
// módulo "sueldos" sobre tramos/fichadas_legajos/fichadas_feriados (no
// escritura -- la liquidación solo lee).
migrate((db) => {
  const dao = new Dao(db);

  // --- 1) choferes.legajo ---
  const choferes = dao.findCollectionByNameOrId('choferes');
  choferes.schema.addField(new SchemaField({
    system: false, id: 'chf0legajo001', name: 'legajo', type: 'relation',
    required: false, presentable: false, unique: false,
    options: {
      collectionId: dao.findCollectionByNameOrId('fichadas_legajos').id,
      cascadeDelete: false, minSelect: null, maxSelect: 1, displayFields: ['nombre'],
    },
  }));
  dao.saveCollection(choferes);

  // --- 2) tramos: 2 campos nuevos ---
  const tramos = dao.findCollectionByNameOrId('tramos');
  tramos.schema.addField(new SchemaField({
    system: false, id: 'trm0aguasga1', name: 'es_aguas_gaseosas', type: 'bool',
    required: false, presentable: false, unique: false, options: {},
  }));
  tramos.schema.addField(new SchemaField({
    system: false, id: 'trm0kmzona12', name: 'km_zona_120', type: 'number',
    required: false, presentable: false, unique: false,
    options: { min: 0, max: null, noDecimal: false },
  }));

  // --- 3) permisos: "sueldos" lee tramos/fichadas_legajos/fichadas_feriados ---
  const reglaLecturaTramosConSueldos = '@request.auth.id != "" && (@request.auth.rol = "admin" || @request.auth.modulos ~ "planilla_choferes" || @request.auth.modulos ~ "consumo_combustible" || @request.auth.modulos ~ "sueldos")';
  tramos.listRule = reglaLecturaTramosConSueldos;
  tramos.viewRule = reglaLecturaTramosConSueldos;
  dao.saveCollection(tramos);

  const reglaLecturaLegajosConSueldos = '@request.auth.id != "" && (@request.auth.rol = "admin" || @request.auth.modulos ~ "fichadas" || @request.auth.modulos ~ "reportes" || @request.auth.modulos ~ "vacaciones" || @request.auth.modulos ~ "personal" || @request.auth.modulos ~ "sueldos")';
  const legajos = dao.findCollectionByNameOrId('fichadas_legajos');
  legajos.listRule = reglaLecturaLegajosConSueldos;
  legajos.viewRule = reglaLecturaLegajosConSueldos;
  dao.saveCollection(legajos);

  const reglaLecturaFeriadosConSueldos = '@request.auth.id != "" && (@request.auth.rol = "admin" || @request.auth.modulos ~ "fichadas" || @request.auth.modulos ~ "reportes" || @request.auth.modulos ~ "vacaciones" || @request.auth.modulos ~ "sueldos")';
  const feriados = dao.findCollectionByNameOrId('fichadas_feriados');
  feriados.listRule = reglaLecturaFeriadosConSueldos;
  feriados.viewRule = reglaLecturaFeriadosConSueldos;
  dao.saveCollection(feriados);

  // --- 4) auto-vincular choferes con su legajo por nombre exacto (sin mayúsc./espacios extra) ---
  const normalizar = (s) => (s || '').trim().toUpperCase().replace(/\s+/g, ' ');
  const todosLosChoferes = dao.findRecordsByFilter(choferes.id, "id != ''", '', 500, 0);
  const todosLosLegajos = dao.findRecordsByFilter(legajos.id, "id != ''", '', 2000, 0);
  const legajoPorNombre = new Map();
  for (const l of todosLosLegajos) {
    legajoPorNombre.set(normalizar(l.getString('nombre')), l.id);
  }
  for (const c of todosLosChoferes) {
    if (c.get('legajo')) continue; // ya vinculado, no pisar
    const legajoId = legajoPorNombre.get(normalizar(c.getString('nombre')));
    if (legajoId) {
      c.set('legajo', legajoId);
      dao.saveRecord(c);
    }
  }

  return null;
}, (db) => {
  const dao = new Dao(db);

  const reglaLecturaTramosOriginal = '@request.auth.id != "" && (@request.auth.rol = "admin" || @request.auth.modulos ~ "planilla_choferes" || @request.auth.modulos ~ "consumo_combustible")';
  const tramos = dao.findCollectionByNameOrId('tramos');
  tramos.listRule = reglaLecturaTramosOriginal;
  tramos.viewRule = reglaLecturaTramosOriginal;
  tramos.schema.removeField('trm0aguasga1');
  tramos.schema.removeField('trm0kmzona12');
  dao.saveCollection(tramos);

  const reglaLecturaLegajosOriginal = '@request.auth.id != "" && (@request.auth.rol = "admin" || @request.auth.modulos ~ "fichadas" || @request.auth.modulos ~ "reportes" || @request.auth.modulos ~ "vacaciones" || @request.auth.modulos ~ "personal")';
  const legajos = dao.findCollectionByNameOrId('fichadas_legajos');
  legajos.listRule = reglaLecturaLegajosOriginal;
  legajos.viewRule = reglaLecturaLegajosOriginal;
  dao.saveCollection(legajos);

  const reglaLecturaFeriadosOriginal = '@request.auth.id != "" && (@request.auth.rol = "admin" || @request.auth.modulos ~ "fichadas" || @request.auth.modulos ~ "reportes" || @request.auth.modulos ~ "vacaciones")';
  const feriados = dao.findCollectionByNameOrId('fichadas_feriados');
  feriados.listRule = reglaLecturaFeriadosOriginal;
  feriados.viewRule = reglaLecturaFeriadosOriginal;
  dao.saveCollection(feriados);

  const choferes = dao.findCollectionByNameOrId('choferes');
  choferes.schema.removeField('chf0legajo001');
  dao.saveCollection(choferes);

  return null;
})
