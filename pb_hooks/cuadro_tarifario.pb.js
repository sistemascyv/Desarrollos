/// <reference path="../pb_data/types.d.ts" />
// Cuadro Tarifario: el unico endpoint que puede escribir en
// cuadro_tarifario y cuadro_tarifario_minimos (ninguna tiene
// createRule/updateRule para usuarios normales -- ver
// pb_migrations/1789230000_created_cuadro_tarifario.js y
// pb_migrations/1789260000_created_cuadro_tarifario_minimos.js).
// Recalcula TODAS las filas (seco+frio+congelado juntas) MAS los minimos
// por sucursal, aplicando el mismo % a todo -- no hay un % independiente
// por categoria ni para los minimos. Sin historial de cada aplicacion
// (decidido explicitamente en el spec).

// Los helpers van adentro del handler: PocketBase corre los callbacks en un
// contexto que no ve funciones declaradas afuera (mismo motivo que en
// planilla.pb.js y cheques.pb.js). Con helpers globales falla con
// "ReferenceError: leerJson is not defined".
routerAdd("POST", "/api/cuadro-tarifario/aplicar-porcentaje", (c) => {
  function redondear2(n) {
    return Math.round(n * 100) / 100;
  }

  // Un campo "json" leido desde un record puede llegar como objeto ya
  // parseado, como texto, o (mismo problema ya visto con auth.get("modulos")
  // en otras colecciones de este proyecto) como arreglo de bytes -- se
  // normaliza a texto antes de parsear para cubrir los 3 casos.
  function leerJson(raw) {
    if (raw === null || raw === undefined || raw === '') return null;
    if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
    const texto = Array.isArray(raw) ? String.fromCharCode.apply(null, raw) : String(raw);
    return JSON.parse(texto);
  }

  const info = $apis.requestInfo(c);
  const auth = info.authRecord;
  if (!auth || auth.get("rol") !== "admin") {
    throw new ForbiddenError("Solo un administrador puede aplicar el porcentaje.");
  }

  const body = info.data || {};
  const porcentaje = Number(body.porcentaje);
  if (!porcentaje || Number.isNaN(porcentaje) || porcentaje <= 0 || porcentaje > 50) {
    return c.json(400, { message: "Ingresá un porcentaje válido, mayor a 0 y hasta 50." });
  }
  const factor = 1 + porcentaje / 100;

  const dao = $app.dao();
  const coleccion = dao.findCollectionByNameOrId("cuadro_tarifario");
  // Filtro real, no vacio -- un filtro "" rompe findRecordsByFilter en
  // esta version de PocketBase (ya confirmado varias veces en este
  // proyecto).
  const filas = dao.findRecordsByFilter(coleccion.id, "rango_kg_desde >= 0", "", 500, 0);

  filas.forEach((f) => {
    if (f.get("categoria") === "seco") {
      const valores = leerJson(f.get("valores")) || {};
      const nuevos = {};
      Object.keys(valores).forEach((k) => {
        nuevos[k] = redondear2(valores[k] * factor);
      });
      f.set("valores", nuevos);
    } else {
      const valorActual = Number(f.get("valor")) || 0;
      f.set("valor", redondear2(valorActual * factor));
    }
    dao.saveRecord(f);
  });

  // Filtro real, no vacio -- mismo motivo que arriba.
  const minimos = dao.findFirstRecordByFilter("cuadro_tarifario_minimos", "cordoba >= 0");
  ["cordoba", "san_francisco", "rosario", "buenos_aires"].forEach((campo) => {
    minimos.set(campo, redondear2((Number(minimos.get(campo)) || 0) * factor));
  });
  dao.saveRecord(minimos);

  return c.json(200, { ok: true, filas_actualizadas: filas.length });
});
