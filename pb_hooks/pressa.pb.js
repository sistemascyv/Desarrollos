/// <reference path="../pb_data/types.d.ts" />

// Integración con la API de PRESSA (satelital de la flota) — mismo
// patrón que cheques.pb.js/deudores.pb.js: el navegador nunca habla
// directo con Pressa (evita CORS, y no expone las credenciales en el
// bundle del frontend), este hook hace de proxy server-side.
//   GET /api/flota/pressa/monitor -> posición y estado actual de toda
//       la flota (ws_monitor_search.php).
//
// Toda la lógica vive DENTRO del callback de routerAdd (nada de
// funciones/variables sueltas arriba del archivo): PocketBase corre
// ese callback en un contexto que en producción no siempre ve lo
// declarado afuera ("ReferenceError: ... is not defined" — ver el
// mismo comentario en cheques.pb.js, ya nos pasó una vez con este hook
// nuevo). Como consecuencia no se cachea la sessionKey en una variable
// JS entre requests (se resuelve un login por consulta a Pressa) — lo
// que sí se cachea, en la colección pressa_cache, es la RESPUESTA de
// /monitor por unos segundos: como el mapa consulta solo cada 1
// minuto y puede haber varias personas mirándolo a la vez, esto evita
// pegarle a Pressa (con su login de por medio) en cada request de
// cada usuario.
//
// Credenciales: Pressa pide el SHA1 del usuario como "clientHash" y el
// SHA1 de la contraseña como "password" — nunca la contraseña en texto
// plano. Se leen de variables de entorno (cargadas server-side por el
// deploy, ver .github/workflows/deploy.yml), no quedan escritas acá.
// Usuario Pressa: "carossiows", provisto por Pressa el 2026-09-11, con
// las 4 unidades que tenemos con ellos ya asignadas de su lado.

routerAdd("GET", "/api/flota/pressa/monitor", (c) => {
  const info = $apis.requestInfo(c);
  const auth = info.authRecord;

  // Ver pb_hooks/cheques.pb.js: auth.get("modulos") da los bytes crudos
  // del JSON guardado, no el array ya interpretado — hay que decodificar.
  const rawModulos = auth.get("modulos");
  const modulosTexto = (Array.isArray(rawModulos) ? String.fromCharCode.apply(null, rawModulos) : JSON.stringify(rawModulos || [])).toLowerCase();
  const tieneAcceso = auth.get("rol") === "admin" || modulosTexto.indexOf("flota_posicion") !== -1;
  if (!tieneAcceso) {
    return c.json(403, { message: "No tenés acceso al módulo de Posición de Flota." });
  }

  const CACHE_SEGUNDOS = 30;
  const ahoraUnix = Math.floor(Date.now() / 1000);
  const dao = $app.dao();
  let cacheRow = null;
  try {
    cacheRow = dao.findFirstRecordByFilter("pressa_cache", "clave = 'monitor'");
  } catch (e) {
    cacheRow = null; // todavía no existe, primera consulta desde el deploy
  }
  if (cacheRow && (ahoraUnix - cacheRow.getInt("actualizado")) < CACHE_SEGUNDOS) {
    return c.json(200, cacheRow.get("datos"));
  }

  const base = "https://interno.pressacloud.com/pressa_external_backend/";
  const username = $os.getenv("PRESSA_USERNAME");
  const clientHash = $os.getenv("PRESSA_CLIENT_HASH");
  const passwordHash = $os.getenv("PRESSA_PASSWORD_HASH");
  if (!username || !clientHash || !passwordHash) {
    return c.json(502, { message: "Faltan las variables de entorno PRESSA_USERNAME / PRESSA_CLIENT_HASH / PRESSA_PASSWORD_HASH en el servidor." });
  }

  let loginRes;
  try {
    loginRes = $http.send({
      url: base + "ws_user_login.php",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      timeout: 20, // segundos — para que un Pressa lento/colgado falle claro en vez de tardar "muchísimo" sin avisar
      body: JSON.stringify({
        clientHash: clientHash,
        password: passwordHash,
        timestamp: Math.floor(Date.now() / 1000),
        username: username,
      }),
    });
  } catch (e) {
    return c.json(502, { message: "No se pudo conectar con Pressa (login): " + (e && e.message ? e.message : String(e)) });
  }
  const loginBody = loginRes.json || {};
  if (loginRes.statusCode !== 200 || loginBody.errorCode !== 0) {
    return c.json(502, { message: "Login a Pressa falló: " + (loginBody.displayMsg || ("HTTP " + loginRes.statusCode)) });
  }
  const sessionKey = loginBody.data.sessionKey;

  let monitorRes;
  try {
    monitorRes = $http.send({
      url: base + "ws_monitor_search.php",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      timeout: 20, // segundos — para que un Pressa lento/colgado falle claro en vez de tardar "muchísimo" sin avisar
      body: JSON.stringify({
        clientHash: clientHash,
        sessionKey: sessionKey,
        timestamp: Math.floor(Date.now() / 1000),
      }),
    });
  } catch (e) {
    return c.json(502, { message: "No se pudo conectar con Pressa (monitor): " + (e && e.message ? e.message : String(e)) });
  }
  const monitorBody = monitorRes.json || {};
  if (monitorRes.statusCode !== 200 || monitorBody.errorCode !== 0) {
    return c.json(502, { message: "Pressa devolvió un error: " + (monitorBody.displayMsg || ("HTTP " + monitorRes.statusCode)) });
  }

  const vehiculos = ((monitorBody.data && monitorBody.data.vehicles) || []).map((v) => {
    const veh = v.vehicle || {};
    // Pressa manda -999.9 como "sin sensor" en los canales de
    // temperatura que no están cableados — se descartan acá para no
    // mostrarlos como si fueran una lectura real.
    const temperaturas = [veh.currTemperature, veh.currTemperature2, veh.currTemperature3]
      .filter((t) => typeof t === "number" && t > -900);
    return {
      id: veh.id || "",
      alias: veh.alias || veh.name || "(sin alias)",
      patente: veh.licensePlate || "",
      marca: (veh.brand || "").trim(),
      modelo: (veh.model || "").trim(),
      estado: (veh.currEventCode && veh.currEventCode.description) || "",
      estadoColor: (veh.currEventCode && veh.currEventCode.color) || null,
      velocidad: veh.speed || 0,
      km: veh.odometer || 0,
      lat: typeof veh.lat === "number" ? veh.lat : null,
      lng: typeof veh.lng === "number" ? veh.lng : null,
      direccion: veh.address || "",
      actualizado: veh.timestamp || veh.datetime || null,
      temperaturas: temperaturas,
      bateriaAux: typeof veh.auxBatteryVolt === "number" ? veh.auxBatteryVolt : null,
      bateriaPrincipal: typeof veh.mainBatteryVolt === "number" ? veh.mainBatteryVolt : null,
    };
  });

  const payload = { total: vehiculos.length, vehiculos: vehiculos };

  // Guardar en cache no debe romper la respuesta si falla por algún
  // motivo — el dato ya está armado, se devuelve igual.
  try {
    const coleccion = dao.findCollectionByNameOrId("pressa_cache");
    const registro = cacheRow || new Record(coleccion);
    registro.set("clave", "monitor");
    registro.set("datos", payload);
    registro.set("actualizado", ahoraUnix);
    dao.saveRecord(registro);
  } catch (e) { /* no bloqueamos la respuesta si falla el guardado del cache */ }

  return c.json(200, payload);
}, $apis.requireRecordAuth("usuarios"));

// GET /api/flota/pressa/historico/:vid/:desde/:hasta -> recorrido (puntos
// GPS) de una unidad entre dos fechas (unix seconds), para dibujar como
// línea en el mapa. "desde"/"hasta" van como segmento de path (no query
// string) para reusar el mismo mecanismo ya probado en producción
// (c.pathParam, ver cheques.pb.js) en vez de arriesgar uno sin probar.
routerAdd("GET", "/api/flota/pressa/historico/:vid/:desde/:hasta", (c) => {
  const info = $apis.requestInfo(c);
  const auth = info.authRecord;

  const rawModulos = auth.get("modulos");
  const modulosTexto = (Array.isArray(rawModulos) ? String.fromCharCode.apply(null, rawModulos) : JSON.stringify(rawModulos || [])).toLowerCase();
  const tieneAcceso = auth.get("rol") === "admin" || modulosTexto.indexOf("flota_posicion") !== -1;
  if (!tieneAcceso) {
    return c.json(403, { message: "No tenés acceso al módulo de Posición de Flota." });
  }

  const vid = c.pathParam("vid");
  const startDate = parseInt(c.pathParam("desde"), 10);
  const endDate = parseInt(c.pathParam("hasta"), 10);
  if (!vid || !startDate || !endDate) {
    return c.json(400, { message: "Faltan vid/desde/hasta." });
  }
  // Este endpoint atiende UN tramo por llamada — partir un rango largo
  // en varios tramos y pedirlos EN PARALELO es responsabilidad del
  // frontend (ver RecorridoTab.tsx): así cada tramo pasa por su propio
  // login y su propia conexión, y el tiempo total lo manda el tramo
  // más lento, no la suma de todos (antes se pedían uno atrás de otro
  // acá adentro y un rango de 20 días tardaba 2.5 minutos). Este tope
  // es una salvaguarda para que un pedido directo a la API no le pida
  // a Pressa un solo tramo gigante.
  const RANGO_MAXIMO_DIAS_POR_LLAMADA = 5;
  const diasPedidos = Math.ceil((endDate - startDate) / 86400);
  if (diasPedidos > RANGO_MAXIMO_DIAS_POR_LLAMADA) {
    return c.json(400, { message: "Este tramo es de " + diasPedidos + " días — cada llamada acepta hasta " + RANGO_MAXIMO_DIAS_POR_LLAMADA + " días." });
  }

  const base = "https://interno.pressacloud.com/pressa_external_backend/";
  const username = $os.getenv("PRESSA_USERNAME");
  const clientHash = $os.getenv("PRESSA_CLIENT_HASH");
  const passwordHash = $os.getenv("PRESSA_PASSWORD_HASH");
  if (!username || !clientHash || !passwordHash) {
    return c.json(502, { message: "Faltan las variables de entorno PRESSA_USERNAME / PRESSA_CLIENT_HASH / PRESSA_PASSWORD_HASH en el servidor." });
  }

  let loginRes;
  try {
    loginRes = $http.send({
      url: base + "ws_user_login.php",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      timeout: 20, // segundos — para que un Pressa lento/colgado falle claro en vez de tardar "muchísimo" sin avisar
      body: JSON.stringify({
        clientHash: clientHash,
        password: passwordHash,
        timestamp: Math.floor(Date.now() / 1000),
        username: username,
      }),
    });
  } catch (e) {
    return c.json(502, { message: "No se pudo conectar con Pressa (login): " + (e && e.message ? e.message : String(e)) });
  }
  const loginBody = loginRes.json || {};
  if (loginRes.statusCode !== 200 || loginBody.errorCode !== 0) {
    return c.json(502, { message: "Login a Pressa falló: " + (loginBody.displayMsg || ("HTTP " + loginRes.statusCode)) });
  }
  const sessionKey = loginBody.data.sessionKey;

  let histRes;
  try {
    histRes = $http.send({
      url: base + "ws_report_historic.php",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      timeout: 40,
      body: JSON.stringify({
        clientHash: clientHash,
        sessionKey: sessionKey,
        timestamp: Math.floor(Date.now() / 1000),
        vid: vid,
        startDate: startDate,
        endDate: endDate,
        minSpeed: 0,
        maxSpeed: 250,
        skip: "0",
      }),
    });
  } catch (e) {
    return c.json(502, { message: "No se pudo conectar con Pressa (histórico): " + (e && e.message ? e.message : String(e)) });
  }
  const histBody = histRes.json || {};
  if (histRes.statusCode !== 200 || histBody.errorCode !== 0) {
    return c.json(502, { message: "Pressa devolvió un error: " + (histBody.displayMsg || ("HTTP " + histRes.statusCode)) });
  }

  const data = histBody.data || {};
  const eventos = data.events || [];
  let puntos = eventos
    .map((e) => ({
      lat: e.location && typeof e.location.lat === "number" ? e.location.lat : null,
      lng: e.location && typeof e.location.lng === "number" ? e.location.lng : null,
      timestamp: e.datetime || null,
      velocidad: e.speed || 0,
    }))
    .filter((p) => p.lat !== null && p.lng !== null);

  // Una unidad muy activa en 5 días puede traer bastantes puntos — se
  // afinan a una muestra pareja (conservando siempre el primero y el
  // último) para que la respuesta no se vuelva pesada. El frontend, que
  // junta varios tramos, hace su propio recorte adicional sobre el total.
  const MAX_PUNTOS = 800;
  if (puntos.length > MAX_PUNTOS) {
    const paso = Math.ceil(puntos.length / MAX_PUNTOS);
    const afinados = puntos.filter((_, i) => i % paso === 0);
    const ultimo = puntos[puntos.length - 1];
    if (afinados[afinados.length - 1] !== ultimo) afinados.push(ultimo);
    puntos = afinados;
  }

  const general = data.general || {};
  return c.json(200, {
    total: data.total || eventos.length,
    puntos: puntos,
    resumen: {
      distanciaKm: general.totalDist || 0,
      velocidadMax: general.maxSpeed || 0,
      velocidadPromedio: general.midSpeed || 0,
    },
  });
}, $apis.requireRecordAuth("usuarios"));

// GET /api/flota/pressa/distancia/:desde/:hasta -> km real recorrido por
// toda la flota en un período (Report Fleet Distance WS). Sin "vids" en
// el pedido devuelve todas las unidades de la cuenta, según el propio
// documento de Pressa.
//   OJO: el documento de Pressa que nos pasaron tiene el bloque de
//   parámetros de este servicio idéntico al de "User Vehicles" (sin
//   startDate/endDate listados) pese a que la descripción dice que
//   devuelve distancia "en un periodo de tiempo" — es casi seguro un
//   error de copiado del PDF. Se mandan startDate/endDate igual, mismo
//   nombre que usa Historic WS; si Pressa los ignora o pide otro
//   nombre, el error 502 de acá abajo va a traer el mensaje real de
//   Pressa para poder ajustarlo.
routerAdd("GET", "/api/flota/pressa/distancia/:desde/:hasta", (c) => {
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

  const base = "https://interno.pressacloud.com/pressa_external_backend/";
  const username = $os.getenv("PRESSA_USERNAME");
  const clientHash = $os.getenv("PRESSA_CLIENT_HASH");
  const passwordHash = $os.getenv("PRESSA_PASSWORD_HASH");
  if (!username || !clientHash || !passwordHash) {
    return c.json(502, { message: "Faltan las variables de entorno PRESSA_USERNAME / PRESSA_CLIENT_HASH / PRESSA_PASSWORD_HASH en el servidor." });
  }

  let loginRes;
  try {
    loginRes = $http.send({
      url: base + "ws_user_login.php",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      timeout: 20, // segundos — para que un Pressa lento/colgado falle claro en vez de tardar "muchísimo" sin avisar
      body: JSON.stringify({
        clientHash: clientHash,
        password: passwordHash,
        timestamp: Math.floor(Date.now() / 1000),
        username: username,
      }),
    });
  } catch (e) {
    return c.json(502, { message: "No se pudo conectar con Pressa (login): " + (e && e.message ? e.message : String(e)) });
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
      // Toda la flota junta en un rango largo — misma lógica que el
      // histórico, le damos más margen que a login/monitor.
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

  const unidades = ((distBody.data && distBody.data.vehicles) || []).map((v) => ({
    alias: v.alias || v.name || "(sin alias)",
    patente: v.licensePlate || "",
    distanciaKm: v.distance || 0,
    velocidadMin: v.minSpeed || 0,
    velocidadMax: v.maxSpeed || 0,
  }));

  return c.json(200, { total: unidades.length, unidades: unidades });
}, $apis.requireRecordAuth("usuarios"));
