import { useMemo, useRef, useState } from 'react';
import { pb } from '../../lib/pb';
import { HistorialReportes } from './HistorialReportes';

// No hay todavía una colección de cubiertas en el sistema — este panel
// solo lee el reporte legacy que se sube a mano (igual que el de
// Combustible cuando viene por archivo), no tiene modo "datos del sistema".
interface Cubierta {
  numero: string; // "Número de cubierta" — une con el historial detallado
  km: number;
  rec: number; // veces recapada
  marca: string;
  modelo: string;
  estadoCat: 'ACTIVA' | 'DESMONTADA' | 'BAJA' | 'OTRO';
  tipo: string | null; // 'T' (tracto) o 'S' (semi), primera letra de la unidad
  anio: string | null; // año de alta
}

// Un evento de recapado real, de la hoja "Historial detallado" del
// export — con esto se puede medir la vida útil ganada por cada
// recapado sobre la MISMA cubierta en el tiempo, en vez de aproximarla
// comparando cubiertas distintas agrupadas por su cantidad de recapados.
interface RecapEvento {
  numero: string;
  fechaMs: number;
  precio: number;
  km: number; // km acumulado de la cubierta al momento del recapado
  proveedor: string;
  banda: string;
  tipoBanda: string;
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
      const numero = find(r, ['número de cubierta', 'numero de cubierta']).trim();
      const km = parseFloat(find(r, ['kilometraje', 'total km', 'totalkm', 'km actual']).replace(/[^\d.-]/g, '')) || 0;
      const rec = parseInt(find(r, ['recapado', 'recapados']), 10) || 0;
      const marca = find(r, ['marca']).trim().toUpperCase();
      const modelo = cleanModel(find(r, ['modelo']), marca);
      const estado = find(r, ['estado']).trim();
      const fecha = find(r, ['fecha alta', 'fechaalta', 'fecha compra']);
      const fechaBaja = find(r, ['fecha de baja', 'fecha baja']).trim();
      // "T129 - MARCA (MODELO - AÑO)" o cualquier otro código de unidad
      // ("CHEVROLET - CHEVROLET (...)", "ACOPLADO - SNSC (...)") — solo
      // cuando arranca con S/T + 3 dígitos sabemos si es semi o tracto,
      // pero igual cuenta como montada aunque no lo sepamos.
      const m = estado.match(/^(\S+)\s*-\s*.+?\((.+?)\s*-\s*(\d{4})\)/);
      const unidad = m ? m[1] : null;
      const tipo = unidad && /^[TS]\d/.test(unidad) ? unidad[0] : null;
      // La baja puede venir marcada en el texto de Estado ("DADA DE BAJA")
      // o solo con la fecha de baja cargada — cualquiera de las dos cuenta.
      const tieneFechaBaja = !!fechaBaja && fechaBaja !== '—' && fechaBaja !== '-';
      let estadoCat: Cubierta['estadoCat'] = 'OTRO';
      if (/baja/i.test(estado) || tieneFechaBaja) estadoCat = 'BAJA';
      else if (/desmontada/i.test(estado)) estadoCat = 'DESMONTADA';
      else if (unidad) estadoCat = 'ACTIVA';
      const ym = fecha.match(/\d{4}/g);
      const anio = ym ? ym.find((y) => y >= '2005' && y <= '2035') || null : null;
      return { numero, km, rec, marca, modelo, estadoCat, tipo, anio };
    })
    .filter((r) => r.marca);
}

// "21/08/2026" -> timestamp, para ordenar eventos de recapado en el tiempo.
function parseFechaAr(s: string): number {
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return NaN;
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])).getTime();
}

// Hoja "Historial detallado": un evento por Montaje o Recapado de cada
// cubierta. Solo nos interesan los Recapado (traen precio real y km).
function parseHistorial(hoja: Element): RecapEvento[] {
  const filas = [...hoja.getElementsByTagName('Row')];
  if (filas.length < 2) return [];
  const celda = (c: Element) => (c.getElementsByTagName('Data')[0]?.textContent ?? c.textContent ?? '').trim();
  const headers = [...filas[0].getElementsByTagName('Cell')].map(celda);
  const out: RecapEvento[] = [];
  for (let i = 1; i < filas.length; i++) {
    const celdas = [...filas[i].getElementsByTagName('Cell')].map(celda);
    if (celdas.length === 0) continue;
    const row: Record<string, string> = {};
    headers.forEach((h, j) => { row[h] = celdas[j] ?? ''; });
    if (find(row, ['movimiento']).trim().toLowerCase() !== 'recapado') continue;
    const numero = find(row, ['número de cubierta', 'numero de cubierta']).trim();
    const fechaMs = parseFechaAr(find(row, ['fecha']));
    const precio = parseFloat(find(row, ['precio recapado', 'precio']).replace(/[^\d.-]/g, '')) || 0;
    const km = parseFloat(find(row, ['km recapado', 'km acumulado']).replace(/[^\d.-]/g, '')) || 0;
    const proveedor = find(row, ['proveedor de recapados', 'proveedor']).trim();
    const banda = find(row, ['banda']).trim();
    const tipoBanda = find(row, ['tipo de banda']).trim();
    if (!numero || km <= 0) continue;
    out.push({ numero, fechaMs, precio, km, proveedor, banda, tipoBanda });
  }
  return out;
}

interface Parseado {
  cubiertas: Cubierta[];
  historial: RecapEvento[];
}

// El export legacy es HTML con extensión .xls (mismo truco que
// AlertasDeStock.xls y el de ControlCombustible) — se parsea con
// DOMParser nativo, sin depender de ninguna librería. No trae historial
// detallado (es una sola tabla), solo la hoja de cubiertas.
function parseHtmlDisfrazado(html: string): Parseado {
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
  const cubiertas = normalizar(rows);
  if (cubiertas.length === 0) throw new Error('No se reconocieron columnas de cubiertas (Marca, Modelo, Kilometraje...). ¿Es el reporte correcto?');
  return { cubiertas, historial: [] };
}

// El export real de Cubiertas resultó ser otro formato legacy: XML de
// Excel 2003 ("SpreadsheetML", <?mso-application progid="Excel.Sheet"?>),
// no HTML disfrazado. Se parsea como XML de verdad (no con DOMParser en
// modo HTML, que normaliza mal las etiquetas <Row>/<Cell>/<Data>).
function parseSpreadsheetXml(xml: string): Parseado {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('El archivo XML no es válido.');
  // El archivo trae más de una hoja (Cubiertas + Historial detallado
  // con los recapados) — hay que leer cada una por separado, si se leen
  // todas las filas del libro mezcladas los datos no cierran.
  const hojas = [...doc.getElementsByTagName('Worksheet')];
  const hoja = hojas.find((h) => /cubiertas/i.test(h.getAttribute('ss:Name') || '')) || hojas[0];
  if (!hoja) throw new Error('No se encontró ninguna hoja en el archivo.');
  const filas = [...hoja.getElementsByTagName('Row')];
  if (filas.length < 2) throw new Error('La hoja de cubiertas no tiene datos.');
  const celda = (c: Element) => (c.getElementsByTagName('Data')[0]?.textContent ?? c.textContent ?? '').trim();
  const headers = [...filas[0].getElementsByTagName('Cell')].map(celda);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < filas.length; i++) {
    const celdas = [...filas[i].getElementsByTagName('Cell')].map(celda);
    if (celdas.length === 0) continue;
    const row: Record<string, string> = {};
    headers.forEach((h, j) => { row[h] = celdas[j] ?? ''; });
    rows.push(row);
  }
  const cubiertas = normalizar(rows);
  if (cubiertas.length === 0) throw new Error('No se reconocieron columnas de cubiertas (Marca, Modelo, Kilometraje...). ¿Es el reporte correcto?');

  const hojaHistorial = hojas.find((h) => /historial/i.test(h.getAttribute('ss:Name') || ''));
  const historial = hojaHistorial ? parseHistorial(hojaHistorial) : [];
  return { cubiertas, historial };
}

export function PanelCubiertasPage() {
  const [cubiertas, setCubiertas] = useState<Cubierta[]>([]);
  const [historial, setHistorial] = useState<RecapEvento[]>([]);
  const [nombreArchivo, setNombreArchivo] = useState('');
  const [errorArchivo, setErrorArchivo] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [historialKey, setHistorialKey] = useState(0);

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
      const texto = new TextDecoder('utf-8').decode(buf);
      let parsed: { cubiertas: Cubierta[]; historial: RecapEvento[] };
      if (inicio.startsWith('<?xml') || inicio.includes('office:spreadsheet')) {
        parsed = parseSpreadsheetXml(texto);
      } else if (inicio.startsWith('<') || inicio.includes('<html') || inicio.includes('<table')) {
        parsed = parseHtmlDisfrazado(texto);
      } else {
        throw new Error('El archivo no parece ser el reporte de Cubiertas (XML/HTML de Excel). Si es otro formato, avisá para sumarle soporte.');
      }
      setCubiertas(parsed.cubiertas);
      setHistorial(parsed.historial);
      setNombreArchivo(file.name);
      // Si el archivo trae historial real de recapados, precargamos el
      // precio de recapado con la mediana real pagada en el último año
      // del archivo (por la inflación, mezclar con precios viejos
      // distorsiona) — sigue editable.
      const fechas = parsed.historial.map((h) => h.fechaMs).filter((n) => !isNaN(n));
      const fechaReciente = fechas.length ? Math.max(...fechas) : null;
      const unAnioMs = 365 * 24 * 60 * 60 * 1000;
      const precios = parsed.historial
        .filter((h) => h.precio > 100 && fechaReciente !== null && h.fechaMs >= fechaReciente - unAnioMs)
        .map((h) => h.precio);
      if (precios.length > 0) setPrecioRecap(String(Math.round(median(precios))));
      try {
        await pb.collection('reportes_archivo').create({
          tipo: 'cubiertas', nombre_archivo: file.name, usuario: pb.authStore.record?.id,
          datos: { cubiertas: parsed.cubiertas, historial: parsed.historial },
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

  function limpiar() {
    setCubiertas([]);
    setHistorial([]);
    setNombreArchivo('');
    setErrorArchivo('');
  }

  const {
    total, activas, desmontadas, bajas, otras, pctBajaSinRecap, marcaStats, byYear, recapSteps, recapStepsReales,
    proveedorStats, bandaStats, cpkProveedorPromedio, cpkBandaPromedio,
    cpk, modeloStats, ahorroTotal, ahorroUnit, repoAnual, recapables, precioRecapReal, eventosRecapReal,
  } = useMemo(() => {
    const total = cubiertas.length;
    const activas = cubiertas.filter((r) => r.estadoCat === 'ACTIVA');
    const desmontadas = cubiertas.filter((r) => r.estadoCat === 'DESMONTADA');
    const bajas = cubiertas.filter((r) => r.estadoCat === 'BAJA');
    const otras = cubiertas.filter((r) => r.estadoCat === 'OTRO');
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

    // Recapado, aproximado: km mediano según cantidad de recapados
    // acumulados HOY (tope 3) — compara cubiertas distintas entre sí, es
    // un cross-section, no la vida real de una misma cubierta.
    const porRec = new Map<number, number[]>();
    valid.forEach((r) => { const k = Math.min(r.rec, 3); const l = porRec.get(k) || []; l.push(r.km); porRec.set(k, l); });
    const recapSteps = [0, 1, 2, 3]
      .map((k) => ({ k, km: porRec.has(k) ? Math.round(median(porRec.get(k)!)) : null }))
      .filter((s) => s.km !== null) as { k: number; km: number }[];

    // Recapado, real: usa el historial detallado (si vino en el archivo)
    // para medir km recorridos por cada banda de LA MISMA cubierta, entre
    // el momento en que se instaló y el siguiente evento (otro recapado,
    // o el km final si la cubierta ya está desmontada/dada de baja). La
    // última banda de una cubierta todavía activa sigue en curso, no
    // entra hasta que se cierre. Cada tramo cerrado (salvo la banda
    // original de fábrica) queda además atado a quién hizo ese recapado
    // y con qué banda, para poder compararlos entre sí.
    interface Tramo { etapa: number; km: number; fechaMs: number | null; proveedor: string | null; banda: string | null; precio: number | null }
    const cubiertaPorNumero = new Map(cubiertas.map((c) => [c.numero, c]));
    const eventosPorCubierta = new Map<string, RecapEvento[]>();
    historial.forEach((e) => { const l = eventosPorCubierta.get(e.numero) || []; l.push(e); eventosPorCubierta.set(e.numero, l); });
    const tramos: Tramo[] = [];
    eventosPorCubierta.forEach((eventos, numero) => {
      const ordenados = [...eventos].sort((a, b) => a.fechaMs - b.fechaMs);
      const cub = cubiertaPorNumero.get(numero);
      const puntos = ordenados.map((e) => e.km);
      const cerrada = cub && (cub.estadoCat === 'BAJA' || cub.estadoCat === 'DESMONTADA');
      if (cerrada && cub!.km > puntos[puntos.length - 1]) puntos.push(cub!.km);
      for (let k = 0; k < puntos.length; k++) {
        const km = k === 0 ? puntos[0] : puntos[k] - puntos[k - 1];
        if (km <= 0) continue;
        const ev = k > 0 ? ordenados[k - 1] : null;
        // $1, $2... son placeholders de recapados rechazados/sin costo real,
        // no un precio de verdad — se descartan con un piso mínimo.
        tramos.push({
          etapa: Math.min(k, 3), km, fechaMs: ev?.fechaMs ?? null,
          proveedor: ev?.proveedor || null, banda: ev?.banda || null, precio: ev && ev.precio > 100 ? ev.precio : null,
        });
      }
    });
    const recapStepsReales = [0, 1, 2, 3]
      .map((k) => { const arr = tramos.filter((t) => t.etapa === k).map((t) => t.km); return { k, km: arr.length ? Math.round(median(arr)) : null }; })
      .filter((s) => s.km !== null) as { k: number; km: number }[];

    // Argentina tiene inflación muy alta — comparar precios en pesos de
    // hace varios años contra precios de ahora no sirve para decidir hoy.
    // La vida útil (km) usa todo el historial disponible, pero el precio
    // solo se compara dentro de los últimos 12 meses del archivo.
    const UN_ANIO_MS = 365 * 24 * 60 * 60 * 1000;
    const fechasValidas = historial.map((e) => e.fechaMs).filter((n) => !isNaN(n));
    const fechaMasReciente = fechasValidas.length ? Math.max(...fechasValidas) : null;
    const esPrecioReciente = (fechaMs: number | null) =>
      fechaMasReciente !== null && fechaMs !== null && fechaMs >= fechaMasReciente - UN_ANIO_MS;

    // Proveedores y bandas de recapado: solo tramos que vienen de un
    // recapado real (se excluye la banda original, que no tiene proveedor).
    const tramosRecapados = tramos.filter((t) => t.proveedor !== null);
    function agruparTramos(campo: 'proveedor' | 'banda') {
      const grupos = new Map<string, Tramo[]>();
      tramosRecapados.forEach((t) => { const k = t[campo] || '(sin dato)'; const l = grupos.get(k) || []; l.push(t); grupos.set(k, l); });
      return [...grupos.entries()]
        .filter(([, v]) => v.length >= 5)
        .map(([nombre, v]) => {
          const precios = v.filter((t) => esPrecioReciente(t.fechaMs) && t.precio !== null).map((t) => t.precio as number);
          const kmMed = median(v.map((t) => t.km));
          const precioMed = precios.length ? median(precios) : null;
          return {
            nombre, n: v.length, km: Math.round(kmMed),
            precio: precioMed !== null ? Math.round(precioMed) : null,
            precioN: precios.length,
            cpk: precioMed !== null && kmMed > 0 ? precioMed / kmMed : null,
          };
        })
        .sort((a, b) => (a.cpk ?? Infinity) - (b.cpk ?? Infinity));
    }
    const proveedorStats = agruparTramos('proveedor');
    const bandaStats = agruparTramos('banda');
    const cpkProveedorPromedio = proveedorStats.length ? proveedorStats.reduce((s, p) => s + (p.cpk ?? 0), 0) / proveedorStats.length : 0;
    const cpkBandaPromedio = bandaStats.length ? bandaStats.reduce((s, p) => s + (p.cpk ?? 0), 0) / bandaStats.length : 0;

    // Precio real de recapado para precargar "Costo por km": mediana de
    // lo pagado en los últimos 12 meses del archivo (mismo motivo: no
    // mezclar precios viejos con los de hoy).
    const preciosRecientes = historial.filter((e) => e.precio > 100 && esPrecioReciente(e.fechaMs)).map((e) => e.precio);
    const precioRecapReal = preciosRecientes.length ? Math.round(median(preciosRecientes)) : null;
    const eventosRecapReal = preciosRecientes.length;

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

    return { total, activas, desmontadas, bajas, otras, pctBajaSinRecap, marcaStats, byYear, recapSteps, recapStepsReales, proveedorStats, bandaStats, cpkProveedorPromedio, cpkBandaPromedio, cpk, modeloStats, ahorroTotal, ahorroUnit, repoAnual, recapables, kmPromedioGeneral, precioRecapReal, eventosRecapReal };
  }, [cubiertas, historial, precioNueva, precioRecap, pctRecapable]);

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

  const usaRecapadoReal = recapStepsReales.length > 0;
  const stepsAMostrar = usaRecapadoReal ? recapStepsReales : recapSteps;
  const etiquetaEtapa = (k: number) => usaRecapadoReal
    ? (k === 0 ? 'Banda original (hasta el 1er recapado)' : `${k}ª banda recapada`)
    : (k === 0 ? 'Sin recapar' : `${k} recapado${k > 1 ? 's' : ''}`);

  const modeloFiltrados = filtroModelo
    ? modeloStats.filter((m) => (m.marca + ' ' + m.modelo).toLowerCase().includes(filtroModelo.toLowerCase()))
    : modeloStats;

  const conCpk = proveedorStats.filter((p) => p.cpk !== null);
  const mejorProveedor = conCpk[0] || null; // ya viene ordenado asc por cpk
  const peorProveedor = conCpk.length ? conCpk[conCpk.length - 1] : null;

  // Resumen ejecutivo: 3-5 conclusiones accionables arriba de todo, para
  // no obligar a leer cada tabla para saber qué decisión tomar.
  const puntosClave: React.ReactNode[] = [];
  if (marcaStats.length > 0) {
    const m = marcaStats[0];
    puntosClave.push(<>🏆 Mejor marca por vida útil: <strong>{m.marca}</strong> — {num(m.km)} km medianos (n={m.n}).</>);
  }
  if (modeloStats.length > 0) {
    const m = modeloStats[0];
    puntosClave.push(<>🥇 Mejor combinación marca + modelo por costo: <strong>{m.marca} {m.modelo}</strong> — ${num(m.cpk, 2)}/km.</>);
  }
  if (mejorProveedor) {
    puntosClave.push(<>🔧 Mejor proveedor de recapado: <strong>{mejorProveedor.nombre}</strong> — ${num(mejorProveedor.cpk ?? 0, 2)}/km ({mejorProveedor.n} recapados).</>);
  }
  if (ahorroTotal > 0) {
    puntosClave.push(<>💰 Ahorro estimado recapando en vez de comprar nuevas: <strong>${num(ahorroTotal)}/año</strong>{tc > 0 ? <> (≈ u$s {num(ahorroTotal / tc)})</> : null}.</>);
  }
  if (bajas.length >= 10 && pctBajaSinRecap >= 40) {
    puntosClave.push(<>⚠️ <strong>{pctBajaSinRecap}%</strong> de las {bajas.length} bajas se dieron sin recapar — hay margen para extender vida útil antes de retirar la cubierta.</>);
  }

  function tablaProveedorBanda(
    filas: { nombre: string; n: number; km: number; precio: number | null; precioN: number; cpk: number | null }[],
    promedio: number,
    columna: string,
  ) {
    return (
      <div className="table-wrap">
        <table>
          <thead><tr><th>{columna}</th><th className="num">Recapados</th><th className="num">Km logrados</th><th className="num">Precio (12m)</th><th className="num">ARS/km</th></tr></thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.nombre}>
                <td className="admin-name">{f.nombre}</td>
                <td className="num">{f.n}</td>
                <td className="num">{num(f.km)}</td>
                <td className="num">{f.precio !== null ? `$${num(f.precio)}` : <span title="Sin recapados de este proveedor/banda en los últimos 12 meses del archivo">—</span>}</td>
                <td className="num">
                  {f.cpk !== null ? <span className="badge" style={claseDesvioCpk(f.cpk, promedio)}>{num(f.cpk, 2)}</span> : '—'}
                </td>
              </tr>
            ))}
            {filas.length === 0 && <tr><td className="empty" colSpan={5}>Sin datos suficientes (mínimo 5 recapados).</td></tr>}
          </tbody>
        </table>
      </div>
    );
  }

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

      <HistorialReportes
        tipo="cubiertas"
        refreshKey={historialKey}
        onCargar={(datos, nombre) => {
          // Entradas viejas del historial guardaron un array plano de
          // cubiertas (sin historial de recapados); las nuevas guardan
          // {cubiertas, historial} — soportamos las dos.
          if (Array.isArray(datos)) {
            setCubiertas(datos as Cubierta[]);
            setHistorial([]);
          } else {
            const d = datos as unknown as { cubiertas: Cubierta[]; historial: RecapEvento[] };
            setCubiertas(d.cubiertas || []);
            setHistorial(d.historial || []);
          }
          setNombreArchivo(nombre);
          setErrorArchivo('');
        }}
      />

      {cubiertas.length === 0 ? null : (
        <>
          {puntosClave.length > 0 && (
            <div className="card" style={{ background: 'var(--panel2)', borderLeft: '4px solid var(--brand)' }}>
              <h2>Puntos clave</h2>
              <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.9 }}>
                {puntosClave.map((p, i) => <li key={i}>{p}</li>)}
              </ul>
            </div>
          )}

          <div className="card">
            <h2>Resumen del parque</h2>
            <div className="summary-grid">
              <div className="stat"><div className="lbl">Total registros</div><div className="val">{num(total)}</div></div>
              <div className="stat"><div className="lbl">Activas</div><div className="val">{num(activas.length)}</div></div>
              <div className="stat"><div className="lbl">Desmontadas (stock)</div><div className="val">{num(desmontadas.length)}</div></div>
              <div className="stat"><div className="lbl">Bajas sin recapar</div><div className="val" style={pctBajaSinRecap >= 50 ? { color: 'var(--err)' } : undefined}>{pctBajaSinRecap}%</div></div>
              <div className="stat"><div className="lbl">Sin clasificar</div><div className="val">{num(otras.length)}</div></div>
            </div>
            <div className="hint" style={{ marginTop: 6 }}>
              {bajas.length} bajas en total. "Sin clasificar" son registros cuyo campo Estado no coincide con ninguno de los 3 patrones reconocidos (montada en unidad, desmontada, dada de baja) — probablemente carga histórica con otro criterio; no entran en ninguna cuenta de arriba. El color en las tablas de abajo es el desvío contra el promedio de esta misma muestra, no un umbral fijo.
            </div>
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
            {usaRecapadoReal ? (
              <div className="hint" style={{ marginBottom: 10 }}>
                Km reales recorridos entre eventos de recapado de <strong>la misma cubierta</strong> (del historial detallado del archivo) — solo se cuentan etapas ya cerradas, no la banda que está puesta ahora mismo.
              </div>
            ) : (
              <div className="hint" style={{ marginBottom: 10 }}>
                Aproximado: km mediano de cubiertas agrupadas por su cantidad de recapados actual (compara cubiertas distintas entre sí). Subí un archivo con la hoja "Historial detallado" para ver el dato real por cubierta.
              </div>
            )}
            <div className="summary-grid">
              {stepsAMostrar.map((s, i) => {
                const prev = i > 0 ? stepsAMostrar[i - 1].km : null;
                const ganancia = prev ? Math.round(((s.km - prev) / prev) * 100) : null;
                return (
                  <div className="stat" key={s.k}>
                    <div className="lbl">{etiquetaEtapa(s.k)}</div>
                    <div className="val">{num(s.km)} km</div>
                    {ganancia !== null && (
                      <div className="hint" style={{ color: ganancia > 3 ? 'var(--ok)' : 'var(--err)', marginTop: 2 }}>
                        {ganancia >= 0 ? '+' : ''}{ganancia}% vs. etapa anterior
                      </div>
                    )}
                  </div>
                );
              })}
              {stepsAMostrar.length === 0 && <div className="hint">Sin datos suficientes.</div>}
            </div>
          </div>

          {usaRecapadoReal && (proveedorStats.length > 0 || bandaStats.length > 0) && (
            <div className="card">
              <h2>Proveedores y bandas de recapado</h2>
              <div className="hint" style={{ marginBottom: 10 }}>
                Del historial real, agrupado por quién hizo cada recapado y qué banda usó (mínimo 5 recapados para entrar). El km es de todo el historial; el precio y el ARS/km solo cuentan lo pagado en los últimos 12 meses del archivo — con inflación, mezclar precios de años distintos da una comparación falsa. Ordenado de mejor a peor ARS/km, el primero de cada tabla es la referencia a seguir.
              </div>
              <div className="grid2">
                <div>
                  <h3 style={{ fontSize: 13, marginBottom: 8 }}>Por proveedor</h3>
                  {tablaProveedorBanda(proveedorStats, cpkProveedorPromedio, 'Proveedor')}
                </div>
                <div>
                  <h3 style={{ fontSize: 13, marginBottom: 8 }}>Por banda</h3>
                  {tablaProveedorBanda(bandaStats, cpkBandaPromedio, 'Banda')}
                </div>
              </div>
              {mejorProveedor && (
                <div className="hint" style={{ marginTop: 10 }}>
                  💡 Mejor relación km/precio por proveedor: <strong>{mejorProveedor.nombre}</strong> (${num(mejorProveedor.cpk ?? 0, 2)}/km, {mejorProveedor.n} recapados). {peorProveedor && peorProveedor.nombre !== mejorProveedor.nombre && (
                    <>El más caro por km es <strong>{peorProveedor.nombre}</strong> (${num(peorProveedor.cpk ?? 0, 2)}/km).</>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="card">
            <h2>Costo por km</h2>
            <div className="row">
              <div className="field"><label>Cubierta nueva (ARS)</label><input type="number" step="1000" value={precioNueva} onChange={(e) => setPrecioNueva(e.target.value)} /></div>
              <div className="field"><label>Recapado (ARS)</label><input type="number" step="1000" value={precioRecap} onChange={(e) => setPrecioRecap(e.target.value)} /></div>
              <div className="field"><label>Tipo de cambio (ARS/USD)</label><input type="number" step="1" value={tipoCambio} onChange={(e) => setTipoCambio(e.target.value)} /></div>
            </div>
            {precioRecapReal !== null && (
              <div className="hint" style={{ marginTop: 6 }}>
                Precio de recapado real, últimos 12 meses del archivo: mediana ${num(precioRecapReal)} ({eventosRecapReal} recapados) — ya precargado arriba, se puede editar para simular otro valor.
              </div>
            )}
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
