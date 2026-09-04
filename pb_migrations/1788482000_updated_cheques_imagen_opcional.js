/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("cheqctrl0001pnd");

  // Carga manual (sin foto): solo CUIT + N° de cheque, cuando el
  // usuario no tiene una captura para pegar o el OCR no detectó nada.
  // La imagen deja de ser obligatoria para permitir esos casos.
  const campoImagen = collection.schema.getFieldById("chq0img1");
  campoImagen.required = false;

  return dao.saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("cheqctrl0001pnd");

  const campoImagen = collection.schema.getFieldById("chq0img1");
  campoImagen.required = true;

  return dao.saveCollection(collection);
})
