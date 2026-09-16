/// <reference path="../pb_data/types.d.ts" />
// Al cruzar el mes de agosto COMPLETO (5241 marcas reales de los 152 .bak
// del reloj) contra los legajos, aparecieron errores propios de la
// migración 1788970000 ("altas confirmadas por agosto"):
//
// 1) Usé el número de LEGAJO como si fuera el número de TARJETA para 5
//    personas -- son distintos para ellas (columna "Legajo" vs columna
//    "Identificador" en los reportes de CINTIA). Con la tarjeta mal, sus
//    marcas reales nunca iban a matchear con nadie.
// 2) "ARES LUCAS" quedó duplicado: ya existía con tarjeta 30302 (su
//    legajo real es 30480), y lo volví a crear con tarjeta 30480.
// 3) "CASTILLO GERARDO" (tarjeta 50562, Mantenimiento) tiene marcas
//    reales en agosto pero no apareció en el cruce anterior (áreas
//    AGOSTO/Parte Diario) -- se había borrado por error en 1788990000.
//    Se restaura.
migrate((db) => {
  const dao = new Dao(db);
  const legajosColl = dao.findCollectionByNameOrId('fichadas_legajos');
  const empresasColl = dao.findCollectionByNameOrId('fichadas_empresas');

  const empresaIdPorNombre = {};
  dao.findRecordsByFilter(empresasColl.id, "nombre != ''", '', 200, 0).forEach((r) => {
    empresaIdPorNombre[r.get('nombre')] = r.id;
  });
  const horariosColl = dao.findCollectionByNameOrId('fichadas_horarios');
  const horarioIdPorNombre = {};
  dao.findRecordsByFilter(horariosColl.id, "nombre != ''", '', 200, 0).forEach((r) => {
    horarioIdPorNombre[r.get('nombre')] = r.id;
  });

  // 1) corregir tarjeta (legajo -> identificador real)
  const correcciones = [
    { legajoActual: '10542', tarjetaCorrecta: '70004' },
    { legajoActual: '629', tarjetaCorrecta: '20629' },
    { legajoActual: '7007', tarjetaCorrecta: '07007' },
    { legajoActual: '630', tarjetaCorrecta: '20630' },
    { legajoActual: '634', tarjetaCorrecta: '10634' },
  ];
  let corregidos = 0;
  for (const c of correcciones) {
    try {
      const record = dao.findFirstRecordByFilter(legajosColl.id, 'nro_tarjeta = {:t}', { t: c.legajoActual });
      record.set('nro_tarjeta', c.tarjetaCorrecta);
      dao.saveRecord(record);
      corregidos++;
    } catch (e) { /* no existía */ }
  }

  // 2) borrar el duplicado de Ares Lucas (30480) -- el real es 30302
  let borrados = 0;
  try {
    const dup = dao.findFirstRecordByFilter(legajosColl.id, 'nro_tarjeta = {:t}', { t: '30480' });
    dao.deleteRecord(dup);
    borrados++;
  } catch (e) { /* no existía */ }

  // 3) restaurar a Castillo Gerardo
  let restaurado = false;
  try {
    dao.findFirstRecordByFilter(legajosColl.id, 'nro_tarjeta = {:t}', { t: '50562' });
  } catch (e) {
    const record = new Record(legajosColl, {
      nro_legajo: '50562',
      nro_tarjeta: '50562',
      nombre: 'CASTILLO GERARDO',
      empresa: empresaIdPorNombre['MANTENIMIENTO'] || '',
      horario: horarioIdPorNombre['Mantenimiento - Lunes a Sabado'] || '',
      estado: true,
    });
    dao.saveRecord(record);
    restaurado = true;
  }

  console.log('fichadas: tarjetas corregidas: ' + corregidos + ', duplicados borrados: ' + borrados + ', Castillo Gerardo restaurado: ' + restaurado);
  return null;
}, (db) => {
  return null; // no-op: corrección de datos
})
