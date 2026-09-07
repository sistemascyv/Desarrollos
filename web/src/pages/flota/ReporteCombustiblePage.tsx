import { useEffect, useMemo, useRef, useState } from 'react';
import { pb } from '../../lib/pb';
import { useToast } from '../../lib/ToastContext';
import type { Chofer, Tramo } from '../../types';
import { isoDate } from '../../lib/format';

interface Fila {
  clave: string;
  nombre: string;
  viajes: number;
  litros: number;
  km: number;
  l100: number; // litros cada 100km
  kmL: number; // km por litro
  desvio: number; // % vs el promedio de la flota
  repostajes: number; // viajes con carga intermedia en ruta
}

// Colorea segun el desvio contra el promedio de la propia flota en vez de
// umbrales fijos de L/100km — no sabemos de antemano cual es "bueno" para
// esta flota puntual, así que el propio promedio es la referencia.
function claseDesvio(desvio: number): { color: string } {
  if (desvio <= -5) return { color: 'var(--ok)' };
  if (desvio >= 5) return { color: 'var(--err)' };
  return { color: 'var(--warn)' };
}

function agrupar(items: Tramo[], keyFn: (t: Tramo) => string, nombreFn: (clave: string) => string): Fila[] {
  const map = new Map<string, { litros: number; km: number; viajes: number; repostajes: number }>();
  for (const t of items) {
    const k = keyFn(t) || '(sin dato)';
    const cur = map.get(k) || { litros: 0, km: 0, viajes: 0, repostajes: 0 };
    cur.litros += Number(t.litros_consumidos) || 0;
    cur.km += Number(t.km_recorridos) || 0;
    cur.viajes += 1;
    if ((Number(t.litros_intermedios) || 0) > 0) cur.repostajes += 1;
    map.set(k, cur);
  }
  return [...map.entries()].map(([clave, v]) => ({
    clave,
    nombre: nombreFn(clave),
    viajes: v.viajes,
    litros: v.litros,
    km: v.km,
    l100: v.km > 0 ? (v.litros / v.km) * 100 : 0,
    kmL: v.litros > 0 ? v.km / v.litros : 0,
    repostajes: v.repostajes,
    desvio: 0,
  }));
}

const num = (n: number, d = 0) => n.toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d });

export function ReporteCombustiblePage() {
  const toast = useToast();
  const now = useRef(new Date());
  const [desde, setDesde] = useState(isoDate(new Date(now.current.getFullYear(), now.current.getMonth(), 1)));
  const [hasta, setHasta] = useState(isoDate(now.current));
  const [tramos, setTramos] = useState<Tramo[]>([]);
  const [choferes, setChoferes] = useState<Chofer[]>([]);
  const [loading, setLoading] = useState(false);

  const [precioGasoil, setPrecioGasoil] = useState('1300');
  const [tipoCambio, setTipoCambio] = useState('1300');

  useEffect(() => {
    (async () => {
      try {
        setChoferes(await pb.collection('choferes').getFullList<Chofer>({ sort: 'nombre' }));
      } catch { /* offline, ignore */ }
    })();
    buscar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function buscar() {
    if (!desde || !hasta) { toast('Elegí el rango de fechas.', 'warn'); return; }
    setLoading(true);
    try {
      const filter = `dia_salida >= '${desde}' && dia_salida <= '${hasta}'`;
      const items = await pb.collection('tramos').getFullList<Tramo>({ filter, sort: 'dia_salida' });
      setTramos(items);
    } catch (e) {
      toast('No se pudieron cargar los tramos: ' + (e instanceof Error ? e.message : ''), 'err');
    } finally {
      setLoading(false);
    }
  }

  const nombreChofer = (id: string) => choferes.find((c) => c.id === id)?.nombre || id;

  const { validos, totalLitros, totalKm, l100Flota, kmLFlota, camiones, choferesFila, topRepoCam, topRepoCho } = useMemo(() => {
    const validos = tramos.filter((t) => (Number(t.km_recorridos) || 0) > 0 && (Number(t.litros_consumidos) || 0) > 0);
    const totalLitros = validos.reduce((s, t) => s + (Number(t.litros_consumidos) || 0), 0);
    const totalKm = validos.reduce((s, t) => s + (Number(t.km_recorridos) || 0), 0);
    const l100Flota = totalKm > 0 ? (totalLitros / totalKm) * 100 : 0;
    const kmLFlota = totalLitros > 0 ? totalKm / totalLitros : 0;

    const camiones = agrupar(validos, (t) => t.tractor || '', (k) => k || '(sin tractor)')
      .map((f) => ({ ...f, desvio: l100Flota > 0 ? ((f.l100 - l100Flota) / l100Flota) * 100 : 0 }))
      .sort((a, b) => a.l100 - b.l100);

    const choferesFila = agrupar(validos, (t) => t.chofer || '', nombreChofer)
      .map((f) => ({ ...f, desvio: l100Flota > 0 ? ((f.l100 - l100Flota) / l100Flota) * 100 : 0 }))
      .sort((a, b) => a.l100 - b.l100);

    const topRepoCam = [...camiones].filter((c) => c.repostajes > 0).sort((a, b) => b.repostajes - a.repostajes).slice(0, 10);
    const topRepoCho = [...choferesFila].filter((c) => c.repostajes > 0).sort((a, b) => b.repostajes - a.repostajes).slice(0, 10);

    return { validos, totalLitros, totalKm, l100Flota, kmLFlota, camiones, choferesFila, topRepoCam, topRepoCho };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tramos, choferes]);

  const totalRepostajes = validos.filter((t) => (Number(t.litros_intermedios) || 0) > 0).length;
  const totalFrio = validos.reduce((s, t) => s + (Number(t.litros_equipo_frio) || 0), 0);

  const precio = Number(precioGasoil) || 0;
  const tc = Number(tipoCambio) || 0;
  const arsKmFlota = (l100Flota * precio) / 100;
  const usdKmFlota = tc > 0 ? arsKmFlota / tc : 0;
  const peorL100 = camiones.length ? Math.max(...camiones.map((c) => c.l100)) : 0;

  function tablaRanking(filas: Fila[], columna: string) {
    return (
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th><th>{columna}</th><th className="num">Viajes</th><th className="num">Litros</th>
              <th className="num">Km</th><th className="num">L/100km</th><th className="num">km/L</th>
              <th className="num">Desvío</th><th className="num">Repost.</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f, i) => (
              <tr key={f.clave}>
                <td>{i + 1}</td>
                <td className="admin-name">{f.nombre}</td>
                <td className="num">{f.viajes}</td>
                <td className="num">{num(f.litros)}</td>
                <td className="num">{num(f.km)}</td>
                <td className="num"><span className="badge" style={claseDesvio(f.desvio)}>{num(f.l100, 2)}</span></td>
                <td className="num">{num(f.kmL, 3)}</td>
                <td className="num" style={claseDesvio(f.desvio)}>{f.desvio >= 0 ? '+' : ''}{num(f.desvio, 1)}%</td>
                <td className="num">{f.repostajes}</td>
              </tr>
            ))}
            {filas.length === 0 && <tr><td className="empty" colSpan={9}>Sin tramos con combustible cargado en este rango.</td></tr>}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <main>
      <div className="card">
        <h2>Consumo de Combustible</h2>
        <div className="row">
          <div className="field"><label>Desde</label><input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></div>
          <div className="field"><label>Hasta</label><input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></div>
          <button onClick={buscar} disabled={loading}>{loading ? 'Buscando…' : 'Buscar'}</button>
        </div>
        <div className="hint">
          {validos.length} de {tramos.length} tramos del período tienen litros y km cargados — solo esos entran en los cálculos de abajo.
          El resto (cargados antes de este reporte, o sin ese dato) queda afuera para no distorsionar los promedios.
        </div>
      </div>

      <div className="card">
        <h2>Resumen de flota</h2>
        <div className="summary-grid">
          <div className="stat"><div className="lbl">Litros totales</div><div className="val">{num(totalLitros)}</div></div>
          <div className="stat"><div className="lbl">Km recorridos</div><div className="val">{num(totalKm)}</div></div>
          <div className="stat"><div className="lbl">L/100km flota</div><div className="val">{num(l100Flota, 2)}</div></div>
          <div className="stat"><div className="lbl">km/L flota</div><div className="val">{num(kmLFlota, 3)}</div></div>
          <div className="stat"><div className="lbl">Repostajes en ruta</div><div className="val">{totalRepostajes}</div></div>
          <div className="stat"><div className="lbl">Litros equipo frío</div><div className="val">{num(totalFrio)}</div></div>
        </div>
      </div>

      <div className="card">
        <h2>Ranking por camión</h2>
        <div className="hint" style={{ marginBottom: 10 }}>Ordenado de mejor a peor L/100km. El color es el desvío contra el promedio de la flota en este período.</div>
        {tablaRanking(camiones, 'Camión')}
      </div>

      <div className="card">
        <h2>Ranking por chofer</h2>
        {tablaRanking(choferesFila, 'Chofer')}
      </div>

      <div className="card">
        <h2>Costo por km</h2>
        <div className="row">
          <div className="field"><label>Precio gasoil (ARS/L)</label><input type="number" step="1" value={precioGasoil} onChange={(e) => setPrecioGasoil(e.target.value)} /></div>
          <div className="field"><label>Tipo de cambio (ARS/USD)</label><input type="number" step="1" value={tipoCambio} onChange={(e) => setTipoCambio(e.target.value)} /></div>
        </div>
        <div className="hint" style={{ marginBottom: 10 }}>Valores de referencia, editables — se recalcula todo al cambiarlos.</div>
        <div className="summary-grid summary-grid-compact">
          <div className="stat"><div className="lbl">ARS por km (flota)</div><div className="val">${num(arsKmFlota, 2)}</div></div>
          <div className="stat"><div className="lbl">USD por km (flota)</div><div className="val">u$s {num(usdKmFlota, 4)}</div></div>
        </div>
        <div className="table-wrap" style={{ marginTop: 14 }}>
          <table>
            <thead>
              <tr><th>#</th><th>Camión</th><th className="num">L/100km</th><th className="num">ARS/km</th><th className="num">USD/km</th><th className="num">Ahorro vs. peor (ARS/km)</th></tr>
            </thead>
            <tbody>
              {camiones.map((c, i) => {
                const ars = (c.l100 * precio) / 100;
                const usd = tc > 0 ? ars / tc : 0;
                const ahorro = ((peorL100 - c.l100) * precio) / 100;
                return (
                  <tr key={c.clave}>
                    <td>{i + 1}</td>
                    <td className="admin-name">{c.nombre}</td>
                    <td className="num">{num(c.l100, 2)}</td>
                    <td className="num">${num(ars, 2)}</td>
                    <td className="num">u$s {num(usd, 4)}</td>
                    <td className="num">${num(ahorro, 2)}</td>
                  </tr>
                );
              })}
              {camiones.length === 0 && <tr><td className="empty" colSpan={6}>Sin datos.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h2>Repostajes en ruta</h2>
        <div className="hint" style={{ marginBottom: 10 }}>Top 10 con más cargas intermedias — frecuencia alta puede indicar rutas largas o un tanque con problemas.</div>
        <div className="grid2">
          <div>
            <h3 style={{ fontSize: 13, marginBottom: 8 }}>Por camión</h3>
            {tablaRanking(topRepoCam, 'Camión')}
          </div>
          <div>
            <h3 style={{ fontSize: 13, marginBottom: 8 }}>Por chofer</h3>
            {tablaRanking(topRepoCho, 'Chofer')}
          </div>
        </div>
      </div>
    </main>
  );
}
