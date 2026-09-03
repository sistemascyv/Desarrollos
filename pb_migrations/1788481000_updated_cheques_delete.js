/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("cheqctrl0001pnd");

  // El botón "Limpiar lista" lo usa cualquier usuario con el módulo
  // asignado (no solo admin) — con "deleteRule" restringido a admin,
  // PocketBase le devolvía a cualquier otro usuario "The requested
  // resource wasn't found." al intentar borrar (así responde cuando la
  // regla no matchea el registro, no un 403). Se alinea con el resto de
  // las reglas de esta colección.
  collection.deleteRule = "@request.auth.id != \"\" && (@request.auth.rol = \"admin\" || @request.auth.modulos ~ \"control_cheques\")";

  return dao.saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("cheqctrl0001pnd");

  collection.deleteRule = "@request.auth.rol = \"admin\"";

  return dao.saveCollection(collection);
})
