import { useEffect, useState } from 'react';
import { ClientResponseError } from 'pocketbase';
import { pb } from '../../lib/pb';
import { useToast } from '../../lib/ToastContext';
import { isoDate, fechaSola } from '../../lib/format';
import { useAuth } from '../../lib/AuthContext';
import { useConfirm } from '../../lib/ConfirmContext';
import type { Chofer, ValeCaja } from '../../types';
import { MembreteImpreso } from '../../components/MembreteImpreso';

type ValeConChofer = ValeCaja & { expand?: { chofer?: Chofer } };

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

function CopiaVale({ v, etiqueta }: { v: ValeConChofer; etiqueta: string }) {
  return (
    <div className="copia-imprimible">
      <div style={{ textAlign: 'right', fontSize: 10, letterSpacing: 2, marginBottom: 4 }}>{etiqueta}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <MembreteImpreso sucursal={v.sucursal} />
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>N° {String(v.numero).padStart(4, '0')}</div>
          <CasillasFecha fecha={v.fecha} />
        </div>
      </div>

      <div style={{ textAlign: 'center', fontWeight: 700, fontSize: 22, textDecoration: 'underline', marginTop: 20, marginBottom: 20 }}>
        VALE DE CAJA
      </div>

      <div style={{ marginTop: 14 }}>
        A favor de <span style={{ borderBottom: '1px dotted #000', paddingBottom: 2 }}>&nbsp;{v.expand?.chofer?.nombre}&nbsp;</span>
      </div>
      <div style={{ marginTop: 14 }}>
        Por $ <span style={{ borderBottom: '1px dotted #000', paddingBottom: 2 }}>&nbsp;{v.importe.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}&nbsp;</span>
      </div>
      <div style={{ marginTop: 14 }}>
        CONCEPTO: <span style={{ borderBottom: '1px dotted #000', paddingBottom: 2 }}>&nbsp;{v.observacion1}&nbsp;</span>
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

export function ValeCajaPage() {
  const toast = useToast();
  const { isAdmin } = useAuth();
  const confirm = useConfirm();
  const [historial, setHistorial] = useState<ValeConChofer[]>([]);
  const [filtroChofer, setFiltroChofer] = useState('');

  const [choferes, setChoferes] = useState<Chofer[]>([]);
  const [choferId, setChoferId] = useState('');
  const [fecha, setFecha] = useState(() => isoDate(new Date()));
  const [importe, setImporte] = useState('');
  const [concepto, setConcepto] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [ultimoCreado, setUltimoCreado] = useState<ValeConChofer | null>(null);
  const [paraImprimir, setParaImprimir] = useState<ValeConChofer | null>(null);

  function imprimir(v: ValeConChofer) {
    setParaImprimir(v);
    document.body.classList.add('imprimiendo-vale');
    const estiloPagina = document.createElement('style');
    estiloPagina.textContent = '@media print { @page { size: A4 portrait; margin: 0; } }';
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
      const items = await pb.collection('vales_caja').getList<ValeConChofer>(1, 50, {
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

  function limpiar() {
    setChoferId('');
    setFecha(isoDate(new Date()));
    setImporte('');
    setConcepto('');
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

    setGuardando(true);
    try {
      // Numero correlativo asignado por el servidor -- si dos vales de la
      // misma sucursal se guardan en el mismo instante, el segundo puede
      // chocar con "validation_not_unique" (indice unico de la base, ver
      // pb_migrations/1789310000_numeros_correlativos_indice_unico.js).
      // Se reintenta solo, igual que en Cotizador (CotizadorPage.tsx).
      let creado!: ValeCaja;
      for (let intento = 1; ; intento++) {
        try {
          creado = await pb.collection('vales_caja').create<ValeCaja>({
            fecha, chofer: choferId, importe: valor, moneda: 'ARS',
            observacion1: concepto.trim() || undefined,
          });
          break;
        } catch (e) {
          const esColisionDeNumero =
            e instanceof ClientResponseError &&
            (e.response?.data as Record<string, { code?: string }> | undefined)?.numero?.code === 'validation_not_unique';
          if (!esColisionDeNumero || intento >= 5) throw e;
        }
      }
      const choferElegido = choferes.find((c) => c.id === choferId);
      const creadoConChofer = { ...creado, expand: { chofer: choferElegido } };
      setUltimoCreado(creadoConChofer);
      toast(`Vale de Caja N° ${creado.numero} guardado.`, 'ok');
      cargarHistorial();
      imprimir(creadoConChofer);
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
        <div className="hint">Pago en efectivo a un chofer.</div>

        <div className="row" style={{ marginTop: 14, flexWrap: 'wrap' }}>
          <div className="field">
            <label>Chofer</label>
            <select value={choferId} onChange={(e) => setChoferId(e.target.value)} disabled={!!ultimoCreado}>
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
        </div>

        <div className="row" style={{ marginTop: 10 }}>
          <div className="field" style={{ flex: 1, minWidth: 260 }}>
            <label>Concepto</label>
            <input value={concepto} onChange={(e) => setConcepto(e.target.value)} disabled={!!ultimoCreado} placeholder="ej: Gastos de viaje a Uruguay" />
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
          <CopiaVale v={paraImprimir} etiqueta="ORIGINAL" />
          <CopiaVale v={paraImprimir} etiqueta="DUPLICADO" />
        </div>
      )}
    </main>
  );
}
