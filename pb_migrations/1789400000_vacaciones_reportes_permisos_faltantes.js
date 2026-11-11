/// <reference path="../pb_data/types.d.ts" />
// Hallazgo de la revisión del refactor de módulos: Vacaciones y Reportes
// quedaron con su propio permiso, pero algunas colecciones que esas
// páginas SÍ necesitan leer habían quedado afuera -- alguien con
// "vacaciones" pero sin "fichadas" veía la pantalla vacía (sin error,
// PocketBase simplemente filtra a lista vacía cuando la regla no
// matchea), y alguien con solo "reportes" obtenía números equivocados en
// silencio (el expand de "horario" en fichadas_legajos quedaba vacío,
// haciendo parecer que nadie tiene horario asignado). Ver
// docs/superpowers/plans/2026-11-11-fichadas-vacaciones-licencias.md.
migrate((db) => {
  const dao = new Dao(db);

  const reglaConVacaciones = '@request.auth.id != "" && (@request.auth.rol = "admin" || @request.auth.modulos ?= "fichadas" || @request.auth.modulos ?= "reportes" || @request.auth.modulos ?= "vacaciones")';
  ['fichadas_legajos', 'fichadas_empresas'].forEach((nombre) => {
    const collection = dao.findCollectionByNameOrId(nombre);
    collection.listRule = reglaConVacaciones;
    collection.viewRule = reglaConVacaciones;
    dao.saveCollection(collection);
  });

  const reglaHorarios = '@request.auth.id != "" && (@request.auth.rol = "admin" || @request.auth.modulos ?= "fichadas" || @request.auth.modulos ?= "reportes")';
  const horarios = dao.findCollectionByNameOrId('fichadas_horarios');
  horarios.listRule = reglaHorarios;
  horarios.viewRule = reglaHorarios;
  dao.saveCollection(horarios);

  return null;
}, (db) => {
  const dao = new Dao(db);

  const reglaSinVacaciones = '@request.auth.id != "" && (@request.auth.rol = "admin" || @request.auth.modulos ?= "fichadas" || @request.auth.modulos ?= "reportes")';
  ['fichadas_legajos', 'fichadas_empresas'].forEach((nombre) => {
    const collection = dao.findCollectionByNameOrId(nombre);
    collection.listRule = reglaSinVacaciones;
    collection.viewRule = reglaSinVacaciones;
    dao.saveCollection(collection);
  });

  // fichadas_horarios usaba el operador "~" antes de esta migración, no "?=" --
  // se restaura tal cual estaba (no estandarizado, a diferencia de las otras
  // colecciones que sí se tocaron antes en 1789390000).
  const reglaOriginalHorarios = '@request.auth.id != "" && (@request.auth.rol = "admin" || @request.auth.modulos ~ "fichadas")';
  const horarios = dao.findCollectionByNameOrId('fichadas_horarios');
  horarios.listRule = reglaOriginalHorarios;
  horarios.viewRule = reglaOriginalHorarios;
  dao.saveCollection(horarios);

  return null;
})
