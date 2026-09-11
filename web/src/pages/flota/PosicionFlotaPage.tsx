import { useEffect, useState } from 'react';
import { pb } from '../../lib/pb';
import { useToast } from '../../lib/ToastContext';

// Lo que devuelve pb_hooks/pressa.pb.js, ya aplanado desde la respuesta
// cruda de la API de Pressa (ver ese hook para el mapeo completo).
interface VehiculoPressa {
  id: string;
  alias: string;
  patente: string;
  marca: string;
  modelo: string;
  estado: string;
  estadoColor: string | null;
  velocidad: number;
  km: number;
  lat: number | null;
  lng: number | null;
  direccion: string;
  actualizado: number | null; // unix seconds
}

const num = (n: number, d = 0) => n.toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d });

function formatoFecha(unixSeconds: number | null): string {
  if (!unixSeconds) return '—';
  return new Date(unixSeconds * 1000).toLocaleString('es-AR');
}

export function PosicionFlotaPage() {
  const toast = useToast();
  const [vehiculos, setVehiculos] = useState<VehiculoPressa[]>([]);
  const [loading, setLoading] = useState(false);
  const [cargado, setCargado] = useState(false);

  async function buscar() {
    setLoading(true);
    try {
      const res = await pb.send<{ total: number; vehiculos: VehiculoPressa[] }>('/api/flota/pressa/monitor', { method: 'GET' });
      setVehiculos(res.vehiculos || []);
      setCargado(true);
    } catch (e) {
      toast('No se pudo consultar Pressa: ' + (e instanceof Error ? e.message : ''), 'err');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { buscar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const ordenados = [...vehiculos].sort((a, b) => a.alias.localeCompare(b.alias));

  return (
    <main>
      <div className="card">
        <h2>Posición de Flota</h2>
        <div className="hint">Última posición y estado de cada unidad, según el satelital Pressa.</div>
        <div className="row" style={{ marginTop: 10 }}>
          <button onClick={buscar} disabled={loading}>{loading ? 'Actualizando…' : 'Actualizar'}</button>
        </div>
      </div>

      {cargado && (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Unidad</th><th>Patente</th><th>Marca / Modelo</th><th>Estado</th>
                  <th className="num">Velocidad</th><th className="num">Km</th><th>Ubicación</th><th>Actualizado</th>
                </tr>
              </thead>
              <tbody>
                {ordenados.map((v) => (
                  <tr key={v.id}>
                    <td className="admin-name">{v.alias}</td>
                    <td>{v.patente}</td>
                    <td>{[v.marca, v.modelo].filter(Boolean).join(' ')}</td>
                    <td>
                      <span className="badge" style={v.estadoColor ? { color: '#' + v.estadoColor, borderColor: '#' + v.estadoColor } : undefined}>
                        {v.estado || '—'}
                      </span>
                    </td>
                    <td className="num">{num(v.velocidad)} km/h</td>
                    <td className="num">{num(v.km)}</td>
                    <td>
                      {v.lat !== null && v.lng !== null ? (
                        <a href={`https://www.google.com/maps?q=${v.lat},${v.lng}`} target="_blank" rel="noreferrer">
                          {v.direccion || 'Ver en mapa'}
                        </a>
                      ) : (v.direccion || '—')}
                    </td>
                    <td>{formatoFecha(v.actualizado)}</td>
                  </tr>
                ))}
                {ordenados.length === 0 && <tr><td className="empty" colSpan={8}>Sin unidades reportadas por Pressa.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </main>
  );
}
