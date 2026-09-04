/// <reference path="../pb_data/types.d.ts" />

// Módulo "Control de Cheques": proxy server-side a la API del BCRA
// (así el navegador no pega directo a una API de gobierno con problemas
// de CORS, y de paso queda registrado quién consulta qué).
//   GET /api/cheques/bcra/:cuit -> consulta la Central de Deudores del
//       BCRA: cheques rechazados, deuda actual y deuda histórica (24
//       meses) por entidad financiera. Es la única info de "riesgo
//       crediticio" que existe gratis para este CUIT — cosas como el
//       Score, consultas o relacionados (que se ven en un informe de
//       Equifax, por ejemplo) son de un servicio comercial pago, no del
//       BCRA, y no tienen equivalente gratuito.
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

  // Wrapper único para las 3 consultas (misma URL base, mismo manejo de
  // conexión caída / 404 / status raro) — evita repetir el try/catch de
  // $http.send tres veces.
  function llamarBcra(path) {
    try {
      const res = $http.send({
        url: "https://api.bcra.gob.ar/centraldedeudores/v1.0/" + path,
        method: "GET",
        headers: { Accept: "application/json" },
      });
      if (res.statusCode === 404) return { ok: true, body: null };
      if (res.statusCode !== 200) return { ok: false, error: "La API del BCRA devolvió " + res.statusCode + " para " + path };
      return { ok: true, body: res.json || {} };
    } catch (e) {
      return { ok: false, error: "No se pudo conectar con la API del BCRA: " + (e && e.message ? e.message : String(e)) };
    }
  }

  const resRechazados = llamarBcra("Deudas/ChequesRechazados/" + cuit);
  if (!resRechazados.ok) {
    return c.json(502, { message: resRechazados.error });
  }

  try {
    let denominacion = null;
    const rechazos = [];
    if (resRechazados.body) {
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
      const results = resRechazados.body.results || {};
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

    // Deuda actual: { results: { denominacion, periodos: [ { periodo,
    // entidades: [ { entidad, situacion, monto, diasAtrasoPago,
    // refinanciaciones, situacionJuridica, procesoJud, ... } ] } ] } } —
    // el primer período es el más reciente. Se pide siempre (no solo
    // cuando falta la denominación) porque acá sale también la deuda
    // actual por entidad, que antes se descartaba.
    let deudaActual = [];
    const resDeuda = llamarBcra("Deudas/" + cuit);
    if (resDeuda.ok && resDeuda.body) {
      const results = resDeuda.body.results || {};
      if (!denominacion) denominacion = results.denominacion || null;
      const periodos = results.periodos || [];
      const entidades = (periodos[0] && periodos[0].entidades) || [];
      deudaActual = entidades.map((e) => ({
        entidad: e.entidad || null,
        situacion: e.situacion != null ? e.situacion : null,
        monto: e.monto != null ? e.monto : null,
        diasAtrasoPago: e.diasAtrasoPago != null ? e.diasAtrasoPago : null,
        refinanciaciones: !!e.refinanciaciones,
        situacionJuridica: !!e.situacionJuridica,
        procesoJud: !!e.procesoJud,
      }));
    }
    // Best-effort: si esta consulta falla, seguimos sin deuda actual en
    // vez de romper toda la respuesta.

    // Deuda histórica: misma forma pero un período por mes, hasta 24
    // meses — es la tabla "Evolución" que un informe de riesgo crediticio
    // (ej. Equifax) también arma a partir de esta misma fuente del BCRA.
    // Se aplana a una lista simple de filas (periodo + entidad) para que
    // el frontend no tenga que anidar.
    let deudaHistorica = [];
    const resHist = llamarBcra("Deudas/Historicas/" + cuit);
    if (resHist.ok && resHist.body) {
      const periodos = (resHist.body.results && resHist.body.results.periodos) || [];
      for (const p of periodos) {
        const entidades = p.entidades || [];
        for (const e of entidades) {
          deudaHistorica.push({
            periodo: p.periodo || null,
            entidad: e.entidad || null,
            situacion: e.situacion != null ? e.situacion : null,
            monto: e.monto != null ? e.monto : null,
          });
        }
      }
    }

    return c.json(200, {
      cuit: cuit,
      denominacion: denominacion,
      tieneRechazados: rechazos.length > 0,
      rechazos: rechazos,
      deudaActual: deudaActual,
      deudaHistorica: deudaHistorica,
    });
  } catch (e) {
    return c.json(502, { message: "No se pudo interpretar la respuesta del BCRA: " + (e && e.message ? e.message : String(e)) });
  }
}, $apis.requireRecordAuth("usuarios"));
