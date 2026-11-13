/// <reference path="../pb_data/types.d.ts" />
// Personal (ex-pestaña Configuración de Fichadas: Empleados, Horarios,
// Horas extra fijas, Plantillas, Áreas) se separa de Fichadas como
// módulo propio del menú -- necesita su propio permiso para leer y
// escribir legajos/horarios/áreas. Se agrega "personal" como
// alternativa de lectura en fichadas_legajos/fichadas_horarios/
// fichadas_empresas (sin sacarle nada a fichadas/reportes/vacaciones,
// que siguen necesitando leer lo mismo), y se corta limpio el
// create/update de esas 3 colecciones de "fichadas" a "personal" --
// nada en Carga/Resultados (lo que queda de Fichadas) crea o edita
// legajos/horarios/áreas, solo los lee. deleteRule de las 3 ya era
// admin-only, se deja igual. También se abre la lectura de
// fichadas_categorias a "personal" (create/update/delete siguen siendo
// solo de "vacaciones"/admin, los edita la pantalla de Categorías).
migrate((db) => {
  const dao = new Dao(db);

  const reglaLecturaConPersonal = '@request.auth.id != "" && (@request.auth.rol = "admin" || @request.auth.modulos ~ "fichadas" || @request.auth.modulos ~ "reportes" || @request.auth.modulos ~ "vacaciones" || @request.auth.modulos ~ "personal")';
  const reglaEscrituraPersonal = '@request.auth.id != "" && (@request.auth.rol = "admin" || @request.auth.modulos ~ "personal")';
  ['fichadas_legajos', 'fichadas_horarios', 'fichadas_empresas'].forEach((nombre) => {
    const collection = dao.findCollectionByNameOrId(nombre);
    collection.listRule = reglaLecturaConPersonal;
    collection.viewRule = reglaLecturaConPersonal;
    collection.createRule = reglaEscrituraPersonal;
    collection.updateRule = reglaEscrituraPersonal;
    dao.saveCollection(collection);
  });

  const reglaCategoriasConPersonal = '@request.auth.id != "" && (@request.auth.rol = "admin" || @request.auth.modulos ~ "vacaciones" || @request.auth.modulos ~ "fichadas" || @request.auth.modulos ~ "personal")';
  const categorias = dao.findCollectionByNameOrId('fichadas_categorias');
  categorias.listRule = reglaCategoriasConPersonal;
  categorias.viewRule = reglaCategoriasConPersonal;
  dao.saveCollection(categorias);

  return null;
}, (db) => {
  const dao = new Dao(db);

  const reglaLecturaOriginal = '@request.auth.id != "" && (@request.auth.rol = "admin" || @request.auth.modulos ~ "fichadas" || @request.auth.modulos ~ "reportes" || @request.auth.modulos ~ "vacaciones")';
  const reglaEscrituraOriginal = '@request.auth.id != "" && (@request.auth.rol = "admin" || @request.auth.modulos ~ "fichadas")';
  ['fichadas_legajos', 'fichadas_horarios', 'fichadas_empresas'].forEach((nombre) => {
    const collection = dao.findCollectionByNameOrId(nombre);
    collection.listRule = reglaLecturaOriginal;
    collection.viewRule = reglaLecturaOriginal;
    collection.createRule = reglaEscrituraOriginal;
    collection.updateRule = reglaEscrituraOriginal;
    dao.saveCollection(collection);
  });

  const reglaCategoriasOriginal = '@request.auth.id != "" && (@request.auth.rol = "admin" || @request.auth.modulos ~ "vacaciones" || @request.auth.modulos ~ "fichadas")';
  const categorias = dao.findCollectionByNameOrId('fichadas_categorias');
  categorias.listRule = reglaCategoriasOriginal;
  categorias.viewRule = reglaCategoriasOriginal;
  dao.saveCollection(categorias);

  return null;
})
