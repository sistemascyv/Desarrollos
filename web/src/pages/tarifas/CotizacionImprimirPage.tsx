import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { pb } from '../../lib/pb';
import { useToast } from '../../lib/ToastContext';
import { money, isoDate } from '../../lib/format';
import type { Cliente, Cotizacion, CotizacionItem } from '../../types';
import { fechaVencimiento } from './cotizadorMotor';
import { CATEGORIAS } from '../../lib/categoriasTarifario';
import { DIRECCION_SUCURSAL } from '../../lib/direccionesSucursal';

// Precarga el logo apenas carga el módulo -- mismo motivo que
// RecibosPage.tsx: window.print() puede dispararse antes de que el
// navegador termine de pedir una imagen recién referenciada.
new Image().src = '/cotizador-logo.jpg';

export function CotizacionImprimirPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const [cot, setCot] = useState<Cotizacion | null>(null);
  const [items, setItems] = useState<CotizacionItem[]>([]);
  const [clienteNombre, setClienteNombre] = useState('');

  useEffect(() => { cargar(); }, [id]);

  async function cargar() {
    if (!id) return;
    try {
      const [c, its] = await Promise.all([
        pb.collection('cotizaciones').getOne<Cotizacion>(id),
        pb.collection('cotizacion_items').getFullList<CotizacionItem>({ filter: pb.filter('cotizacion = {:id}', { id }) }),
      ]);
      setCot(c);
      setItems(its);
      if (c.cliente) {
        try {
          const cli = await pb.collection('clientes').getOne<Cliente>(c.cliente);
          setClienteNombre(cli.nombre);
        } catch { /* cliente borrado -- queda sin nombre */ }
      }
    } catch (e) {
      toast('No se pudo cargar la cotización: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }

  if (!cot) return <main><div className="card">Cargando…</div></main>;

  const vencimiento = fechaVencimiento(cot.fecha);
  const hoy = isoDate(new Date());
  const estado = hoy > vencimiento ? 'Vencido' : 'Vigente';
  const categoriaLabel = CATEGORIAS.find((c) => c.id === cot.categoria)?.label || 'Seco';
  const direccion = DIRECCION_SUCURSAL[cot.sucursal || 'san_francisco'];

  return (
    <main>
      <div className="card">
        <button onClick={() => {
          document.body.classList.add('imprimiendo-cotizacion');
          const estiloPagina = document.createElement('style');
          estiloPagina.textContent = '@media print { @page { size: A4 portrait; margin: 0; } }';
          document.head.appendChild(estiloPagina);
          setTimeout(() => {
            try {
              window.print();
            } finally {
              document.body.classList.remove('imprimiendo-cotizacion');
              document.head.removeChild(estiloPagina);
            }
          }, 50);
        }}>Imprimir</button>
      </div>
      <div id="cotizacion-imprimible">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <img src="/cotizador-logo.jpg" alt="" style={{ height: 120 }} />
          <div style={{ textAlign: 'right', fontSize: 11 }}>
            <div>Carossio, Vairolatti &amp; Cía S.R.L.</div>
            <div>{direccion.calle}</div>
            <div>{direccion.localidad}</div>
            <div>CUIT: 30-54057342-1 - Ing. Brutos: 904-249209-7</div>
          </div>
        </div>
        <hr />
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <div>Cotización: <strong>{cot.numero}</strong></div>
            <div>Fecha: {cot.fecha}</div>
            <div>Categoría: {categoriaLabel}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div>Estado: {estado}</div>
            <div>Vencimiento: {vencimiento} (salvo incremento tarifario)</div>
          </div>
        </div>
        <hr />
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <div>Señor(es): {clienteNombre || cot.cliente_nombre || '—'}</div>
            <div>Atento: {clienteNombre || cot.cliente_nombre || '—'}</div>
          </div>
          <div>Remitente: {cot.solicitado_por || '—'}</div>
        </div>
        <hr />
        <table style={{ width: '100%', marginTop: 10 }}>
          <thead><tr><th>Kilos</th><th>Metros Cúbicos</th><th>Bultos</th><th>Valor Declarado</th><th>Observación</th><th>Precio</th><th>Total</th></tr></thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id}>
                <td>{it.kilos.toFixed(2)}</td>
                <td>{it.m3.toFixed(2)}</td>
                <td>{it.bultos.toFixed(2)}</td>
                <td>{it.valor_declarado.toFixed(2)}</td>
                <td></td>
                <td>{money(it.precio)}</td>
                <td>{money(it.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginTop: 16, maxWidth: 320 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}><span>SubTotal:</span><span>{money(cot.sub_total)}</span></div>
          {cot.recargo > 0 && <div className="row" style={{ justifyContent: 'space-between' }}><span>Recargo mínimo:</span><span>{money(cot.recargo)}</span></div>}
          <div className="row" style={{ justifyContent: 'space-between' }}><span>Seguro:</span><span>{money(cot.seguro)}</span></div>
          <div className="row" style={{ justifyContent: 'space-between' }}><span>Taxi-Flet:</span><span>{money(cot.taxi_flet)}</span></div>
          {cot.contra_reembolso > 0 && <div className="row" style={{ justifyContent: 'space-between' }}><span>Contra Reembolso:</span><span>{money(cot.contra_reembolso)}</span></div>}
          <hr />
          <div className="row" style={{ justifyContent: 'space-between' }}><span>Neto:</span><span>{money(cot.neto_gravado)}</span></div>
          <div className="row" style={{ justifyContent: 'space-between' }}><span>IVA:</span><span>{money(cot.iva)}</span></div>
          <hr />
          <div className="row" style={{ justifyContent: 'space-between', fontWeight: 700 }}><span>Total:</span><span>{money(cot.total)}</span></div>
        </div>
        <div style={{ marginTop: 16 }}>
          <div>Lugar de Carga: {cot.lugar_carga || '—'}</div>
          <div>Lugar de Descarga: {cot.lugar_descarga || '—'}</div>
          <div>Tipo de Mercadería: {cot.tipo_mercaderia || '—'}</div>
          <div>Observación: {cot.observacion || '—'}</div>
        </div>
        <div style={{ marginTop: 20, fontSize: 10, fontStyle: 'italic' }}>
          En caso de que los datos informados por el cliente difieran de los datos reales, se procederá a realizar un ajuste en la tarifa.
        </div>
      </div>
    </main>
  );
}
