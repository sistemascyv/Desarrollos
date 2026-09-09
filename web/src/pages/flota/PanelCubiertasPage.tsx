import { useMemo, useRef, useState } from 'react';

// No hay todavía una colección de cubiertas en el sistema — este panel
// solo lee el reporte legacy que se sube a mano (igual que el de
// Combustible cuando viene por archivo), no tiene modo "datos del sistema".
interface Cubierta {
  km: number;
  rec: number; // veces recapada
  marca: string;
  modelo: string;
  estadoCat: 'ACTIVA' | 'DESMONTADA' | 'BAJA' | 'OTRO';
  tipo: string | null; // 'T' (tracto) o 'S' (semi), primera letra de la unidad
  anio: string | null; // año de alta
}

const num = (n: number, d = 0) => n.toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d });

function median(arr: number[]): number {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Colorea según el desvío contra el promedio propio de la muestra en vez
// de umbrales fijos de km — mismo criterio que el reporte de Combustible.
function claseDesvio(valor: number, promedio: number): { color: string } {
  if (!promedio) return { color: 'var(--text)' };
  const desvio = ((valor - promedio) / promedio) * 100;
  if (desvio >= 5) return { color: 'var(--ok)' };
  if (desvio <= -5) return { color: 'var(--err)' };
  return { color: 'var(--warn)' };
}

function find(row: Record<string, string>, keys: string[]): string {
  for (const h of Object.keys(row)) {
    const hn = h.toLowerCase();
    if (keys.some((k) => hn.includes(k))) return row[h];
  }
  return '';
}

function cleanModel(modeloRaw: string, marca: string): string {
  let mod = String(modeloRaw || '').toUpperCase().trim();
  if (marca) mod = mod.split(marca).join('').trim();
  mod = mod.replace(/\d{3}\/\d{2}[/-]?\d{2}\.?\d?/g, '').trim();
  mod = mod.replace(/-\s*$/, '').trim();
  mod = mod.replace(/\s{2,}/g, ' ');
  mod = mod.replace(/^[-\s]+|[-\s]+$/g, '');
  return mod || 'SIN MODELO';
}

function normalizar(rows: Record<string, string>[]): Cubierta[] {
  return rows
    .map((r) => {
      const km = parseFloat(find(r, ['kilometraje', 'total km', 'totalkm', 'km actual']).replace(/[^\d.-]/g, '')) || 0;
      const rec = parseInt(find(r, ['recapado', 'recapados']), 10) || 0;
      const marca = find(r, ['marca']).trim().toUpperCase();
      const modelo = cleanModel(find(r, ['modelo']), marca);
      const estado = find(r, ['estado']).trim();
      const fecha = find(r, ['fecha alta', 'fechaalta', 'fecha compra']);
      // "T129 - MARCA (MODELO - AÑO)"
      const m = estado.match(/^([TS]\d{3})\s*-\s*(.+?)\s*\((.+?)\s*-\s*(\d{4})\)/);
      const unidad = m ? m[1] : null;
      const tipo = unidad ? unidad[0] : null;
      let estadoCat: Cubierta['estadoCat'] = 'OTRO';
      if (/baja/i.test(estado)) estadoCat = 'BAJA';
      else if (/desmontada/i.test(estado)) estadoCat = 'DESMONTADA';
      else if (unidad) estadoCat = 'ACTIVA';
      const ym = fecha.match(/\d{4}/g);
      const anio = ym ? ym.find((y) => y >= '2005' && y <= '2035') || null : null;
      return { km, rec, marca, modelo, estadoCat, tipo, anio };
    })
    .filter((r) => r.marca);
}

// El export legacy es HTML con extensión .xls (mismo truco que
// AlertasDeStock.xls y el de ControlCombustible) — se parsea con
// DOMParser nativo, sin depender de ninguna librería.
function parseHtmlDisfrazado(html: string): Cubierta[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const table = doc.querySelector('table');
  if (!table) throw new Error('No se encontró ninguna tabla en el archivo.');
  const filas = [...table.querySelectorAll('tr')];
  if (filas.length < 2) throw new Error('La tabla no tiene datos.');
  const headers = [...filas[0].querySelectorAll('th,td')].map((x) => x.textContent?.trim() || '');
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < filas.length; i++) {
    const celdas = [...filas[i].querySelectorAll('td')].map((x) => x.textContent?.trim() || '');
    if (celdas.length === 0) continue;
    const row: Record<string, string> = {};
    headers.forEach((h, j) => { row[h] = celdas[j] ?? ''; });
    rows.push(row);
  }
  const out = normalizar(rows);
  if (out.length === 0) throw new Error('No se reconocieron columnas de cubiertas (Marca, Modelo, Kilometraje...). ¿Es el reporte correcto?');
  return out;
}

export function PanelCubiertasPage() {
  const [cubiertas, setCubiertas] = useState<Cubierta[]>([]);
  const [nombreArchivo, setNombreArchivo] = useState('');
  const [errorArchivo, setErrorArchivo] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [precioNueva, setPrecioNueva] = useState('480000');
  const [precioRecap, setPrecioRecap] = useState('140000');
  const [tipoCambio, setTipoCambio] = useState('1150');
  const [pctRecapable, setPctRecapable] = useState('40');
  const [filtroModelo, setFiltroModelo] = useState('');

  async function handleFile(file: File) {
    setErrorArchivo('');
    try {
      const buf = await file.arrayBuffer();
      const inicio = new TextDecoder().decode(new Uint8Array(buf.slice(0, 500))).trim().toLowerCase();
      if (!(inicio.startsWith('<') || inicio.includes('<html') || inicio.includes('<table'))) {
        throw new Error('El archivo no parece ser el reporte de Cubiertas (HTML con extensión .xls). Si tenés un .xlsx real, avisá para sumarle soporte.');
      }
      const html = new TextDecoder('utf-8').decode(buf);
      const parsed = parseHtmlDisfrazado(html);
      setCubiertas(parsed);
      setNombreArchivo(file.name);
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

  function limpiar() {
    setCubiertas([]);
    setNombreArchivo('');
    setErrorArchivo('');
  }

  const {
    total, activas, desmontadas, bajas, pctBajaSinRecap, marcaStats, byYear, recapSteps,
    cpk, modeloStats, ahorroTotal, ahorroUnit, repoAnual, recapables,
  } = useMemo(() => {
    const total = cubiertas.length;
    const activas = cubiertas.filter((r) => r.estadoCat === 'ACTIVA');
    const desmontadas = cubiertas.filter((r) => r.estadoCat === 'DESMONTADA');
    const bajas = cubiertas.filter((r) => r.estadoCat === 'BAJA');
    const bajasSinRecap = bajas.filter((r) => r.rec === 0).length;
    const pctBajaSinRecap = bajas.length ? Math.round((bajasSinRecap / bajas.length) * 100) : 0;

    const valid = cubiertas.filter((r) => r.km > 1000 && r.km < 2000000);
    const kmPromedioGeneral = valid.length ? valid.reduce((s, r) => s + r.km, 0) / valid.length : 0;

    // Vida útil por marca (mín. 20 registros)
    const porMarca = new Map<string, Cubierta[]>();
    valid.forEach((r) => { const l = porMarca.get(r.marca) || []; l.push(r); porMarca.set(r.marca, l); });
    const marcaStats = [...porMarca.entries()]
      .filter(([, v]) => v.length >= 20)
      .map(([marca, v]) => ({ marca, n: v.length, km: median(v.map((x) => x.km)), rec: median(v.map((x) => x.rec)) }))
      .sort((a, b) => b.km - a.km);

    // Compras por año
    const byYear = new Map<string, number>();
    cubiertas.forEach((r) => { if (r.anio) byYear.set(r.anio, (byYear.get(r.anio) || 0) + 1); });

    // Recapado: km mediano según cantidad de recapados (tope 3)
    const porRec = new Map<number, number[]>();
    valid.forEach((r) => { const k = Math.min(r.rec, 3); const l = porRec.get(k) || []; l.push(r.km); porRec.set(k, l); });
    const recapSteps = [0, 1, 2, 3]
      .map((k) => ({ k, km: porRec.has(k) ? Math.round(median(porRec.get(k)!)) : null }))
      .filter((s) => s.km !== null) as { k: number; km: number }[];

    // Costo por km por marca
    const pNueva = Number(precioNueva) || 0;
    const pRecap = Number(precioRecap) || 0;
    const cpkList = marcaStats.map((m) => {
      const costoTotal = pNueva + m.rec * pRecap;
      return { ...m, costoTotal, cpk: m.km > 0 ? costoTotal / m.km : 0 };
    }).sort((a, b) => a.cpk - b.cpk);
    const cpkPromedio = cpkList.length ? cpkList.reduce((s, m) => s + m.cpk, 0) / cpkList.length : 0;
    const cpk = cpkList.map((m) => ({ ...m, ...claseDesvioCpk(m.cpk, cpkPromedio) }));

    // Detalle por marca + modelo (mín. 15 registros)
    const porModelo = new Map<string, Cubierta[]>();
    valid.forEach((r) => { const k = r.marca + '|||' + r.modelo; const l = porModelo.get(k) || []; l.push(r); porModelo.set(k, l); });
    const porModeloTipo = new Map<string, string[]>();
    cubiertas.forEach((r) => { if (!r.tipo) return; const k = r.marca + '|||' + r.modelo; const l = porModeloTipo.get(k) || []; l.push(r.tipo); porModeloTipo.set(k, l); });
    const modeloStats = [...porModelo.entries()]
      .filter(([, v]) => v.length >= 15)
      .map(([key, v]) => {
        const [marca, modelo] = key.split('|||');
        const kmMed = median(v.map((x) => x.km));
        const recMed = median(v.map((x) => x.rec));
        const costoTotal = pNueva + recMed * pRecap;
        const tg = porModeloTipo.get(key);
        const pctTracto = tg && tg.length ? Math.round((tg.filter((t) => t === 'T').length / tg.length) * 100) : null;
        return { marca, modelo, n: v.length, km: kmMed, rec: recMed, pctTracto, cpk: kmMed > 0 ? costoTotal / kmMed : 0 };
      })
      .sort((a, b) => a.cpk - b.cpk);

    // Ahorro estimado
    const años = [...byYear.keys()];
    const repoAnual = años.length ? byYear.get(años.sort().slice(-1)[0]) || 0 : 0;
    const pct = (Number(pctRecapable) || 0) / 100;
    const recapables = Math.round(repoAnual * pct);
    const ahorroUnit = pNueva - pRecap;
    const ahorroTotal = recapables * ahorroUnit;

    return { total, activas, desmontadas, bajas, pctBajaSinRecap, marcaStats, byYear, recapSteps, cpk, modeloStats, ahorroTotal, ahorroUnit, repoAnual, recapables, kmPromedioGeneral };
  }, [cubiertas, precioNueva, precioRecap, pctRecapable]);

  function claseDesvioCpk(valor: number, promedio: number) {
    // Acá "mejor" es más barato, al revés que en km — invertimos el signo.
    if (!promedio) return {};
    const desvio = ((valor - promedio) / promedio) * 100;
    if (desvio <= -5) return { color: 'var(--ok)' };
    if (desvio >= 5) return { color: 'var(--err)' };
    return { color: 'var(--warn)' };
  }

  const maxMarcaKm = marcaStats.length ? Math.max(...marcaStats.map((m) => m.km)) : 0;
  const maxAnio = byYear.size ? Math.max(...[...byYear.values()]) : 0;
  const promedioMarcaKm = marcaStats.length ? marcaStats.reduce((s, m) => s + m.km, 0) / marcaStats.length : 0;
  const tc = Number(tipoCambio) || 0;

  const modeloFiltrados = filtroModelo
    ? modeloStats.filter((m) => (m.marca + ' ' + m.modelo).toLowerCase().includes(filtroModelo.toLowerCase()))
    : modeloStats;

  return (
    <main>
      <div className="card">
        <h2>Panel de Cubiertas</h2>
        <div className="hint">Subí el reporte de cubiertas del sistema viejo y se calcula todo acá: vida útil, recapado, costo por km y oportunidades de ahorro.</div>

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
            <strong>Cargar reporte de Cubiertas</strong>
            hacé clic o arrastrá acá el archivo — se analiza en tu navegador, no se guarda en el sistema.
          </div>
          {errorArchivo && <div className="hint" style={{ color: 'var(--err)', marginTop: 6 }}>⚠ {errorArchivo}</div>}
          {nombreArchivo && !errorArchivo && (
            <div className="period-bar" style={{ marginTop: 10 }}>
              <div className="info">📄 <strong>{nombreArchivo}</strong> · {total} cubiertas leídas</div>
              <button className="reset" onClick={limpiar}>Quitar archivo</button>
            </div>
          )}
        </div>
      </div>

      {cubiertas.length === 0 ? null : (
        <>
          <div className="card">
            <h2>Resumen del parque</h2>
            <div className="summary-grid">
              <div className="stat"><div className="lbl">Total registros</div><div className="val">{num(total)}</div></div>
              <div className="stat"><div className="lbl">Activas</div><div className="val">{num(activas.length)}</div></div>
              <div className="stat"><div className="lbl">Desmontadas (stock)</div><div className="val">{num(desmontadas.length)}</div></div>
              <div className="stat"><div className="lbl">Bajas sin recapar</div><div className="val" style={pctBajaSinRecap >= 50 ? { color: 'var(--err)' } : undefined}>{pctBajaSinRecap}%</div></div>
            </div>
            <div className="hint" style={{ marginTop: 6 }}>{bajas.length} bajas en total. El color en las tablas de abajo es el desvío contra el promedio de esta misma muestra, no un umbral fijo.</div>
          </div>

          <div className="card">
            <h2>Vida útil por marca</h2>
            <div className="hint" style={{ marginBottom: 10 }}>Km mediano recorrido, marcas con al menos 20 registros válidos.</div>
            {marcaStats.length === 0 ? (
              <div className="hint">Sin marcas con suficientes registros para comparar.</div>
            ) : (
              <div className="bar-chart">
                <div className="bar-chart-axis">
                  <span>{num(maxMarcaKm)}</span>
                  <span>{num(maxMarcaKm / 2)}</span>
                  <span>0</span>
                </div>
                <div className="bar-chart-bars">
                  {marcaStats.map((m) => (
                    <div className="bar-chart-col" key={m.marca} title={`${m.marca}: ${num(m.km)} km (n=${m.n})`}>
                      <div className="bar-chart-stack" style={{ height: `${maxMarcaKm ? (m.km / maxMarcaKm) * 100 : 0}%` }}>
                        <div className="bar-chart-seg" style={{ flex: 1, background: claseDesvio(m.km, promedioMarcaKm).color }} />
                      </div>
                      <div className="bar-chart-label">{m.marca}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="card">
            <h2>Compras por año</h2>
            {byYear.size === 0 ? (
              <div className="hint">Sin fechas de alta reconocidas en el archivo.</div>
            ) : (
              <div className="bar-chart">
                <div className="bar-chart-axis">
                  <span>{num(maxAnio)}</span>
                  <span>{num(maxAnio / 2)}</span>
                  <span>0</span>
                </div>
                <div className="bar-chart-bars">
                  {[...byYear.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([anio, n]) => (
                    <div className="bar-chart-col" key={anio} title={`${anio}: ${n} cubiertas`}>
                      <div className="bar-chart-stack" style={{ height: `${maxAnio ? (n / maxAnio) * 100 : 0}%` }}>
                        <div className="bar-chart-seg" style={{ flex: 1, background: 'var(--accent)' }} />
                      </div>
                      <div className="bar-chart-label">{anio}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="card">
            <h2>El recapado y la vida útil</h2>
            <div className="hint" style={{ marginBottom: 10 }}>Km mediano según cantidad de recapados acumulados. El primer recapado suele ser el de mayor retorno.</div>
            <div className="summary-grid">
              {recapSteps.map((s, i) => {
                const prev = i > 0 ? recapSteps[i - 1].km : null;
                const ganancia = prev ? Math.round(((s.km - prev) / prev) * 100) : null;
                return (
                  <div className="stat" key={s.k}>
                    <div className="lbl">{s.k === 0 ? 'Sin recapar' : `${s.k} recapado${s.k > 1 ? 's' : ''}`}</div>
                    <div className="val">{num(s.km)} km</div>
                    {ganancia !== null && (
                      <div className="hint" style={{ color: ganancia > 3 ? 'var(--ok)' : 'var(--err)', marginTop: 2 }}>
                        {ganancia >= 0 ? '+' : ''}{ganancia}% vs. paso anterior
                      </div>
                    )}
                  </div>
                );
              })}
              {recapSteps.length === 0 && <div className="hint">Sin datos suficientes.</div>}
            </div>
          </div>

          <div className="card">
            <h2>Costo por km</h2>
            <div className="row">
              <div className="field"><label>Cubierta nueva (ARS)</label><input type="number" step="1000" value={precioNueva} onChange={(e) => setPrecioNueva(e.target.value)} /></div>
              <div className="field"><label>Recapado (ARS)</label><input type="number" step="1000" value={precioRecap} onChange={(e) => setPrecioRecap(e.target.value)} /></div>
              <div className="field"><label>Tipo de cambio (ARS/USD)</label><input type="number" step="1" value={tipoCambio} onChange={(e) => setTipoCambio(e.target.value)} /></div>
            </div>
            <div className="hint" style={{ margin: '10px 0' }}>
              El costo usa el mismo precio de "cubierta nueva" para todas las marcas — no diferenciamos precio de lista, así que esto refleja diferencias reales de kilometraje y recapado, no de precio.
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Marca</th><th className="num">Km mediano</th><th className="num">Recapados</th><th className="num">Costo total</th><th className="num">ARS/km</th><th className="num">USD/km</th></tr></thead>
                <tbody>
                  {cpk.map((m) => (
                    <tr key={m.marca}>
                      <td className="admin-name">{m.marca}</td>
                      <td className="num">{num(m.km)}</td>
                      <td className="num">{num(m.rec, 1)}</td>
                      <td className="num">${num(m.costoTotal)}</td>
                      <td className="num"><span className="badge" style={m.color ? { color: m.color } : undefined}>{num(m.cpk, 2)}</span></td>
                      <td className="num">{tc > 0 ? `u$s ${num(m.cpk / tc, 4)}` : '—'}</td>
                    </tr>
                  ))}
                  {cpk.length === 0 && <tr><td className="empty" colSpan={6}>Sin datos.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <h2>Detalle por marca + modelo</h2>
            <div className="hint" style={{ marginBottom: 10 }}>Modelos con al menos 15 registros válidos. "% tracto" es la proporción real montada hoy en tractos vs. semirremolques.</div>
            <input type="text" placeholder="Filtrar por marca o modelo…" value={filtroModelo} onChange={(e) => setFiltroModelo(e.target.value)} style={{ marginBottom: 10, maxWidth: 320 }} />
            <div className="table-wrap">
              <table>
                <thead><tr><th>Marca</th><th>Modelo</th><th className="num">n</th><th className="num">Km mediano</th><th className="num">Recapados</th><th className="num">% Tracto</th><th className="num">ARS/km</th></tr></thead>
                <tbody>
                  {modeloFiltrados.map((m) => (
                    <tr key={m.marca + m.modelo}>
                      <td className="admin-name">{m.marca}</td>
                      <td>{m.modelo}</td>
                      <td className="num">{m.n}</td>
                      <td className="num">{num(m.km)}</td>
                      <td className="num">{num(m.rec, 1)}</td>
                      <td className="num">{m.pctTracto !== null ? `${m.pctTracto}%` : '—'}</td>
                      <td className="num"><b>{num(m.cpk, 2)}</b></td>
                    </tr>
                  ))}
                  {modeloFiltrados.length === 0 && <tr><td className="empty" colSpan={7}>Sin resultados.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <h2>Oportunidad de ahorro anual estimada</h2>
            <div className="row">
              <div className="field"><label>% de reposiciones que podrían ser recapado</label><input type="number" step="5" value={pctRecapable} onChange={(e) => setPctRecapable(e.target.value)} /></div>
            </div>
            <div className="summary-grid" style={{ marginTop: 10 }}>
              <div className="stat"><div className="lbl">Ahorro estimado (ARS/año)</div><div className="val">${num(ahorroTotal)}</div></div>
              <div className="stat"><div className="lbl">Ahorro estimado (USD/año)</div><div className="val">{tc > 0 ? `u$s ${num(ahorroTotal / tc)}` : '—'}</div></div>
            </div>
            <div className="hint" style={{ marginTop: 10 }}>
              Recapando ~{num(recapables)} carcasas propias al año ({pctRecapable}% de las ~{num(repoAnual)} repuestas en {[...byYear.keys()].sort().slice(-1)[0] || 'el último año detectado'}) en vez de comprar nuevas. Diferencia por cubierta: ${num(ahorroUnit)} (recapado ${num(Number(precioRecap))} vs. nueva ${num(Number(precioNueva))}).
            </div>
          </div>
        </>
      )}
    </main>
  );
}
