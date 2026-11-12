/// <reference path="../pb_data/types.d.ts" />
// Liquidación de Vacaciones: colección nueva con los parámetros de
// convenio por categoría (Plus Vacacional, divisor mensual, y los 6 %
// de descuento), más categoria/basico en fichadas_legajos. Ver
// docs/superpowers/specs/2026-11-11-liquidacion-vacaciones-design.md.
migrate((db) => {
  const dao = new Dao(db);
  dao.saveCollection(new Collection({
    "id": "fchd0categor01",
    "name": "fichadas_categorias",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false, "id": "fcc0nombre001", "name": "nombre", "type": "text",
        "required": true, "presentable": true, "unique": false,
        "options": { "min": null, "max": null, "pattern": "" }
      },
      {
        "system": false, "id": "fcc0plusvac01", "name": "plus_vacacional", "type": "number",
        "required": true, "presentable": true, "unique": false,
        "options": { "min": 0, "max": null, "noDecimal": false }
      },
      {
        "system": false, "id": "fcc0divisor01", "name": "divisor_mensual", "type": "number",
        "required": true, "presentable": true, "unique": false,
        "options": { "min": 1, "max": null, "noDecimal": false }
      },
      {
        "system": false, "id": "fcc0pctjubil1", "name": "pct_jubilacion", "type": "number",
        "required": true, "presentable": false, "unique": false,
        "options": { "min": 0, "max": 100, "noDecimal": false }
      },
      {
        "system": false, "id": "fcc0pctley191", "name": "pct_ley19032", "type": "number",
        "required": true, "presentable": false, "unique": false,
        "options": { "min": 0, "max": 100, "noDecimal": false }
      },
      {
        "system": false, "id": "fcc0pctobrso1", "name": "pct_obra_social", "type": "number",
        "required": true, "presentable": false, "unique": false,
        "options": { "min": 0, "max": 100, "noDecimal": false }
      },
      {
        "system": false, "id": "fcc0pctansal1", "name": "pct_ansal", "type": "number",
        "required": true, "presentable": false, "unique": false,
        "options": { "min": 0, "max": 100, "noDecimal": false }
      },
      {
        "system": false, "id": "fcc0pctsindi1", "name": "pct_cuota_sindical", "type": "number",
        "required": true, "presentable": false, "unique": false,
        "options": { "min": 0, "max": 100, "noDecimal": false }
      },
      {
        "system": false, "id": "fcc0pctsepel1", "name": "pct_seguro_sepelio", "type": "number",
        "required": true, "presentable": false, "unique": false,
        "options": { "min": 0, "max": 100, "noDecimal": false }
      }
    ],
    "indexes": [],
    "listRule": "@request.auth.id != \"\" && (@request.auth.rol = \"admin\" || @request.auth.modulos ~ \"vacaciones\")",
    "viewRule": "@request.auth.id != \"\" && (@request.auth.rol = \"admin\" || @request.auth.modulos ~ \"vacaciones\")",
    "createRule": "@request.auth.id != \"\" && (@request.auth.rol = \"admin\" || @request.auth.modulos ~ \"vacaciones\")",
    "updateRule": "@request.auth.id != \"\" && (@request.auth.rol = \"admin\" || @request.auth.modulos ~ \"vacaciones\")",
    "deleteRule": "@request.auth.rol = \"admin\"",
    "options": {}
  }));

  const legajos = dao.findCollectionByNameOrId('fichadas_legajos');
  legajos.schema.addField(new SchemaField({
    system: false, id: 'fcl0categoria1', name: 'categoria', type: 'relation',
    required: false, presentable: false, unique: false,
    options: {
      collectionId: 'fchd0categor01', cascadeDelete: false,
      minSelect: null, maxSelect: 1, displayFields: ['nombre'],
    },
  }));
  legajos.schema.addField(new SchemaField({
    system: false, id: 'fcl0basico001', name: 'basico', type: 'number',
    required: false, presentable: false, unique: false,
    options: { min: 0, max: null, noDecimal: false },
  }));
  dao.saveCollection(legajos);

  return null;
}, (db) => {
  const dao = new Dao(db);
  const legajos = dao.findCollectionByNameOrId('fichadas_legajos');
  legajos.schema.removeField('fcl0categoria1');
  legajos.schema.removeField('fcl0basico001');
  dao.saveCollection(legajos);
  try { dao.deleteCollection(dao.findCollectionByNameOrId('fichadas_categorias')); } catch (e) { /* no existía */ }
  return null;
})
