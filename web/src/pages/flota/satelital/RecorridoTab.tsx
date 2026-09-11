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

  const RANGO_MAXIMO_DIAS = 30;
  const TAMANO_TRAMO_DIAS = 3; // el hook acepta hasta 5 por llamada; 3 deja margen

  async function buscar() {
    const mapa = mapaRef.current;
    const capa = capaRef.current;
    if (!mapa || !capa || !vid || !desde || !hasta) { toast('Elegí unidad y fechas.', 'warn'); return; }
    setLoading(true);
    try {
      const desdeUnix = Math.floor(new Date(desde + 'T00:00:00').getTime() / 1000);
      const hastaUnix = Math.floor(new Date(hasta + 'T23:59:59').getTime() / 1000);
      const diasPedidos = Math.ceil((hastaUnix - desdeUnix) / 86400);
      if (diasPedidos > RANGO_MAXIMO_DIAS) {
        toast(`El rango es de ${diasPedidos} días — probá con ${RANGO_MAXIMO_DIAS} días o menos.`, 'warn');
        return;
      }

      // El rango elegido se parte en tramos de 3 días y se piden TODOS
      // a la vez (no uno atrás de otro) — cada tramo hace su propio
      // login contra Pressa, pero como corren en paralelo el tiempo
      // total lo marca el tramo más lento, no la suma de todos. Antes,
      // pedidos secuenciales, un rango de 20 días tardaba 2 minutos y
      // medio; en paralelo debería bajar a lo que tarde un solo tramo.
      const tramoSegundos = TAMANO_TRAMO_DIAS * 86400;
      const ventanas: [number, number][] = [];
      for (let inicio = desdeUnix; inicio < hastaUnix; inicio += tramoSegundos) {
        ventanas.push([inicio, Math.min(inicio + tramoSegundos - 1, hastaUnix)]);
      }

      const resultados = await Promise.allSettled(
        ventanas.map(([ini, fin]) =>
          pb.send<{ puntos: PuntoRuta[]; resumen: { distanciaKm: number; velocidadMax: number; velocidadPromedio: number } }>(
            `/api/flota/pressa/historico/${vid}/${ini}/${fin}`,
            { method: 'GET' },
          ),
        ),
      );

      let puntos: PuntoRuta[] = [];
      let distanciaKm = 0;
      let velocidadMax = 0;
      let sumaVelocidadProm = 0;
      let tramosOk = 0;
      let tramosConDatos = 0; // para el promedio: sin contar tramos sin actividad (si no, el 0 de un tramo parado tira el promedio para abajo)
      let tramosFallidos = 0;
      for (const r of resultados) {
        if (r.status === 'fulfilled') {
          puntos = puntos.concat(r.value.puntos);
          distanciaKm += r.value.resumen.distanciaKm;
          if (r.value.resumen.velocidadMax > velocidadMax) velocidadMax = r.value.resumen.velocidadMax;
          if (r.value.puntos.length > 0) {
            sumaVelocidadProm += r.value.resumen.velocidadPromedio;
            tramosConDatos++;
          }
          tramosOk++;
        } else {
          tramosFallidos++;
        }
      }

      if (tramosOk === 0) {
        toast('Pressa no respondió para ningún tramo del rango elegido.', 'err');
        return;
      }
      if (tramosFallidos > 0) {
        toast(`Pressa no respondió para ${tramosFallidos} tramo${tramosFallidos > 1 ? 's' : ''} de ${TAMANO_TRAMO_DIAS} días — el recorrido puede estar incompleto.`, 'warn');
      }

      // Con varios tramos el total puede acumular más puntos de los
      // que conviene dibujar de una — se afina de nuevo sobre el total
      // ya unido (cada tramo, por separado, ya viene afinado del hook).
      const MAX_PUNTOS_TOTAL = 1500;
      if (puntos.length > MAX_PUNTOS_TOTAL) {
        const paso = Math.ceil(puntos.length / MAX_PUNTOS_TOTAL);
        puntos = puntos.filter((_, i) => i % paso === 0);
      }

      capa.clearLayers();
      const latlngs: [number, number][] = puntos.map((p) => [p.lat, p.lng]);
      if (latlngs.length < 2) {
        toast('No hay recorrido registrado para esa unidad en ese rango.', 'warn');
        setResumen(null);
        return;
      }
      L.polyline(latlngs, { color: '#185FA5', weight: 4, opacity: 0.8 }).addTo(capa);
      L.circleMarker(latlngs[0], { radius: 7, color: '#3f8f5f', fillColor: '#3f8f5f', fillOpacity: 0.9 }).bindTooltip('Inicio').addTo(capa);
      L.circleMarker(latlngs[latlngs.length - 1], { radius: 7, color: '#b3382c', fillColor: '#b3382c', fillOpacity: 0.9 }).bindTooltip('Fin').addTo(capa);
      mapa.fitBounds(L.latLngBounds(latlngs), { padding: [30, 30] });
      setResumen({
        distanciaKm,
        velocidadMax,
        velocidadPromedio: tramosConDatos > 0 ? sumaVelocidadProm / tramosConDatos : 0,
        puntos: puntos.length,
      });
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
        <div className="hint" style={{ marginTop: 6 }}>Se consulta en tramos de 3 días, todos al mismo tiempo (máximo 30 días por búsqueda). Si algún tramo puntual no responde, se avisa y se muestra el resto igual.</div>
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
