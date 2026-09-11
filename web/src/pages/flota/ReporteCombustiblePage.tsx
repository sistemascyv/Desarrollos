import { useEffect, useMemo, useRef, useState } from 'react';
import { pb } from '../../lib/pb';
import { useToast } from '../../lib/ToastContext';
import type { Chofer, Tramo } from '../../types';
import { isoDate } from '../../lib/format';
import { HistorialReportes } from './HistorialReportes';

// Forma común para un viaje con datos de combustible, venga de la base
// (tramos ya cargados en el sistema) o de un archivo subido a mano — todo
// el cálculo de abajo trabaja sobre esto, sin importar el origen.
interface Movimiento {
  chofer: string; // nombre, ya resuelto (no el id)
  tractor: string;
  km_recorridos: number;
  litros_consumidos: number;
  litros_intermedios: number;
  litros_equipo_frio: number;
}

interface Fila {
  clave: string;
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

function agrupar(items: Movimiento[], keyFn: (m: Movimiento) => string): Fila[] {
  const map = new Map<string, { litros: number; km: number; viajes: number; repostajes: number }>();
  for (const m of items) {
    const k = keyFn(m) || '(sin dato)';
    const cur = map.get(k) || { litros: 0, km: 0, viajes: 0, repostajes: 0 };
    cur.litros += m.litros_consumidos;
    cur.km += m.km_recorridos;
    cur.viajes += 1;
    if (m.litros_intermedios > 0) cur.repostajes += 1;
    map.set(k, cur);
  }
  return [...map.entries()].map(([clave, v]) => ({
    clave,
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

function parseNum(s: string): number {
  if (!s) return 0;
  const n = parseFloat(String(s).replace(/\s/g, '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

// T79 -> T079, para que coincida con el codigo que usamos en vehiculos.
function normalizarTractor(raw: string): string {
  const cm = raw.trim().toUpperCase();
  const m = cm.match(/^T(\d+)$/);
  return m ? 'T' + m[1].padStart(3, '0') : cm;
}

interface IndicesColumnas {
  ch: number; cm: number; km: number; li: number; lf: number; lc: number; ef: number;
}

function indicesDeHeader(headers: string[]): IndicesColumnas {
  const find = (name: string) => headers.findIndex((h) => h.trim() === name);
  return {
    ch: find('Chofer'), cm: find('Camion'), km: find('KmRecorridos'),
    li: find('LitrosIntermediosConsumidos'), lf: find('LitrosFinalesConsumidos'),
    lc: find('LitrosConsumidos'), ef: find('LitrosEquipoFrio'),
  };
}

function filaDesdeCeldas(c: string[], idx: IndicesColumnas): Movimiento | null {
  const tractor = idx.cm >= 0 ? normalizarTractor(c[idx.cm] || '') : '';
  const km = idx.km >= 0 ? parseNum(c[idx.km]) : 0;
  let litros = idx.lc >= 0 ? parseNum(c[idx.lc]) : 0;
  const li = idx.li >= 0 ? parseNum(c[idx.li]) : 0;
  const lf = idx.lf >= 0 ? parseNum(c[idx.lf]) : 0;
  if (!litros) litros = li + lf; // algunos exports no traen el total, solo las partes
  if (!tractor || km <= 0 || litros <= 0) return null;
  return {
    chofer: (idx.ch >= 0 ? c[idx.ch] : '').trim() || '(sin chofer)',
    tractor, km_recorridos: km, litros_consumidos: litros,
    litros_intermedios: li, litros_equipo_frio: idx.ef >= 0 ? parseNum(c[idx.ef]) : 0,
  };
}

// El export legacy ("ControlCombustible") es en realidad HTML con
// extensión .xls — mismo truco que AlertasDeStock.xls, se parsea con
// DOMParser nativo, sin depender de ninguna librería.
function parseHtmlDisfrazado(html: string): Movimiento[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const table = doc.querySelector('table');
  if (!table) throw new Error('No se encontró ninguna tabla en el archivo.');
  const filas = [...table.querySelectorAll('tr')];
  if (filas.length < 2) throw new Error('La tabla no tiene datos.');
  const headers = [...filas[0].querySelectorAll('th,td')].map((x) => x.textContent?.trim() || '');
  const idx = indicesDeHeader(headers);
  if (idx.cm < 0 || idx.km < 0) throw new Error('No se reconocen las columnas esperadas (Camion, KmRecorridos, LitrosConsumidos...).');
  const out: Movimiento[] = [];
  for (let i = 1; i < filas.length; i++) {
    const celdas = [...filas[i].querySelectorAll('td')].map((x) => x.textContent?.trim() || '');
    if (celdas.length === 0) continue;
    const m = filaDesdeCeldas(celdas, idx);
    if (m) out.push(m);
  }
  return out;
}

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

  const [origen, setOrigen] = useState<'bd' | 'archivo'>('bd');
  const [movArchivo, setMovArchivo] = useState<Movimiento[]>([]);
  const [nombreArchivo, setNombreArchivo] = useState('');
  const [errorArchivo, setErrorArchivo] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [historialKey, setHistorialKey] = useState(0);

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

  async function handleFile(file: File) {
    setErrorArchivo('');
    try {
      const buf = await file.arrayBuffer();
      const inicio = new TextDecoder().decode(new Uint8Array(buf.slice(0, 500))).trim().toLowerCase();
      if (!(inicio.startsWith('<') || inicio.includes('<html') || inicio.includes('<table'))) {
        throw new Error('El archivo no parece ser el export de ControlCombustible (HTML con extensión .xls). Si tenés un .xlsx real, avisá para sumarle soporte.');
      }
      const html = new TextDecoder('utf-8').decode(buf);
      const movs = parseHtmlDisfrazado(html);
      if (movs.length === 0) throw new Error('No se encontraron viajes válidos en el archivo.');
      setMovArchivo(movs);
      setNombreArchivo(file.name);
      setOrigen('archivo');
      try {
        await pb.collection('reportes_archivo').create({
          tipo: 'combustible', nombre_archivo: file.name, usuario: pb.authStore.record?.id, datos: movs,
        });
        setHistorialKey((k) => k + 1);
      } catch { /* no bloqueamos el reporte si falla el guardado del historial */ }
    } catch (e) {
      setErrorArchivo(e instanceof Error ? e.message : 'Error al procesar el archivo.');
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  function volverABD() {
    setOrigen('bd');
    setMovArchivo([]);
    setNombreArchivo('');
    setErrorArchivo('');
  }

  const nombreChofer = (id: string) => choferes.find((c) => c.id === id)?.nombre || id;

  const movBD: Movimiento[] = useMemo(() => tramos.map((t) => ({
    chofer: nombreChofer(t.chofer || ''),
    tractor: t.tractor || '',
    km_recorridos: Number(t.km_recorridos) || 0,
    litros_consumidos: Number(t.litros_consumidos) || 0,
    litros_intermedios: Number(t.litros_intermedios) || 0,
    litros_equipo_frio: Number(t.litros_equipo_frio) || 0,
  })), [tramos, choferes]);

  const movimientos = origen === 'archivo' ? movArchivo : movBD;

  const { validos, totalLitros, totalKm, l100Flota, kmLFlota, camiones, choferesFila, topRepoCam, topRepoCho } = useMemo(() => {
    const validos = movimientos.filter((m) => m.km_recorridos > 0 && m.litros_consumidos > 0);
    const totalLitros = validos.reduce((s, m) => s + m.litros_consumidos, 0);
    const totalKm = validos.reduce((s, m) => s + m.km_recorridos, 0);
    const l100Flota = totalKm > 0 ? (totalLitros / totalKm) * 100 : 0;
    const kmLFlota = totalLitros > 0 ? totalKm / totalLitros : 0;

    const conDesvio = (filas: Fila[]) => filas
      .map((f) => ({ ...f, desvio: l100Flota > 0 ? ((f.l100 - l100Flota) / l100Flota) * 100 : 0 }))
      .sort((a, b) => a.l100 - b.l100);

    const camiones = conDesvio(agrupar(validos, (m) => m.tractor || '(sin tractor)'));
    const choferesFila = conDesvio(agrupar(validos, (m) => m.chofer));

    const topRepoCam = [...camiones].filter((c) => c.repostajes > 0).sort((a, b) => b.repostajes - a.repostajes).slice(0, 10);
    const topRepoCho = [...choferesFila].filter((c) => c.repostajes > 0).sort((a, b) => b.repostajes - a.repostajes).slice(0, 10);

    return { validos, totalLitros, totalKm, l100Flota, kmLFlota, camiones, choferesFila, topRepoCam, topRepoCho };
  }, [movimientos]);

  const totalRepostajes = validos.filter((m) => m.litros_intermedios > 0).length;
  const totalFrio = validos.reduce((s, m) => s + m.litros_equipo_frio, 0);

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
                <td className="admin-name">{f.clave}</td>
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
        <div className="hint">Elegí un rango de fechas de los tramos ya cargados en el sistema, o subí la planilla de ControlCombustible, y se calcula todo acá: consumo, ranking por camión y chofer, costo por km y repostajes.</div>

        {origen === 'bd' ? (
          <>
            <div className="row">
              <div className="field"><label>Desde</label><input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></div>
              <div className="field"><label>Hasta</label><input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></div>
              <button onClick={buscar} disabled={loading}>{loading ? 'Buscando…' : 'Buscar'}</button>
            </div>
            <div className="hint">
              {validos.length} de {tramos.length} tramos del período tienen litros y km cargados — solo esos entran en los cálculos de abajo.
            </div>
          </>
        ) : (
          <div className="period-bar" style={{ marginBottom: 0 }}>
            <div className="info"><strong>{nombreArchivo}</strong> · {movArchivo.length} viajes leídos del archivo</div>
            <button className="reset" onClick={volverABD}>Volver a los datos del sistema</button>
          </div>
        )}

        <div style={{ marginTop: 14 }}>
          <input
            ref={fileRef}
            type="file"
            accept=".xls,.xlsx"
            style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
          />
          <div
            className={`dropzone${dragOver ? ' dragover' : ''}`}
            style={{ padding: '18px 20px' }}
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
          >
            <strong>Cargar planilla de ControlCombustible</strong>
            hacé clic o arrastrá acá el archivo — se analiza en tu navegador, no se guarda en el sistema.
          </div>
          {errorArchivo && <div className="hint" style={{ color: 'var(--err)', marginTop: 6 }}>{errorArchivo}</div>}
        </div>
      </div>

      <HistorialReportes
        tipo="combustible"
        refreshKey={historialKey}
        onCargar={(datos, nombre) => {
          setMovArchivo(datos as Movimiento[]);
          setNombreArchivo(nombre);
          setOrigen('archivo');
          setErrorArchivo('');
        }}
      />

      {movimientos.length === 0 ? null : (
        <>
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
                        <td className="admin-name">{c.clave}</td>
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
        </>
      )}
    </main>
  );
}
