import { Fragment, useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { pb } from '../../lib/pb';
import { useToast } from '../../lib/ToastContext';
import { isoDate } from '../../lib/format';
import {
  procesarPeriodo, calcularEstadisticaHorasExtras, calcularEstadisticaAusentismo, calcularEstadisticaRotacion,
  type FilaEstadisticaArea, type FilaEstadisticaCausa, type RotacionMes, type MovimientoRotacion,
} from './motor';
import type { FichadasConfiguracion, FichadasEmpresa, FichadasFeriado, FichadasLegajo, FichadasMarca, FichadasNovedad } from '../../types';

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
type Vista = 'horas_extras' | 'ausentismo' | 'rotacion';

function fmtHs(n: number): string {
  return n.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}
function fmtPct(n: number): string {
  return (n * 100).toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
}

// ---------- Excel: números crudos (no el texto ya formateado de pantalla) ----------
type FilaExcel = (string | number | null)[];
function hs2(n: number): number { return Math.round(n * 100) / 100; }
function pct1(n: number): number { return Math.round(n * 1000) / 10; } // ej. 0.128 -> 12.8

function filaAoaHorasExtras(f: FilaEstadisticaArea): FilaExcel[] {
  const etiquetas: [string, (m: FilaEstadisticaArea['meses'][number]) => number][] = [
    ['Dot.', (m) => m.dotacion],
    ['HS', (m) => hs2(m.hs)],
    ['HS/To', (m) => pct1(m.hsTotalMes > 0 ? m.hs / m.hsTotalMes : 0)],
    ['%', (m) => pct1(m.porcentaje)],
    ['Hs/P.', (m) => hs2(m.hsPorPersona)],
  ];
  return etiquetas.map(([etiqueta, valorDe]) => [
    f.area, etiqueta,
    ...f.meses.map(valorDe),
    etiqueta === 'HS' ? hs2(f.promedioHs) : null,
    etiqueta === 'HS' ? hs2(f.totalHs) : null,
  ]);
}

function filaAoaAusentismo(f: FilaEstadisticaCausa): FilaExcel[] {
  const etiquetas: [string, (m: FilaEstadisticaCausa['meses'][number]) => number][] = [
    ['Hs', (m) => hs2(m.horas)],
    ['%', (m) => pct1(m.porcentaje)],
  ];
  return etiquetas.map(([etiqueta, valorDe]) => [
    f.causa, etiqueta,
    ...f.meses.map(valorDe),
    etiqueta === 'Hs' ? hs2(f.promedioHoras) : null,
    etiqueta === 'Hs' ? hs2(f.totalHoras) : null,
  ]);
}

export function EstadisticasTab() {
  const toast = useToast();
  const [vista, setVista] = useState<Vista>('horas_extras');
  const [anio, setAnio] = useState(() => new Date().getFullYear());
  const [horasPosibles, setHorasPosibles] = useState('192');
  const [configId, setConfigId] = useState('');
  const [guardandoConfig, setGuardandoConfig] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [filasHorasExtras, setFilasHorasExtras] = useState<FilaEstadisticaArea[] | null>(null);
  const [totalHorasExtras, setTotalHorasExtras] = useState<FilaEstadisticaArea | null>(null);
  const [filasAusentismo, setFilasAusentismo] = useState<FilaEstadisticaCausa[] | null>(null);
  const [totalAusentismo, setTotalAusentismo] = useState<FilaEstadisticaCausa | null>(null);
  const [ultimaFechaConDatos, setUltimaFechaConDatos] = useState<string | null>(null);
  const [rotacionMeses, setRotacionMeses] = useState<RotacionMes[] | null>(null);
  const [rotacionMovimientos, setRotacionMovimientos] = useState<MovimientoRotacion[] | null>(null);
  const [rotacionMesesTranscurridos, setRotacionMesesTranscurridos] = useState(12);

  useEffect(() => {
    pb.collection('fichadas_configuracion').getFullList<FichadasConfiguracion>()
      .then((items) => {
        if (items[0]) {
          setConfigId(items[0].id);
          setHorasPosibles(String(items[0].horas_posibles_mensuales));
        }
      })
      .catch((e) => toast('No se pudo cargar la configuración: ' + (e instanceof Error ? e.message : ''), 'err'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function guardarHorasPosibles() {
    const n = Number(horasPosibles.replace(',', '.'));
    if (!isFinite(n) || n <= 0) { toast('Las horas posibles tienen que ser un número mayor a cero.', 'warn'); return; }
    if (!configId) { toast('No se encontró el registro de configuración.', 'err'); return; }
    setGuardandoConfig(true);
    try {
      await pb.collection('fichadas_configuracion').update(configId, { horas_posibles_mensuales: n });
      toast('Guardado.', 'ok');
    } catch (e) {
      toast('Error: ' + (e instanceof Error ? e.message : ''), 'err');
    } finally {
      setGuardandoConfig(false);
    }
  }

  async function calcular() {
    const n = Number(horasPosibles.replace(',', '.'));
    if (!isFinite(n) || n <= 0) { toast('Las horas posibles tienen que ser un número mayor a cero.', 'warn'); return; }
    const anioActual = new Date().getFullYear();
    if (!isFinite(anio) || anio < 2000 || anio > anioActual) { toast('Elegí un año válido.', 'warn'); return; }
    setCargando(true);
    try {
      const hoy = new Date();
      const desde = isoDate(new Date(anio, 0, 1));
      const finDeAnio = new Date(anio, 11, 31);
      const hasta = isoDate(finDeAnio.getTime() > hoy.getTime() ? hoy : finDeAnio);
      const mesesTranscurridos = anio < anioActual ? 12 : hoy.getMonth() + 1;
      const [legajosTodos, marcas, novedades, feriados, empresas] = await Promise.all([
        // sin filtro estado: las horas pasadas de ex-empleados tienen que contarse igual
        pb.collection('fichadas_legajos').getFullList<FichadasLegajo>({ expand: 'empresa,horario' }),
        pb.collection('fichadas_marcas').getFullList<FichadasMarca>({ filter: pb.filter('fecha >= {:d} && fecha <= {:h}', { d: desde, h: hasta }) }),
        pb.collection('fichadas_novedades').getFullList<FichadasNovedad>({ filter: pb.filter('fecha >= {:d} && fecha <= {:h}', { d: desde, h: hasta }) }),
        pb.collection('fichadas_feriados').getFullList<FichadasFeriado>({ filter: pb.filter('fecha >= {:d} && fecha <= {:h}', { d: desde, h: hasta }) }),
        pb.collection('fichadas_empresas').getFullList<FichadasEmpresa>({ sort: 'nombre' }),
      ]);
      const empresaNombrePorId = new Map(empresas.map((e) => [e.id, e.nombre]));
      // ex-empleados SIN fecha_baja cargada (caso legacy): no inventar horas extra
      // fijas para todo el período, no hay forma de saber cuándo se fueron. Si
      // tienen fecha_baja, el recorte de ventana en procesarPeriodo ya corta sus
      // horas fijas justo después de esa fecha -- no hace falta pisarlas acá.
      const legajosParaCalculo = legajosTodos.map((l) => ((l.estado || l.fecha_baja) ? l : { ...l, horas_extra_fijas: null }));
      const { resultados } = procesarPeriodo({ legajos: legajosParaCalculo, marcas, novedades, feriados, empresaNombrePorId, desde, hasta });

      const dotacionPorArea = new Map<string, number>();
      legajosTodos.filter((l) => l.estado).forEach((l) => {
        const nombreArea = l.empresa ? empresaNombrePorId.get(l.empresa) : undefined;
        if (!nombreArea) return;
        dotacionPorArea.set(nombreArea, (dotacionPorArea.get(nombreArea) || 0) + 1);
      });
      const dotacionTotal = Array.from(dotacionPorArea.values()).reduce((a, b) => a + b, 0);

      const { filas: fHE, total: tHE } = calcularEstadisticaHorasExtras({
        resultados, areas: empresas.map((e) => e.nombre), dotacionPorArea, horasPosiblesMensuales: n, mesesTranscurridos,
      });
      setFilasHorasExtras(fHE);
      setTotalHorasExtras(tHE);

      const ultimaConDatos = marcas.length ? marcas.reduce((max, m) => (m.fecha > max ? m.fecha : max), marcas[0].fecha) : null;
      setUltimaFechaConDatos(ultimaConDatos);

      const { filas: fAus, total: tAus } = calcularEstadisticaAusentismo({
        resultados, dotacionTotal, horasPosiblesMensuales: n, mesesTranscurridos,
        ultimaFechaConDatos: ultimaConDatos || undefined,
      });
      setFilasAusentismo(fAus);
      setTotalAusentismo(tAus);

      const { meses: mesesRot, movimientos: movRot } = calcularEstadisticaRotacion({ legajos: legajosTodos, anio, mesesTranscurridos });
      setRotacionMeses(mesesRot);
      setRotacionMovimientos(movRot);
      setRotacionMesesTranscurridos(mesesTranscurridos);
    } catch (e) {
      toast('No se pudo calcular: ' + (e instanceof Error ? e.message : ''), 'err');
    } finally {
      setCargando(false);
    }
  }

  function filaTablaHorasExtras(f: FilaEstadisticaArea, destacada: boolean) {
    const etiquetas: [string, (m: FilaEstadisticaArea['meses'][number]) => string][] = [
      ['Dot.', (m) => String(m.dotacion)],
      ['HS', (m) => fmtHs(m.hs)],
      ['HS/To', (m) => fmtPct(m.hsTotalMes > 0 ? m.hs / m.hsTotalMes : 0)],
      ['%', (m) => fmtPct(m.porcentaje)],
      ['Hs/P.', (m) => fmtHs(m.hsPorPersona)],
    ];
    return (
      <>
        {etiquetas.map(([etiqueta, valorDe], i) => (
          <tr key={etiqueta} style={destacada ? { fontWeight: 700 } : undefined}>
            {i === 0 ? <td rowSpan={5} style={{ verticalAlign: 'top', fontWeight: 700 }}>{f.area}</td> : null}
            <td>{etiqueta}</td>
            {f.meses.map((m, idx) => <td key={idx} className="num">{valorDe(m)}</td>)}
            <td className="num">{etiqueta === 'HS' ? fmtHs(f.promedioHs) : ''}</td>
            <td className="num">{etiqueta === 'HS' ? fmtHs(f.totalHs) : ''}</td>
          </tr>
        ))}
      </>
    );
  }

  function filaTablaAusentismo(f: FilaEstadisticaCausa, destacada: boolean) {
    const etiquetas: [string, (m: FilaEstadisticaCausa['meses'][number]) => string][] = [
      ['Hs', (m) => fmtHs(m.horas)],
      ['%', (m) => fmtPct(m.porcentaje)],
    ];
    return (
      <>
        {etiquetas.map(([etiqueta, valorDe], i) => (
          <tr key={etiqueta} style={destacada ? { fontWeight: 700 } : undefined}>
            {i === 0 ? <td rowSpan={2} style={{ verticalAlign: 'top', fontWeight: 700 }}>{f.causa}</td> : null}
            <td>{etiqueta}</td>
            {f.meses.map((m, idx) => <td key={idx} className="num">{valorDe(m)}</td>)}
            <td className="num">{etiqueta === 'Hs' ? fmtHs(f.promedioHoras) : ''}</td>
            <td className="num">{etiqueta === 'Hs' ? fmtHs(f.totalHoras) : ''}</td>
          </tr>
        ))}
      </>
    );
  }

  function descargarExcel() {
    if (!todoCalculado || !filasHorasExtras || !totalHorasExtras || !filasAusentismo || !totalAusentismo || !rotacionMeses) return;
    const wb = XLSX.utils.book_new();

    const aoaHE: FilaExcel[] = [['Área', '', ...MESES, 'Prom.', 'Total']];
    filasHorasExtras.forEach((f) => aoaHE.push(...filaAoaHorasExtras(f)));
    aoaHE.push(...filaAoaHorasExtras(totalHorasExtras));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoaHE), 'Horas Extras');

    const aoaAus: FilaExcel[] = [['Causa', '', ...MESES, 'Prom.', 'Total']];
    filasAusentismo.forEach((f) => aoaAus.push(...filaAoaAusentismo(f)));
    aoaAus.push(...filaAoaAusentismo(totalAusentismo));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoaAus), 'Ausentismo');

    const aoaRot: FilaExcel[] = [['Métrica', ...MESES, 'Prom.', 'Total']];
    filasRotacion(rotacionMeses, rotacionMesesTranscurridos).forEach((f) => {
      aoaRot.push([
        f.etiqueta,
        ...f.valores.map((v) => (f.esPorcentaje ? pct1(v) : v)),
        f.prom !== undefined ? (f.esPorcentaje ? pct1(f.prom) : hs2(f.prom)) : null,
        f.tot !== undefined ? f.tot : null,
      ]);
    });
    aoaRot.push([]);
    aoaRot.push(['Fecha', 'Nombre', 'Tipo', 'Motivo']);
    (rotacionMovimientos || []).forEach((mv) => {
      aoaRot.push([mv.fecha, mv.nombre, mv.tipo === 'ingreso' ? 'Alta' : 'Baja', mv.motivo || '']);
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoaRot), 'Rotación');

    XLSX.writeFile(wb, `estadisticas_rrhh_${anio}.xlsx`);
  }

  function filasRotacion(meses: RotacionMes[], mesesTranscurridos: number) {
    function prom(valores: number[]) { return valores.slice(0, mesesTranscurridos).reduce((a, b) => a + b, 0) / mesesTranscurridos; }
    function total(valores: number[]) { return valores.reduce((a, b) => a + b, 0); }
    return [
      { etiqueta: 'Dotación Inicial', valores: meses.map((m) => m.dotacionInicial), prom: prom(meses.map((m) => m.dotacionInicial)) },
      { etiqueta: 'Ingresos', valores: meses.map((m) => m.ingresos), prom: prom(meses.map((m) => m.ingresos)), tot: total(meses.map((m) => m.ingresos)) },
      { etiqueta: 'Despidos', valores: meses.map((m) => m.despidos), prom: prom(meses.map((m) => m.despidos)), tot: total(meses.map((m) => m.despidos)) },
      { etiqueta: 'Renuncias', valores: meses.map((m) => m.renuncias), prom: prom(meses.map((m) => m.renuncias)), tot: total(meses.map((m) => m.renuncias)) },
      { etiqueta: 'Acuerdos', valores: meses.map((m) => m.acuerdos), prom: prom(meses.map((m) => m.acuerdos)), tot: total(meses.map((m) => m.acuerdos)) },
      { etiqueta: 'Jubilación', valores: meses.map((m) => m.jubilaciones), prom: prom(meses.map((m) => m.jubilaciones)), tot: total(meses.map((m) => m.jubilaciones)) },
      { etiqueta: 'Total Egresos', valores: meses.map((m) => m.totalEgresos), prom: prom(meses.map((m) => m.totalEgresos)), tot: total(meses.map((m) => m.totalEgresos)) },
      { etiqueta: 'Dotación Final', valores: meses.map((m) => m.dotacionFinal), prom: prom(meses.map((m) => m.dotacionFinal)) },
      { etiqueta: 'Índice de Rotación', valores: meses.map((m) => m.indiceRotacion), esPorcentaje: true, prom: prom(meses.map((m) => m.indiceRotacion)) },
    ] as { etiqueta: string; valores: number[]; esPorcentaje?: boolean; prom?: number; tot?: number }[];
  }

  const hayDatos = vista === 'horas_extras' ? !!(filasHorasExtras && totalHorasExtras)
    : vista === 'ausentismo' ? !!(filasAusentismo && totalAusentismo)
    : rotacionMeses !== null;
  const todoCalculado = !!(filasHorasExtras && totalHorasExtras && filasAusentismo && totalAusentismo && rotacionMeses);

  return (
    <div className="card">
      <h2>Estadísticas</h2>
      <div className="hint">Resumen anual por área/causa/rotación — reemplaza las planillas que arma RRHH a mano.</div>

      <div className="row" style={{ marginTop: 14, flexWrap: 'wrap', alignItems: 'end' }}>
        <div className="field">
          <label>Ver</label>
          <select value={vista} onChange={(e) => setVista(e.target.value as Vista)}>
            <option value="horas_extras">Horas Extras</option>
            <option value="ausentismo">Ausentismo</option>
            <option value="rotacion">Rotación</option>
          </select>
        </div>
        <div className="field">
          <label>Año</label>
          <input type="number" min={2015} max={new Date().getFullYear()} value={anio} onChange={(e) => setAnio(Number(e.target.value))} style={{ width: 90 }} />
        </div>
        <div className="field">
          <label>Horas posibles por mes</label>
          <input value={horasPosibles} onChange={(e) => setHorasPosibles(e.target.value)} style={{ width: 90 }} />
        </div>
        <button className="secondary" onClick={guardarHorasPosibles} disabled={guardandoConfig}>Guardar horas posibles</button>
        <button onClick={calcular} disabled={cargando}>{cargando ? 'Calculando…' : 'Calcular'}</button>
        <button className="secondary" onClick={descargarExcel} disabled={!todoCalculado}>Descargar Excel</button>
      </div>

      {hayDatos && vista === 'ausentismo' && ultimaFechaConDatos && (
        <div className="hint" style={{ marginTop: 16 }}>
          Fichadas cargadas hasta el {ultimaFechaConDatos.split('-').reverse().join('/')} — los días sin fichadas importadas todavía no se cuentan como "Sin Justificar".
        </div>
      )}

      {hayDatos && vista !== 'rotacion' && (
        <div className="table-wrap" style={{ marginTop: 16 }}>
          <table>
            <thead>
              <tr>
                <th>{vista === 'horas_extras' ? 'Área' : 'Causa'}</th><th></th>
                {MESES.map((m) => <th key={m} className="num">{m}</th>)}
                <th className="num">Prom.</th>
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {vista === 'horas_extras' && filasHorasExtras && totalHorasExtras && (
                <>
                  {filasHorasExtras.map((f) => <Fragment key={f.area}>{filaTablaHorasExtras(f, false)}</Fragment>)}
                  {filaTablaHorasExtras(totalHorasExtras, true)}
                </>
              )}
              {vista === 'ausentismo' && filasAusentismo && totalAusentismo && (
                <>
                  {filasAusentismo.map((f) => <Fragment key={f.causa}>{filaTablaAusentismo(f, false)}</Fragment>)}
                  {filaTablaAusentismo(totalAusentismo, true)}
                </>
              )}
            </tbody>
          </table>
        </div>
      )}

      {hayDatos && vista === 'rotacion' && rotacionMeses && (
        <>
          <div className="table-wrap" style={{ marginTop: 16 }}>
            <table>
              <thead>
                <tr>
                  <th colSpan={2}>Métrica</th>
                  {MESES.map((m) => <th key={m} className="num">{m}</th>)}
                  <th className="num">Prom.</th>
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {filasRotacion(rotacionMeses, rotacionMesesTranscurridos).map((f) => (
                  <tr key={f.etiqueta}>
                    <td colSpan={2} style={{ fontWeight: 700 }}>{f.etiqueta}</td>
                    {f.valores.map((v, idx) => <td key={idx} className="num">{f.esPorcentaje ? fmtPct(v) : String(v)}</td>)}
                    <td className="num">{f.prom !== undefined ? (f.esPorcentaje ? fmtPct(f.prom) : fmtHs(f.prom)) : ''}</td>
                    <td className="num">{f.tot !== undefined ? String(f.tot) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rotacionMovimientos && rotacionMovimientos.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <h3 style={{ fontSize: 13, color: 'var(--navy)', margin: '0 0 8px' }}>Movimientos del año</h3>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {rotacionMovimientos.map((mv, idx) => (
                  <li key={idx} style={{ fontSize: 12 }}>
                    {mv.fecha.split('-').reverse().join('/')} — {mv.nombre} — {mv.tipo === 'ingreso' ? 'Alta' : `Baja (${mv.motivo || 'sin motivo'})`}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {rotacionMovimientos && rotacionMovimientos.length === 0 && (
            <div className="empty" style={{ marginTop: 16 }}>Sin altas ni bajas cargadas este año.</div>
          )}
        </>
      )}
      {!hayDatos && !cargando && <div className="empty" style={{ marginTop: 16 }}>Elegí un año y apretá "Calcular".</div>}
    </div>
  );
}
