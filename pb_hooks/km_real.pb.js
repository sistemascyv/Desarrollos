/// <reference path="../pb_data/types.d.ts" />
// Km real de toda la flota, combinando los dos proveedores de GPS:
// Pressa (toda la flota en una sola llamada, misma lógica que tenía
// pb_hooks/pressa.pb.js antes) y Megatrans (una llamada por vehículo,
// vía vehiculos.codigo_megatrans). Ver
// docs/superpowers/specs/2026-09-24-megatrans-km-real-design.md.
//
// Toda la lógica vive DENTRO del callback de routerAdd (nada de
// funciones/variables sueltas arriba del archivo) -- mismo motivo que
// pb_hooks/pressa.pb.js: PocketBase corre este callback en un contexto
// que en producción no siempre ve lo declarado afuera.
routerAdd("GET", "/api/flota/km-real/:desde/:hasta", (c) => {
  const info = $apis.requestInfo(c);
  const auth = info.authRecord;

  const rawModulos = auth.get("modulos");
  const modulosTexto = (Array.isArray(rawModulos) ? String.fromCharCode.apply(null, rawModulos) : JSON.stringify(rawModulos || [])).toLowerCase();
  const tieneAcceso = auth.get("rol") === "admin" || modulosTexto.indexOf("flota_posicion") !== -1;
  if (!tieneAcceso) {
    return c.json(403, { message: "No tenés acceso al módulo de Posición de Flota." });
  }

  const startDate = parseInt(c.pathParam("desde"), 10);
  const endDate = parseInt(c.pathParam("hasta"), 10);
  if (!startDate || !endDate) {
    return c.json(400, { message: "Faltan desde/hasta." });
  }

  const unidades = [];

  // --- Pressa: toda la flota en una sola llamada ---
  const base = "https://interno.pressacloud.com/pressa_external_backend/";
  const username = $os.getenv("PRESSA_USERNAME");
  const clientHash = $os.getenv("PRESSA_CLIENT_HASH");
  const passwordHash = $os.getenv("PRESSA_PASSWORD_HASH");
  if (!username || !clientHash || !passwordHash) {
    return c.json(502, { message: "Faltan las variables de entorno PRESSA_USERNAME / PRESSA_CLIENT_HASH / PRESSA_PASSWORD_HASH en el servidor." });
  }

  let loginRes;
  for (let intento = 1; intento <= 2 && !loginRes; intento++) {
    try {
      loginRes = $http.send({
        url: base + "ws_user_login.php",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        timeout: intento === 1 ? 20 : 35,
        body: JSON.stringify({
          clientHash: clientHash,
          password: passwordHash,
          timestamp: Math.floor(Date.now() / 1000),
          username: username,
        }),
      });
    } catch (e) {
      if (intento === 2) {
        return c.json(502, { message: "No se pudo conectar con Pressa (login): " + (e && e.message ? e.message : String(e)) });
      }
    }
  }
  const loginBody = loginRes.json || {};
  if (loginRes.statusCode !== 200 || loginBody.errorCode !== 0) {
    return c.json(502, { message: "Login a Pressa falló: " + (loginBody.displayMsg || ("HTTP " + loginRes.statusCode)) });
  }
  const sessionKey = loginBody.data.sessionKey;

  let distRes;
  try {
    distRes = $http.send({
      url: base + "ws_report_fleet_distance.php",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      timeout: 60,
      body: JSON.stringify({
        clientHash: clientHash,
        sessionKey: sessionKey,
        timestamp: Math.floor(Date.now() / 1000),
        startDate: startDate,
        endDate: endDate,
      }),
    });
  } catch (e) {
    return c.json(502, { message: "No se pudo conectar con Pressa (distancia): " + (e && e.message ? e.message : String(e)) });
  }
  const distBody = distRes.json || {};
  if (distRes.statusCode !== 200 || distBody.errorCode !== 0) {
    return c.json(502, { message: "Pressa devolvió un error: " + (distBody.displayMsg || ("HTTP " + distRes.statusCode)) });
  }
  ((distBody.data && distBody.data.vehicles) || []).forEach((v) => {
    unidades.push({
      alias: v.alias || v.name || "(sin alias)",
      patente: v.licensePlate || "",
      distanciaKm: v.distance || 0,
    });
  });

  // --- Megatrans: una llamada por vehículo con codigo_megatrans ---
  // Megatrans quiere yyyyMMddHHmm en hora LOCAL ARGENTINA (UTC-3), no UTC
  // -- restar 3 horas explícitamente antes de formatear, no asumir que
  // el servidor ya corre en esa zona horaria.
  function formatoMegatrans(unixSeconds) {
    const d = new Date((unixSeconds - 3 * 3600) * 1000);
    const pad = (n) => String(n).padStart(2, "0");
    return "" + d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + pad(d.getUTCHours()) + pad(d.getUTCMinutes());
  }
  const desdeMegatrans = formatoMegatrans(startDate);
  const hastaMegatrans = formatoMegatrans(endDate);

  const dao = $app.dao();
  const vehiculosMegatrans = dao.findRecordsByFilter("vehiculos", "codigo_megatrans != ''", "", 500, 0);
  let megatransFallidos = 0;
  vehiculosMegatrans.forEach((veh) => {
    const codigoEntidad = veh.getString("codigo_megatrans");
    try {
      // $http.send en este proyecto no tiene ningún uso confirmado de una
      // opción "query" para armar el query string -- se arma la URL a
      // mano para no depender de algo sin verificar.
      const url = "https://admws.megatrans.com.ar/services/CarossioVairolattiKmsRecorridosEntreFechasv2/AcumuladoUnidadv2"
        + "?CodigoEntidad=" + encodeURIComponent(codigoEntidad)
        + "&FechaHoraDesde=" + encodeURIComponent(desdeMegatrans)
        + "&FechaHoraHasta=" + encodeURIComponent(hastaMegatrans);
      // Dos ajustes de headers, ambos confirmados en vivo el 24/09 contra
      // el WSO2 real de Megatrans (no se pueden deducir leyendo el código,
      // solo pegándole al servicio de verdad):
      //  - Sin "Accept: application/json", el WSO2 devuelve XML por
      //    default y res.json no lo puede parsear.
      //  - $http.send de este JSVM pone "Content-Type: application/json"
      //    por default en TODO pedido que no lo pisa explícitamente
      //    (incluso un GET sin body) -- y con ese Content-Type puesto, el
      //    WSO2 de Megatrans responde con INCOMPATIBLE_PARAMETERS_ERROR
      //    (busca los parámetros en un body JSON que no existe). Hay que
      //    pisarlo a mano con algo que no sea "application/json".
      const res = $http.send({
        url: url,
        method: "GET",
        timeout: 20,
        headers: { "Accept": "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      });
      const body = res.json || {};
      if (res.statusCode === 200 && body.Dato) {
        unidades.push({
          alias: veh.getString("codigo"),
          patente: body.Dato.Patente || "",
          distanciaKm: parseFloat(body.Dato.KmRecorridos) || 0,
        });
      } else {
        megatransFallidos++;
      }
    } catch (e) {
      megatransFallidos++;
    }
  });

  return c.json(200, { total: unidades.length, unidades: unidades, megatransFallidos: megatransFallidos });
}, $apis.requireRecordAuth("usuarios"));
