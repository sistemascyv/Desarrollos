import { Fragment, useEffect, useState } from 'react';
import { pb } from '../../lib/pb';
import { useToast } from '../../lib/ToastContext';
import { isoDate } from '../../lib/format';
import {
  procesarPeriodo, calcularEstadisticaHorasExtras, calcularEstadisticaAusentismo,
  type FilaEstadisticaArea, type FilaEstadisticaCausa,
} from './motor';
import type { FichadasConfiguracion, FichadasEmpresa, FichadasFeriado, FichadasLegajo, FichadasMarca, FichadasNovedad } from '../../types';

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
type Vista = 'horas_extras' | 'ausentismo';

function fmtHs(n: number): string {
  return n.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}
function fmtPct(n: number): string {
  return (n * 100).toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
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
      // ex-empleados: no inventar horas extra fijas para períodos posteriores a su baja
      const legajosParaCalculo = legajosTodos.map((l) => (l.estado ? l : { ...l, horas_extra_fijas: null }));
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

      const { filas: fAus, total: tAus } = calcularEstadisticaAusentismo({
        resultados, dotacionTotal, horasPosiblesMensuales: n, mesesTranscurridos,
      });
      setFilasAusentismo(fAus);
      setTotalAusentismo(tAus);
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

  const hayDatos = vista === 'horas_extras' ? (filasHorasExtras && totalHorasExtras) : (filasAusentismo && totalAusentismo);

  return (
    <div className="card">
      <h2>Estadísticas</h2>
      <div className="hint">Resumen anual por área/causa — reemplaza las planillas que arma RRHH a mano.</div>

      <div className="row" style={{ marginTop: 14, flexWrap: 'wrap', alignItems: 'end' }}>
        <div className="field">
          <label>Ver</label>
          <select value={vista} onChange={(e) => setVista(e.target.value as Vista)}>
            <option value="horas_extras">Horas Extras</option>
            <option value="ausentismo">Ausentismo</option>
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
      </div>

      {hayDatos && (
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
      {!hayDatos && !cargando && <div className="empty" style={{ marginTop: 16 }}>Elegí un año y apretá "Calcular".</div>}
    </div>
  );
}
