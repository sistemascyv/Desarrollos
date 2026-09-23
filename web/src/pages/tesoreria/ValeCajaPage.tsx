import { useEffect, useState } from 'react';
import { pb } from '../../lib/pb';
import { useToast } from '../../lib/ToastContext';
import { isoDate, fechaSola } from '../../lib/format';
import { useAuth } from '../../lib/AuthContext';
import { useConfirm } from '../../lib/ConfirmContext';
import { importeEnLetras } from '../../lib/numeroEnLetras';
import type { Chofer, ValeCaja } from '../../types';

export function ValeCajaPage() {
  const toast = useToast();
  const { isAdmin } = useAuth();
  const confirm = useConfirm();
  const [historial, setHistorial] = useState<(ValeCaja & { expand?: { chofer?: Chofer } })[]>([]);
  const [filtroChofer, setFiltroChofer] = useState('');

  const [choferes, setChoferes] = useState<Chofer[]>([]);
  const [choferId, setChoferId] = useState('');
  const [fecha, setFecha] = useState(() => isoDate(new Date()));
  const [importe, setImporte] = useState('');
  const [moneda, setMoneda] = useState<'ARS' | 'BRL'>('ARS');
  const [observacion1, setObservacion1] = useState('');
  const [observacion2, setObservacion2] = useState('');
  const [nombreFirma, setNombreFirma] = useState('');
  const [nombreFirmaTocado, setNombreFirmaTocado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [ultimoCreado, setUltimoCreado] = useState<ValeCaja | null>(null);
  const [paraImprimir, setParaImprimir] = useState<(ValeCaja & { expand?: { chofer?: Chofer } }) | null>(null);

  function imprimir(v: ValeCaja & { expand?: { chofer?: Chofer } }) {
    setParaImprimir(v);
    document.body.classList.add('imprimiendo-vale');
    const estiloPagina = document.createElement('style');
    estiloPagina.textContent = '@media print { @page { size: A4; margin: 0; } }';
    document.head.appendChild(estiloPagina);
    setTimeout(() => {
      try {
        window.print();
      } finally {
        document.body.classList.remove('imprimiendo-vale');
        document.head.removeChild(estiloPagina);
      }
    }, 50);
  }

  useEffect(() => {
    pb.collection('choferes').getFullList<Chofer>({ filter: 'activo=true', sort: 'nombre' })
      .then(setChoferes)
      .catch((e) => toast('No se pudieron cargar los choferes: ' + (e instanceof Error ? e.message : ''), 'err'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function cargarHistorial() {
    try {
      const filtro = filtroChofer ? pb.filter('chofer = {:c}', { c: filtroChofer }) : '';
      const items = await pb.collection('vales_caja').getList<ValeCaja & { expand?: { chofer?: Chofer } }>(1, 50, {
        filter: filtro, sort: '-numero', expand: 'chofer',
      });
      setHistorial(items.items);
    } catch (e) {
      toast('No se pudo cargar el historial: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }

  useEffect(() => {
    cargarHistorial();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroChofer]);

  function elegirChofer(id: string) {
    setChoferId(id);
    if (!nombreFirmaTocado) {
      const c = choferes.find((x) => x.id === id);
      if (c) setNombreFirma(c.nombre);
    }
  }

  function limpiar() {
    setChoferId('');
    setFecha(isoDate(new Date()));
    setImporte('');
    setMoneda('ARS');
    setObservacion1('');
    setObservacion2('');
    setNombreFirma('');
    setNombreFirmaTocado(false);
    setUltimoCreado(null);
  }

  async function eliminar(id: string, numero: number) {
    const ok = await confirm(`¿Eliminar el Vale de Caja N° ${numero}? No se puede deshacer.`, 'Eliminar vale');
    if (!ok) return;
    try {
      await pb.collection('vales_caja').delete(id);
      toast('Vale eliminado.', 'ok');
      cargarHistorial();
    } catch (e) {
      toast('No se pudo eliminar: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }

  async function liberar(id: string) {
    try {
      await pb.send(`/api/vales-caja/${id}/liberar`, { method: 'POST' });
      toast('Vale liberado.', 'ok');
      cargarHistorial();
    } catch (e) {
      toast('No se pudo liberar el vale: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }

  async function guardar() {
    const valor = Number(importe.replace(',', '.'));
    if (!choferId) { toast('Elegí un chofer.', 'warn'); return; }
    if (!fecha) { toast('Elegí una fecha.', 'warn'); return; }
    if (!valor || valor <= 0) { toast('El importe tiene que ser mayor a cero.', 'warn'); return; }
    if (!nombreFirma.trim()) { toast('Falta el nombre de quien firma.', 'warn'); return; }

    setGuardando(true);
    try {
      const creado = await pb.collection('vales_caja').create<ValeCaja>({
        fecha, chofer: choferId, importe: valor, moneda,
        observacion1: observacion1.trim() || undefined,
        observacion2: observacion2.trim() || undefined,
        nombre_firma: nombreFirma.trim(),
      });
      setUltimoCreado(creado);
      toast(`Vale de Caja N° ${creado.numero} guardado.`, 'ok');
      cargarHistorial();
    } catch (e) {
      toast('No se pudo guardar el vale: ' + (e instanceof Error ? e.message : ''), 'err');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <main>
      <div className="card">
        <h2 style={{ margin: 0 }}>Vale de Caja</h2>
        <div className="hint">Pago en efectivo a un chofer. Recibí de Carossio Vairolatti y Cía SRL.</div>

        <div className="row" style={{ marginTop: 14, flexWrap: 'wrap' }}>
          <div className="field">
            <label>Chofer</label>
            <select value={choferId} onChange={(e) => elegirChofer(e.target.value)} disabled={!!ultimoCreado}>
              <option value="">Elegir...</option>
              {choferes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Fecha</label>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} disabled={!!ultimoCreado} />
          </div>
          <div className="field">
            <label>Importe</label>
            <input inputMode="decimal" placeholder="ej: 50000" value={importe} onChange={(e) => setImporte(e.target.value)} disabled={!!ultimoCreado} style={{ width: 120 }} />
          </div>
          <div className="field">
            <label>Moneda</label>
            <select value={moneda} onChange={(e) => setMoneda(e.target.value as 'ARS' | 'BRL')} disabled={!!ultimoCreado}>
              <option value="ARS">Pesos Argentinos</option>
              <option value="BRL">Reales</option>
            </select>
          </div>
        </div>

        <div className="row" style={{ marginTop: 10, flexWrap: 'wrap' }}>
          <div className="field" style={{ flex: 1, minWidth: 260 }}>
            <label>Observación 1</label>
            <input value={observacion1} onChange={(e) => setObservacion1(e.target.value)} disabled={!!ultimoCreado} />
          </div>
          <div className="field" style={{ flex: 1, minWidth: 260 }}>
            <label>Observación 2</label>
            <input value={observacion2} onChange={(e) => setObservacion2(e.target.value)} disabled={!!ultimoCreado} />
          </div>
        </div>

        <div className="row" style={{ marginTop: 10 }}>
          <div className="field" style={{ flex: 1, minWidth: 260 }}>
            <label>Nombre y Firma</label>
            <input
              value={nombreFirma}
              onChange={(e) => { setNombreFirma(e.target.value); setNombreFirmaTocado(true); }}
              disabled={!!ultimoCreado}
            />
          </div>
        </div>

        <div className="row" style={{ marginTop: 14 }}>
          {!ultimoCreado ? (
            <button onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
          ) : (
            <>
              <span className="hint">Vale N° {ultimoCreado.numero} guardado.</span>
              <button onClick={() => imprimir(ultimoCreado)}>Imprimir</button>
              <button onClick={limpiar} className="secondary">Cargar otro</button>
            </>
          )}
        </div>
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <h2 style={{ margin: 0 }}>Historial</h2>
        <div className="row" style={{ marginTop: 10 }}>
          <div className="field">
            <label>Filtrar por chofer</label>
            <select value={filtroChofer} onChange={(e) => setFiltroChofer(e.target.value)}>
              <option value="">Todos</option>
              {choferes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
        </div>
        <div className="table-wrap" style={{ marginTop: 10 }}>
          <table>
            <thead>
              <tr>
                <th className="num">N°</th><th>Fecha</th><th>Chofer</th><th className="num">Importe</th>
                <th>Moneda</th><th>Usado</th><th>Emitido por</th><th></th>
              </tr>
            </thead>
            <tbody>
              {historial.map((v) => (
                <tr key={v.id}>
                  <td className="num">{v.numero}</td>
                  <td>{fechaSola(v.fecha)}</td>
                  <td>{v.expand?.chofer?.nombre || '—'}</td>
                  <td className="num">{v.importe.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td>{v.moneda}</td>
                  <td>{v.usado ? 'Sí' : 'No'}</td>
                  <td>{v.creado_por || '—'}</td>
                  <td>
                    <button className="small" onClick={() => imprimir(v)}>Reimprimir</button>
                    {' '}
                    {v.usado && <button className="small secondary" onClick={() => liberar(v.id)}>Liberar</button>}
                    {' '}
                    {isAdmin && <button className="small danger" onClick={() => eliminar(v.id, v.numero)}>Eliminar</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {historial.length === 0 && <div className="empty">Todavía no se cargó ningún vale.</div>}
        </div>
      </div>
      {paraImprimir && (
        <div id="vale-imprimible">
          <div style={{ textAlign: 'right', fontWeight: 700, marginBottom: 20 }}>
            VALE DE CAJA N° {String(paraImprimir.numero).padStart(4, '0')}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div>Recibí de Carossio Vairolatti y Cía SRL</div>
            <div>{fechaSola(paraImprimir.fecha)}</div>
          </div>
          <div style={{ marginTop: 16 }}>
            la cantidad de {paraImprimir.moneda === 'BRL' ? 'reales' : 'pesos argentinos'}{' '}
            {importeEnLetras(paraImprimir.importe).toLowerCase()}
          </div>
          <div style={{ borderBottom: '1px solid #000', marginTop: 24, paddingBottom: 2 }}>{paraImprimir.observacion1}</div>
          <div style={{ borderBottom: '1px solid #000', marginTop: 20, paddingBottom: 2 }}>{paraImprimir.observacion2}</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 30 }}>
            <div>{paraImprimir.moneda === 'BRL' ? 'Son R$' : 'Son $'} {paraImprimir.importe.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ borderBottom: '1px solid #000', width: 200 }}>&nbsp;</div>
              {paraImprimir.nombre_firma}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
