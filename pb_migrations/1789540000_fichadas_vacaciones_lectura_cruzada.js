/// <reference path="../pb_data/types.d.ts" />
// procesarPeriodo() (motor.ts) ahora toma también fichadas_vacaciones para
// que un período de vacaciones asignado cuente como novedad "Vacaciones"
// en los días que cubre, en vez de aparecer AUSENTE -- lo usan Fichadas →
// Resultados ("fichadas"), Sueldos → Liquidación Administrativos
// ("sueldos") y Reportes RRHH ("reportes"), además del propio módulo
// Vacaciones que ya la leía. Hoy fichadas_vacaciones solo permite leer con
// el módulo "vacaciones" (desde 1789380000, cuando se separó como módulo
// propio) -- sin este cambio, cualquiera de esos otros tres módulos
// recibiría la lista vacía en silencio (mismo bug de permisos cruzados ya
// documentado varias veces en este proyecto). Solo lectura -- create/update
// siguen restringidos a "vacaciones" (solo esa pantalla crea/edita
// períodos).
migrate((db) => {
  const dao = new Dao(db);
  const regla = '@request.auth.id != "" && (@request.auth.rol = "admin" || @request.auth.modulos ~ "vacaciones" || @request.auth.modulos ~ "fichadas" || @request.auth.modulos ~ "sueldos" || @request.auth.modulos ~ "reportes")';
  const collection = dao.findCollectionByNameOrId('fichadas_vacaciones');
  collection.listRule = regla;
  collection.viewRule = regla;
  dao.saveCollection(collection);
  return null;
}, (db) => {
  const dao = new Dao(db);
  const reglaOriginal = '@request.auth.id != "" && (@request.auth.rol = "admin" || @request.auth.modulos ~ "vacaciones")';
  const collection = dao.findCollectionByNameOrId('fichadas_vacaciones');
  collection.listRule = reglaOriginal;
  collection.viewRule = reglaOriginal;
  dao.saveCollection(collection);
  return null;
})
