/// <reference path="../pb_data/types.d.ts" />

// Módulo "Control de Cheques": dos rutas propias que actúan de proxy server-side
// (así el navegador nunca necesita la clave de Claude ni pega directo a una API
// de gobierno con problemas de CORS).
//   POST /api/cheques/extraer-cuit  -> le manda la imagen a Claude y devuelve
//        los cheques que identificó (CUIT, número, monto, nombre).
//   GET  /api/cheques/bcra/:cuit    -> consulta la Central de Deudores del BCRA
//        y devuelve si ese CUIT tiene cheques rechazados.

function checkAccesoControlCheques(info) {
  const auth = info.authRecord;
  if (!auth) return false;
  if (auth.get("rol") === "admin") return true;
  const modulos = auth.get("modulos") || [];
  return modulos.indexOf("control_cheques") !== -1;
}

routerAdd("POST", "/api/cheques/extraer-cuit", (c) => {
  const info = $apis.requestInfo(c);
  if (!checkAccesoControlCheques(info)) {
    return c.json(403, { message: "No tenés acceso al módulo de Control de Cheques." });
  }

  const data = info.data || {};
  const imageBase64 = data.image_base64;
  const mediaType = data.media_type || "image/jpeg";
  if (!imageBase64) {
    return c.json(400, { message: "Falta la imagen (image_base64)." });
  }

  const apiKey = $os.getenv("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return c.json(500, { message: "El servidor no tiene configurada ANTHROPIC_API_KEY." });
  }

  const schema = {
    type: "object",
    properties: {
      cheques: {
        type: "array",
        items: {
          type: "object",
          properties: {
            cuit_emisor: {
              type: ["string", "null"],
              description: "CUIT del emisor del cheque, 11 dígitos sin guiones ni puntos. null si no es legible.",
            },
            numero_cheque: { type: ["string", "null"] },
            monto: { type: ["number", "null"] },
            emisor_nombre: { type: ["string", "null"] },
          },
          required: ["cuit_emisor", "numero_cheque", "monto", "emisor_nombre"],
          additionalProperties: false,
        },
      },
    },
    required: ["cheques"],
    additionalProperties: false,
  };

  const body = {
    model: "claude-opus-5",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
          {
            type: "text",
            text:
              "Esta es una captura de pantalla de una app bancaria (Banco Macro) mostrando uno o " +
              "más cheques electrónicos pendientes de aceptar. Extraé, para cada cheque visible: el " +
              "CUIT del emisor (11 dígitos, sin guiones ni puntos), el número de cheque si es " +
              "legible, el monto si es legible, y el nombre del emisor si aparece. Si un dato no es " +
              "legible o no aparece en la imagen, usá null para ese campo puntual. No inventes " +
              "datos que no estén en la imagen.",
          },
        ],
      },
    ],
    output_config: { format: { type: "json_schema", schema: schema } },
  };

  const res = $http.send({
    url: "https://api.anthropic.com/v1/messages",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (res.statusCode !== 200) {
    return c.json(502, { message: "Error consultando la IA.", detalle: res.json });
  }

  try {
    const blocks = (res.json && res.json.content) || [];
    const textBlock = blocks.filter((b) => b.type === "text")[0];
    const parsed = JSON.parse(textBlock.text);
    return c.json(200, parsed);
  } catch (e) {
    return c.json(502, { message: "No se pudo interpretar la respuesta de la IA." });
  }
}, $apis.requireRecordAuth("usuarios"));

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
