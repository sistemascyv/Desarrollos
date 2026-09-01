/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("tjsyat03iwz89tz")

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "bb97nsll",
    "name": "modulos",
    "type": "json",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "maxSize": 2000000
    }
  }))

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("tjsyat03iwz89tz")

  // remove
  collection.schema.removeField("bb97nsll")

  return dao.saveCollection(collection)
})
