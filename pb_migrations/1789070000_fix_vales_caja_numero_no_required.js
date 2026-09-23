/// <reference path="../pb_data/types.d.ts" />
// Bug encontrado en la revisión de Task 9 (Vale de Caja): PocketBase valida
// los campos "required" ANTES de correr onRecordBeforeCreateRequest -- así
// que "numero" (marcado required en la migración original) rechazaba con
// "Missing required value" cualquier create que no mandara el campo, que es
// exactamente lo que hace el formulario real (nunca manda numero a
// propósito, lo asigna el hook). Confirmado en vivo: el mismo payload que
// arma ValeCajaPage.tsx fallaba con required=true y funcionaba (asignando
// numero=1 correctamente) con required=false. La columna sigue siendo
// "unique", así que el respaldo contra duplicados a nivel de base no se
// pierde -- solo se saca la validación de "tiene que venir en el pedido".
migrate((db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId('vales_caja');
  const campo = collection.schema.getFieldById('vlc0numero01');
  campo.required = false;
  return dao.saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId('vales_caja');
  const campo = collection.schema.getFieldById('vlc0numero01');
  campo.required = true;
  return dao.saveCollection(collection);
})
