import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import { pb } from '../../../lib/pb';
import { useToast } from '../../../lib/ToastContext';
import { type VehiculoPressa, type PuntoRuta, num, formatoFecha } from './types';

type TipoIconoVehiculo = 'camion' | 'acoplado' | null;

function tipoIconoDeAlias(alias: string): TipoIconoVehiculo {
  const primera = alias.trim().charAt(0).toUpperCase();
  if (primera === 'T') return 'camion';
  if (primera === 'S') return 'acoplado';
  return null;
}

function iconoCamion(color: string): L.DivIcon {
  return L.divIcon({
    className: 'flota-icon',
    html: `<svg viewBox="0 0 64 64" width="44" height="44"><rect x="4" y="18" width="20" height="22" rx="2" fill="${color}" stroke="#ffffff" stroke-width="3"/><path d="M24 24h8l6 8v8h-14z" fill="${color}" stroke="#ffffff" stroke-width="3" stroke-linejoin="round"/><circle cx="12" cy="42" r="5" fill="#111822" stroke="#ffffff" stroke-width="2.5"/><circle cx="32" cy="42" r="5" fill="#111822" stroke="#ffffff" stroke-width="2.5"/></svg>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });
}

function iconoAcoplado(color: string): L.DivIcon {
  const franja = `color-mix(in srgb, ${color} 65%, black)`;
  return L.divIcon({
    className: 'flota-icon',
    html: `<svg viewBox="0 0 64 64" width="44" height="44"><rect x="8" y="20" width="44" height="18" rx="2" fill="${color}" stroke="#ffffff" stroke-width="3"/><rect x="8" y="20" width="44" height="5" fill="${franja}"/><circle cx="18" cy="42" r="5" fill="#111822" stroke="#ffffff" stroke-width="2.5"/><circle cx="44" cy="42" r="5" fill="#111822" stroke="#ffffff" stroke-width="2.5"/></svg>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });
}

function iconoCirculo(color: string): L.DivIcon {
  return L.divIcon({
    className: 'flota-icon',
    html: `<svg viewBox="0 0 20 20" width="20" height="20"><circle cx="10" cy="10" r="8" fill="${color}" fill-opacity="0.85" stroke="${color}" stroke-width="2"/></svg>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
}

function iconoParaVehiculo(v: VehiculoPressa): L.DivIcon {
  const tipo = tipoIconoDeAlias(v.alias);
  if (tipo === 'camion') return iconoCamion(v.velocidad > 0 ? 'var(--ok)' : 'var(--err)');
  if (tipo === 'acoplado') return iconoAcoplado(v.temperaturas.length > 0 ? 'var(--frio)' : 'var(--err)');
  return iconoCirculo(v.estadoColor ? '#' + v.estadoColor : '#185FA5');
}

// Mapa en vivo con Leaflet + OpenStreetMap (sin API key). El mapa se crea
// una sola vez; en cada actualización se mueven/crean/borran los
// marcadores en vez de recrear todo, para que no "parpadee" cada minuto.
// Al tocar una unidad se dibuja su recorrido de hoy (Historic WS de
// Pressa) como línea.
function FlotaMapa({ vehiculos }: { vehiculos: VehiculoPressa[] }) {
  const toast = useToast();
  const contenedorRef = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<L.Map | null>(null);
  const marcadoresRef = useRef<Map<string, L.Marker>>(new Map());
  const grupoRef = useRef<L.MarkerClusterGroup | null>(null);
  const primerFitRef = useRef(false);
  const polylineRef = useRef<L.Polyline | null>(null);
  const [ruta, setRuta] = useState<{ alias: string; distanciaKm: number } | null>(null);
  const [cargandoRuta, setCargandoRuta] = useState(false);

  useEffect(() => {
    if (!contenedorRef.current || mapaRef.current) return;
    const mapa = L.map(contenedorRef.current).setView([-34, -64], 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(mapa);
    const grupo = L.markerClusterGroup();
    grupo.addTo(mapa);
    grupoRef.current = grupo;
    mapaRef.current = mapa;
    return () => { mapa.remove(); mapaRef.current = null; grupoRef.current = null; };
  }, []);

  function cerrarRecorrido() {
    if (polylineRef.current) { polylineRef.current.remove(); polylineRef.current = null; }
    setRuta(null);
  }

  async function mostrarRecorrido(v: VehiculoPressa) {
    const mapa = mapaRef.current;
    if (!mapa) return;
    setCargandoRuta(true);
    try {
      const ahora = new Date();
      const medianoche = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
      const desde = Math.floor(medianoche.getTime() / 1000);
      const hasta = Math.floor(ahora.getTime() / 1000);
      const res = await pb.send<{ puntos: PuntoRuta[]; resumen: { distanciaKm: number } }>(
        `/api/flota/pressa/historico/${v.id}/${desde}/${hasta}`,
        { method: 'GET' },
      );
      if (polylineRef.current) { polylineRef.current.remove(); polylineRef.current = null; }
      const latlngs: [number, number][] = res.puntos.map((p) => [p.lat, p.lng]);
      if (latlngs.length < 2) {
        toast(`${v.alias} no tiene recorrido registrado hoy.`, 'warn');
        setRuta(null);
        return;
      }
      const linea = L.polyline(latlngs, { color: '#185FA5', weight: 4, opacity: 0.8 }).addTo(mapa);
      polylineRef.current = linea;
      mapa.fitBounds(linea.getBounds(), { padding: [30, 30] });
      setRuta({ alias: v.alias, distanciaKm: res.resumen?.distanciaKm || 0 });
    } catch (e) {
      toast('No se pudo traer el recorrido: ' + (e instanceof Error ? e.message : ''), 'err');
    } finally {
      setCargandoRuta(false);
    }
  }

  useEffect(() => {
    const mapa = mapaRef.current;
    const grupo = grupoRef.current;
    if (!mapa || !grupo) return;
    const vivos = new Set<string>();
    vehiculos.forEach((v) => {
      if (v.lat === null || v.lng === null) return;
      vivos.add(v.id);
      const popup = `<strong>${v.alias}</strong> (${v.patente})<br>${v.estado || '—'}<br>${num(v.velocidad)} km/h · ${v.direccion || ''}<br><span style="color:#888">${formatoFecha(v.actualizado)}</span>`;
      let marcador = marcadoresRef.current.get(v.id);
      if (marcador) {
        marcador.setLatLng([v.lat, v.lng]);
        marcador.setIcon(iconoParaVehiculo(v));
        marcador.setPopupContent(popup);
      } else {
        marcador = L.marker([v.lat, v.lng], { icon: iconoParaVehiculo(v) }).addTo(grupo);
        marcador.bindPopup(popup);
        marcador.bindTooltip(v.alias);
        marcador.on('click', () => mostrarRecorrido(v));
        marcadoresRef.current.set(v.id, marcador);
      }
    });
    // Sacar del grupo (no del mapa directo) las unidades que ya no vinieron
    // en esta respuesta -- un marcador agrupado hay que sacarlo con el
    // método del grupo, si no la librería lo sigue contando en la burbuja
    // aunque el marcador haya desaparecido.
    for (const [id, marcador] of marcadoresRef.current) {
      if (!vivos.has(id)) { grupo.removeLayer(marcador); marcadoresRef.current.delete(id); }
    }
    // Solo la primera vez centramos/encuadramos en todas las unidades —
    // después el usuario puede haber movido el mapa a mano, no se lo pisamos.
    if (!primerFitRef.current && marcadoresRef.current.size > 0) {
      const bounds = L.latLngBounds([...marcadoresRef.current.values()].map((m) => m.getLatLng()));
      mapa.fitBounds(bounds, { padding: [30, 30] });
      primerFitRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehiculos]);

  return (
    <div>
      {(ruta || cargandoRuta) && (
        <div className="period-bar" style={{ marginBottom: 10 }}>
          <div className="info">
            {cargandoRuta ? 'Cargando recorrido…' : ruta && <>Recorrido de hoy — <strong>{ruta.alias}</strong>: {num(ruta.distanciaKm)} km.</>}
          </div>
          {ruta && <button className="reset" onClick={cerrarRecorrido}>Cerrar recorrido</button>}
        </div>
      )}
      <div ref={contenedorRef} className="flota-map" />
      <div className="hint" style={{ marginTop: 8 }}>Tocá una unidad para ver el recorrido que hizo hoy.</div>
    </div>
  );
}

export function MapaTab({ vehiculos }: { vehiculos: VehiculoPressa[] }) {
  const ordenados = [...vehiculos].sort((a, b) => a.alias.localeCompare(b.alias));

  return (
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
  );
}
