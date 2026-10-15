import { useEffect, useState } from 'react';
import { pb } from '../../lib/pb';
import { useToast } from '../../lib/ToastContext';
import { isoDate, fechaSola } from '../../lib/format';
import { useAuth } from '../../lib/AuthContext';
import { useConfirm } from '../../lib/ConfirmContext';
import type { Recibo } from '../../types';

const RECIBIDO_DE_DEFAULT = 'Carossio Vairolatti y Cía SRL';

// Precarga el logo del membrete apenas carga el módulo: window.print() dispara
// 50ms después de montar el div de impresión, y Chrome no espera de forma
// confiable una imagen recién pedida en ese momento -- el primer impreso de
// la sesión podía salir sin logo.
new Image().src = '/vale-logo.jpg';

function CasillasFecha({ fecha }: { fecha: string }) {
  const [anio, mes, dia] = (fecha || '').slice(0, 10).split('-');
  const casillas = [
    { etiqueta: 'DÍA', valor: dia },
    { etiqueta: 'MES', valor: mes },
    { etiqueta: 'AÑO', valor: anio?.slice(-2) },
  ];
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {casillas.map((c) => (
        <div key={c.etiqueta} style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 9 }}>{c.etiqueta}</div>
          <div style={{ border: '1px solid #000', width: 28, height: 22, lineHeight: '22px' }}>{c.valor}</div>
        </div>
      ))}
    </div>
  );
}

function MembreteImpreso() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <img src="/vale-logo.jpg" alt="" style={{ height: 120 }} />
      <div>
        <div style={{ fontSize: 10, color: '#333' }}>SAN LORENZO 31<br />2400 SAN FRANCISCO (Cba.)</div>
      </div>
    </div>
  );
}

function CopiaRecibo({ r, etiqueta }: { r: Recibo; etiqueta: string }) {
  return (
    <div className="copia-imprimible">
      <div style={{ textAlign: 'right', fontSize: 10, letterSpacing: 2, marginBottom: 4 }}>{etiqueta}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <MembreteImpreso />
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>N° {String(r.numero).padStart(4, '0')}</div>
          <CasillasFecha fecha={r.fecha} />
        </div>
      </div>

      <div style={{ textAlign: 'center', marginTop: 20, marginBottom: 20 }}>
        <span style={{ display: 'inline-block', border: '2px solid #000', padding: '4px 24px', fontWeight: 700, fontSize: 22 }}>
          RECIBO
        </span>
      </div>

      <div style={{ marginTop: 14 }}>
        Recibí de <span style={{ borderBottom: '1px dotted #000', paddingBottom: 2 }}>&nbsp;{r.recibido_de}&nbsp;</span>
      </div>
      <div style={{ marginTop: 14 }}>
        Por {r.moneda === 'USD' ? 'U$S' : '$'} <span style={{ borderBottom: '1px dotted #000', paddingBottom: 2 }}>&nbsp;{r.importe.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}&nbsp;</span>
      </div>
      <div style={{ marginTop: 14 }}>
        CONCEPTO: <span style={{ borderBottom: '1px dotted #000', paddingBottom: 2 }}>&nbsp;{r.concepto}&nbsp;</span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: 50 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ borderBottom: '1px solid #000', width: 180 }}>&nbsp;</div>
          Firma
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ borderBottom: '1px solid #000', width: 180 }}>&nbsp;</div>
          Firma Autorizada
        </div>
      </div>
    </div>
  );
}

export function RecibosPage() {
  const toast = useToast();
  const { isAdmin } = useAuth();
  const confirm = useConfirm();
  const [historial, setHistorial] = useState<Recibo[]>([]);

  const [fecha, setFecha] = useState(() => isoDate(new Date()));
  const [recibidoDe, setRecibidoDe] = useState(RECIBIDO_DE_DEFAULT);
  const [importe, setImporte] = useState('');
  const [moneda, setMoneda] = useState<Recibo['moneda']>('ARS');
  const [concepto, setConcepto] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [ultimoCreado, setUltimoCreado] = useState<Recibo | null>(null);
  const [paraImprimir, setParaImprimir] = useState<Recibo | null>(null);

  function imprimir(r: Recibo) {
    setParaImprimir(r);
    document.body.classList.add('imprimiendo-recibo');
    const estiloPagina = document.createElement('style');
    estiloPagina.textContent = '@media print { @page { size: A4 portrait; margin: 0; } }';
    document.head.appendChild(estiloPagina);
    setTimeout(() => {
      try {
        window.print();
      } finally {
        document.body.classList.remove('imprimiendo-recibo');
        document.head.removeChild(estiloPagina);
      }
    }, 50);
  }

  async function cargarHistorial() {
    try {
      const items = await pb.collection('recibos').getList<Recibo>(1, 50, { sort: '-numero' });
      setHistorial(items.items);
    } catch (e) {
      toast('No se pudo cargar el historial: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }

  useEffect(() => {
    cargarHistorial();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function limpiar() {
    setFecha(isoDate(new Date()));
    setRecibidoDe(RECIBIDO_DE_DEFAULT);
    setImporte('');
    setMoneda('ARS');
    setConcepto('');
    setUltimoCreado(null);
  }

  async function eliminar(id: string, numero: number) {
    const ok = await confirm(`¿Eliminar el Recibo N° ${numero}? No se puede deshacer.`, 'Eliminar recibo');
    if (!ok) return;
    try {
      await pb.collection('recibos').delete(id);
      toast('Recibo eliminado.', 'ok');
      cargarHistorial();
    } catch (e) {
      toast('No se pudo eliminar: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }

  async function guardar() {
    const valor = Number(importe.replace(',', '.'));
    if (!recibidoDe.trim()) { toast('Falta "Recibí de".', 'warn'); return; }
    if (!fecha) { toast('Elegí una fecha.', 'warn'); return; }
    if (!valor || valor <= 0) { toast('El importe tiene que ser mayor a cero.', 'warn'); return; }

    setGuardando(true);
    try {
      const creado = await pb.collection('recibos').create<Recibo>({
        fecha, recibido_de: recibidoDe.trim(), importe: valor, moneda,
        concepto: concepto.trim() || undefined,
      });
      setUltimoCreado(creado);
      toast(`Recibo N° ${creado.numero} guardado.`, 'ok');
      cargarHistorial();
      imprimir(creado);
    } catch (e) {
      toast('No se pudo guardar el recibo: ' + (e instanceof Error ? e.message : ''), 'err');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <main>
      <div className="card">
        <h2 style={{ margin: 0 }}>Recibos</h2>
        <div className="hint">Registro de plata que recibe la empresa de un tercero (ej: venta de un camión).</div>

        <div className="row" style={{ marginTop: 14, flexWrap: 'wrap' }}>
          <div className="field" style={{ flex: 1, minWidth: 260 }}>
            <label>Recibí de</label>
            <input value={recibidoDe} onChange={(e) => setRecibidoDe(e.target.value)} disabled={!!ultimoCreado} />
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
            <select value={moneda} onChange={(e) => setMoneda(e.target.value as Recibo['moneda'])} disabled={!!ultimoCreado}>
              <option value="ARS">Pesos Argentinos</option>
              <option value="USD">Dólares</option>
            </select>
          </div>
        </div>

        <div className="row" style={{ marginTop: 10 }}>
          <div className="field" style={{ flex: 1, minWidth: 260 }}>
            <label>Concepto</label>
            <input value={concepto} onChange={(e) => setConcepto(e.target.value)} disabled={!!ultimoCreado} placeholder="ej: Venta de camión" />
          </div>
        </div>

        <div className="row" style={{ marginTop: 14 }}>
          {!ultimoCreado ? (
            <button onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
          ) : (
            <>
              <span className="hint">Recibo N° {ultimoCreado.numero} guardado.</span>
              <button onClick={() => imprimir(ultimoCreado)}>Imprimir</button>
              <button onClick={limpiar} className="secondary">Cargar otro</button>
            </>
          )}
        </div>
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <h2 style={{ margin: 0 }}>Historial</h2>
        <div className="table-wrap" style={{ marginTop: 10 }}>
          <table>
            <thead>
              <tr>
                <th className="num">N°</th><th>Fecha</th><th>Recibí de</th><th className="num">Importe</th>
                <th>Moneda</th><th>Emitido por</th><th></th>
              </tr>
            </thead>
            <tbody>
              {historial.map((r) => (
                <tr key={r.id}>
                  <td className="num">{r.numero}</td>
                  <td>{fechaSola(r.fecha)}</td>
                  <td>{r.recibido_de}</td>
                  <td className="num">{r.importe.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td>{r.moneda}</td>
                  <td>{r.creado_por || '—'}</td>
                  <td>
                    <button className="small" onClick={() => imprimir(r)}>Reimprimir</button>
                    {' '}
                    {isAdmin && <button className="small danger" onClick={() => eliminar(r.id, r.numero)}>Eliminar</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {historial.length === 0 && <div className="empty">Todavía no se cargó ningún recibo.</div>}
        </div>
      </div>
      {paraImprimir && (
        <div id="recibo-imprimible">
          <CopiaRecibo r={paraImprimir} etiqueta="ORIGINAL" />
          <CopiaRecibo r={paraImprimir} etiqueta="DUPLICADO" />
        </div>
      )}
    </main>
  );
}
