/// <reference path="../pb_data/types.d.ts" />
// Vacaciones se separa de Fichadas como módulo propio del menú -- el
// permiso para ver/usar estas dos colecciones pasa de "fichadas" a
// "vacaciones" (corte limpio, nada de esto está en producción todavía).
// Ver docs/superpowers/plans/2026-11-11-fichadas-vacaciones-licencias.md.
migrate((db) => {
  const dao = new Dao(db);
  const regla = '@request.auth.id != "" && (@request.auth.rol = "admin" || @request.auth.modulos ?= "vacaciones")';
  ['fichadas_vacaciones', 'fichadas_grupos_restriccion'].forEach((nombre) => {
    const collection = dao.findCollectionByNameOrId(nombre);
    collection.listRule = regla;
    collection.viewRule = regla;
    collection.createRule = regla;
    collection.updateRule = regla;
    dao.saveCollection(collection);
  });
  return null;
}, (db) => {
  const dao = new Dao(db);
  const regla = '@request.auth.id != "" && (@request.auth.rol = "admin" || @request.auth.modulos ?= "fichadas")';
  ['fichadas_vacaciones', 'fichadas_grupos_restriccion'].forEach((nombre) => {
    const collection = dao.findCollectionByNameOrId(nombre);
    collection.listRule = regla;
    collection.viewRule = regla;
    collection.createRule = regla;
    collection.updateRule = regla;
    dao.saveCollection(collection);
  });
  return null;
})
