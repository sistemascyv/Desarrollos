/// <reference path="../pb_data/types.d.ts" />
// Hallazgo Critico de la revision final: igual que 1789050000, pero acá
// el "?=" roto (no funciona contra "modulos" porque ese campo es json
// plano, no una relacion/select multi-valor de verdad) se reintrodujo en
// reglas NUEVAS de esta sesion (fichadas_vacaciones,
// fichadas_grupos_restriccion, fichadas_configuracion) y además
// "contagió" a seis colecciones que ya andaban bien con "~" al
// intentar estandarizarlas en 1789390000/1789400000
// (fichadas_empresas/legajos/marcas/novedades/feriados/horarios -- las
// últimas cinco solo en list/view, que es lo único que esos dos
// migrations tocaron). De paso se corrige fichadas_legajo_historial,
// que tiene el mismo bug desde antes de esta sesion (su createRule y
// updateRule nunca se habían tocado). Confirmado con usuarios reales de
// prueba contra la API, no solo revisando el texto de la regla -- ver
// docs/superpowers/plans/2026-11-11-fichadas-vacaciones-licencias.md.
migrate((db) => {
  const dao = new Dao(db);
  const fix = (r) => r ? r.split('modulos ?=').join('modulos ~') : r;

  const objetivos = [
    { nombre: 'fichadas_vacaciones', campos: ['listRule', 'viewRule', 'createRule', 'updateRule'] },
    { nombre: 'fichadas_grupos_restriccion', campos: ['listRule', 'viewRule', 'createRule', 'updateRule'] },
    { nombre: 'fichadas_configuracion', campos: ['listRule', 'viewRule', 'updateRule'] },
    { nombre: 'fichadas_legajo_historial', campos: ['listRule', 'viewRule', 'createRule', 'updateRule'] },
    { nombre: 'fichadas_empresas', campos: ['listRule', 'viewRule'] },
    { nombre: 'fichadas_legajos', campos: ['listRule', 'viewRule'] },
    { nombre: 'fichadas_marcas', campos: ['listRule', 'viewRule'] },
    { nombre: 'fichadas_novedades', campos: ['listRule', 'viewRule'] },
    { nombre: 'fichadas_feriados', campos: ['listRule', 'viewRule'] },
    { nombre: 'fichadas_horarios', campos: ['listRule', 'viewRule'] },
  ];

  objetivos.forEach(({ nombre, campos }) => {
    const c = dao.findCollectionByNameOrId(nombre);
    campos.forEach((campo) => { c[campo] = fix(c[campo]); });
    dao.saveCollection(c);
  });

  return null;
}, (db) => {
  const dao = new Dao(db);
  const fix = (r) => r ? r.split('modulos ~').join('modulos ?=') : r;

  const objetivos = [
    { nombre: 'fichadas_vacaciones', campos: ['listRule', 'viewRule', 'createRule', 'updateRule'] },
    { nombre: 'fichadas_grupos_restriccion', campos: ['listRule', 'viewRule', 'createRule', 'updateRule'] },
    { nombre: 'fichadas_configuracion', campos: ['listRule', 'viewRule', 'updateRule'] },
    { nombre: 'fichadas_legajo_historial', campos: ['listRule', 'viewRule', 'createRule', 'updateRule'] },
    { nombre: 'fichadas_empresas', campos: ['listRule', 'viewRule'] },
    { nombre: 'fichadas_legajos', campos: ['listRule', 'viewRule'] },
    { nombre: 'fichadas_marcas', campos: ['listRule', 'viewRule'] },
    { nombre: 'fichadas_novedades', campos: ['listRule', 'viewRule'] },
    { nombre: 'fichadas_feriados', campos: ['listRule', 'viewRule'] },
    { nombre: 'fichadas_horarios', campos: ['listRule', 'viewRule'] },
  ];

  objetivos.forEach(({ nombre, campos }) => {
    const c = dao.findCollectionByNameOrId(nombre);
    campos.forEach((campo) => { c[campo] = fix(c[campo]); });
    dao.saveCollection(c);
  });

  return null;
})
