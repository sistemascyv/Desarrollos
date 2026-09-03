/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("cheqctrl0001pnd");

  // El operador "?=" (any/al menos uno) solo funciona sobre campos
  // multi-valor reales (select/relation/file múltiples) — "modulos" es un
  // campo "json" genérico, así que "?=" nunca matcheaba y esta regla
  // devolvía 0 resultados en silencio para cualquier usuario no-admin
  // (confirmado: un empleado con el módulo asignado entraba a la pantalla
  // pero veía la lista de cheques siempre vacía). Se reemplaza por "~"
  // (LIKE), que sí busca la substring dentro del JSON serializado del
  // campo y funciona para cualquier tamaño de array.
  const regla = "@request.auth.id != \"\" && (@request.auth.rol = \"admin\" || @request.auth.modulos ~ \"control_cheques\")";
  collection.listRule = regla;
  collection.viewRule = regla;
  collection.createRule = regla;
  collection.updateRule = regla;

  return dao.saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("cheqctrl0001pnd");

  const regla = "@request.auth.id != \"\" && (@request.auth.rol = \"admin\" || @request.auth.modulos ?= \"control_cheques\")";
  collection.listRule = regla;
  collection.viewRule = regla;
  collection.createRule = regla;
  collection.updateRule = regla;

  return dao.saveCollection(collection);
})
