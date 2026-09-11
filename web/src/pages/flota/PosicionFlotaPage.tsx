import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
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

const ACTUALIZACION_MS = 60000; // 1 minuto

const num = (n: number, d = 0) => n.toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d });

function formatoFecha(unixSeconds: number | null): string {
  if (!unixSeconds) return '—';
  return new Date(unixSeconds * 1000).toLocaleString('es-AR');
}

// Mapa en vivo con Leaflet + OpenStreetMap (sin API key). El mapa se crea
// una sola vez; en cada actualización se mueven/crean/borran los
// marcadores en vez de recrear todo, para que no "parpadee" cada minuto.
function FlotaMapa({ vehiculos }: { vehiculos: VehiculoPressa[] }) {
  const contenedorRef = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<L.Map | null>(null);
  const marcadoresRef = useRef<Map<string, L.CircleMarker>>(new Map());
  const primerFitRef = useRef(false);

  useEffect(() => {
    if (!contenedorRef.current || mapaRef.current) return;
    const mapa = L.map(contenedorRef.current).setView([-34, -64], 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(mapa);
    mapaRef.current = mapa;
    return () => { mapa.remove(); mapaRef.current = null; };
  }, []);

  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa) return;
    const vivos = new Set<string>();
    vehiculos.forEach((v) => {
      if (v.lat === null || v.lng === null) return;
      vivos.add(v.id);
      const color = v.estadoColor ? '#' + v.estadoColor : '#185FA5';
      const popup = `<strong>${v.alias}</strong> (${v.patente})<br>${v.estado || '—'}<br>${num(v.velocidad)} km/h · ${v.direccion || ''}<br><span style="color:#888">${formatoFecha(v.actualizado)}</span>`;
      let marcador = marcadoresRef.current.get(v.id);
      if (marcador) {
        marcador.setLatLng([v.lat, v.lng]);
        marcador.setStyle({ color, fillColor: color });
        marcador.setPopupContent(popup);
      } else {
        marcador = L.circleMarker([v.lat, v.lng], { radius: 8, color, fillColor: color, fillOpacity: 0.85, weight: 2 }).addTo(mapa);
        marcador.bindPopup(popup);
        marcador.bindTooltip(v.alias);
        marcadoresRef.current.set(v.id, marcador);
      }
    });
    // Sacar del mapa unidades que ya no vinieron en esta respuesta.
    for (const [id, marcador] of marcadoresRef.current) {
      if (!vivos.has(id)) { marcador.remove(); marcadoresRef.current.delete(id); }
    }
    // Solo la primera vez centramos/encuadramos en todas las unidades —
    // después el usuario puede haber movido el mapa a mano, no se lo pisamos.
    if (!primerFitRef.current && marcadoresRef.current.size > 0) {
      const bounds = L.latLngBounds([...marcadoresRef.current.values()].map((m) => m.getLatLng()));
      mapa.fitBounds(bounds, { padding: [30, 30] });
      primerFitRef.current = true;
    }
  }, [vehiculos]);

  return <div ref={contenedorRef} className="flota-map" />;
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

  useEffect(() => {
    buscar();
    const id = setInterval(buscar, ACTUALIZACION_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ordenados = [...vehiculos].sort((a, b) => a.alias.localeCompare(b.alias));

  return (
    <main>
      <div className="card">
        <h2>Posición de Flota</h2>
        <div className="hint">Última posición y estado de cada unidad, según el satelital Pressa — se actualiza solo cada 1 minuto.</div>
        <div className="row" style={{ marginTop: 10 }}>
          <button onClick={buscar} disabled={loading}>{loading ? 'Actualizando…' : 'Actualizar ahora'}</button>
        </div>
      </div>

      {cargado && (
        <>
          <div className="card">
            <FlotaMapa vehiculos={vehiculos} />
          </div>

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
        </>
      )}
    </main>
  );
}
