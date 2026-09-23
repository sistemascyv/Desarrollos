/// <reference path="../pb_data/types.d.ts" />
// El operador "?=" solo funciona contra campos multi-valor de verdad
// (select/relation con maxSelect>1, o file) -- "modulos" en usuarios es un
// campo json, así que "@request.auth.modulos ?= \"x\"" nunca da true para
// nadie que no sea admin. Quedó así en las colecciones creadas antes de
// que se detectara el bug (fichadas, reportes_archivo -- "cheques" ya se
// había corregido en 1788480000_updated_cheques.js). El patrón correcto
// ("~") ya se usa en las colecciones más nuevas (planilla, bot_tarifas).
//
// Nota: "typeof regla === 'string'" da false para estas reglas en este
// runtime JSVM (no son un string primitivo de JS aunque se comporten como
// uno) -- por eso acá se usa un chequeo por verdad (regla ? ... : regla)
// en vez de typeof, si no el reemplazo queda armado pero nunca se aplica.
migrate((db) => {
  const dao = new Dao(db);

  function arreglar(nombre) {
    const c = dao.findCollectionByNameOrId(nombre);
    const fix = (r) => r ? r.split('modulos ?=').join('modulos ~') : r;
    c.listRule = fix(c.listRule);
    c.viewRule = fix(c.viewRule);
    c.createRule = fix(c.createRule);
    c.updateRule = fix(c.updateRule);
    c.deleteRule = fix(c.deleteRule);
    dao.saveCollection(c);
  }

  ['fichadas_empresas', 'fichadas_horarios', 'fichadas_legajos', 'fichadas_marcas', 'fichadas_novedades', 'fichadas_feriados', 'reportes_archivo'].forEach(arreglar);
}, (db) => {
  const dao = new Dao(db);

  function revertir(nombre) {
    const c = dao.findCollectionByNameOrId(nombre);
    const fix = (r) => r ? r.split('modulos ~').join('modulos ?=') : r;
    c.listRule = fix(c.listRule);
    c.viewRule = fix(c.viewRule);
    c.createRule = fix(c.createRule);
    c.updateRule = fix(c.updateRule);
    c.deleteRule = fix(c.deleteRule);
    dao.saveCollection(c);
  }

  ['fichadas_empresas', 'fichadas_horarios', 'fichadas_legajos', 'fichadas_marcas', 'fichadas_novedades', 'fichadas_feriados', 'reportes_archivo'].forEach(revertir);
})
