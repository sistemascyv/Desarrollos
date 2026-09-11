import { useRef, useState } from 'react';
import { pb } from '../../../lib/pb';
import { useToast } from '../../../lib/ToastContext';
import { isoDate } from '../../../lib/format';
import { num } from './types';

interface UnidadDistancia {
  alias: string;
  patente: string;
  distanciaKm: number;
  velocidadMin: number;
  velocidadMax: number;
}

// Report Fleet Distance WS — km real por GPS/odómetro en un período, en
// vez del km que se carga a mano en Planilla Choferes. Es un reporte
// aparte por ahora: todavía no se cruza automáticamente contra los
// tramos cargados, esa es la prioridad sugerida para el próximo paso.
export function KmRealTab() {
  const toast = useToast();
  const now = useRef(new Date());
  const [desde, setDesde] = useState(isoDate(new Date(now.current.getFullYear(), now.current.getMonth(), 1)));
  const [hasta, setHasta] = useState(isoDate(now.current));
  const [loading, setLoading] = useState(false);
  const [unidades, setUnidades] = useState<UnidadDistancia[] | null>(null);

  async function buscar() {
    if (!desde || !hasta) { toast('Elegí el rango de fechas.', 'warn'); return; }
    setLoading(true);
    try {
      const desdeUnix = Math.floor(new Date(desde + 'T00:00:00').getTime() / 1000);
      const hastaUnix = Math.floor(new Date(hasta + 'T23:59:59').getTime() / 1000);
      const res = await pb.send<{ unidades: UnidadDistancia[] }>(`/api/flota/pressa/distancia/${desdeUnix}/${hastaUnix}`, { method: 'GET' });
      setUnidades((res.unidades || []).sort((a, b) => b.distanciaKm - a.distanciaKm));
    } catch (e) {
      toast('No se pudo traer la distancia real: ' + (e instanceof Error ? e.message : ''), 'err');
    } finally {
      setLoading(false);
    }
  }

  const totalKm = unidades ? unidades.reduce((s, u) => s + u.distanciaKm, 0) : 0;

  return (
    <>
      <div className="card">
        <h2>Km real</h2>
        <div className="hint">Distancia recorrida real (GPS/odómetro de Pressa) por unidad en el período — para comparar contra el km cargado a mano en Planilla Choferes.</div>
        <div className="row" style={{ marginTop: 10 }}>
          <div className="field"><label>Desde</label><input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></div>
          <div className="field"><label>Hasta</label><input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></div>
          <button onClick={buscar} disabled={loading}>{loading ? 'Buscando…' : 'Buscar'}</button>
        </div>
      </div>

      {unidades && (
        <div className="card">
          <div className="summary-grid summary-grid-compact" style={{ marginBottom: 14 }}>
            <div className="stat"><div className="lbl">Unidades</div><div className="val">{unidades.length}</div></div>
            <div className="stat"><div className="lbl">Km totales de flota</div><div className="val">{num(totalKm)}</div></div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Unidad</th><th>Patente</th><th className="num">Km recorridos</th><th className="num">Velocidad máx.</th></tr>
              </thead>
              <tbody>
                {unidades.map((u) => (
                  <tr key={u.alias + u.patente}>
                    <td className="admin-name">{u.alias}</td>
                    <td>{u.patente}</td>
                    <td className="num">{num(u.distanciaKm)}</td>
                    <td className="num">{num(u.velocidadMax)} km/h</td>
                  </tr>
                ))}
                {unidades.length === 0 && <tr><td className="empty" colSpan={4}>Sin datos para ese período.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
