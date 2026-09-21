/// <reference path="../pb_data/types.d.ts" />

// Planilla Choferes — dos cosas que el cliente no puede garantizar solo:
//   * auditoría: creado_por / editado_por los pone el servidor con el usuario
//     logueado (el frontend no manda nada, no se puede falsear);
//   * cierre de mes: si el mes está en periodos_cerrados, no se puede crear,
//     editar ni borrar un tramo o una tarifa de ese mes (ni mover uno hacia
//     adentro o afuera). Solo un admin reabre el mes (borra el registro).
// Cada callback lleva su lógica adentro: PocketBase corre los handlers en un
// contexto que no ve funciones declaradas afuera (mismo motivo que en
// cheques.pb.js).

onRecordBeforeCreateRequest((e) => {
  const auth = $apis.requestInfo(e.httpContext).authRecord;
  const quien = auth ? (auth.get("nombre") || auth.get("username") || auth.id) : "";
  const col = e.record.collection().name;

  if (col === "periodos_cerrados") {
    e.record.set("cerrado_por", quien);
    return;
  }

  const mes = e.record.get("mes");
  if (mes) {
    let cerrado = false;
    try {
      $app.dao().findFirstRecordByFilter("periodos_cerrados", "mes = {:mes}", { mes: mes });
      cerrado = true;
    } catch (err) { /* no está cerrado */ }
    if (cerrado) {
      throw new ForbiddenError("El mes " + mes + " está cerrado: un admin tiene que reabrirlo para cargar cambios.");
    }
  }
  e.record.set("creado_por", quien);
}, "tramos", "tarifas", "periodos_cerrados");

onRecordBeforeUpdateRequest((e) => {
  const auth = $apis.requestInfo(e.httpContext).authRecord;
  const quien = auth ? (auth.get("nombre") || auth.get("username") || auth.id) : "";

  // se mira el mes de antes Y el de después: no se puede sacar un tramo de un
  // mes cerrado ni meterlo en uno.
  const meses = [e.record.originalCopy().get("mes"), e.record.get("mes")];
  for (const mes of meses) {
    if (!mes) continue;
    let cerrado = false;
    try {
      $app.dao().findFirstRecordByFilter("periodos_cerrados", "mes = {:mes}", { mes: mes });
      cerrado = true;
    } catch (err) { /* no está cerrado */ }
    if (cerrado) {
      throw new ForbiddenError("El mes " + mes + " está cerrado: un admin tiene que reabrirlo para modificarlo.");
    }
  }
  e.record.set("editado_por", quien);
}, "tramos", "tarifas");

onRecordBeforeDeleteRequest((e) => {
  const mes = e.record.get("mes");
  if (!mes) return;
  let cerrado = false;
  try {
    $app.dao().findFirstRecordByFilter("periodos_cerrados", "mes = {:mes}", { mes: mes });
    cerrado = true;
  } catch (err) { /* no está cerrado */ }
  if (cerrado) {
    throw new ForbiddenError("El mes " + mes + " está cerrado: un admin tiene que reabrirlo para borrar.");
  }
}, "tramos", "tarifas");
