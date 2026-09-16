/// <reference path="../pb_data/types.d.ts" />
// Las marcas importadas antes de que se agregara el alias "cortejarena"
// -> BUENOS AIRES (ver 273ce85) quedaron con deposito="DESCONOCIDO"
// grabado en el registro -- reimportar el mismo .bak no las corrige
// porque el hook de import solo agrega marcas nuevas, nunca pisa el
// deposito de una que ya existe. Se corrigen las que vinieron de un
// archivo con "cortejarena" en el nombre.
migrate((db) => {
  const dao = new Dao(db);
  const marcasColl = dao.findCollectionByNameOrId('fichadas_marcas');

  let corregidas = 0, sinArchivo = 0;
  dao.findRecordsByFilter(marcasColl.id, "deposito = 'DESCONOCIDO'", '', 5000, 0).forEach((r) => {
    const archivo = (r.get('archivo_origen') || '').toLowerCase();
    if (archivo.includes('cortejarena')) {
      r.set('deposito', 'BUENOS AIRES');
      dao.saveRecord(r);
      corregidas++;
    } else {
      sinArchivo++;
    }
  });
  console.log('fichadas: depositos corregidos (cortejarena -> BUENOS AIRES): ' + corregidas + ', sin matchear: ' + sinArchivo);

  return null;
}, (db) => {
  return null; // no-op: corrección de datos
})
