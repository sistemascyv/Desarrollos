/// <reference path="../pb_data/types.d.ts" />
// Agrega el campo "dni" a fichadas_legajos y completa el de los legajos
// que sí lo traían en el export original de CINTIA (NroDoc) — hace
// falta para que el Parte Diario tenga la columna DNI/CUIL igual que
// el que genera CINTIA hoy.
migrate((db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId('fichadas_legajos');

  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "fcl0dni00001",
    "name": "dni",
    "type": "text",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "min": null,
      "max": null,
      "pattern": ""
    }
  }));
  dao.saveCollection(collection);

  const datos = [{"tarjeta":"10246","dni":"24522260"},{"tarjeta":"60362","dni":"26797351"},{"tarjeta":"20363","dni":"31512697"},{"tarjeta":"20369","dni":"32926754"},{"tarjeta":"20370","dni":"34289332"},{"tarjeta":"20371","dni":"36447517"},{"tarjeta":"30082","dni":"17967487"},{"tarjeta":"30087","dni":"20699190"},{"tarjeta":"30135","dni":"23882797"},{"tarjeta":"30222","dni":"18504299"},{"tarjeta":"30300","dni":"27777859"},{"tarjeta":"30302","dni":"25393578"},{"tarjeta":"30316","dni":"22195483"},{"tarjeta":"30330","dni":"22872722"},{"tarjeta":"30379","dni":"94482836"},{"tarjeta":"30380","dni":"94783706"},{"tarjeta":"30381","dni":"22572899"},{"tarjeta":"40114","dni":"16265640"},{"tarjeta":"40130","dni":"16982232"},{"tarjeta":"40226","dni":"16627735"},{"tarjeta":"40232","dni":"23344388"},{"tarjeta":"40254","dni":"26835471"},{"tarjeta":"40308","dni":"29777241"},{"tarjeta":"40377","dni":"31571342"},{"tarjeta":"60128","dni":"22985766"},{"tarjeta":"10089","dni":"13524374"},{"tarjeta":"10137","dni":"16372088"},{"tarjeta":"10461","dni":"36935075"},{"tarjeta":"10413","dni":"33365147"},{"tarjeta":"10462","dni":"36621316"},{"tarjeta":"20464","dni":"35654515"},{"tarjeta":"10468","dni":"40575719"},{"tarjeta":"50055","dni":"17490005"},{"tarjeta":"50241","dni":"24522147"},{"tarjeta":"50259","dni":"28565374"},{"tarjeta":"50283","dni":"27540734"},{"tarjeta":"50287","dni":"22423304"},{"tarjeta":"50301","dni":"23909253"},{"tarjeta":"50312","dni":"29015162"},{"tarjeta":"50325","dni":"33618129"},{"tarjeta":"50361","dni":"33618068"},{"tarjeta":"30388","dni":"94437641"},{"tarjeta":"30391","dni":"34813796"},{"tarjeta":"30400","dni":"26737548"},{"tarjeta":"30401","dni":"31693293"},{"tarjeta":"10407","dni":"35225075"},{"tarjeta":"20415","dni":"34104278"},{"tarjeta":"20416","dni":"31512690"},{"tarjeta":"10424","dni":"32802413"},{"tarjeta":"10425","dni":"26575603"},{"tarjeta":"50435","dni":"33748145"},{"tarjeta":"10007","dni":"38279032"},{"tarjeta":"50445","dni":"17358459"},{"tarjeta":"30447","dni":"32532054"},{"tarjeta":"20454","dni":"38886149"},{"tarjeta":"30481","dni":"21441778"},{"tarjeta":"50484","dni":"21690987"},{"tarjeta":"20111","dni":"34854283"},{"tarjeta":"10498","dni":"40028341"},{"tarjeta":"10502","dni":"38418922"},{"tarjeta":"10506","dni":"35259240"},{"tarjeta":"70003","dni":"42387988"},{"tarjeta":"10519","dni":"23966899"},{"tarjeta":"10525","dni":"39613345"},{"tarjeta":"10518","dni":"33959137"},{"tarjeta":"10526","dni":"38134807"},{"tarjeta":"10529","dni":"36680420"},{"tarjeta":"50527","dni":"37166919"},{"tarjeta":"70005","dni":"43273810"},{"tarjeta":"70004","dni":"42386990"},{"tarjeta":"10547","dni":"40505556"},{"tarjeta":"20553","dni":"42860960"},{"tarjeta":"20552","dni":"2365"},{"tarjeta":"20550","dni":"38002181"},{"tarjeta":"50562","dni":"42559153"},{"tarjeta":"50559","dni":"29845927"},{"tarjeta":"10567","dni":"39523073"},{"tarjeta":"10566","dni":"40504539"},{"tarjeta":"10576","dni":"42386988"},{"tarjeta":"10560","dni":"43673548"},{"tarjeta":"50575","dni":"41905399"},{"tarjeta":"50127","dni":"22953475"},{"tarjeta":"50442","dni":"34734474"},{"tarjeta":"10352","dni":"33618104"},{"tarjeta":"10164","dni":"14221685"},{"tarjeta":"30309","dni":"94453861"},{"tarjeta":"10579","dni":"38159712"},{"tarjeta":"10580","dni":"27897602"},{"tarjeta":"10581","dni":"44049590"},{"tarjeta":"20594","dni":"40686139"},{"tarjeta":"20595","dni":"42440744"},{"tarjeta":"20605","dni":"39302281"},{"tarjeta":"20618","dni":"34290262"},{"tarjeta":"10622","dni":"43608474"},{"tarjeta":"20623","dni":"37374425"},{"tarjeta":"10628","dni":"42387072"},{"tarjeta":"20630","dni":"33618010"},{"tarjeta":"20629","dni":"30656807"}];

  const fresh = dao.findCollectionByNameOrId('fichadas_legajos');
  let completados = 0;
  for (const d of datos) {
    try {
      const record = dao.findFirstRecordByFilter(fresh.id, 'nro_tarjeta = {:t}', { t: d.tarjeta });
      record.set('dni', d.dni);
      dao.saveRecord(record);
      completados++;
    } catch (e) { /* no existía este legajo */ }
  }
  console.log('fichadas: dni completado en ' + completados + ' legajos');

  return null;
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId('fichadas_legajos');
  collection.schema.removeField('fcl0dni00001');
  return dao.saveCollection(collection);
})
