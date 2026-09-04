/// <reference path="../pb_data/types.d.ts" />

// Módulo "Control de Cheques": proxy server-side a la API del BCRA
// (así el navegador no pega directo a una API de gobierno con problemas
// de CORS, y de paso queda registrado quién consulta qué).
//   GET /api/cheques/bcra/:cuit -> consulta la Central de Deudores del
//       BCRA y devuelve si ese CUIT tiene cheques rechazados.
// La lectura del CUIT desde la imagen del cheque se hace 100% en el
// navegador (OCR con Tesseract, sin costo ni servicio externo) — ver
// web/src/lib/ocr.ts.

routerAdd("GET", "/api/cheques/bcra/:cuit", (c) => {
  // El chequeo de acceso va inline (no como función aparte arriba del
  // archivo): PocketBase corre el callback de routerAdd en un contexto
  // que no siempre tiene visibilidad de funciones declaradas fuera de él
  // ("ReferenceError: ... is not defined" en producción con una función
  // separada), así que toda la lógica del handler vive acá adentro.
  const info = $apis.requestInfo(c);
  const auth = info.authRecord;
  if (!auth) {
    return c.json(403, { message: "No tenés acceso al módulo de Control de Cheques." });
  }

  // auth.get("modulos") (campo "json") no devuelve el array ya
  // interpretado acá adentro: devuelve los bytes crudos del JSON
  // guardado, uno por uno, como array de números (confirmado con debug:
  // [91,34,99,111,...] es exactamente la lista de códigos ASCII de
  // '["control_cheques"]' letra por letra). Hay que decodificar esos
  // bytes a texto antes de poder buscar el módulo adentro.
  const rawModulos = auth.get("modulos");
  const modulosTexto = (Array.isArray(rawModulos) ? String.fromCharCode.apply(null, rawModulos) : JSON.stringify(rawModulos || [])).toLowerCase();
  const tieneAcceso = auth.get("rol") === "admin" || modulosTexto.indexOf("control_cheques") !== -1;
  if (!tieneAcceso) {
    return c.json(403, { message: "No tenés acceso al módulo de Control de Cheques." });
  }

  const cuit = c.pathParam("cuit");
  if (!cuit || !/^[0-9]{11}$/.test(cuit)) {
    return c.json(400, { message: "CUIT inválido: debe tener 11 dígitos sin guiones." });
  }

  let res;
  try {
    res = $http.send({
      url: "https://api.bcra.gob.ar/centraldedeudores/v1.0/Deudas/ChequesRechazados/" + cuit,
      method: "GET",
      headers: { Accept: "application/json" },
    });
  } catch (e) {
    // $http.send tira excepción si no puede conectar (DNS, TLS, timeout,
    // etc.) — sin este catch, esa excepción explota como un error genérico
    // de PocketBase ("Something went wrong") que no dice nada útil.
    return c.json(502, { message: "No se pudo conectar con la API del BCRA: " + (e && e.message ? e.message : String(e)) });
  }

  if (res.statusCode !== 200 && res.statusCode !== 404) {
    return c.json(502, { message: "La API del BCRA devolvió " + res.statusCode + ".", detalle: res.json || res.raw });
  }

  let denominacion = null;
  let rechazos = [];
  try {
    if (res.statusCode === 200) {
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
      denominacion = results.denominacion || null;
      const causales = results.causales || [];
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
    }
    // El BCRA solo manda la denominación junto con los datos de cheques
    // rechazados: si el CUIT no tiene rechazos, ChequesRechazados devuelve
    // 404 sin nombre. Para tener el nombre igual (caso más común: "sin
    // rechazos"), consultamos aparte el endpoint general de deudores, que
    // trae identificación + denominación aunque no haya cheques rechazados.
    // Es "mejor esfuerzo": si falla o también da 404 (puede no tener
    // ningún historial en el BCRA), seguimos sin nombre en vez de romper
    // la consulta.
    if (!denominacion) {
      try {
        const resGeneral = $http.send({
          url: "https://api.bcra.gob.ar/centraldedeudores/v1.0/Deudas/" + cuit,
          method: "GET",
          headers: { Accept: "application/json" },
        });
        if (resGeneral.statusCode === 200) {
          const bodyGeneral = resGeneral.json || {};
          denominacion = (bodyGeneral.results && bodyGeneral.results.denominacion) || null;
        }
      } catch (e) {
        // Best-effort: si esta segunda consulta falla, no afecta el resultado principal.
      }
    }

    return c.json(200, {
      cuit: cuit,
      denominacion: denominacion,
      tieneRechazados: rechazos.length > 0,
      rechazos: rechazos,
    });
  } catch (e) {
    return c.json(502, { message: "No se pudo interpretar la respuesta del BCRA: " + (e && e.message ? e.message : String(e)), crudo: res.raw });
  }
}, $apis.requireRecordAuth("usuarios"));
