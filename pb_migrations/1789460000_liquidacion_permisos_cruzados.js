/// <reference path="../pb_data/types.d.ts" />
// Liquidación de Vacaciones: el botón "Liquidar" vive en el módulo
// "vacaciones" pero necesita leer datos que hasta ahora solo estaban
// abiertos a "fichadas"/"reportes" (marcas, novedades, feriados,
// historial, horarios) -- confirmado en vivo que un usuario con SOLO
// "vacaciones" obtenía listas vacías en silencio (PocketBase filtra en
// vez de devolver error), dando horas extra = 0 sin ningún aviso. Se
// agrega "vacaciones" como alternativa de lectura en esas 5
// colecciones. También se abre la lectura de fichadas_categorias a
// "fichadas" (sin tocar create/update/delete, que siguen siendo solo de
// "vacaciones"), para que la pantalla de Empleados pueda mostrar la
// categoría real de cada legajo. De paso se saca el required:true de
// los 8 campos numéricos de fichadas_categorias -- PocketBase rechaza
// un 0 literal en un number required, y la validación real ya la hace
// CategoriasSub.tsx (rechaza vacíos y divisor_mensual<=0) desde
// ea1498f. Ver docs/superpowers/plans/2026-11-12-liquidacion-vacaciones.md.
migrate((db) => {
  const dao = new Dao(db);

  const reglaConVacaciones = '@request.auth.id != "" && (@request.auth.rol = "admin" || @request.auth.modulos ~ "fichadas" || @request.auth.modulos ~ "reportes" || @request.auth.modulos ~ "vacaciones")';
  ['fichadas_marcas', 'fichadas_novedades', 'fichadas_feriados', 'fichadas_legajo_historial', 'fichadas_horarios'].forEach((nombre) => {
    const collection = dao.findCollectionByNameOrId(nombre);
    collection.listRule = reglaConVacaciones;
    collection.viewRule = reglaConVacaciones;
    dao.saveCollection(collection);
  });

  const reglaCategoriasLectura = '@request.auth.id != "" && (@request.auth.rol = "admin" || @request.auth.modulos ~ "vacaciones" || @request.auth.modulos ~ "fichadas")';
  const categorias = dao.findCollectionByNameOrId('fichadas_categorias');
  categorias.listRule = reglaCategoriasLectura;
  categorias.viewRule = reglaCategoriasLectura;

  const camposNumericos = ['plus_vacacional', 'divisor_mensual', 'pct_jubilacion', 'pct_ley19032', 'pct_obra_social', 'pct_ansal', 'pct_cuota_sindical', 'pct_seguro_sepelio'];
  camposNumericos.forEach((nombreCampo) => {
    categorias.schema.getFieldByName(nombreCampo).required = false;
  });
  dao.saveCollection(categorias);

  return null;
}, (db) => {
  const dao = new Dao(db);

  const reglaSinVacaciones = '@request.auth.id != "" && (@request.auth.rol = "admin" || @request.auth.modulos ~ "fichadas" || @request.auth.modulos ~ "reportes")';
  ['fichadas_marcas', 'fichadas_novedades', 'fichadas_feriados', 'fichadas_legajo_historial', 'fichadas_horarios'].forEach((nombre) => {
    const collection = dao.findCollectionByNameOrId(nombre);
    collection.listRule = reglaSinVacaciones;
    collection.viewRule = reglaSinVacaciones;
    dao.saveCollection(collection);
  });

  const reglaCategoriasOriginal = '@request.auth.id != "" && (@request.auth.rol = "admin" || @request.auth.modulos ~ "vacaciones")';
  const categorias = dao.findCollectionByNameOrId('fichadas_categorias');
  categorias.listRule = reglaCategoriasOriginal;
  categorias.viewRule = reglaCategoriasOriginal;

  const camposNumericos = ['plus_vacacional', 'divisor_mensual', 'pct_jubilacion', 'pct_ley19032', 'pct_obra_social', 'pct_ansal', 'pct_cuota_sindical', 'pct_seguro_sepelio'];
  camposNumericos.forEach((nombreCampo) => {
    categorias.schema.getFieldByName(nombreCampo).required = true;
  });
  dao.saveCollection(categorias);

  return null;
})
