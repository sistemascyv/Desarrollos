/// <reference path="../pb_data/types.d.ts" />

// Integración con la API de PRESSA (satelital de la flota) — mismo
// patrón que cheques.pb.js/deudores.pb.js: el navegador nunca habla
// directo con Pressa (evita CORS, y no expone las credenciales en el
// bundle del frontend), este hook hace de proxy server-side.
//   GET /api/flota/pressa/monitor -> posición y estado actual de toda
//       la flota (ws_monitor_search.php).
//
// Credenciales: Pressa pide el SHA1 del usuario como "clientHash" y el
// SHA1 de la contraseña como "password" — nunca la contraseña en texto
// plano. Se leen de variables de entorno (cargadas server-side por el
// deploy, ver .github/workflows/deploy.yml), no quedan escritas acá.
// Usuario Pressa: "carossiows", provisto por Pressa el 2026-09-11, con
// las 4 unidades que tenemos con ellos ya asignadas de su lado.
const PRESSA_BASE = "https://interno.pressacloud.com/pressa_external_backend/";

// Sesión cacheada en memoria del proceso — se reloguea sola si Pressa
// dice que ya no es válida (errorCode 6 = ERR_INVALID_SESSION), no hay
// que loguear en cada request.
let pressaSessionKey = null;

function pressaPost(endpoint, body) {
  const res = $http.send({
    url: PRESSA_BASE + endpoint,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { statusCode: res.statusCode, body: res.json || {} };
}

function pressaLogin() {
  const username = $os.getenv("PRESSA_USERNAME");
  const clientHash = $os.getenv("PRESSA_CLIENT_HASH");
  const passwordHash = $os.getenv("PRESSA_PASSWORD_HASH");
  if (!username || !clientHash || !passwordHash) {
    throw new Error("Faltan las variables de entorno PRESSA_USERNAME / PRESSA_CLIENT_HASH / PRESSA_PASSWORD_HASH en el servidor.");
  }
  const res = pressaPost("ws_user_login.php", {
    clientHash: clientHash,
    password: passwordHash,
    timestamp: Math.floor(Date.now() / 1000),
    username: username,
  });
  if (res.statusCode !== 200 || !res.body || res.body.errorCode !== 0) {
    throw new Error("Login a Pressa falló: " + (res.body && res.body.displayMsg ? res.body.displayMsg : "HTTP " + res.statusCode));
  }
  pressaSessionKey = res.body.data.sessionKey;
  return pressaSessionKey;
}

// Llama un endpoint de Pressa que necesita sesión, relogueando una vez
// si la sesión cacheada ya no sirve.
function pressaCallConSesion(endpoint, extraBody) {
  if (!pressaSessionKey) pressaLogin();
  function intentar() {
    return pressaPost(endpoint, Object.assign({
      clientHash: $os.getenv("PRESSA_CLIENT_HASH"),
      sessionKey: pressaSessionKey,
      timestamp: Math.floor(Date.now() / 1000),
    }, extraBody || {}));
  }
  let res = intentar();
  if (res.body && res.body.errorCode === 6) {
    pressaLogin();
    res = intentar();
  }
  return res;
}

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

  let res;
  try {
    res = pressaCallConSesion("ws_monitor_search.php", {});
  } catch (e) {
    return c.json(502, { message: "No se pudo conectar con Pressa: " + (e && e.message ? e.message : String(e)) });
  }
  if (!res.body || res.body.errorCode !== 0) {
    return c.json(502, { message: "Pressa devolvió un error: " + (res.body && res.body.displayMsg ? res.body.displayMsg : "desconocido") });
  }

  const vehiculos = ((res.body.data && res.body.data.vehicles) || []).map((v) => {
    const veh = v.vehicle || {};
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
    };
  });

  return c.json(200, { total: vehiculos.length, vehiculos: vehiculos });
}, $apis.requireRecordAuth("usuarios"));
