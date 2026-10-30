/// <reference path="../pb_data/types.d.ts" />
// Segmentacion por sucursal, parte 2: ahora que cotizaciones/vales_caja/
// recibos tienen el campo `sucursal` (ver 1789330000), se usa en
// listRule/viewRule para que un usuario no-admin solo vea los registros
// de su propia sucursal. Admin sigue viendo todo. cotizacion_items no
// tiene su propio campo sucursal (seria redundante con el de su
// cotizacion padre) -- filtra via la relacion (cotizacion.sucursal).
// vales_caja ademas de "admin" y "vale_caja+misma sucursal" deja pasar a
// cualquiera con "planilla_choferes" SIN filtrar por sucursal: los vales
// siempre se cargan en San Francisco, asi que quien concilia anticipos de
// choferes (Planilla Choferes) tiene que poder ver todos, sea de la
// sucursal que sea (confirmado con el usuario).
// Ver docs/superpowers/specs/2026-10-30-segmentacion-por-sucursal-design.md
migrate((db) => {
  const dao = new Dao(db);

  const reglaCotizador = '@request.auth.id != "" && (@request.auth.rol = "admin" || (@request.auth.modulos ~ "cotizador" && sucursal = @request.auth.sucursal))';
  const cotizaciones = dao.findCollectionByNameOrId('cotizaciones01');
  cotizaciones.listRule = reglaCotizador;
  cotizaciones.viewRule = reglaCotizador;
  dao.saveCollection(cotizaciones);

  const reglaItems = '@request.auth.id != "" && (@request.auth.rol = "admin" || (@request.auth.modulos ~ "cotizador" && cotizacion.sucursal = @request.auth.sucursal))';
  const items = dao.findCollectionByNameOrId('cotizacionitm1');
  items.listRule = reglaItems;
  items.viewRule = reglaItems;
  dao.saveCollection(items);

  const reglaValesCaja = '@request.auth.id != "" && (@request.auth.rol = "admin" || @request.auth.modulos ~ "planilla_choferes" || (@request.auth.modulos ~ "vale_caja" && sucursal = @request.auth.sucursal))';
  const valesCaja = dao.findCollectionByNameOrId('vales_caja');
  valesCaja.listRule = reglaValesCaja;
  valesCaja.viewRule = reglaValesCaja;
  dao.saveCollection(valesCaja);

  const reglaRecibos = '@request.auth.id != "" && (@request.auth.rol = "admin" || (@request.auth.modulos ~ "recibos" && sucursal = @request.auth.sucursal))';
  const recibos = dao.findCollectionByNameOrId('recibos');
  recibos.listRule = reglaRecibos;
  recibos.viewRule = reglaRecibos;
  dao.saveCollection(recibos);

  return null;
}, (db) => {
  const dao = new Dao(db);

  const reglaCotizadorVieja = '@request.auth.id != "" && (@request.auth.rol = "admin" || @request.auth.modulos ~ "cotizador")';
  const cotizaciones = dao.findCollectionByNameOrId('cotizaciones01');
  cotizaciones.listRule = reglaCotizadorVieja;
  cotizaciones.viewRule = reglaCotizadorVieja;
  dao.saveCollection(cotizaciones);

  const items = dao.findCollectionByNameOrId('cotizacionitm1');
  items.listRule = reglaCotizadorVieja;
  items.viewRule = reglaCotizadorVieja;
  dao.saveCollection(items);

  const reglaValesCajaVieja = '@request.auth.id != "" && (@request.auth.rol = "admin" || @request.auth.modulos ~ "vale_caja" || @request.auth.modulos ~ "planilla_choferes")';
  const valesCaja = dao.findCollectionByNameOrId('vales_caja');
  valesCaja.listRule = reglaValesCajaVieja;
  valesCaja.viewRule = reglaValesCajaVieja;
  dao.saveCollection(valesCaja);

  const reglaRecibosVieja = '@request.auth.id != "" && (@request.auth.rol = "admin" || @request.auth.modulos ~ "recibos")';
  const recibos = dao.findCollectionByNameOrId('recibos');
  recibos.listRule = reglaRecibosVieja;
  recibos.viewRule = reglaRecibosVieja;
  dao.saveCollection(recibos);

  return null;
})
