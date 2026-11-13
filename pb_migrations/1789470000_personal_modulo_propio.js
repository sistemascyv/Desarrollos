/// <reference path="../pb_data/types.d.ts" />
// Personal (ex-pestaña Configuración de Fichadas: Empleados, Horarios,
// Horas extra fijas, Plantillas, Áreas) se separa de Fichadas como
// módulo propio del menú -- necesita su propio permiso para leer y
// escribir legajos/horarios/áreas/historial. Se agrega "personal" como
// alternativa de lectura en fichadas_legajos/fichadas_horarios/
// fichadas_empresas/fichadas_legajo_historial (sin sacarle nada a
// fichadas/reportes/vacaciones, que siguen necesitando leer lo mismo),
// y se corta limpio el create/update de esas 4 colecciones de
// "fichadas" a "personal" -- nada en Carga/Resultados (lo que queda de
// Fichadas) crea o edita legajos/horarios/áreas/historial, solo los
// lee. PersonalPage.tsx también lee y escribe fichadas_legajo_historial
// (flujo de Reactivar: busca si ya existe una etapa cerrada para el
// legajo y la crea antes de actualizar el legajo), por eso entra en el
// mismo corte que las otras 3. deleteRule de las 4 ya era admin-only,
// se deja igual. También se abre la lectura de fichadas_categorias a
// "personal" (create/update/delete siguen siendo solo de
// "vacaciones"/admin, los edita la pantalla de Categorías).
migrate((db) => {
  const dao = new Dao(db);

  const reglaLecturaConPersonal = '@request.auth.id != "" && (@request.auth.rol = "admin" || @request.auth.modulos ~ "fichadas" || @request.auth.modulos ~ "reportes" || @request.auth.modulos ~ "vacaciones" || @request.auth.modulos ~ "personal")';
  const reglaEscrituraPersonal = '@request.auth.id != "" && (@request.auth.rol = "admin" || @request.auth.modulos ~ "personal")';
  ['fichadas_legajos', 'fichadas_horarios', 'fichadas_empresas', 'fichadas_legajo_historial'].forEach((nombre) => {
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
  ['fichadas_legajos', 'fichadas_horarios', 'fichadas_empresas', 'fichadas_legajo_historial'].forEach((nombre) => {
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
