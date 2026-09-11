import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { pb } from '../../../lib/pb';
import { useToast } from '../../../lib/ToastContext';
import { isoDate } from '../../../lib/format';
import { type VehiculoPressa, type PuntoRuta, num } from './types';

// Mismo Historic WS que ya usa el mapa para "hoy" (pb_hooks/pressa.pb.js
// ya acepta cualquier rango), acá con selector de unidad y fechas libres
// para poder auditar un viaje puntual, no solo el día en curso.
export function RecorridoTab({ vehiculos }: { vehiculos: VehiculoPressa[] }) {
  const toast = useToast();
  const contenedorRef = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<L.Map | null>(null);
  const capaRef = useRef<L.LayerGroup | null>(null);
  const now = useRef(new Date());

  const [vid, setVid] = useState('');
  const [desde, setDesde] = useState(isoDate(now.current));
  const [hasta, setHasta] = useState(isoDate(now.current));
  const [loading, setLoading] = useState(false);
  const [resumen, setResumen] = useState<{ distanciaKm: number; velocidadMax: number; velocidadPromedio: number; puntos: number } | null>(null);

  const ordenados = [...vehiculos].sort((a, b) => a.alias.localeCompare(b.alias));

  useEffect(() => {
    // Preferimos arrancar en una unidad que esté en movimiento ahora —
    // si el default es alfabético a secas, suele caer en un
    // semirremolque parado y el primer intento sale "sin recorrido".
    if (!vid && ordenados.length > 0) {
      const enMovimiento = ordenados.find((v) => v.velocidad > 0);
      setVid((enMovimiento || ordenados[0]).id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehiculos]);

  useEffect(() => {
    if (!contenedorRef.current || mapaRef.current) return;
    const mapa = L.map(contenedorRef.current).setView([-34, -64], 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(mapa);
    mapaRef.current = mapa;
    capaRef.current = L.layerGroup().addTo(mapa);
    return () => { mapa.remove(); mapaRef.current = null; };
  }, []);

  async function buscar() {
    const mapa = mapaRef.current;
    const capa = capaRef.current;
    if (!mapa || !capa || !vid || !desde || !hasta) { toast('Elegí unidad y fechas.', 'warn'); return; }
    setLoading(true);
    try {
      const desdeUnix = Math.floor(new Date(desde + 'T00:00:00').getTime() / 1000);
      const hastaUnix = Math.floor(new Date(hasta + 'T23:59:59').getTime() / 1000);
      const res = await pb.send<{ puntos: PuntoRuta[]; resumen: { distanciaKm: number; velocidadMax: number; velocidadPromedio: number } }>(
        `/api/flota/pressa/historico/${vid}/${desdeUnix}/${hastaUnix}`,
        { method: 'GET' },
      );
      capa.clearLayers();
      const latlngs: [number, number][] = res.puntos.map((p) => [p.lat, p.lng]);
      if (latlngs.length < 2) {
        toast('No hay recorrido registrado para esa unidad en ese rango.', 'warn');
        setResumen(null);
        return;
      }
      L.polyline(latlngs, { color: '#185FA5', weight: 4, opacity: 0.8 }).addTo(capa);
      L.circleMarker(latlngs[0], { radius: 7, color: '#3f8f5f', fillColor: '#3f8f5f', fillOpacity: 0.9 }).bindTooltip('Inicio').addTo(capa);
      L.circleMarker(latlngs[latlngs.length - 1], { radius: 7, color: '#b3382c', fillColor: '#b3382c', fillOpacity: 0.9 }).bindTooltip('Fin').addTo(capa);
      mapa.fitBounds(L.latLngBounds(latlngs), { padding: [30, 30] });
      setResumen({ ...res.resumen, puntos: res.puntos.length });
    } catch (e) {
      toast('No se pudo traer el recorrido: ' + (e instanceof Error ? e.message : ''), 'err');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="card">
        <h2>Recorrido histórico</h2>
        <div className="hint">Trayecto real de una unidad en cualquier rango de fechas — para auditar un viaje puntual.</div>
        <div className="row" style={{ marginTop: 10 }}>
          <div className="field">
            <label>Unidad</label>
            <select value={vid} onChange={(e) => setVid(e.target.value)}>
              {ordenados.map((v) => <option key={v.id} value={v.id}>{v.alias} ({v.patente})</option>)}
            </select>
          </div>
          <div className="field"><label>Desde</label><input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></div>
          <div className="field"><label>Hasta</label><input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></div>
          <button onClick={buscar} disabled={loading}>{loading ? 'Buscando…' : 'Buscar'}</button>
        </div>
        <div className="hint" style={{ marginTop: 6 }}>Un rango largo en una unidad muy activa puede tardar varios segundos — Pressa tiene que recorrer todo el historial de esos días.</div>
      </div>

      <div className="card">
        {resumen && (
          <div className="summary-grid summary-grid-compact" style={{ marginBottom: 14 }}>
            <div className="stat"><div className="lbl">Distancia</div><div className="val">{num(resumen.distanciaKm)} km</div></div>
            <div className="stat"><div className="lbl">Velocidad máxima</div><div className="val">{num(resumen.velocidadMax)} km/h</div></div>
            <div className="stat"><div className="lbl">Velocidad promedio</div><div className="val">{num(resumen.velocidadPromedio)} km/h</div></div>
            <div className="stat"><div className="lbl">Puntos GPS</div><div className="val">{num(resumen.puntos)}</div></div>
          </div>
        )}
        <div ref={contenedorRef} className="flota-map" />
      </div>
    </>
  );
}
