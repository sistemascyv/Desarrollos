/// <reference path="../pb_data/types.d.ts" />

// Módulo Fichadas (RRHH) — análisis del reloj biométrico.
//   GET/CRUD de empresas/horarios/legajos/novedades/feriados van directo
//   por las reglas nativas de la colección (pb.collection(...) desde el
//   cliente, ver pb_migrations/1788900000_created_fichadas.js) — no hace
//   falta hook para eso.
//   Este archivo SOLO tiene el import masivo de marcas del reloj, porque
//   necesita deduplicar contra lo que ya está cargado (evitar duplicar si
//   se vuelve a subir un período que se solapa) y eso conviene resolverlo
//   server-side con el dao en vez de N chequeos desde el cliente.
//
// Ver pb_hooks/cheques.pb.js para la explicación de por qué acá adentro
// se decodifican a mano los bytes de auth.get("modulos") en vez de usar
// el array ya interpretado.

routerAdd("POST", "/api/fichadas/marcas/importar", (c) => {
  const info = $apis.requestInfo(c);
  const auth = info.authRecord;

  const rawModulos = auth.get("modulos");
  const modulosTexto = (Array.isArray(rawModulos) ? String.fromCharCode.apply(null, rawModulos) : JSON.stringify(rawModulos || [])).toLowerCase();
  const tieneAcceso = auth.get("rol") === "admin" || modulosTexto.indexOf("fichadas") !== -1;
  if (!tieneAcceso) {
    return c.json(403, { message: "No tenés acceso al módulo de Fichadas." });
  }

  const body = info.data || {};
  const marcas = Array.isArray(body.marcas) ? body.marcas : [];
  if (!marcas.length) {
    return c.json(400, { message: "No se recibieron marcas para importar." });
  }

  const dao = $app.dao();
  const coleccionMarcas = dao.findCollectionByNameOrId("fichadas_marcas");
  const coleccionLegajos = dao.findCollectionByNameOrId("fichadas_legajos");

  // mapa tarjeta -> id de legajo, una sola consulta (son ~250 legajos, no
  // vale la pena una consulta por marca)
  const legajoPorTarjeta = {};
  dao.findRecordsByFilter(coleccionLegajos.id, "", "", 2000, 0).forEach((r) => {
    const t = (r.get("nro_tarjeta") || "").trim();
    if (t) legajoPorTarjeta[t] = r.id;
  });

  // set de "tarjeta|fecha|hora" ya cargadas, para no duplicar si se
  // vuelve a subir un rango de fechas que se solapa con uno anterior.
  let desde = null, hasta = null;
  marcas.forEach((m) => {
    if (!m || !m.fecha) return;
    if (desde === null || m.fecha < desde) desde = m.fecha;
    if (hasta === null || m.fecha > hasta) hasta = m.fecha;
  });
  const existentes = new Set();
  if (desde && hasta) {
    dao.findRecordsByFilter(
      coleccionMarcas.id,
      "fecha >= {:desde} && fecha <= {:hasta}",
      "",
      200000,
      0,
      { desde, hasta }
    ).forEach((r) => {
      existentes.add(r.get("tarjeta") + "|" + r.get("fecha") + "|" + r.get("hora"));
    });
  }

  let importadas = 0, duplicadas = 0, sinLegajo = 0, invalidas = 0;
  marcas.forEach((m) => {
    if (!m || !m.tarjeta || !m.fecha || !m.hora || typeof m.minutos !== "number") {
      invalidas++;
      return;
    }
    const clave = m.tarjeta + "|" + m.fecha + "|" + m.hora;
    if (existentes.has(clave)) {
      duplicadas++;
      return;
    }
    existentes.add(clave); // por si el mismo archivo trae la línea repetida
    const legajoId = legajoPorTarjeta[m.tarjeta] || "";
    if (!legajoId) sinLegajo++;
    const record = new Record(coleccionMarcas, {
      legajo: legajoId,
      tarjeta: m.tarjeta,
      fecha: m.fecha,
      hora: m.hora,
      minutos: m.minutos,
      deposito: m.deposito || "",
      reloj: m.reloj || "",
      archivo_origen: m.archivo || "",
    });
    try {
      dao.saveRecord(record);
      importadas++;
    } catch (e) {
      invalidas++;
    }
  });

  return c.json(200, { importadas, duplicadas, sinLegajo, invalidas, total: marcas.length });
}, $apis.requireRecordAuth("usuarios"));
