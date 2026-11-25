/// <reference path="../pb_data/types.d.ts" />
// Choferes/Vehiculos/Rutas/Clientes salen de "Administracion" (antes
// create/update/delete = solo admin) y pasan a tener permiso granular por
// modulo, igual que el resto del sistema -- las pantallas nuevas de
// Personal/Mantenimiento/Comercial (tareas 2-6) asumen esto ya aplicado.
// Nota: se usa el operador "~" (contains), no "?=" -- "modulos" es un campo
// JSON plano, no una relacion/select multi-valor real, y "?=" ya se
// demostro roto contra ese campo (ver 1789410000_corregir_operador_modulos_a_like.js).
migrate((db) => {
  const dao = new Dao(db);

  const reglas = [
    { id: 'henbj40l3bk5gl8', modulo: 'personal' },         // choferes
    { id: 'drkysi4dr66cl89', modulo: 'vehiculos' },         // vehiculos
    { id: 'kerhtv3kxuoku1q', modulo: 'rutas_frecuentes' },  // rutas
    { id: 'ao9eo8ib8n0a6cp', modulo: 'clientes' },          // clientes
  ];

  for (const { id, modulo } of reglas) {
    const collection = dao.findCollectionByNameOrId(id);
    const regla = '@request.auth.id != "" && (@request.auth.rol = "admin" || @request.auth.modulos ~ "' + modulo + '")';
    collection.createRule = regla;
    collection.updateRule = regla;
    collection.deleteRule = regla;
    dao.saveCollection(collection);
  }

  return null;
}, (db) => {
  const dao = new Dao(db);
  const ids = ['henbj40l3bk5gl8', 'drkysi4dr66cl89', 'kerhtv3kxuoku1q', 'ao9eo8ib8n0a6cp'];

  for (const id of ids) {
    const collection = dao.findCollectionByNameOrId(id);
    collection.createRule = '@request.auth.rol = "admin"';
    collection.updateRule = '@request.auth.rol = "admin"';
    collection.deleteRule = '@request.auth.rol = "admin"';
    dao.saveCollection(collection);
  }

  return null;
})
