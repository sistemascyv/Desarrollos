import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { pb } from '../../lib/pb';
import { queueOp } from '../../lib/offlineQueue';
import { useToast } from '../../lib/ToastContext';
import { useConfirm } from '../../lib/ConfirmContext';
import type { Chofer, Cliente, Ruta, Tarifa, Tramo, Vehiculo } from '../../types';
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

export function PlanillaChoferesPage() {
  const toast = useToast();
  const confirm = useConfirm();

  const [choferes, setChoferes] = useState<Chofer[]>([]);
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [rutas, setRutas] = useState<Ruta[]>([]);

  const [choferId, setChoferId] = useState('');
  const now = useRef(new Date());
  const [desde, setDesde] = useState(isoDate(new Date(now.current.getFullYear(), now.current.getMonth(), 1)));
  const [hasta, setHasta] = useState(isoDate(now.current));

  const [mesTarifa, setMesTarifa] = useState(String(now.current.getMonth() + 1).padStart(2, '0'));
  const [anioTarifa, setAnioTarifa] = useState(String(now.current.getFullYear()));
  const [tarifaActual, setTarifaActual] = useState<Tarifa | null>(null);
  const [tarifaKm, setTarifaKm] = useState('');
  const [viaticoNoche, setViaticoNoche] = useState('');

  const [tramos, setTramos] = useState<Tramo[]>([]);
  const [tarifasCache, setTarifasCache] = useState<Record<string, Tarifa | null>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTramo, setEditingTramo] = useState<Tramo | null>(null);

  const selMes = anioTarifa + '-' + mesTarifa;

  useEffect(() => {
    refreshCatalogs();
  }, []);

  useEffect(() => {
    loadTarifa(selMes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selMes]);

  useEffect(() => {
    if (choferId) loadTramos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [choferId]);

  async function refreshCatalogs() {
    try {
      const items = await pb.collection('choferes').getFullList<Chofer>({ filter: 'activo=true', sort: 'nombre' });
      setChoferes(items);
      if (!choferId && items.length) setChoferId(items[0].id);
    } catch (e) {
      toast('No se pudo cargar choferes: ' + (e instanceof Error ? e.message : ''), 'err');
    }
    try {
      setVehiculos(await pb.collection('vehiculos').getFullList<Vehiculo>({ filter: 'activo=true', sort: 'codigo' }));
    } catch { /* offline, ignore */ }
    try {
      setClientes(await pb.collection('clientes').getFullList<Cliente>({ filter: 'activo=true', sort: 'nombre' }));
    } catch { /* offline, ignore */ }
    try {
      setRutas(await pb.collection('rutas').getFullList<Ruta>({ filter: 'activo=true', sort: 'origen' }));
    } catch { /* offline, ignore */ }
  }

  async function fetchTarifaFor(mes: string): Promise<Tarifa | null> {
    if (mes in tarifasCache) return tarifasCache[mes];
    let tarifa: Tarifa | null = null;
    try {
      const items = await pb.collection('tarifas').getFullList<Tarifa>({ filter: `mes='${mes.replace(/'/g, "\\'")}'` });
      tarifa = items[0] || null;
    } catch { /* offline */ }
    setTarifasCache((c) => ({ ...c, [mes]: tarifa }));
    return tarifa;
  }

  async function ensureTarifasFor(meses: string[]) {
    await Promise.all(meses.map(fetchTarifaFor));
  }

  async function loadTarifa(mes: string) {
    setTarifasCache((c) => {
      const next = { ...c };
      delete next[mes];
      return next;
    });
    let tarifa: Tarifa | null = null;
    try {
      const items = await pb.collection('tarifas').getFullList<Tarifa>({ filter: `mes='${mes.replace(/'/g, "\\'")}'` });
      tarifa = items[0] || null;
    } catch { /* offline */ }
    setTarifasCache((c) => ({ ...c, [mes]: tarifa }));
    setTarifaActual(tarifa);
    setTarifaKm(tarifa ? String(tarifa.tarifa_km) : '');
    setViaticoNoche(tarifa ? String(tarifa.valor_viatico_noche || 0) : '');
  }

  async function saveTarifa() {
    const km = Number(tarifaKm);
    const viatico = Number(viaticoNoche) || 0;
    if (!km) { toast('Ingresá un valor de tarifa por km.', 'warn'); return; }
    try {
      if (tarifaActual) {
        await pb.collection('tarifas').update(tarifaActual.id, { tarifa_km: km, valor_viatico_noche: viatico });
      } else {
        await pb.collection('tarifas').create({ mes: selMes, tarifa_km: km, valor_viatico_noche: viatico });
      }
      toast('Valores del mes guardados.', 'ok');
      await loadTarifa(selMes);
    } catch {
      queueOp({
        type: tarifaActual ? 'update' : 'create',
        collection: 'tarifas',
        id: tarifaActual ? tarifaActual.id : undefined,
        data: { mes: selMes, tarifa_km: km, valor_viatico_noche: viatico },
      });
      toast('Sin conexión: valores encolados para sincronizar.', 'warn');
    }
  }

  async function loadTramos() {
    if (!choferId || !desde || !hasta) { toast('Elegí chofer y el rango de fechas.', 'warn'); return; }
    let items: Tramo[] = [];
    try {
      const filter = `chofer='${choferId.replace(/'/g, "\\'")}' && dia_salida >= '${desde}' && dia_salida <= '${hasta}'`;
      items = await pb.collection('tramos').getFullList<Tramo>({ filter, sort: 'dia_salida,hora_salida' });
    } catch (e) {
      toast('No se pudieron cargar los tramos: ' + (e instanceof Error ? e.message : ''), 'warn');
    }
    setTramos(items);
    await ensureTarifasFor([...new Set(items.map((t) => t.mes).filter(Boolean))]);
  }

  function toggleExpand(id: string) {
    setExpanded((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleSubmitTramo(data: Partial<Tramo> & { mes: string }) {
    const chofer = choferId;
    const full = { ...data, chofer };
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
    } catch {
      if (editingTramo) {
        queueOp({ type: 'update', collection: 'tramos', id: editingTramo.id, data: full });
        setTramos((cur) => cur.map((t) => (t.id === editingTramo.id ? { ...t, ...full } as Tramo : t)));
      } else {
        const tempId = uid();
        queueOp({ type: 'create', collection: 'tramos', data: full });
        setTramos((cur) => [...cur, { id: tempId, ...full } as Tramo]);
      }
      toast('Sin conexión: tramo guardado localmente y encolado.', 'warn');
      setModalOpen(false);
      await ensureTarifasFor([data.mes]);
    }
  }

  async function deleteTramo(id: string) {
    if (!(await confirm('¿Borrar este tramo? Esta acción no se puede deshacer.', 'Borrar tramo'))) return;
    if (!id.startsWith('tmp_')) {
      try {
        await pb.collection('tramos').delete(id);
      } catch {
        queueOp({ type: 'delete', collection: 'tramos', id });
      }
    }
    setTramos((cur) => cur.filter((t) => t.id !== id));
  }

  function exportCSV() {
    if (tramos.length === 0) { toast('No hay tramos para exportar.', 'warn'); return; }
    const choferNombre = choferes.find((c) => c.id === choferId)?.nombre || 'chofer';
    const cols: [keyof Tramo, string][] = [
      ['tractor', 'Tractor'], ['dia_salida', 'Dia salida'], ['hora_salida', 'Hora salida'],
      ['dia_llegada', 'Dia llegada'], ['hora_llegada', 'Hora llegada'], ['origen', 'Origen'], ['destino', 'Destino'],
      ['cliente', 'Cliente'], ['es_posicionamiento', 'Posicionamiento'], ['peajes', 'Peajes'],
      ['gastos_varios', 'Gastos varios'], ['km_alargue', 'Km alargue'], ['comida_viaje', 'Comida viaje'],
      ['comida_internacional', 'Comida internacional'], ['entrega_retiro_sfco', 'Retiro/Entrega SFCO'],
      ['interrupcion', 'Interrupcion'], ['cyd_manual', 'CyD manual'], ['control_gral', 'Control gral'],
      ['descanso', 'Descanso'], ['vale_nro', 'Vale N'], ['vale_importe', 'Vale importe'],
      ['total_gastos', 'Total gastos'], ['km_recorridos', 'Km recorridos'], ['km_dobles', 'Km dobles'],
      ['control', 'Control'], ['permanencia', 'Permanencia'], ['cruce_frontera', 'Cruce frontera'],
    ];
    const escapeCsv = (v: unknown) => {
      const s = String(v ?? '');
      return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lines = [cols.map((c) => c[1]).join(',')];
    tramos.forEach((t) => {
      lines.push(cols.map(([f]) => escapeCsv(typeof t[f] === 'boolean' ? (t[f] ? 'Si' : 'No') : t[f])).join(','));
    });
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rendicion_${choferNombre.replace(/[^a-z0-9]+/gi, '_')}_${desde}_a_${hasta}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const summary = useMemo(() => {
    const totalVales = tramos.reduce((s, t) => s + (Number(t.vale_importe) || 0), 0);
    const totalKmAlargue = tramos.reduce((s, t) => s + (Number(t.km_alargue) || 0), 0);
    const totalGastos = tramos.reduce((s, t) => s + (Number(t.total_gastos) || 0), 0);
    const totalPermanencia = tramos.reduce((s, t) => s + (Number(t.permanencia) || 0), 0);
    const saldo = totalVales - totalGastos;

    const mesesSinTarifa = new Set<string>();
    let montoAlargue = 0;
    let viaticos = 0;
    tramos.forEach((t) => {
      const tar = tarifasCache[t.mes];
      if (!tar) { if (t.km_alargue || t.permanencia) mesesSinTarifa.add(t.mes); return; }
      montoAlargue += (Number(t.km_alargue) || 0) * (Number(tar.tarifa_km) || 0);
      viaticos += (Number(t.permanencia) || 0) * (Number(tar.valor_viatico_noche) || 0);
    });
    const faltaTarifaTxt = mesesSinTarifa.size ? ` (falta tarifa: ${[...mesesSinTarifa].sort().map(monthLabel).join(', ')})` : '';

    return { totalVales, totalKmAlargue, totalGastos, totalPermanencia, saldo, montoAlargue, viaticos, faltaTarifaTxt };
  }, [tramos, tarifasCache]);

  const sum = (f: keyof Tramo) => tramos.reduce((s, t) => s + (Number(t[f]) || 0), 0);

  const years = useMemo(() => {
    const y = now.current.getFullYear();
    const list = [];
    for (let i = y + 1; i >= y - 4; i--) list.push(i);
    return list;
  }, []);

  const choferNombre = choferes.find((c) => c.id === choferId)?.nombre || '';

  return (
    <main>
      <div id="print-header" style={{ display: 'none' }}>
        <h1>CyV — Rendición de chofer</h1>
        <div className="sub">
          Chofer: {choferNombre || '—'} · Del {desde || '—'} al {hasta || '—'} · Impreso: {new Date().toLocaleString('es-AR')}
        </div>
      </div>

      <div className="card">
        <h2>Filtrar tramos</h2>
        <div className="row">
          <div className="field" style={{ minWidth: 220 }}>
            <label>Chofer</label>
            <select value={choferId} onChange={(e) => setChoferId(e.target.value)}>
              {choferes.length === 0 && <option value="">(sin choferes)</option>}
              {choferes.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}{c.localidad ? ' — ' + c.localidad : ''}</option>
              ))}
            </select>
          </div>
          <div className="field"><label>Desde</label><input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></div>
          <div className="field"><label>Hasta</label><input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></div>
          <button onClick={loadTramos}>Buscar</button>
          <button className="secondary" onClick={() => { setEditingTramo(null); setModalOpen(true); }}>+ Nuevo tramo</button>
          <button className="secondary" onClick={exportCSV}>Exportar CSV</button>
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
            <input type="number" step="0.0001" value={tarifaKm} onChange={(e) => setTarifaKm(e.target.value)} placeholder="ej: 169.6053" />
          </div>
          <div className="field">
            <label>Viático por noche ($) — regla a confirmar</label>
            <input type="number" step="0.01" value={viaticoNoche} onChange={(e) => setViaticoNoche(e.target.value)} placeholder="ej: 5000" />
          </div>
          <button className="secondary" onClick={saveTarifa}>Guardar valores del mes</button>
        </div>
        <div className="hint">Se usa para calcular el monto de alargue y los viáticos de los tramos de ese mes, sin importar qué rango de fechas estés mirando abajo.</div>
      </div>

      <div className="card">
        <h2>Resumen</h2>
        <div className="summary-grid">
          <div className="stat"><div className="lbl">Total vales</div><div className="val">{money(summary.totalVales)}</div></div>
          <div className="stat"><div className="lbl">Km alargue</div><div className="val">{summary.totalKmAlargue.toLocaleString('es-AR')}</div></div>
          <div className="stat"><div className="lbl">Monto alargue</div><div className="val">{money(summary.montoAlargue)}{summary.faltaTarifaTxt}</div></div>
          <div className="stat"><div className="lbl">Total gastos</div><div className="val">{money(summary.totalGastos)}</div></div>
          <div className="stat"><div className="lbl">Viáticos (noches × valor)</div><div className="val">{money(summary.viaticos)}{summary.faltaTarifaTxt}</div></div>
          <div className={`stat ${summary.saldo >= 0 ? 'saldo-pos' : 'saldo-neg'}`}><div className="lbl">Saldo (vales − gastos)</div><div className="val">{money(summary.saldo)}</div></div>
        </div>
      </div>

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
                const open = expanded.has(t.id);
                return (
                  <Fragment key={t.id}>
                    <tr>
                      <td><button className={`expand-btn${open ? ' open' : ''}`} onClick={() => toggleExpand(t.id)}>{open ? '▾' : '▸'}</button></td>
                      <td>{pending ? <span className="badge pending">pend.</span> : ''}</td>
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
                        <button className="small secondary" onClick={() => { setEditingTramo(t); setModalOpen(true); }}>Editar</button>
                        <button className="small danger" onClick={() => deleteTramo(t.id)}>Borrar</button>
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
          {tramos.length === 0 && <div className="empty">No hay tramos para este chofer / rango de fechas.</div>}
        </div>
      </div>

      {modalOpen && (
        <TramoModal
          tramo={editingTramo}
          vehiculos={vehiculos}
          clientes={clientes}
          rutas={rutas}
          onClose={() => setModalOpen(false)}
          onSubmit={handleSubmitTramo}
        />
      )}
    </main>
  );
}
