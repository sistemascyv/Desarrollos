/// <reference path="../pb_data/types.d.ts" />
// El usuario decidió que borrar vacaciones/grupos de restricción no sea
// solo cosa de admin -- cualquiera con el módulo "vacaciones" también
// puede, igual que ya puede crear/editar. La UI (AsignarVacacionesSub.tsx,
// GruposRestriccionSub.tsx) ya mostraba el botón "Eliminar" a cualquiera
// con el módulo, esto solo alinea la regla del backend. Ver
// docs/superpowers/plans/2026-11-11-fichadas-vacaciones-licencias.md.
migrate((db) => {
  const dao = new Dao(db);
  const regla = '@request.auth.id != "" && (@request.auth.rol = "admin" || @request.auth.modulos ~ "vacaciones")';
  ['fichadas_vacaciones', 'fichadas_grupos_restriccion'].forEach((nombre) => {
    const collection = dao.findCollectionByNameOrId(nombre);
    collection.deleteRule = regla;
    dao.saveCollection(collection);
  });
  return null;
}, (db) => {
  const dao = new Dao(db);
  ['fichadas_vacaciones', 'fichadas_grupos_restriccion'].forEach((nombre) => {
    const collection = dao.findCollectionByNameOrId(nombre);
    collection.deleteRule = '@request.auth.rol = "admin"';
    dao.saveCollection(collection);
  });
  return null;
})
