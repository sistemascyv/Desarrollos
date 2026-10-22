import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { pb } from '../../lib/pb';
import { useAuth } from '../../lib/AuthContext';
import { useToast } from '../../lib/ToastContext';
import { money, isoDate } from '../../lib/format';
import type { Cliente, Cotizacion, CotizacionItem, CuadroTarifarioFila, CuadroTarifarioMinimos, Sucursal } from '../../types';
import { claveZona, calcularItem, calcularTotales, minimoDeSucursal } from './cotizadorMotor';

const SUCURSALES: { id: Sucursal; label: string }[] = [
  { id: 'cordoba', label: 'Córdoba' },
  { id: 'san_francisco', label: 'San Francisco' },
  { id: 'rosario', label: 'Rosario' },
  { id: 'buenos_aires', label: 'Buenos Aires' },
];

interface ItemForm {
  kilos: string;
  m3: string;
  bultos: string;
  valorDeclarado: string;
}

function itemVacio(): ItemForm {
  return { kilos: '', m3: '', bultos: '', valorDeclarado: '' };
}

export function CotizadorPage() {
  const { usuario } = useAuth();
  const toast = useToast();

  const [vista, setVista] = useState<'lista' | 'form'>('lista');
  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [filasSeco, setFilasSeco] = useState<CuadroTarifarioFila[]>([]);
  const [minimos, setMinimos] = useState<CuadroTarifarioMinimos | null>(null);

  const [fecha, setFecha] = useState(() => isoDate(new Date()));
  const [traficoOrigen, setTraficoOrigen] = useState<Sucursal>('san_francisco');
  const [traficoDestino, setTraficoDestino] = useState<Sucursal>('san_francisco');
  const [pagaEn, setPagaEn] = useState<'origen' | 'destino'>('origen');
  const [cliente, setCliente] = useState('');
  const [solicitadoPor, setSolicitadoPor] = useState('');
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [lugarCarga, setLugarCarga] = useState('');
  const [lugarDescarga, setLugarDescarga] = useState('');
  const [tipoMercaderia, setTipoMercaderia] = useState('');
  const [observacion, setObservacion] = useState('');
  const [items, setItems] = useState<ItemForm[]>([itemVacio()]);
  const [seguroActivo, setSeguroActivo] = useState(true);
  const [seguroPorcentaje, setSeguroPorcentaje] = useState('0.7');
  const [contraReembolso, setContraReembolso] = useState('0');
  const [taxiFlet, setTaxiFlet] = useState('0');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => { cargarListaYDatos(); }, []);

  async function cargarListaYDatos() {
    try {
      const [cots, clis, cuadro, mins] = await Promise.all([
        pb.collection('cotizaciones').getFullList<Cotizacion>({ sort: '-created' }),
        pb.collection('clientes').getFullList<Cliente>({ filter: 'activo = true', sort: 'nombre' }),
        pb.collection('cuadro_tarifario').getFullList<CuadroTarifarioFila>({ filter: "categoria = 'seco'", sort: 'rango_kg_desde' }),
        pb.collection('cuadro_tarifario_minimos').getFullList<CuadroTarifarioMinimos>(),
      ]);
      setCotizaciones(cots);
      setClientes(clis);
      setFilasSeco(cuadro);
      setMinimos(mins[0] || null);
    } catch (e) {
      toast('No se pudo cargar: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }

  function abrirNueva() {
    setFecha(isoDate(new Date()));
    setTraficoOrigen('san_francisco'); setTraficoDestino('san_francisco'); setPagaEn('origen');
    setCliente(''); setSolicitadoPor(''); setTelefono(''); setEmail('');
    setLugarCarga(''); setLugarDescarga(''); setTipoMercaderia(''); setObservacion('');
    setItems([itemVacio()]);
    setSeguroActivo(true); setSeguroPorcentaje('0.7'); setContraReembolso('0'); setTaxiFlet('0');
    setVista('form');
  }

  function actualizarItem(idx: number, campo: keyof ItemForm, valor: string) {
    setItems((cur) => cur.map((it, i) => (i === idx ? { ...it, [campo]: valor } : it)));
  }

  function agregarItem() {
    setItems((cur) => [...cur, itemVacio()]);
  }

  function quitarItem(idx: number) {
    setItems((cur) => (cur.length > 1 ? cur.filter((_, i) => i !== idx) : cur));
  }

  const clave = claveZona(traficoOrigen, traficoDestino);
  const itemsCalculados = items.map((it) => {
    const kilos = Number(it.kilos.replace(',', '.')) || 0;
    const m3 = Number(it.m3.replace(',', '.')) || 0;
    if (!clave || (kilos <= 0 && m3 <= 0)) return null;
    return calcularItem(filasSeco, kilos, m3, clave);
  });
  const hayItemInvalido = items.some((it, i) => {
    const kilos = Number(it.kilos.replace(',', '.')) || 0;
    const m3 = Number(it.m3.replace(',', '.')) || 0;
    if (kilos <= 0 && m3 <= 0) return false; // fila vacía, se ignora
    return itemsCalculados[i] === null;
  });
  const valorDeclaradoTotal = items.reduce((a, it) => a + (Number(it.valorDeclarado.replace(',', '.')) || 0), 0);
  const sucursalQuePaga = pagaEn === 'origen' ? traficoOrigen : traficoDestino;
  const totales = minimos
    ? calcularTotales({
        totalesItems: itemsCalculados.filter((x): x is NonNullable<typeof x> => x !== null).map((x) => x.total),
        valorDeclaradoTotal,
        minimoAplicable: minimoDeSucursal(minimos, sucursalQuePaga),
        seguroActivo,
        seguroPorcentaje: Number(seguroPorcentaje.replace(',', '.')) || 0,
        contraReembolso: Number(contraReembolso.replace(',', '.')) || 0,
        taxiFlet: Number(taxiFlet.replace(',', '.')) || 0,
      })
    : null;

  async function guardar() {
    if (!usuario?.sucursal) {
      toast('Tu usuario no tiene sucursal asignada -- pedile a un administrador que te la cargue en Administración → Usuarios.', 'err');
      return;
    }
    if (!clave) { toast('Ese tráfico no tiene una combinación de zona válida.', 'warn'); return; }
    if (hayItemInvalido) { toast('Hay un ítem en una banda "Por Kg" sin Kilos cargados -- completá el peso real.', 'warn'); return; }
    const itemsValidos = items
      .map((it, i) => ({ it, calc: itemsCalculados[i] }))
      .filter((x): x is { it: ItemForm; calc: NonNullable<typeof x.calc> } => x.calc !== null);
    if (itemsValidos.length === 0) { toast('Cargá al menos un ítem con Kilos o Mts³.', 'warn'); return; }
    if (!totales) return;

    setGuardando(true);
    try {
      const cot = await pb.collection('cotizaciones').create<Cotizacion>({
        fecha, trafico_origen: traficoOrigen, trafico_destino: traficoDestino, paga_en: pagaEn,
        cliente: cliente || null, solicitado_por: solicitadoPor.trim(), telefono: telefono.trim(), email: email.trim(),
        lugar_carga: lugarCarga.trim(), lugar_descarga: lugarDescarga.trim(),
        tipo_mercaderia: tipoMercaderia.trim(), observacion: observacion.trim(),
        seguro_activo: seguroActivo, seguro_porcentaje: Number(seguroPorcentaje.replace(',', '.')) || 0,
        contra_reembolso: Number(contraReembolso.replace(',', '.')) || 0, taxi_flet: Number(taxiFlet.replace(',', '.')) || 0,
        sub_total: totales.subTotal, recargo: totales.recargo, seguro: totales.seguro,
        neto_gravado: totales.netoGravado, iva: totales.iva, total: totales.total,
      });
      for (const { it, calc } of itemsValidos) {
        await pb.collection('cotizacion_items').create<CotizacionItem>({
          cotizacion: cot.id,
          kilos: Number(it.kilos.replace(',', '.')) || 0,
          m3: Number(it.m3.replace(',', '.')) || 0,
          bultos: Number(it.bultos.replace(',', '.')) || 0,
          valor_declarado: Number(it.valorDeclarado.replace(',', '.')) || 0,
          precio: calc.precio, total: calc.total,
        });
      }
      toast(`Cotización ${cot.numero} guardada.`, 'ok');
      setVista('lista');
      cargarListaYDatos();
    } catch (e) {
      toast('Error al guardar: ' + (e instanceof Error ? e.message : ''), 'err');
    } finally {
      setGuardando(false);
    }
  }

  if (vista === 'lista') {
    return (
      <main>
        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div>
              <h2>Cotizador</h2>
              <div className="hint">Cotizaciones de carga Seca — <Link to="/comercial/tarifas">ver Cuadro Tarifario</Link>.</div>
            </div>
            <button onClick={abrirNueva}>+ Nueva Cotización</button>
          </div>
          <div className="table-wrap" style={{ marginTop: 10 }}>
            <table>
              <thead><tr><th>Número</th><th>Fecha</th><th>Tráfico</th><th className="num">Total</th><th></th></tr></thead>
              <tbody>
                {cotizaciones.map((c) => (
                  <tr key={c.id}>
                    <td>{c.numero}</td>
                    <td>{c.fecha}</td>
                    <td>{c.trafico_origen} → {c.trafico_destino}</td>
                    <td className="num">{money(c.total)}</td>
                    <td><Link to={`/comercial/cotizador/${c.id}/imprimir`} target="_blank">Imprimir</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {cotizaciones.length === 0 && <div className="empty">Todavía no se cargó ninguna cotización.</div>}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main>
      <div className="card">
        <h2>Nueva Cotización</h2>
        <div className="row">
          <div className="field"><label>Fecha</label><input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></div>
          <div className="field">
            <label>Tráfico Origen</label>
            <select value={traficoOrigen} onChange={(e) => setTraficoOrigen(e.target.value as Sucursal)}>
              {SUCURSALES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Tráfico Destino</label>
            <select value={traficoDestino} onChange={(e) => setTraficoDestino(e.target.value as Sucursal)}>
              {SUCURSALES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Paga en</label>
            <select value={pagaEn} onChange={(e) => setPagaEn(e.target.value as 'origen' | 'destino')}>
              <option value="origen">Origen</option>
              <option value="destino">Destino</option>
            </select>
          </div>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <div className="field">
            <label>Cliente</label>
            <select value={cliente} onChange={(e) => setCliente(e.target.value)}>
              <option value="">Seleccione…</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
          <div className="field"><label>Solicitado Por</label><input value={solicitadoPor} onChange={(e) => setSolicitadoPor(e.target.value)} /></div>
          <div className="field"><label>Teléfono</label><input value={telefono} onChange={(e) => setTelefono(e.target.value)} /></div>
          <div className="field" style={{ flex: 1 }}><label>Email</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <div className="field" style={{ flex: 1 }}><label>Lugar de Carga</label><input value={lugarCarga} onChange={(e) => setLugarCarga(e.target.value)} /></div>
          <div className="field" style={{ flex: 1 }}><label>Lugar de Descarga</label><input value={lugarDescarga} onChange={(e) => setLugarDescarga(e.target.value)} /></div>
          <div className="field"><label>Tipo de Mercadería</label><input value={tipoMercaderia} onChange={(e) => setTipoMercaderia(e.target.value)} /></div>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <div className="field" style={{ flex: 1 }}><label>Observación</label><textarea value={observacion} onChange={(e) => setObservacion(e.target.value)} /></div>
        </div>

        <h3 style={{ marginTop: 18 }}>Items</h3>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Kilos</th><th>Mts³</th><th>Bultos</th><th>Valor Declarado</th><th className="num">Precio</th><th className="num">Total</th><th></th></tr></thead>
            <tbody>
              {items.map((it, i) => {
                const calc = itemsCalculados[i];
                const kilos = Number(it.kilos.replace(',', '.')) || 0;
                const m3 = Number(it.m3.replace(',', '.')) || 0;
                const tieneCarga = kilos > 0 || m3 > 0;
                return (
                  <tr key={i}>
                    <td><input inputMode="decimal" value={it.kilos} onChange={(e) => actualizarItem(i, 'kilos', e.target.value)} style={{ width: 80 }} /></td>
                    <td><input inputMode="decimal" value={it.m3} onChange={(e) => actualizarItem(i, 'm3', e.target.value)} style={{ width: 80 }} /></td>
                    <td><input inputMode="decimal" value={it.bultos} onChange={(e) => actualizarItem(i, 'bultos', e.target.value)} style={{ width: 70 }} /></td>
                    <td><input inputMode="decimal" value={it.valorDeclarado} onChange={(e) => actualizarItem(i, 'valorDeclarado', e.target.value)} style={{ width: 110 }} /></td>
                    <td className="num">{calc ? money(calc.precio) : (tieneCarga ? '—' : '')}</td>
                    <td className="num">{calc ? money(calc.total) : (tieneCarga ? '—' : '')}</td>
                    <td><button className="small danger" onClick={() => quitarItem(i)} disabled={items.length === 1}>Quitar</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <button className="small secondary" onClick={agregarItem} style={{ marginTop: 6 }}>+ Agregar ítem</button>

        <div className="row" style={{ marginTop: 16, alignItems: 'flex-start' }}>
          <div>
            <label><input type="checkbox" checked={seguroActivo} onChange={(e) => setSeguroActivo(e.target.checked)} /> Seguro</label>
            {' '}
            <input inputMode="decimal" value={seguroPorcentaje} onChange={(e) => setSeguroPorcentaje(e.target.value)} style={{ width: 70 }} disabled={!seguroActivo} /> %
          </div>
          <div className="field"><label>Contra Reembolso</label><input inputMode="decimal" value={contraReembolso} onChange={(e) => setContraReembolso(e.target.value)} style={{ width: 110 }} /></div>
          <div className="field"><label>Taxi-Flet</label><input inputMode="decimal" value={taxiFlet} onChange={(e) => setTaxiFlet(e.target.value)} style={{ width: 110 }} /></div>
        </div>

        {totales && (
          <div style={{ marginTop: 16, maxWidth: 320 }}>
            <div className="row" style={{ justifyContent: 'space-between' }}><span>Sub-Total</span><span>{money(totales.subTotal)}</span></div>
            <div className="row" style={{ justifyContent: 'space-between' }}><span>Recargo</span><span>{money(totales.recargo)}</span></div>
            <div className="row" style={{ justifyContent: 'space-between' }}><span>Seguro</span><span>{money(totales.seguro)}</span></div>
            <div className="row" style={{ justifyContent: 'space-between' }}><span>Neto Gravado</span><span>{money(totales.netoGravado)}</span></div>
            <div className="row" style={{ justifyContent: 'space-between' }}><span>IVA 21%</span><span>{money(totales.iva)}</span></div>
            <div className="row" style={{ justifyContent: 'space-between', fontWeight: 700 }}><span>Total</span><span>{money(totales.total)}</span></div>
          </div>
        )}

        <div className="row" style={{ marginTop: 16 }}>
          <button onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
          <button className="secondary" onClick={() => setVista('lista')}>Cancelar</button>
        </div>
      </div>
    </main>
  );
}
