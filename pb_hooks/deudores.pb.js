/// <reference path="../pb_data/types.d.ts" />

// Módulo "Central de Deudores": consulta puntual de un CUIT contra la
// Central de Deudores del BCRA — pensado como un reporte de riesgo
// crediticio "estilo Equifax" pero con datos 100% gratuitos del BCRA
// (identificación, deuda actual y evolución histórica por entidad
// financiera, cheques rechazados). No incluye Score, consultas ni
// relacionados: eso es exclusivo de servicios comerciales pagos como
// Equifax y no tiene equivalente gratuito.
//   GET /api/deudores/bcra/:cuit

routerAdd("GET", "/api/deudores/bcra/:cuit", (c) => {
  const info = $apis.requestInfo(c);
  const auth = info.authRecord;
  if (!auth) {
    return c.json(403, { message: "No tenés acceso al módulo de Central de Deudores." });
  }

  // Ver pb_hooks/cheques.pb.js: auth.get("modulos") da los bytes crudos
  // del JSON guardado, no el array ya interpretado — hay que decodificar.
  const rawModulos = auth.get("modulos");
  const modulosTexto = (Array.isArray(rawModulos) ? String.fromCharCode.apply(null, rawModulos) : JSON.stringify(rawModulos || [])).toLowerCase();
  const tieneAcceso = auth.get("rol") === "admin" || modulosTexto.indexOf("central_deudores") !== -1;
  if (!tieneAcceso) {
    return c.json(403, { message: "No tenés acceso al módulo de Central de Deudores." });
  }

  const cuit = c.pathParam("cuit");
  if (!cuit || !/^[0-9]{11}$/.test(cuit)) {
    return c.json(400, { message: "CUIT inválido: debe tener 11 dígitos sin guiones." });
  }

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

  const resDeuda = llamarBcra("Deudas/" + cuit);
  if (!resDeuda.ok) {
    return c.json(502, { message: resDeuda.error });
  }

  try {
    let denominacion = null;

    // Deuda actual: results.periodos[0].entidades[] — el primer período
    // es el más reciente.
    let deudaActual = [];
    if (resDeuda.body) {
      const results = resDeuda.body.results || {};
      denominacion = results.denominacion || null;
      const entidades = (results.periodos && results.periodos[0] && results.periodos[0].entidades) || [];
      deudaActual = entidades.map((e) => ({
        entidad: e.entidad || null,
        situacion: e.situacion != null ? e.situacion : null,
        monto: e.monto != null ? e.monto : null,
        diasAtrasoPago: e.diasAtrasoPago != null ? e.diasAtrasoPago : null,
        refinanciaciones: !!e.refinanciaciones,
        recategorizacionOblig: !!e.recategorizacionOblig,
        situacionJuridica: !!e.situacionJuridica,
        irrecDisposicionTecnica: !!e.irrecDisposicionTecnica,
        enRevision: !!e.enRevision,
        procesoJud: !!e.procesoJud,
      }));
    }

    // Deuda histórica: un período por mes, hasta 24 meses — la tabla de
    // "evolución" que arma cualquier informe de riesgo crediticio a
    // partir de esta misma fuente del BCRA. Se aplana a filas simples
    // (periodo + entidad) para que el frontend no tenga que anidar.
    let deudaHistorica = [];
    const resHist = llamarBcra("Deudas/Historicas/" + cuit);
    if (resHist.ok && resHist.body) {
      const periodos = (resHist.body.results && resHist.body.results.periodos) || [];
      if (!denominacion) denominacion = resHist.body.results.denominacion || null;
      for (const p of periodos) {
        const entidades = p.entidades || [];
        for (const e of entidades) {
          deudaHistorica.push({
            periodo: p.periodo || null,
            entidad: e.entidad || null,
            situacion: e.situacion != null ? e.situacion : null,
            monto: e.monto != null ? e.monto : null,
            enRevision: !!e.enRevision,
            procesoJud: !!e.procesoJud,
          });
        }
      }
    }

    // Cheques rechazados: misma forma que ya usa Control de Cheques (ver
    // pb_hooks/cheques.pb.js para la referencia de la respuesta real del
    // BCRA), aplanada a una lista simple.
    let rechazos = [];
    const resRechazados = llamarBcra("Deudas/ChequesRechazados/" + cuit);
    if (resRechazados.ok && resRechazados.body) {
      const results = resRechazados.body.results || {};
      if (!denominacion) denominacion = results.denominacion || null;
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

    if (!denominacion && deudaActual.length === 0 && deudaHistorica.length === 0 && rechazos.length === 0) {
      return c.json(404, { message: "El BCRA no tiene ningún registro para ese CUIT." });
    }

    return c.json(200, {
      cuit: cuit,
      denominacion: denominacion,
      deudaActual: deudaActual,
      deudaHistorica: deudaHistorica,
      rechazos: rechazos,
    });
  } catch (e) {
    return c.json(502, { message: "No se pudo interpretar la respuesta del BCRA: " + (e && e.message ? e.message : String(e)) });
  }
}, $apis.requireRecordAuth("usuarios"));
