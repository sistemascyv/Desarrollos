/// <reference path="../pb_data/types.d.ts" />
// Reportes (Horas Extras/Ausentismo/Rotación) se separa de Fichadas como
// módulo propio del menú -- necesita leer los mismos datos que ya leía
// Fichadas, más permiso de escritura sobre fichadas_configuracion (ahí
// vive "Guardar horas posibles"). Se agrega "reportes" como alternativa
// a "fichadas", sin sacarle nada a Fichadas (Resultados sigue
// necesitando lo mismo). Ver
// docs/superpowers/plans/2026-11-11-fichadas-vacaciones-licencias.md.
migrate((db) => {
  const dao = new Dao(db);
  const reglaLectura = '@request.auth.id != "" && (@request.auth.rol = "admin" || @request.auth.modulos ?= "fichadas" || @request.auth.modulos ?= "reportes")';
  const soloLectura = ['fichadas_empresas', 'fichadas_legajos', 'fichadas_marcas', 'fichadas_novedades', 'fichadas_feriados', 'fichadas_legajo_historial'];
  soloLectura.forEach((nombre) => {
    const collection = dao.findCollectionByNameOrId(nombre);
    collection.listRule = reglaLectura;
    collection.viewRule = reglaLectura;
    dao.saveCollection(collection);
  });

  const configuracion = dao.findCollectionByNameOrId('fichadas_configuracion');
  configuracion.listRule = reglaLectura;
  configuracion.viewRule = reglaLectura;
  configuracion.updateRule = reglaLectura;
  dao.saveCollection(configuracion);
  return null;
}, (db) => {
  const dao = new Dao(db);
  const reglaOriginal = '@request.auth.id != "" && (@request.auth.rol = "admin" || @request.auth.modulos ?= "fichadas")';
  const soloLectura = ['fichadas_empresas', 'fichadas_legajos', 'fichadas_marcas', 'fichadas_novedades', 'fichadas_feriados', 'fichadas_legajo_historial'];
  soloLectura.forEach((nombre) => {
    const collection = dao.findCollectionByNameOrId(nombre);
    collection.listRule = reglaOriginal;
    collection.viewRule = reglaOriginal;
    dao.saveCollection(collection);
  });
  const configuracion = dao.findCollectionByNameOrId('fichadas_configuracion');
  configuracion.listRule = reglaOriginal;
  configuracion.viewRule = reglaOriginal;
  configuracion.updateRule = reglaOriginal;
  dao.saveCollection(configuracion);
  return null;
})
