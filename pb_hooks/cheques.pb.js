/// <reference path="../pb_data/types.d.ts" />

// Módulo "Control de Cheques": proxy server-side a la API del BCRA
// (así el navegador no pega directo a una API de gobierno con problemas
// de CORS, y de paso queda registrado quién consulta qué).
//   GET /api/cheques/bcra/:cuit -> consulta la Central de Deudores del
//       BCRA y devuelve si ese CUIT tiene cheques rechazados.
// La lectura del CUIT desde la imagen del cheque se hace 100% en el
// navegador (OCR con Tesseract, sin costo ni servicio externo) — ver
// web/src/lib/ocr.ts.

function checkAccesoControlCheques(info) {
  const auth = info.authRecord;
  if (!auth) return false;
  if (auth.get("rol") === "admin") return true;
  const modulos = auth.get("modulos") || [];
  return modulos.indexOf("control_cheques") !== -1;
}

routerAdd("GET", "/api/cheques/bcra/:cuit", (c) => {
  const info = $apis.requestInfo(c);
  if (!checkAccesoControlCheques(info)) {
    return c.json(403, { message: "No tenés acceso al módulo de Control de Cheques." });
  }

  const cuit = c.pathParam("cuit");
  if (!cuit || !/^[0-9]{11}$/.test(cuit)) {
    return c.json(400, { message: "CUIT inválido: debe tener 11 dígitos sin guiones." });
  }

  const res = $http.send({
    url: "https://api.bcra.gob.ar/centraldedeudores/v1.0/Deudas/ChequesRechazados/" + cuit,
    method: "GET",
    headers: { Accept: "application/json" },
  });

  if (res.statusCode === 404) {
    // El BCRA devuelve 404 cuando el CUIT no tiene cheques rechazados registrados.
    return c.json(200, { cuit: cuit, denominacion: null, tieneRechazados: false, rechazos: [] });
  }
  if (res.statusCode !== 200) {
    return c.json(502, { message: "Error consultando la API del BCRA.", detalle: res.json });
  }

  const body = res.json || {};
  // Forma real de la respuesta (ChequeResponse -> ChequeRechazado, ver
  // https://www.bcra.gob.ar/archivos/Catalogo/Content/files/json/central-deudores-v1.json):
  //   { status, results: { identificacion, denominacion, causales: [
  //       { causal, entidades: [ { entidad, detalle: [
  //           { nroCheque, fechaRechazo, monto, fechaPago, fechaPagoMulta,
  //             estadoMulta, ctaPersonal, denomJuridica, enRevision, procesoJud }
  //       ] } ]
  //   ] } }
  // Lo aplanamos acá a una lista simple (un item por cheque) para que el
  // frontend no tenga que iterar 3 niveles de anidamiento.
  const results = body.results || {};
  const causales = results.causales || [];
  const rechazos = [];
  for (const c2 of causales) {
    const entidades = c2.entidades || [];
    for (const e of entidades) {
      const detalle = e.detalle || [];
      for (const d of detalle) {
        rechazos.push({
          causal: c2.causal || null,
          entidad: e.entidad != null ? e.entidad : null,
          nroCheque: d.nroCheque,
          fechaRechazo: d.fechaRechazo,
          monto: d.monto,
          fechaPago: d.fechaPago || null,
          fechaPagoMulta: d.fechaPagoMulta || null,
          estadoMulta: d.estadoMulta || null,
          enRevision: !!d.enRevision,
          procesoJud: !!d.procesoJud,
        });
      }
    }
  }

  return c.json(200, {
    cuit: cuit,
    denominacion: results.denominacion || null,
    tieneRechazados: rechazos.length > 0,
    rechazos: rechazos,
    crudo: body,
  });
}, $apis.requireRecordAuth("usuarios"));
