/// <reference path="../pb_data/types.d.ts" />

// "Bot Act Tarifas": un bot en Python + Selenium que corre en una PC de la
// oficina (necesita Chrome real) y aplica un aumento porcentual a las
// tarifas de un sistema de un tercero (ventascyv...). No es parte de este
// backend: acá solo se guarda el RESULTADO de cada corrida, para verlo
// desde Sistema CyV. El bot se lanza desde el navegador con un protocolo
// propio (bottarifas://...) y, al terminar, manda su resultado acá con el
// mismo token del usuario que lo disparó -- por eso alcanza con completar
// ejecutado_por server-side como en el resto del sistema (no confiar en lo
// que mande el cliente).
onRecordBeforeCreateRequest((e) => {
  const auth = $apis.requestInfo(e.httpContext).authRecord;
  e.record.set("ejecutado_por", auth ? (auth.get("nombre") || auth.get("username") || auth.id) : "");
}, "tarifas_bot_ajustes");
