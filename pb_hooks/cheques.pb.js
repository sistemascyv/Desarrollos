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
    return c.json(200, { cuit: cuit, tieneRechazados: false, entidades: [] });
  }
  if (res.statusCode !== 200) {
    return c.json(502, { message: "Error consultando la API del BCRA.", detalle: res.json });
  }

  const body = res.json || {};
  const entidades = (body.results && body.results.entidades) || body.entidades || [];
  return c.json(200, {
    cuit: cuit,
    denominacion: body.denominacion || (body.results && body.results.denominacion) || null,
    tieneRechazados: Array.isArray(entidades) && entidades.length > 0,
    entidades: entidades,
    crudo: body,
  });
}, $apis.requireRecordAuth("usuarios"));
