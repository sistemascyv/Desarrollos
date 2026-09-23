import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { pb } from '../../lib/pb';
import { amendQueuedCreate, esErrorDeRed, getQueue, mensajeDeError, queueOp, removeQueuedCreate } from '../../lib/offlineQueue';
import { useAuth } from '../../lib/AuthContext';
import { useToast } from '../../lib/ToastContext';
import { useConfirm } from '../../lib/ConfirmContext';
import type { Chofer, Cliente, PeriodoCerrado, Ruta, Tarifa, Tramo, Vehiculo, ValeCaja } from '../../types';
import { money, monthLabel, NOMBRES_MESES, isoDate, uid } from '../../lib/format';
import { TramoModal } from './TramoModal';

const DETAIL_FIELDS: [keyof Tramo, string, boolean][] = [
  ['peajes', 'Peajes', true], ['gastos_varios', 'Gastos varios', true],
  ['comida_viaje', 'Comida viaje', true], ['comida_internacional', 'Comida internacional', true],
  ['entrega_retiro_sfco', 'Retiro/Entrega SFCO', true], ['interrupcion', 'Interrupción', true],
  ['cyd_manual', 'CyD manual', true], ['control_gral', 'Control gral', true],
  ['descanso', 'Descanso', true], ['km_dobles', 'Km dobles', false],
  ['cruce_frontera', 'Cruce frontera', false],
];

// Columnas del Excel de tramos: [campo, encabezado, es plata, se suma en el total]
const COLUMNAS_EXCEL: [keyof Tramo, string, boolean, boolean][] = [
  ['tractor', 'Tractor', false, false], ['dia_salida', 'Día salida', false, false], ['hora_salida', 'Hora salida', false, false],
  ['dia_llegada', 'Día llegada', false, false], ['hora_llegada', 'Hora llegada', false, false],
  ['origen', 'Origen', false, false], ['destino', 'Destino', false, false], ['cliente', 'Cliente', false, false],
  ['es_posicionamiento', 'Posicionamiento', false, false],
  ['peajes', 'Peajes', true, true], ['gastos_varios', 'Gastos varios', true, true], ['km_alargue', 'Km alargue', false, true],
  ['comida_viaje', 'Comida viaje', true, true], ['comida_internacional', 'Comida internacional', true, true],
  ['entrega_retiro_sfco', 'Retiro/Entrega SFCO', true, true], ['interrupcion', 'Interrupción', true, true],
  ['cyd_manual', 'CyD manual', true, true], ['control_gral', 'Control gral', true, true], ['descanso', 'Descanso', true, true],
  ['vale_nro', 'Vale N°', false, false], ['vale_importe', 'Vale importe', true, true],
  ['total_gastos', 'Total gastos', true, true], ['km_recorridos', 'Km recorridos', false, true],
  ['km_dobles', 'Km dobles', false, true], ['control', 'Control', false, false],
  ['permanencia', 'Permanencia (noches)', false, true], ['cruce_frontera', 'Cruce frontera', false, true],
];

function cmpTramos(a: Tramo, b: Tramo) {
  return (a.dia_salida || '').localeCompare(b.dia_salida || '') || (a.hora_salida || '').localeCompare(b.hora_salida || '');
}

function fechaCorta(iso: string | undefined) {
  return iso ? new Date(iso.replace(' ', 'T')).toLocaleDateString('es-AR') : '';
}

export function PlanillaChoferesPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const { isAdmin, usuario } = useAuth();

  const [choferes, setChoferes] = useState<Chofer[]>([]);
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [rutas, setRutas] = useState<Ruta[]>([]);
  const [cerrados, setCerrados] = useState<Record<string, PeriodoCerrado>>({});

  const [choferId, setChoferId] = useState('');
  const now = useRef(new Date());
  const [desde, setDesde] = useState(isoDate(new Date(now.current.getFullYear(), now.current.getMonth(), 1)));
  const [hasta, setHasta] = useState(isoDate(now.current));

  const [mesTarifa, setMesTarifa] = useState(String(now.current.getMonth() + 1).padStart(2, '0'));
  const [anioTarifa, setAnioTarifa] = useState(String(now.current.getFullYear()));
  const [tarifaActual, setTarifaActual] = useState<Tarifa | null>(null);
  const [tarifaOk, setTarifaOk] = useState(false); // false = todavía no se pudo leer la tarifa de este mes
  const [tarifaKm, setTarifaKm] = useState('');
  const [viaticoNoche, setViaticoNoche] = useState('');

  const [tramos, setTramos] = useState<Tramo[]>([]);
  const [valesDisponibles, setValesDisponibles] = useState<ValeCaja[]>([]);
  const [valesTildados, setValesTildados] = useState<Set<string>>(new Set());
  const [cargando, setCargando] = useState(false);
  const [tarifasCache, setTarifasCache] = useState<Record<string, Tarifa | null>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTramo, setEditingTramo] = useState<Tramo | null>(null);

  // Cada búsqueda lleva un número: si el usuario cambia de chofer/mes mientras
  // la anterior sigue en vuelo, la respuesta vieja se descarta en vez de pisar
  // la pantalla con datos de otro chofer.
  const tramosReq = useRef(0);
  const tarifaReq = useRef(0);

  const selMes = anioTarifa + '-' + mesTarifa;
  const mesesCerrados = useMemo(() => new Set(Object.keys(cerrados)), [cerrados]);
  const cierreSel = cerrados[selMes];

  useEffect(() => {
    refreshCatalogs();
  }, []);

  useEffect(() => {
    loadTarifa(selMes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selMes]);

  useEffect(() => {
    if (choferId) { loadTramos(); loadValesDisponibles(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [choferId]);

  // cuando la cola offline termina de sincronizar, los tramos "pend." pasan a ser reales
  const recargarRef = useRef(loadTramos);
  useEffect(() => {
    recargarRef.current = loadTramos;
  });
  useEffect(() => {
    const onFlushed = () => { if (choferId) recargarRef.current(); };
    window.addEventListener('cyv-queue-flushed', onFlushed);
    return () => window.removeEventListener('cyv-queue-flushed', onFlushed);
  }, [choferId]);

  async function refreshCatalogs() {
    try {
      const items = await pb.collection('choferes').getFullList<Chofer>({ filter: 'activo=true', sort: 'nombre' });
      setChoferes(items);
      if (!choferId && items.length) setChoferId(items[0].id);
    } catch (e) {
      toast('No se pudo cargar choferes: ' + mensajeDeError(e), 'err');
    }
    try {
      setVehiculos(await pb.collection('vehiculos').getFullList<Vehiculo>({ filter: 'activo=true', sort: 'codigo' }));
    } catch (e) {
      toast('No se pudieron cargar los vehículos: ' + mensajeDeError(e), 'err');
    }
    try {
      setClientes(await pb.collection('clientes').getFullList<Cliente>({ filter: 'activo=true', sort: 'nombre' }));
    } catch (e) {
      toast('No se pudieron cargar los clientes: ' + mensajeDeError(e), 'err');
    }
    try {
      setRutas(await pb.collection('rutas').getFullList<Ruta>({ filter: 'activo=true', sort: 'origen' }));
    } catch (e) {
      toast('No se pudieron cargar las rutas: ' + mensajeDeError(e), 'err');
    }
    await cargarCerrados();
  }

  async function cargarCerrados() {
    try {
      const items = await pb.collection('periodos_cerrados').getFullList<PeriodoCerrado>();
      setCerrados(Object.fromEntries(items.map((p) => [p.mes, p])));
    } catch (e) {
      toast('No se pudo cargar qué meses están cerrados: ' + mensajeDeError(e), 'err');
    }
  }

  // Si hubiera más de una tarifa para el mismo mes (no hay índice único), gana
  // la última modificada — antes se usaba la primera que devolviera la base.
  async function buscarTarifa(mes: string): Promise<{ tarifa: Tarifa | null; cantidad: number }> {
    const items = await pb.collection('tarifas').getFullList<Tarifa>({ filter: pb.filter('mes = {:mes}', { mes }), sort: '-updated' });
    return { tarifa: items[0] || null, cantidad: items.length };
  }

  async function fetchTarifaFor(mes: string): Promise<Tarifa | null> {
    if (mes in tarifasCache) return tarifasCache[mes];
    try {
      const { tarifa } = await buscarTarifa(mes);
      setTarifasCache((c) => ({ ...c, [mes]: tarifa }));
      return tarifa;
    } catch {
      return null; // no se cachea: se vuelve a intentar en la próxima búsqueda
    }
  }

  async function ensureTarifasFor(meses: string[]) {
    await Promise.all(meses.map(fetchTarifaFor));
  }

  async function loadTarifa(mes: string) {
    const mi = ++tarifaReq.current;
    setTarifasCache((c) => {
      const next = { ...c };
      delete next[mes];
      return next;
    });
    setTarifaOk(false);
    try {
      const { tarifa, cantidad } = await buscarTarifa(mes);
      if (mi !== tarifaReq.current) return;
      setTarifasCache((c) => ({ ...c, [mes]: tarifa }));
      setTarifaActual(tarifa);
      setTarifaKm(tarifa ? String(tarifa.tarifa_km) : '');
      setViaticoNoche(tarifa ? String(tarifa.valor_viatico_noche || 0) : '');
      setTarifaOk(true);
      if (cantidad > 1) {
        toast(`Hay ${cantidad} tarifas cargadas para ${monthLabel(mes)}: se usa la última modificada. Conviene borrar las repetidas.`, 'warn');
      }
    } catch (e) {
      if (mi !== tarifaReq.current) return;
      setTarifaActual(null);
      setTarifaKm('');
      setViaticoNoche('');
      toast(`No se pudo leer la tarifa de ${monthLabel(mes)}: ${mensajeDeError(e)}`, 'warn');
    }
  }

  async function saveTarifa() {
    if (cierreSel) { toast(`${monthLabel(selMes)} está cerrado: un admin tiene que reabrirlo para cambiar la tarifa.`, 'warn'); return; }
    if (!tarifaOk) { toast('No se pudo leer la tarifa de este mes, así que no se guarda (podría duplicarse). Recargá la página.', 'warn'); return; }
    const km = Number(tarifaKm);
    const viatico = Number(viaticoNoche) || 0;
    if (!km || km < 0) { toast('Ingresá un valor de tarifa por km mayor a cero.', 'warn'); return; }
    if (viatico < 0) { toast('El viático por noche no puede ser negativo.', 'warn'); return; }
    const data = { mes: selMes, tarifa_km: km, valor_viatico_noche: viatico };
    try {
      if (tarifaActual) {
        await pb.collection('tarifas').update(tarifaActual.id, { tarifa_km: km, valor_viatico_noche: viatico });
      } else {
        await pb.collection('tarifas').create(data);
      }
      toast('Valores del mes guardados.', 'ok');
      await loadTarifa(selMes);
    } catch (e) {
      if (!esErrorDeRed(e)) { toast('No se pudo guardar la tarifa: ' + mensajeDeError(e), 'err'); return; }
      const label = `tarifa de ${monthLabel(selMes)}`;
      if (tarifaActual) {
        queueOp({ type: 'update', collection: 'tarifas', id: tarifaActual.id, data: { tarifa_km: km, valor_viatico_noche: viatico }, label });
      } else {
        // un solo "create" por mes en la cola: guardar dos veces sin conexión no duplica la tarifa
        const tmpId = 'tarifa_' + selMes;
        if (!amendQueuedCreate(tmpId, data)) queueOp({ type: 'create', collection: 'tarifas', data, tmpId, label });
      }
      toast('Sin conexión: valores encolados para sincronizar.', 'warn');
    }
  }

  async function cerrarMes() {
    const aviso = tarifaActual ? '' : '\n\nOjo: este mes no tiene tarifa cargada.';
    const ok = await confirm(
      `¿Cerrar ${monthLabel(selMes)}? Nadie va a poder cargar, editar ni borrar tramos ni la tarifa de ese mes hasta que un admin lo reabra.${aviso}`,
      'Cerrar mes',
    );
    if (!ok) return;
    try {
      await pb.collection('periodos_cerrados').create({ mes: selMes });
      toast(`${monthLabel(selMes)} cerrado.`, 'ok');
      await cargarCerrados();
    } catch (e) {
      toast('No se pudo cerrar el mes: ' + mensajeDeError(e), 'err');
    }
  }

  async function reabrirMes() {
    if (!cierreSel) return;
    if (!(await confirm(`¿Reabrir ${monthLabel(selMes)}? Vuelve a poder modificarse.`, 'Reabrir mes'))) return;
    try {
      await pb.collection('periodos_cerrados').delete(cierreSel.id);
      toast(`${monthLabel(selMes)} reabierto.`, 'ok');
      await cargarCerrados();
    } catch (e) {
      toast('No se pudo reabrir el mes: ' + mensajeDeError(e), 'err');
    }
  }

  // tramos cargados sin conexión que todavía no salieron de la cola (aparecen con "pend.")
  function pendientesLocales(): Tramo[] {
    return getQueue()
      .filter((o) => o.type === 'create' && o.collection === 'tramos' && o.tmpId && o.data && o.data.chofer === choferId)
      .filter((o) => {
        const d = String(o.data!.dia_salida || '');
        return d >= desde && d <= hasta;
      })
      .map((o) => ({ id: o.tmpId!, ...o.data }) as Tramo);
  }

  async function loadTramos() {
    if (!choferId || !desde || !hasta) { toast('Elegí chofer y el rango de fechas.', 'warn'); return; }
    if (desde > hasta) { toast('"Desde" no puede ser posterior a "Hasta".', 'warn'); return; }
    const mi = ++tramosReq.current;
    setCargando(true);
    let items: Tramo[] = [];
    try {
      const filter = pb.filter('chofer = {:chofer} && dia_salida >= {:desde} && dia_salida <= {:hasta}', { chofer: choferId, desde, hasta });
      items = await pb.collection('tramos').getFullList<Tramo>({ filter, sort: 'dia_salida,hora_salida' });
    } catch (e) {
      if (mi === tramosReq.current) toast('No se pudieron cargar los tramos: ' + mensajeDeError(e), 'warn');
    }
    if (mi !== tramosReq.current) return;
    const todos = [...items, ...pendientesLocales()].sort(cmpTramos);
    setTramos(todos);
    await ensureTarifasFor([...new Set(todos.map((t) => t.mes).filter(Boolean))]);
    if (mi === tramosReq.current) setCargando(false);
  }

  async function loadValesDisponibles() {
    if (!choferId) { setValesDisponibles([]); setValesTildados(new Set()); return; }
    try {
      const items = await pb.collection('vales_caja').getFullList<ValeCaja>({
        filter: pb.filter('chofer = {:c} && usado = false', { c: choferId }),
        sort: 'fecha',
      });
      setValesDisponibles(items);
      setValesTildados(new Set());
    } catch (e) {
      toast('No se pudieron cargar los vales de caja: ' + mensajeDeError(e), 'err');
    }
  }

  async function toggleVale(v: ValeCaja) {
    const marcando = !valesTildados.has(v.id);
    try {
      await pb.send(`/api/vales-caja/${v.id}/${marcando ? 'usar' : 'liberar'}`, { method: 'POST' });
      setValesTildados((cur) => {
        const next = new Set(cur);
        if (marcando) next.add(v.id); else next.delete(v.id);
        return next;
      });
    } catch (e) {
      toast('No se pudo actualizar el vale: ' + mensajeDeError(e), 'err');
    }
  }

  function toggleExpand(id: string) {
    setExpanded((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleSubmitTramo(data: Partial<Tramo> & { mes: string }) {
    // al editar se conserva el chofer del tramo: usar el seleccionado ahora podía
    // reasignarlo a otro si la lista en pantalla estaba desactualizada.
    const chofer = editingTramo?.chofer ?? choferId;
    const full = { ...data, chofer };
    const label = `tramo del ${data.dia_salida || '?'}${data.origen || data.destino ? ` (${data.origen || '?'} → ${data.destino || '?'})` : ''}`;

    // tramo cargado sin conexión que todavía no se sincronizó: se corrige el "alta" pendiente
    if (editingTramo && editingTramo.id.startsWith('tmp_')) {
      if (amendQueuedCreate(editingTramo.id, full)) {
        setTramos((cur) => cur.map((t) => (t.id === editingTramo.id ? ({ ...t, ...full } as Tramo) : t)).sort(cmpTramos));
        toast('Cambios guardados; se sincronizan al reconectar.', 'warn');
      } else {
        toast('Ese tramo justo se sincronizó: recargando la lista, volvé a editarlo.', 'warn');
        await loadTramos();
      }
      setModalOpen(false);
      return;
    }

    try {
      if (editingTramo) {
        await pb.collection('tramos').update(editingTramo.id, full);
      } else {
        await pb.collection('tramos').create(full);
      }
      toast('Tramo guardado.', 'ok');
      setModalOpen(false);
      await ensureTarifasFor([data.mes]);
      await loadTramos();
    } catch (e) {
      // Solo la falta de conexión se encola. Cualquier otra cosa (validación,
      // permisos, mes cerrado…) es una respuesta del servidor: se muestra el
      // motivo real y el modal queda abierto para corregirlo.
      if (!esErrorDeRed(e)) {
        toast('No se pudo guardar el tramo: ' + mensajeDeError(e), 'err');
        return;
      }
      if (editingTramo) {
        queueOp({ type: 'update', collection: 'tramos', id: editingTramo.id, data: full, label });
        setTramos((cur) => cur.map((t) => (t.id === editingTramo.id ? ({ ...t, ...full } as Tramo) : t)).sort(cmpTramos));
      } else {
        const tmpId = uid();
        queueOp({ type: 'create', collection: 'tramos', data: full, tmpId, label });
        setTramos((cur) => [...cur, { id: tmpId, ...full } as Tramo].sort(cmpTramos));
      }
      toast('Sin conexión: tramo guardado en este dispositivo y encolado.', 'warn');
      setModalOpen(false);
      await ensureTarifasFor([data.mes]);
    }
  }

  async function deleteTramo(id: string) {
    if (!(await confirm('¿Borrar este tramo? Esta acción no se puede deshacer.', 'Borrar tramo'))) return;
    if (id.startsWith('tmp_')) {
      // todavía no se creó en el servidor: alcanza con sacarlo de la cola
      removeQueuedCreate(id);
      setTramos((cur) => cur.filter((t) => t.id !== id));
      return;
    }
    try {
      await pb.collection('tramos').delete(id);
      setTramos((cur) => cur.filter((t) => t.id !== id));
    } catch (e) {
      if (!esErrorDeRed(e)) { toast('No se pudo borrar el tramo: ' + mensajeDeError(e), 'err'); return; }
      const t = tramos.find((x) => x.id === id);
      queueOp({ type: 'delete', collection: 'tramos', id, label: `tramo del ${t?.dia_salida || '?'}` });
      setTramos((cur) => cur.filter((x) => x.id !== id));
      toast('Sin conexión: el borrado se hace al reconectar.', 'warn');
    }
  }

  const summary = useMemo(() => {
    const totalValesTramos = tramos.reduce((s, t) => s + (Number(t.vale_importe) || 0), 0);
    const totalValesCaja = valesDisponibles
      .filter((v) => valesTildados.has(v.id))
      .reduce((s, v) => s + (Number(v.importe) || 0), 0);
    const totalVales = totalValesTramos + totalValesCaja;
    const totalKmAlargue = tramos.reduce((s, t) => s + (Number(t.km_alargue) || 0), 0);
    const totalGastos = tramos.reduce((s, t) => s + (Number(t.total_gastos) || 0), 0);
    const totalPermanencia = tramos.reduce((s, t) => s + (Number(t.permanencia) || 0), 0);
    const saldo = totalVales - totalGastos;

    const sinTarifaAlargue = new Set<string>();
    const sinValorViatico = new Set<string>();
    let montoAlargue = 0;
    let viaticos = 0;
    tramos.forEach((t) => {
      const tar = tarifasCache[t.mes];
      if (tar === undefined) return; // todavía cargando: no avisar de más
      if (!tar) {
        if (t.km_alargue) sinTarifaAlargue.add(t.mes);
        if (t.permanencia) sinValorViatico.add(t.mes);
        return;
      }
      montoAlargue += (Number(t.km_alargue) || 0) * (Number(tar.tarifa_km) || 0);
      const valorNoche = Number(tar.valor_viatico_noche) || 0;
      viaticos += (Number(t.permanencia) || 0) * valorNoche;
      if (t.permanencia && !valorNoche) sinValorViatico.add(t.mes);
    });
    const lista = (s: Set<string>) => [...s].sort().map(monthLabel).join(', ');
    const avisoAlargue = sinTarifaAlargue.size ? ` (falta tarifa: ${lista(sinTarifaAlargue)})` : '';
    const avisoViaticos = sinValorViatico.size ? ` (falta valor por noche: ${lista(sinValorViatico)})` : '';
    const incompleto = sinTarifaAlargue.size > 0 || sinValorViatico.size > 0;

    // Lo que se le liquida al chofer: alargue + viáticos + gastos que hizo, menos
    // los vales que ya recibió. Positivo = la empresa le debe; negativo = debe rendir.
    const totalALiquidar = montoAlargue + viaticos + totalGastos - totalVales;

    return { totalVales, totalKmAlargue, totalGastos, totalPermanencia, saldo, montoAlargue, viaticos, avisoAlargue, avisoViaticos, incompleto, totalALiquidar };
  }, [tramos, tarifasCache, valesDisponibles, valesTildados]);

  const sum = (f: keyof Tramo) => tramos.reduce((s, t) => s + (Number(t[f]) || 0), 0);

  const years = useMemo(() => {
    const y = now.current.getFullYear();
    const list = [];
    for (let i = y + 1; i >= y - 4; i--) list.push(i);
    return list;
  }, []);

  const choferNombre = choferes.find((c) => c.id === choferId)?.nombre || '';

  function exportExcel() {
    if (tramos.length === 0) { toast('No hay tramos para exportar.', 'warn'); return; }
    const encabezados = COLUMNAS_EXCEL.map((c) => c[1]);
    const filas = tramos.map((t) =>
      COLUMNAS_EXCEL.map(([f]) => {
        const v = t[f];
        if (typeof v === 'boolean') return v ? 'Sí' : 'No';
        return v ?? '';
      }),
    );
    const totales = COLUMNAS_EXCEL.map(([f, , , suma], i) => (i === 0 ? `TOTAL (${tramos.length})` : suma ? sum(f) : ''));
    const wsTramos = XLSX.utils.aoa_to_sheet([encabezados, ...filas, totales]);
    wsTramos['!cols'] = COLUMNAS_EXCEL.map(([, titulo]) => ({ wch: Math.max(11, titulo.length + 2) }));
    // formato de plata en las columnas que corresponden
    for (let r = 1; r <= filas.length + 1; r++) {
      COLUMNAS_EXCEL.forEach(([, , esPlata], c) => {
        const celda = wsTramos[XLSX.utils.encode_cell({ r, c })];
        if (celda && esPlata && typeof celda.v === 'number') celda.z = '#,##0.00';
      });
    }

    const meses = [...new Set(tramos.map((t) => t.mes).filter(Boolean))].sort();
    const resumen: (string | number)[][] = [
      ['Rendición de chofer'],
      [],
      ['Chofer', choferNombre],
      ['Período', `${desde} a ${hasta}`],
      ['Meses incluidos', meses.map((m) => monthLabel(m) + (mesesCerrados.has(m) ? ' (cerrado)' : ' (abierto)')).join(', ')],
      ['Generado', `${new Date().toLocaleString('es-AR', { hour12: false })} por ${usuario?.nombre || usuario?.username || '—'}`],
      [],
      ['Total vales', summary.totalVales],
      ['Total gastos', summary.totalGastos],
      ['Saldo (vales − gastos)', summary.saldo],
      ['Km alargue', summary.totalKmAlargue],
      ['Monto alargue', summary.montoAlargue],
      ['Viáticos (noches × valor)', summary.viaticos],
      ['TOTAL A LIQUIDAR', summary.totalALiquidar],
      [],
      ['Total a liquidar = Monto alargue + Viáticos + Total gastos − Total vales'],
    ];
    if (summary.incompleto) resumen.push(['ATENCIÓN: el cálculo está incompleto' + summary.avisoAlargue + summary.avisoViaticos]);
    const wsResumen = XLSX.utils.aoa_to_sheet(resumen);
    wsResumen['!cols'] = [{ wch: 28 }, { wch: 60 }];
    for (let r = 7; r <= 13; r++) {
      const celda = wsResumen[XLSX.utils.encode_cell({ r, c: 1 })];
      if (celda && typeof celda.v === 'number' && r !== 10) celda.z = '#,##0.00';
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen');
    XLSX.utils.book_append_sheet(wb, wsTramos, 'Tramos');
    XLSX.writeFile(wb, `rendicion_${(choferNombre || 'chofer').replace(/[^a-z0-9]+/gi, '_')}_${desde}_a_${hasta}.xlsx`);
  }

  return (
    <main>
      <div id="print-header" style={{ display: 'none' }}>
        <h1>CyV — Rendición de chofer</h1>
        <div className="sub">
          Chofer: {choferNombre || '—'} · Del {desde || '—'} al {hasta || '—'} · Impreso: {new Date().toLocaleString('es-AR', { hour12: false })}
        </div>
      </div>

      <div className="card">
        <h2>Filtrar tramos</h2>
        <div className="row">
          <div className="field" style={{ minWidth: 220 }}>
            <label htmlFor="pl-chofer">Chofer</label>
            <select id="pl-chofer" value={choferId} onChange={(e) => setChoferId(e.target.value)}>
              {choferes.length === 0 && <option value="">(sin choferes)</option>}
              {choferes.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}{c.localidad ? ' — ' + c.localidad : ''}</option>
              ))}
            </select>
          </div>
          <div className="field"><label htmlFor="pl-desde">Desde</label><input id="pl-desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></div>
          <div className="field"><label htmlFor="pl-hasta">Hasta</label><input id="pl-hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></div>
          <button onClick={loadTramos} disabled={cargando}>{cargando ? 'Buscando…' : 'Buscar'}</button>
          <button className="secondary" onClick={() => { setEditingTramo(null); setModalOpen(true); }}>+ Nuevo tramo</button>
          <button className="secondary" onClick={exportExcel}>Exportar Excel</button>
          <button className="secondary" onClick={() => window.print()}>Imprimir</button>
        </div>
      </div>

      <div className="card">
        <h2>Tarifa y viático por mes</h2>
        <div className="row" style={{ marginTop: 10 }}>
          <div className="field">
            <label>Mes</label>
            <select value={mesTarifa} onChange={(e) => setMesTarifa(e.target.value)}>
              {NOMBRES_MESES.map((label, i) => (
                <option key={label} value={String(i + 1).padStart(2, '0')}>{label}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Año</label>
            <select value={anioTarifa} onChange={(e) => setAnioTarifa(e.target.value)}>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Tarifa km ($/km)</label>
            <input type="number" min={0} step="0.0001" value={tarifaKm} disabled={!!cierreSel} onChange={(e) => setTarifaKm(e.target.value)} placeholder="ej: 169.6053" />
          </div>
          <div className="field">
            <label>Viático por noche ($)</label>
            <input type="number" min={0} step="0.01" value={viaticoNoche} disabled={!!cierreSel} onChange={(e) => setViaticoNoche(e.target.value)} placeholder="ej: 5000" />
          </div>
          <button className="secondary" onClick={saveTarifa} disabled={!!cierreSel}>Guardar valores del mes</button>
        </div>
        <div className="row" style={{ marginTop: 10, alignItems: 'center' }}>
          <strong style={{ fontSize: 13 }}>{monthLabel(selMes)}:</strong>
          {cierreSel ? (
            <span className="badge" style={{ color: 'var(--err)', borderColor: 'var(--err)' }}>
              Cerrado{cierreSel.cerrado_por ? ` por ${cierreSel.cerrado_por}` : ''} el {fechaCorta(cierreSel.created)}
            </span>
          ) : (
            <span className="badge ok">Abierto</span>
          )}
          {isAdmin && (cierreSel
            ? <button className="small secondary" onClick={reabrirMes}>Reabrir mes</button>
            : <button className="small secondary" onClick={cerrarMes}>Cerrar mes</button>)}
        </div>
        <div className="hint">
          Se usa para calcular el monto de alargue y los viáticos de los tramos de ese mes, sin importar qué rango de fechas estés mirando abajo.
          Un mes cerrado no admite cambios en sus tramos ni en su tarifa hasta que un admin lo reabra.
        </div>
      </div>

      <div className="card">
        <h2>Resumen</h2>
        <div className="summary-grid">
          <div className="stat"><div className="lbl">Total vales</div><div className="val">{money(summary.totalVales)}</div></div>
          <div className="stat"><div className="lbl">Km alargue</div><div className="val">{summary.totalKmAlargue.toLocaleString('es-AR')}</div></div>
          <div className="stat"><div className="lbl">Monto alargue</div><div className="val">{money(summary.montoAlargue)}{summary.avisoAlargue}</div></div>
          <div className="stat"><div className="lbl">Total gastos</div><div className="val">{money(summary.totalGastos)}</div></div>
          <div className="stat"><div className="lbl">Viáticos (noches × valor)</div><div className="val">{money(summary.viaticos)}{summary.avisoViaticos}</div></div>
          <div className={`stat ${summary.saldo >= 0 ? 'saldo-pos' : 'saldo-neg'}`}><div className="lbl">Saldo (vales − gastos)</div><div className="val">{money(summary.saldo)}</div></div>
          <div className={`stat ${summary.totalALiquidar >= 0 ? 'saldo-pos' : 'saldo-neg'}`}>
            <div className="lbl">Total a liquidar</div>
            <div className="val">{money(summary.totalALiquidar)}{summary.incompleto ? ' (incompleto)' : ''}</div>
          </div>
        </div>
        <div className="hint" style={{ marginTop: 8 }}>
          Total a liquidar = monto alargue + viáticos + total gastos − total vales. Positivo: la empresa le debe al chofer; negativo: el chofer tiene que rendir la diferencia.
        </div>
      </div>

      {valesDisponibles.length > 0 && (
        <div className="card" style={{ background: 'var(--panel2)' }}>
          <h3 style={{ margin: '0 0 8px' }}>Vales de caja disponibles</h3>
          <div className="detail-grid">
            {valesDisponibles.map((v) => (
              <label key={v.id} className="d-item" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={valesTildados.has(v.id)} onChange={() => toggleVale(v)} />
                <div>
                  <div className="lbl">{fechaCorta(v.fecha)}</div>
                  <div className="val">{money(v.importe)}</div>
                </div>
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <h2>Tramos</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th></th><th></th><th>Tractor</th><th>Salida</th><th>Llegada</th><th>Origen → Destino</th>
                <th>Cliente</th><th className="num">Km alargue</th><th>Vale N°</th><th className="num">Vale importe</th>
                <th className="num">Total gastos</th><th className="num">Km recorridos</th>
                <th>Control</th><th className="num">Permanencia</th><th></th>
              </tr>
            </thead>
            <tbody>
              {tramos.map((t) => {
                const pending = t.id.startsWith('tmp_');
                const bloqueado = mesesCerrados.has(t.mes);
                const open = expanded.has(t.id);
                return (
                  <Fragment key={t.id}>
                    <tr>
                      <td><button className={`expand-btn${open ? ' open' : ''}`} onClick={() => toggleExpand(t.id)}>{open ? '▾' : '▸'}</button></td>
                      <td>
                        {pending ? <span className="badge pending">pend.</span> : bloqueado ? <span className="badge" title="Mes cerrado: no se puede modificar">cerrado</span> : ''}
                      </td>
                      <td>{t.tractor || ''}</td>
                      <td>{t.dia_salida || ''} {t.hora_salida || ''}</td>
                      <td>{t.dia_llegada || ''} {t.hora_llegada || ''}</td>
                      <td>{t.origen || ''} → {t.destino || ''}</td>
                      <td>{t.cliente || ''}{t.es_posicionamiento ? <span className="badge"> POS</span> : ''}</td>
                      <td className="num">{t.km_alargue || 0}</td>
                      <td>{t.vale_nro || ''}</td>
                      <td className="num">{money(t.vale_importe)}</td>
                      <td className="num"><strong>{money(t.total_gastos)}</strong></td>
                      <td className="num">{t.km_recorridos || 0}</td>
                      <td>{t.control ? '✔' : ''}</td>
                      <td className="num">{t.permanencia || 0}</td>
                      <td className="actions-cell">
                        <button className="small secondary" disabled={bloqueado} title={bloqueado ? 'Mes cerrado' : undefined} onClick={() => { setEditingTramo(t); setModalOpen(true); }}>Editar</button>
                        <button className="small danger" disabled={bloqueado} title={bloqueado ? 'Mes cerrado' : undefined} onClick={() => deleteTramo(t.id)}>Borrar</button>
                      </td>
                    </tr>
                    <tr className={`detail-row${open ? ' open' : ''}`}>
                      <td></td>
                      <td colSpan={14}>
                        <div className="detail-grid">
                          {DETAIL_FIELDS.map(([f, label, isMoney]) => (
                            <div className="d-item" key={String(f)}>
                              <div className="lbl">{label}</div>
                              <div className="val">{isMoney ? money(t[f]) : (t[f] || 0)}</div>
                            </div>
                          ))}
                          {!pending && (
                            <>
                              <div className="d-item">
                                <div className="lbl">Cargado por</div>
                                <div className="val">{t.creado_por || '—'}{t.created ? ` · ${fechaCorta(t.created)}` : ''}</div>
                              </div>
                              {t.editado_por && (
                                <div className="d-item">
                                  <div className="lbl">Última edición</div>
                                  <div className="val">{t.editado_por} · {fechaCorta(t.updated)}</div>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
            {tramos.length > 0 && (
              <tfoot>
                <tr>
                  <td></td><td></td><td colSpan={5}>TOTAL ({tramos.length} tramo{tramos.length === 1 ? '' : 's'})</td>
                  <td className="num">{sum('km_alargue').toLocaleString('es-AR')}</td>
                  <td></td>
                  <td className="num">{money(sum('vale_importe'))}</td>
                  <td className="num">{money(sum('total_gastos'))}</td>
                  <td className="num">{sum('km_recorridos').toLocaleString('es-AR')}</td>
                  <td></td>
                  <td className="num">{sum('permanencia').toLocaleString('es-AR')}</td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
          {tramos.length === 0 && (
            <div className="empty">{cargando ? 'Cargando tramos…' : 'No hay tramos para este chofer / rango de fechas.'}</div>
          )}
        </div>
      </div>

      {modalOpen && (
        <TramoModal
          tramo={editingTramo}
          vehiculos={vehiculos}
          clientes={clientes}
          rutas={rutas}
          mesesCerrados={mesesCerrados}
          onClose={() => setModalOpen(false)}
          onSubmit={handleSubmitTramo}
        />
      )}
    </main>
  );
}
