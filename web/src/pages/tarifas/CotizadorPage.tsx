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

function labelSucursal(s: Sucursal): string {
  return SUCURSALES.find((x) => x.id === s)?.label || s;
}

interface ItemForm {
  kilos: string;
  m3: string;
  bultos: string;
  valorDeclarado: string;
}

function itemVacio(): ItemForm {
  return { kilos: '', m3: '', bultos: '', valorDeclarado: '' };
}

// Coma como separador decimal (mismo criterio simple que el resto de
// esta app -- sin soporte de punto como separador de miles). Vacío =
// 0 (campo no cargado); no vacío pero no numérico = NaN, para que el
// llamador lo trate como dato inválido en vez de 0 en silencio (ej:
// "2.000.000" tipeado por costumbre no debe convertirse en Seguro $0).
function parseNum(s: string): number {
  const limpio = s.trim();
  if (!limpio) return 0;
  return Number(limpio.replace(',', '.'));
}

interface ItemParseado {
  kilos: number;
  m3: number;
  bultos: number;
  valorDeclarado: number;
  invalido: boolean; // algun campo no vacio no es un numero valido
  tieneCarga: boolean; // kilos>0 o m3>0 (y todo valido)
}

function parsearItem(it: ItemForm): ItemParseado {
  const kilos = parseNum(it.kilos);
  const m3 = parseNum(it.m3);
  const bultos = parseNum(it.bultos);
  const valorDeclarado = parseNum(it.valorDeclarado);
  const invalido = [kilos, m3, bultos, valorDeclarado].some((n) => Number.isNaN(n));
  const tieneCarga = !invalido && (kilos > 0 || m3 > 0);
  return { kilos, m3, bultos, valorDeclarado, invalido, tieneCarga };
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
  const itemsParseados = items.map(parsearItem);
  const itemsCalculados = itemsParseados.map((p) => {
    if (!clave || p.invalido || !p.tieneCarga) return null;
    return calcularItem(filasSeco, p.kilos, p.m3, clave);
  });
  // Invalido por 3 motivos distintos: un numero mal escrito, un Valor
  // Declarado cargado sin Kilos/Mts3 (probable error de carga -- no hay
  // nada que asegurar si no hay carga), o que no matchea ninguna banda
  // del Cuadro Tarifario (incluye "Por Kg" sin Kilos). Una fila vacia
  // (sin nada cargado) nunca cuenta como invalida, se ignora.
  const hayItemInvalido = itemsParseados.some((p, i) => {
    if (p.invalido) return true;
    if (!p.tieneCarga) return p.valorDeclarado > 0;
    return itemsCalculados[i] === null;
  });
  const itemsValidos = itemsParseados
    .map((p, i) => ({ p, calc: itemsCalculados[i] }))
    .filter((x): x is { p: ItemParseado; calc: NonNullable<typeof x.calc> } => x.calc !== null);
  const valorDeclaradoTotal = itemsValidos.reduce((a, { p }) => a + p.valorDeclarado, 0);
  const seguroPorcentajeNum = parseNum(seguroPorcentaje);
  const contraReembolsoNum = parseNum(contraReembolso);
  const taxiFletNum = parseNum(taxiFlet);
  const hayNumeroInvalido = [seguroPorcentajeNum, contraReembolsoNum, taxiFletNum].some((n) => Number.isNaN(n));
  const sucursalQuePaga = pagaEn === 'origen' ? traficoOrigen : traficoDestino;
  const totales = minimos && !hayItemInvalido && !hayNumeroInvalido
    ? calcularTotales({
        totalesItems: itemsValidos.map(({ calc }) => calc.total),
        valorDeclaradoTotal,
        minimoAplicable: minimoDeSucursal(minimos, sucursalQuePaga),
        seguroActivo,
        seguroPorcentaje: seguroPorcentajeNum,
        contraReembolso: contraReembolsoNum,
        taxiFlet: taxiFletNum,
      })
    : null;

  async function guardar() {
    if (!usuario?.sucursal) {
      toast('Tu usuario no tiene sucursal asignada -- pedile a un administrador que te la cargue en Administración → Usuarios.', 'err');
      return;
    }
    if (!clave) { toast('Ese tráfico no tiene una combinación de zona válida.', 'warn'); return; }
    if (hayItemInvalido) {
      toast('Hay un ítem con un dato inválido: un número mal escrito, un Valor Declarado sin Kilos/Mts³ cargados, o que no cae en ninguna banda del Cuadro Tarifario (si es "Por Kg", le falta el peso real).', 'warn');
      return;
    }
    if (hayNumeroInvalido) { toast('Revisá que el % de Seguro, Contra Reembolso y Taxi-Flet sean números válidos.', 'warn'); return; }
    if (itemsValidos.length === 0) { toast('Cargá al menos un ítem con Kilos o Mts³.', 'warn'); return; }
    if (!totales) { toast('No se pudieron cargar los mínimos por sucursal -- recargá la página e intentá de nuevo.', 'err'); return; }

    setGuardando(true);
    let cot: Cotizacion | null = null;
    try {
      cot = await pb.collection('cotizaciones').create<Cotizacion>({
        fecha, trafico_origen: traficoOrigen, trafico_destino: traficoDestino, paga_en: pagaEn,
        cliente: cliente || null, solicitado_por: solicitadoPor.trim(), telefono: telefono.trim(), email: email.trim(),
        lugar_carga: lugarCarga.trim(), lugar_descarga: lugarDescarga.trim(),
        tipo_mercaderia: tipoMercaderia.trim(), observacion: observacion.trim(),
        seguro_activo: seguroActivo, seguro_porcentaje: seguroPorcentajeNum,
        contra_reembolso: contraReembolsoNum, taxi_flet: taxiFletNum,
        sub_total: totales.subTotal, recargo: totales.recargo, seguro: totales.seguro,
        neto_gravado: totales.netoGravado, iva: totales.iva, total: totales.total,
      });
      // ponytail: si un item falla a mitad de este loop (red, etc.), la
      // cotizacion ya creada arriba queda "fantasma" (numero real
      // asignado, sin items) -- no se intenta borrarla aca porque
      // deleteRule es admin-only (la mayoria de quien carga cotizaciones
      // es operador), asi que un intento de limpieza fallaria en
      // silencio igual para el caso mas comun. Riesgo bajo (requiere una
      // falla justo entre el create del encabezado y el de un item) y
      // aceptado por ahora -- subir de nivel a un endpoint server-side
      // que cree todo atomico via Dao si esto llega a pasar en la
      // practica. El catch de abajo avisa el numero fantasma para que se
      // pueda pedir que lo borren, en vez de dejarlo sin rastro.
      for (const { p, calc } of itemsValidos) {
        await pb.collection('cotizacion_items').create<CotizacionItem>({
          cotizacion: cot.id,
          kilos: p.kilos, m3: p.m3, bultos: p.bultos, valor_declarado: p.valorDeclarado,
          precio: calc.precio, total: calc.total,
        });
      }
      toast(`Cotización ${cot.numero} guardada.`, 'ok');
      setVista('lista');
      cargarListaYDatos();
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : '';
      toast(
        cot
          ? `La cotización ${cot.numero} quedó incompleta (error al guardar un ítem: ${mensaje}) -- pedile a un administrador que la borre y volvé a cargarla entera.`
          : 'Error al guardar: ' + mensaje,
        'err',
      );
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
                    <td>{labelSucursal(c.trafico_origen)} → {labelSucursal(c.trafico_destino)}</td>
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
                const p = itemsParseados[i];
                const tieneAlgo = p.invalido || p.kilos > 0 || p.m3 > 0;
                return (
                  <tr key={i}>
                    <td><input inputMode="decimal" value={it.kilos} onChange={(e) => actualizarItem(i, 'kilos', e.target.value)} style={{ width: 80 }} /></td>
                    <td><input inputMode="decimal" value={it.m3} onChange={(e) => actualizarItem(i, 'm3', e.target.value)} style={{ width: 80 }} /></td>
                    <td><input inputMode="decimal" value={it.bultos} onChange={(e) => actualizarItem(i, 'bultos', e.target.value)} style={{ width: 70 }} /></td>
                    <td><input inputMode="decimal" value={it.valorDeclarado} onChange={(e) => actualizarItem(i, 'valorDeclarado', e.target.value)} style={{ width: 110 }} /></td>
                    <td className="num">{calc ? money(calc.precio) : (tieneAlgo ? '—' : '')}</td>
                    <td className="num">{calc ? money(calc.total) : (tieneAlgo ? '—' : '')}</td>
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
