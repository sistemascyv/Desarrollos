/// <reference path="../pb_data/types.d.ts" />
// Liquidación de sueldos — Administrativos (último sub-proyecto de la
// automatización de liquidación de sueldos, ver
// docs/superpowers/specs/2026-11-13-liquidacion-sueldos-administrativos-design.md).
// La pantalla nueva corre procesarPeriodo() (Fichadas) para un legajo
// puntual, así que necesita leer fichadas_marcas/fichadas_novedades/
// fichadas_empresas/fichadas_legajo_historial -- ninguna de las 4 tenía
// todavía "sueldos" como alternativa de lectura (fichadas_categorias,
// tramos, fichadas_legajos y fichadas_feriados ya lo tenían desde
// 1789480000/1789490000). Solo lectura, no se toca ninguna regla de
// escritura.
migrate((db) => {
  const dao = new Dao(db);

  const reglaMarcasNovedadesConSueldos = '@request.auth.id != "" && (@request.auth.rol = "admin" || @request.auth.modulos ~ "fichadas" || @request.auth.modulos ~ "reportes" || @request.auth.modulos ~ "vacaciones" || @request.auth.modulos ~ "sueldos")';
  ['fichadas_marcas', 'fichadas_novedades'].forEach((nombre) => {
    const collection = dao.findCollectionByNameOrId(nombre);
    collection.listRule = reglaMarcasNovedadesConSueldos;
    collection.viewRule = reglaMarcasNovedadesConSueldos;
    dao.saveCollection(collection);
  });

  const reglaEmpresasHistorialConSueldos = '@request.auth.id != "" && (@request.auth.rol = "admin" || @request.auth.modulos ~ "fichadas" || @request.auth.modulos ~ "reportes" || @request.auth.modulos ~ "vacaciones" || @request.auth.modulos ~ "personal" || @request.auth.modulos ~ "sueldos")';
  ['fichadas_empresas', 'fichadas_legajo_historial'].forEach((nombre) => {
    const collection = dao.findCollectionByNameOrId(nombre);
    collection.listRule = reglaEmpresasHistorialConSueldos;
    collection.viewRule = reglaEmpresasHistorialConSueldos;
    dao.saveCollection(collection);
  });

  return null;
}, (db) => {
  const dao = new Dao(db);

  const reglaMarcasNovedadesOriginal = '@request.auth.id != "" && (@request.auth.rol = "admin" || @request.auth.modulos ~ "fichadas" || @request.auth.modulos ~ "reportes" || @request.auth.modulos ~ "vacaciones")';
  ['fichadas_marcas', 'fichadas_novedades'].forEach((nombre) => {
    const collection = dao.findCollectionByNameOrId(nombre);
    collection.listRule = reglaMarcasNovedadesOriginal;
    collection.viewRule = reglaMarcasNovedadesOriginal;
    dao.saveCollection(collection);
  });

  const reglaEmpresasHistorialOriginal = '@request.auth.id != "" && (@request.auth.rol = "admin" || @request.auth.modulos ~ "fichadas" || @request.auth.modulos ~ "reportes" || @request.auth.modulos ~ "vacaciones" || @request.auth.modulos ~ "personal")';
  ['fichadas_empresas', 'fichadas_legajo_historial'].forEach((nombre) => {
    const collection = dao.findCollectionByNameOrId(nombre);
    collection.listRule = reglaEmpresasHistorialOriginal;
    collection.viewRule = reglaEmpresasHistorialOriginal;
    dao.saveCollection(collection);
  });

  return null;
})
