import { Fragment, useEffect, useRef, useState } from 'react';
import { pb } from '../../lib/pb';
import { useToast } from '../../lib/ToastContext';
import { useConfirm } from '../../lib/ConfirmContext';
import { fechaHora } from '../../lib/format';
import type { TarifaBotAjuste } from '../../types';

// Cuánto esperar por un resultado antes de avisar que puede que el conector
// no esté instalado en esta PC (el bot en sí puede demorar hasta ~10 minutos
// en el paso de Acuerdos Especiales — no dejamos de esperar antes de eso).
const SEGUNDOS_AVISO_SIN_RESPUESTA = 30;
const MINUTOS_LIMITE_ESPERA = 15;

export function BotTarifasPage() {
  const toast = useToast();
  const confirm = useConfirm();

  const [porcentaje, setPorcentaje] = useState('');
  const [linkListo, setLinkListo] = useState<string | null>(null);
  const [esperando, setEsperando] = useState(false);
  const [avisoTardanza, setAvisoTardanza] = useState(false);
  const [historial, setHistorial] = useState<TarifaBotAjuste[]>([]);
  const [cargandoHistorial, setCargandoHistorial] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const avisoRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const limiteRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // epoch en ms, no texto: el "created" de PocketBase separa fecha y hora con
  // un espacio ("2026-09-22 12:34:56") y no con "T" como toISOString() -- una
  // comparación de strings entre los dos formatos nunca da el resultado
  // esperado, aunque los dos representen el mismo instante.
  const disparadoDesde = useRef<number | null>(null);

  useEffect(() => {
    cargarHistorial();
    return () => detenerEspera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function cargarHistorial() {
    setCargandoHistorial(true);
    try {
      const items = await pb.collection('tarifas_bot_ajustes').getFullList<TarifaBotAjuste>({ sort: '-created' });
      setHistorial(items);
      return items;
    } catch (e) {
      toast('No se pudo cargar el historial: ' + (e instanceof Error ? e.message : ''), 'err');
      return [];
    } finally {
      setCargandoHistorial(false);
    }
  }

  function detenerEspera() {
    if (pollRef.current) clearInterval(pollRef.current);
    if (avisoRef.current) clearTimeout(avisoRef.current);
    if (limiteRef.current) clearTimeout(limiteRef.current);
    pollRef.current = null;
    avisoRef.current = null;
    limiteRef.current = null;
  }

  function empezarAEsperarResultado() {
    detenerEspera();
    setEsperando(true);
    setAvisoTardanza(false);
    disparadoDesde.current = Date.now();

    pollRef.current = setInterval(async () => {
      const items = await cargarHistorial();
      const nuevo = items.find((it) => disparadoDesde.current != null && new Date(it.created.replace(' ', 'T')).getTime() > disparadoDesde.current);
      if (nuevo) {
        detenerEspera();
        setEsperando(false);
        toast(nuevo.exito ? 'Tarifas actualizadas.' : 'El bot terminó con un error — revisá el detalle abajo.', nuevo.exito ? 'ok' : 'err');
      }
    }, 3000);

    avisoRef.current = setTimeout(() => setAvisoTardanza(true), SEGUNDOS_AVISO_SIN_RESPUESTA * 1000);
    limiteRef.current = setTimeout(() => {
      detenerEspera();
      setEsperando(false);
      toast(`Pasaron ${MINUTOS_LIMITE_ESPERA} minutos sin resultado. Si el bot sigue corriendo en la PC, va a quedar igual en el historial cuando termine — actualizá esta pantalla más tarde.`, 'warn');
    }, MINUTOS_LIMITE_ESPERA * 60 * 1000);
  }

  async function ejecutar() {
    const limpio = porcentaje.replace(',', '.').trim();
    const valor = Number(limpio);
    if (!limpio || Number.isNaN(valor) || valor <= 0 || valor > 50) {
      toast('Ingresá un porcentaje válido, mayor a 0 y hasta 50.', 'warn');
      return;
    }
    const ok = await confirm(
      `Se va a aplicar un ajuste de +${limpio}% a TODAS las tarifas del sistema de ventas ` +
      '(Clientes, Acuerdos Especiales, General por Tipo de Carga, Generales Básicas), en todas las sucursales.\n\n' +
      'Se va a abrir Chrome en ESTA computadora para hacerlo — tiene que tener el conector instalado. ' +
      '¿Confirmar y continuar?',
      'Actualizar tarifas',
    );
    if (!ok) return;

    const token = pb.authStore.token;
    if (!token) { toast('Tu sesión no tiene token válido — recargá la página e iniciá sesión de nuevo.', 'err'); return; }
    const url = `bottarifas://ejecutar?porcentaje=${encodeURIComponent(limpio)}&token=${encodeURIComponent(token)}&pbUrl=${encodeURIComponent(pb.baseUrl)}`;
    // Dejamos que lo dispare un click real del usuario sobre un <a href>,
    // en vez de hacerlo nosotros por JS (location.href o un iframe): un
    // navegador puede tratar distinto una navegación a un protocolo propio
    // según si viene de un gesto genuino del usuario o de código — con un
    // click real es como funciona en todos lados (mailto:, etc.) y evita
    // que el intento quede bloqueado en silencio.
    setLinkListo(url);
  }

  function onClickLink() {
    empezarAEsperarResultado();
    setLinkListo(null);
  }

  function toggleExpand(id: string) {
    setExpanded((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <main>
      <div className="card">
        <h2>Actualizar Tarifas</h2>
        <div className="hint">
          Aplica un aumento por porcentaje a todas las tarifas del sistema de ventas (clientes, acuerdos especiales,
          tipo de carga y generales) en todas las sucursales. Corre en esta PC — hace falta tener instalado el
          conector (bot) una sola vez.
        </div>
        <div className="hint" style={{ marginBottom: 10 }}>
          ¿Primera vez en esta PC? Pedile a Sistemas el instalador — está en el share interno,{' '}
          <code>\\SRV-DOCUMENTOS\SISTEMAS$\DESARROLLO CyV\Bot Tarifas - Instalador\</code>. Doble clic y queda
          instalado, sin pedir nada más.
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <div className="field">
            <label>Porcentaje de aumento</label>
            <input
              type="text"
              inputMode="decimal"
              value={porcentaje}
              disabled={esperando}
              onChange={(e) => setPorcentaje(e.target.value)}
              placeholder="ej: 5"
              style={{ width: 100 }}
            />
          </div>
          <button onClick={ejecutar} disabled={esperando || !!linkListo}>{esperando ? 'Esperando resultado…' : 'Actualizar tarifas'}</button>
        </div>
        {linkListo && (
          <div className="hint" style={{ marginTop: 10, padding: 10, border: '1px solid var(--brand)', borderRadius: 6 }}>
            Confirmado. Por seguridad del navegador, el último paso lo tenés que hacer vos con un clic directo:{' '}
            <a className="link" href={linkListo} onClick={onClickLink} style={{ fontWeight: 700 }}>
              hacé clic acá para abrir el bot en esta PC
            </a>.
            <br />
            <strong>Después de ese clic, el navegador te va a preguntar si confirmás.</strong> Según el navegador que
            uses se ve distinto: en Firefox aparece un recuadro oscuro en el medio de la pantalla ("¿Permitir que
            este archivo abra el enlace bottarifas con Python?") con un botón "Abrir enlace"; en Chrome/Edge aparece
            un cartelito chico arriba, cerca de la barra de direcciones. Decile que sí. Si tildás la opción de
            "recordar"/"siempre permitir", la próxima vez no vuelve a preguntar.
          </div>
        )}
        {esperando && (
          <div className="hint" style={{ marginTop: 10 }}>
            Debería haberse abierto Chrome en esta PC. No cierres esta pestaña — el resultado aparece acá solo, y
            también queda en el historial de abajo.
            {avisoTardanza && (
              <div style={{ marginTop: 6, color: 'var(--warn)' }}>
                Pasó más de medio minuto sin respuesta. <strong>Fijate si el navegador te mostró una pregunta de
                confirmación</strong> — en Firefox es un recuadro oscuro en el medio de la pantalla, en Chrome/Edge
                un cartelito chico arriba cerca de la barra de direcciones. Es fácil no verla la primera vez. Si
                está ahí, confirmá que sí. Si no aparece nada y tampoco se abre Chrome, puede que falte instalar el
                conector en esta PC (avisale a Sistemas) — el bot en el paso de Acuerdos Especiales puede tardar
                igual hasta 10 minutos una vez que arrancó.
              </div>
            )}
          </div>
        )}
      </div>

      <div className="card">
        <h2>Historial</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th></th><th>Fecha</th><th>Ejecutado por</th><th className="num">Porcentaje</th><th>Resultado</th>
              </tr>
            </thead>
            <tbody>
              {historial.map((h) => {
                const open = expanded.has(h.id);
                const sucursales = Object.entries(h.sucursales || {});
                const basicas = Object.entries(h.basicas || {});
                return (
                  <Fragment key={h.id}>
                    <tr>
                      <td><button className={`expand-btn${open ? ' open' : ''}`} onClick={() => toggleExpand(h.id)}>{open ? '▾' : '▸'}</button></td>
                      <td>{fechaHora(h.created)}</td>
                      <td>{h.ejecutado_por || '—'}</td>
                      <td className="num">{h.porcentaje}%</td>
                      <td>
                        {h.exito ? (
                          <span className="badge" style={{ color: 'var(--ok)', borderColor: 'var(--ok)' }}>OK</span>
                        ) : (
                          <span className="badge" style={{ color: 'var(--err)', borderColor: 'var(--err)' }}>Error</span>
                        )}
                      </td>
                    </tr>
                    <tr className={`detail-row${open ? ' open' : ''}`}>
                      <td></td>
                      <td colSpan={4}>
                        {h.error && <div style={{ color: 'var(--err)', marginBottom: 8 }}>{h.error}</div>}
                        {sucursales.length > 0 && (
                          <div className="detail-grid">
                            {sucursales.map(([suc, s]) => (
                              <div className="d-item" key={suc}>
                                <div className="lbl">Sucursal {suc}</div>
                                <div className="val">
                                  {s.antes ?? '—'} → {s.despues ?? '—'}
                                  {s.cambio_pct != null ? ` (${s.cambio_pct}%)` : ''}{' '}
                                  {s.ok ? <span style={{ color: 'var(--ok)' }}>✔</span> : <span style={{ color: 'var(--err)' }}>✘</span>}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        {basicas.length > 0 && (
                          <div className="detail-grid" style={{ marginTop: sucursales.length > 0 ? 10 : 0 }}>
                            {basicas.map(([etiqueta, s]) => (
                              <div className="d-item" key={etiqueta}>
                                <div className="lbl">Generales Básicas: {etiqueta}</div>
                                <div className="val">
                                  {s.antes ?? '—'} → {s.despues ?? '—'}
                                  {s.cambio_pct != null ? ` (${s.cambio_pct}%)` : ''}{' '}
                                  {s.ok ? <span style={{ color: 'var(--ok)' }}>✔</span> : <span style={{ color: 'var(--err)' }}>✘</span>}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          {!cargandoHistorial && historial.length === 0 && <div className="empty">Todavía no se corrió el bot desde acá.</div>}
        </div>
      </div>
    </main>
  );
}
