/// <reference path="../pb_data/types.d.ts" />
// Bug encontrado al probar concurrencia en Cotizador antes del rollout a
// varios usuarios: 20 creates simultaneos contra la misma sucursal
// terminaron con solo 6 "numero" distintos (hasta 5 cotizaciones con el
// mismo numero). Causa raiz: el campo "numero" tiene "unique: true" en el
// esquema (cotizaciones/vales_caja/recibos), pero en esta version de
// PocketBase eso NO crea ninguna restriccion real en la base -- la
// proteccion real es un indice SQL, y los tres "indexes" estaban vacios
// ([]). El comentario de 1789070000_fix_vales_caja_numero_no_required.js
// que decia "la columna sigue siendo unique, el respaldo no se pierde"
// era incorrecto -- confirmado en vivo que no habia ningun respaldo.
//
// Este indice no elimina la carrera (dos requests pueden seguir leyendo
// el mismo "ultimo numero" antes de que el otro guarde), pero convierte
// el resultado de "numero duplicado silencioso" en "el segundo create
// falla con un error claro" -- y el frontend de Cotizador ya reintenta
// automaticamente ante ese error especifico (ver CotizadorPage.tsx).
// Vale de Caja y Recibos quedan con la misma proteccion de base, pero sin
// reintento automatico en el frontend todavia (uso minimo hoy; agregar
// el mismo reintento ahi antes de que esos modulos tengan varios
// usuarios simultaneos).
migrate((db) => {
  const dao = new Dao(db);

  const cotizaciones = dao.findCollectionByNameOrId('cotizaciones');
  cotizaciones.indexes = ['CREATE UNIQUE INDEX `idx_cotizaciones_numero` ON `cotizaciones` (`numero`)'];
  dao.saveCollection(cotizaciones);

  const valesCaja = dao.findCollectionByNameOrId('vales_caja');
  valesCaja.indexes = ['CREATE UNIQUE INDEX `idx_vales_caja_numero` ON `vales_caja` (`numero`)'];
  dao.saveCollection(valesCaja);

  const recibos = dao.findCollectionByNameOrId('recibos');
  recibos.indexes = ['CREATE UNIQUE INDEX `idx_recibos_numero` ON `recibos` (`numero`)'];
  dao.saveCollection(recibos);
}, (db) => {
  const dao = new Dao(db);

  const cotizaciones = dao.findCollectionByNameOrId('cotizaciones');
  cotizaciones.indexes = [];
  dao.saveCollection(cotizaciones);

  const valesCaja = dao.findCollectionByNameOrId('vales_caja');
  valesCaja.indexes = [];
  dao.saveCollection(valesCaja);

  const recibos = dao.findCollectionByNameOrId('recibos');
  recibos.indexes = [];
  dao.saveCollection(recibos);
})
