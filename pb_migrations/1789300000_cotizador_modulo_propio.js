/// <reference path="../pb_data/types.d.ts" />
// El Cotizador pasa a tener su propio modulo de permiso ("cotizador"),
// separado de "Tarifas" (cuadro_tarifario) -- hasta ahora compartian el
// mismo modulo. listRule/viewRule/createRule de cotizaciones y
// cotizacion_items pasan a chequear "cotizador" en vez de
// "cuadro_tarifario". updateRule (null) y deleteRule (admin) no se
// tocan. Nadie queda con el modulo "cotizador" tildado por este cambio
// -- hay que asignarlo a mano desde Administracion -> Usuarios a quien
// lo necesite (antes lo tenian automaticamente quienes ya tenian
// "Tarifas").
migrate((db) => {
  const dao = new Dao(db);
  const regla = '@request.auth.id != "" && (@request.auth.rol = "admin" || @request.auth.modulos ~ "cotizador")';
  ['cotizaciones', 'cotizacion_items'].forEach((nombre) => {
    const collection = dao.findCollectionByNameOrId(nombre);
    collection.listRule = regla;
    collection.viewRule = regla;
    collection.createRule = regla;
    dao.saveCollection(collection);
  });
  return null;
}, (db) => {
  const dao = new Dao(db);
  const regla = '@request.auth.id != "" && (@request.auth.rol = "admin" || @request.auth.modulos ~ "cuadro_tarifario")';
  ['cotizaciones', 'cotizacion_items'].forEach((nombre) => {
    const collection = dao.findCollectionByNameOrId(nombre);
    collection.listRule = regla;
    collection.viewRule = regla;
    collection.createRule = regla;
    dao.saveCollection(collection);
  });
  return null;
})
