import { useEffect, useMemo, useState } from 'react';
import { pb } from '../../lib/pb';
import { useToast } from '../../lib/ToastContext';
import { useConfirm } from '../../lib/ConfirmContext';
import {
  calcularHorasExtraPromedioPorLegajo, calcularLiquidacionVacaciones, calcularResumenVacaciones,
  detectarSolapamientoGrupo, partirPeriodoPorMes, procesarPeriodo,
  type TramoLiquidacion,
} from '../fichadas/motor';
import type {
  FichadasCategoria, FichadasEmpresa, FichadasFeriado, FichadasGrupoRestriccion, FichadasLegajo,
  FichadasMarca, FichadasNovedad, FichadasVacacion, HistorialLegajo,
} from '../../types';

type Vista = 'lista' | 'por_legajo';

function fmtDias(n: number | null): string {
  if (n === null) return '—';
  const r = Math.round(n * 10) / 10;
  return r % 1 === 0 ? String(r) : r.toFixed(1);
}

function fmtMoneda(n: number): string {
  return n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function diasDelPeriodo(desde: string, hasta: string): number {
  return Math.round((new Date(hasta + 'T00:00:00Z').getTime() - new Date(desde + 'T00:00:00Z').getTime()) / 86400000) + 1;
}

// Mes inmediatamente anterior a `anioMes` ("YYYY-MM" -> "YYYY-MM" del mes previo).
function mesAnterior(anioMes: string): string {
  const [y, m] = anioMes.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  d.setUTCMonth(d.getUTCMonth() - 1);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

interface ResultadoLiquidacion {
  vacacionId: string;
  nombreLegajo: string;
  nombreCategoria: string;
  basico: number;
  horasExtraPromedio: number;
  tramos: TramoLiquidacion[];
  bruto: number;
  totalDescuentos: number;
  neto: number;
}

export function AsignarVacacionesSub() {
  const toast = useToast();
  const confirm = useConfirm();
  const [vista, setVista] = useState<Vista>('lista');
  const [anio, setAnio] = useState(() => new Date().getFullYear());
  const [legajos, setLegajos] = useState<FichadasLegajo[]>([]);
  const [empresas, setEmpresas] = useState<FichadasEmpresa[]>([]);
  const [vacaciones, setVacaciones] = useState<FichadasVacacion[]>([]);
  const [grupos, setGrupos] = useState<FichadasGrupoRestriccion[]>([]);
  const [categorias, setCategorias] = useState<FichadasCategoria[]>([]);
  const [areaFiltro, setAreaFiltro] = useState('');
  const [tick, setTick] = useState(0);
  const refrescar = () => setTick((t) => t + 1);

  const [idLegajoNuevo, setIdLegajoNuevo] = useState('');
  const [desdeNuevo, setDesdeNuevo] = useState('');
  const [hastaNuevo, setHastaNuevo] = useState('');
  const [comentarioNuevo, setComentarioNuevo] = useState('');
  const [guardando, setGuardando] = useState(false);

  const [liquidando, setLiquidando] = useState<string | null>(null);
  const [liquidacion, setLiquidacion] = useState<ResultadoLiquidacion | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [l, e, v, g, c] = await Promise.all([
          pb.collection('fichadas_legajos').getFullList<FichadasLegajo>({ sort: 'nombre' }),
          pb.collection('fichadas_empresas').getFullList<FichadasEmpresa>({ sort: 'nombre' }),
          pb.collection('fichadas_vacaciones').getFullList<FichadasVacacion>({ sort: 'desde' }),
          pb.collection('fichadas_grupos_restriccion').getFullList<FichadasGrupoRestriccion>(),
          pb.collection('fichadas_categorias').getFullList<FichadasCategoria>({ sort: 'nombre' }),
        ]);
        setLegajos(l); setEmpresas(e); setVacaciones(v); setGrupos(g); setCategorias(c);
      } catch (err) {
        toast('No se pudo cargar Vacaciones: ' + (err instanceof Error ? err.message : ''), 'err');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  useEffect(() => { if (!idLegajoNuevo && legajos[0]) setIdLegajoNuevo(legajos[0].id); }, [legajos, idLegajoNuevo]);

  const empresaNombrePorId = useMemo(() => new Map(empresas.map((e) => [e.id, e.nombre])), [empresas]);
  const legajoPorId = useMemo(() => new Map(legajos.map((l) => [l.id, l])), [legajos]);
  const categoriaPorId = useMemo(() => new Map(categorias.map((c) => [c.id, c])), [categorias]);

  const legajosParaResumen = useMemo(
    () => legajos.filter((l) => l.estado || vacaciones.some((v) => v.legajo === l.id && v.anio === anio)),
    [legajos, vacaciones, anio]
  );
  const resumen = useMemo(
    () => calcularResumenVacaciones({ legajos: legajosParaResumen, vacaciones, empresaNombrePorId, anio }),
    [legajosParaResumen, vacaciones, empresaNombrePorId, anio]
  );

  const periodosDelAnio = useMemo(() => {
    return vacaciones
      .filter((v) => v.anio === anio)
      .filter((v) => !areaFiltro || legajoPorId.get(v.legajo)?.empresa === areaFiltro)
      .sort((a, b) => a.desde.localeCompare(b.desde));
  }, [vacaciones, anio, areaFiltro, legajoPorId]);

  async function asignarPeriodo() {
    if (!idLegajoNuevo || !desdeNuevo || !hastaNuevo) { toast('Completá empleado, desde y hasta.', 'warn'); return; }
    if (hastaNuevo < desdeNuevo) { toast('"Hasta" no puede ser anterior a "Desde".', 'warn'); return; }
    setGuardando(true);
    try {
      const creado = await pb.collection('fichadas_vacaciones').create<FichadasVacacion>({
        legajo: idLegajoNuevo, desde: desdeNuevo, hasta: hastaNuevo, anio, comentario: comentarioNuevo.trim() || null,
      });

      const legajoElegido = legajoPorId.get(idLegajoNuevo);
      if (legajoElegido) {
        const resumenLegajo = calcularResumenVacaciones({
          legajos: [legajoElegido], vacaciones: [...vacaciones, creado], empresaNombrePorId, anio,
        })[0];
        if (resumenLegajo.diasRestantes !== null && resumenLegajo.diasRestantes < 0) {
          toast(`${resumenLegajo.nombre} queda con ${fmtDias(resumenLegajo.diasRestantes)} días de exceso sobre lo que le corresponde en ${anio}.`, 'warn');
        }
      }

      const solapa = detectarSolapamientoGrupo({
        idLegajo: idLegajoNuevo, desde: desdeNuevo, hasta: hastaNuevo, grupos, vacaciones: [...vacaciones, creado], legajoPorId,
      });
      solapa.forEach((s) => {
        toast(`Se solapa con ${s.nombre} (${s.desde} a ${s.hasta}), que está en el mismo grupo de restricción.`, 'warn');
      });

      setDesdeNuevo(''); setHastaNuevo(''); setComentarioNuevo('');
      refrescar();
      toast('Período asignado.', 'ok');
    } catch (e) {
      toast('Error: ' + (e instanceof Error ? e.message : ''), 'err');
    } finally {
      setGuardando(false);
    }
  }

  async function eliminarPeriodo(id: string) {
    if (!(await confirm('¿Eliminar este período de vacaciones?', 'Eliminar período'))) return;
    try {
      await pb.collection('fichadas_vacaciones').delete(id);
      refrescar();
      toast('Eliminado.', 'ok');
    } catch (e) {
      toast('Error: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }

  async function toggleNotificado(v: FichadasVacacion) {
    try {
      await pb.collection('fichadas_vacaciones').update(v.id, { notificado: !v.notificado });
      refrescar();
    } catch (e) {
      toast('Error: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }

  async function liquidarPeriodo(v: FichadasVacacion) {
    const legajo = legajoPorId.get(v.legajo);
    if (!legajo) return;
    if (!legajo.categoria || !legajo.basico) {
      toast('Para liquidar, completá Categoría y Básico de este legajo en Personal → Empleados.', 'warn');
      return;
    }
    const categoria = categoriaPorId.get(legajo.categoria);
    if (!categoria) { toast('No se encontró la categoría de este legajo.', 'err'); return; }
    if (!legajo.fecha_alta) { toast('Este legajo no tiene fecha de alta cargada, no se puede liquidar.', 'err'); return; }

    setLiquidando(v.id);
    try {
      const tramosMes = partirPeriodoPorMes(v.desde, v.hasta);
      const primerMes = tramosMes[0].anioMes;
      // ventana de 6 meses calendario inmediatamente anteriores al mes de inicio
      let cursor = primerMes;
      const mesesVentana: string[] = [];
      for (let i = 0; i < 6; i++) { cursor = mesAnterior(cursor); mesesVentana.push(cursor); }
      mesesVentana.sort();
      const [yIni, mIni] = mesesVentana[0].split('-').map(Number);
      const [yFin, mFin] = mesesVentana[mesesVentana.length - 1].split('-').map(Number);
      const desdeVentana = `${yIni}-${String(mIni).padStart(2, '0')}-01`;
      const ultimoDiaFin = new Date(Date.UTC(yFin, mFin, 0)).getUTCDate();
      const hastaVentana = `${yFin}-${String(mFin).padStart(2, '0')}-${String(ultimoDiaFin).padStart(2, '0')}`;

      const [marcas, novedades, feriados, historial, legajoConHorario] = await Promise.all([
        pb.collection('fichadas_marcas').getFullList<FichadasMarca>({ filter: pb.filter('fecha >= {:d} && fecha <= {:h}', { d: desdeVentana, h: hastaVentana }) }),
        pb.collection('fichadas_novedades').getFullList<FichadasNovedad>({ filter: pb.filter('fecha >= {:d} && fecha <= {:h}', { d: desdeVentana, h: hastaVentana }) }),
        pb.collection('fichadas_feriados').getFullList<FichadasFeriado>({ filter: pb.filter('fecha >= {:d} && fecha <= {:h}', { d: desdeVentana, h: hastaVentana }) }),
        pb.collection('fichadas_legajo_historial').getFullList<HistorialLegajo>(),
        pb.collection('fichadas_legajos').getOne<FichadasLegajo>(legajo.id, { expand: 'horario' }),
      ]);
      const { resultados } = procesarPeriodo({
        legajos: [legajoConHorario], marcas, novedades, feriados, historial, empresaNombrePorId,
        desde: desdeVentana, hasta: hastaVentana,
      });
      const horasExtraPromedio = calcularHorasExtraPromedioPorLegajo(resultados, legajo.id, primerMes, 6);

      const resultado = calcularLiquidacionVacaciones({
        basico: legajo.basico, fechaAlta: legajo.fecha_alta, categoria, horasExtraPromedio,
        desde: v.desde, hasta: v.hasta,
      });
      if (!resultado) { toast('No se pudo calcular la liquidación.', 'err'); return; }
      setLiquidacion({ vacacionId: v.id, nombreLegajo: legajo.nombre, nombreCategoria: categoria.nombre, ...resultado });
    } catch (e) {
      toast('Error al liquidar: ' + (e instanceof Error ? e.message : ''), 'err');
    } finally {
      setLiquidando(null);
    }
  }

  return (
    <div className="card">
      <h2>Vacaciones</h2>
      <div className="hint">Días por antigüedad, asignación de períodos, liquidación y control de notificación — reemplaza los Excel de licencias que arma RRHH a mano.</div>

      <div className="row" style={{ marginTop: 14, flexWrap: 'wrap', alignItems: 'end' }}>
        <div className="field">
          <label>Ver</label>
          <select value={vista} onChange={(e) => setVista(e.target.value as Vista)}>
            <option value="lista">Lista por fecha</option>
            <option value="por_legajo">Por legajo</option>
          </select>
        </div>
        <div className="field">
          <label>Año</label>
          <input type="number" min={2020} max={new Date().getFullYear() + 2} value={anio} onChange={(e) => setAnio(Number(e.target.value))} style={{ width: 90 }} />
        </div>
        {vista === 'lista' && (
          <div className="field">
            <label>Área</label>
            <select value={areaFiltro} onChange={(e) => setAreaFiltro(e.target.value)}>
              <option value="">Todas</option>
              {empresas.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
            </select>
          </div>
        )}
      </div>

      <h3 style={{ fontSize: 13, color: 'var(--navy)', margin: '18px 0 8px' }}>Asignar período</h3>
      <div className="row">
        <div className="field" style={{ flex: 2 }}>
          <label>Empleado</label>
          <select value={idLegajoNuevo} onChange={(e) => setIdLegajoNuevo(e.target.value)}>
            {legajos.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
          </select>
        </div>
        <div className="field"><label>Desde</label><input type="date" value={desdeNuevo} onChange={(e) => setDesdeNuevo(e.target.value)} /></div>
        <div className="field"><label>Hasta</label><input type="date" value={hastaNuevo} onChange={(e) => setHastaNuevo(e.target.value)} /></div>
        <div className="field" style={{ flex: 2 }}><label>Comentario</label><input value={comentarioNuevo} onChange={(e) => setComentarioNuevo(e.target.value)} placeholder="Opcional" /></div>
        <button onClick={asignarPeriodo} disabled={guardando}>{guardando ? 'Guardando…' : 'Asignar'}</button>
      </div>

      {vista === 'lista' && (
        <>
          <h3 style={{ fontSize: 13, color: 'var(--navy)', margin: '18px 0 8px' }}>Períodos de {anio} ({periodosDelAnio.length})</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Legajo</th><th>Nombre</th><th>Área</th><th>Desde</th><th>Hasta</th><th>Días</th><th>Comentario</th><th>Notificado</th><th></th></tr></thead>
              <tbody>
                {periodosDelAnio.map((v) => {
                  const l = legajoPorId.get(v.legajo);
                  return (
                    <tr key={v.id}>
                      <td>{l?.nro_legajo || '—'}</td>
                      <td className="admin-name">{l?.nombre || '—'}</td>
                      <td>{l?.empresa ? (empresaNombrePorId.get(l.empresa) || '—') : '—'}</td>
                      <td>{v.desde}</td>
                      <td>{v.hasta}</td>
                      <td className="num">{diasDelPeriodo(v.desde, v.hasta)}</td>
                      <td>{v.comentario || ''}</td>
                      <td><input type="checkbox" checked={!!v.notificado} onChange={() => toggleNotificado(v)} /></td>
                      <td>
                        <button className="small secondary" onClick={() => liquidarPeriodo(v)} disabled={liquidando === v.id}>
                          {liquidando === v.id ? 'Calculando…' : 'Liquidar'}
                        </button>
                        <button className="small danger" onClick={() => eliminarPeriodo(v.id)}>Eliminar</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {periodosDelAnio.length === 0 && <div className="empty" style={{ marginTop: 16 }}>Sin períodos asignados en {anio}.</div>}
        </>
      )}

      {vista === 'por_legajo' && (
        <>
          <h3 style={{ fontSize: 13, color: 'var(--navy)', margin: '18px 0 8px' }}>Resumen por legajo — {anio}</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Legajo</th><th>Nombre</th><th>Área</th><th>Corresponden</th><th>Asignados</th><th>Restantes</th><th>Períodos</th></tr></thead>
              <tbody>
                {resumen.map((r) => (
                  <tr key={r.idLegajo}>
                    <td>{legajoPorId.get(r.idLegajo)?.nro_legajo || '—'}</td>
                    <td className="admin-name">{r.nombre}</td>
                    <td>{r.area}</td>
                    <td className="num">{fmtDias(r.diasQueCorresponden)}</td>
                    <td className="num">{fmtDias(r.diasAsignados)}</td>
                    <td className="num" style={r.diasRestantes !== null && r.diasRestantes < 0 ? { color: 'var(--warn)', fontWeight: 700 } : undefined}>{fmtDias(r.diasRestantes)}</td>
                    <td>{r.periodos.map((p) => `${p.desde} a ${p.hasta}`).join(' | ') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {liquidacion && (
        <>
          <h3 style={{ fontSize: 13, color: 'var(--navy)', margin: '18px 0 8px' }}>Liquidación — {liquidacion.nombreLegajo}</h3>
          <div className="hint" style={{ marginBottom: 8 }}>
            Categoría: {liquidacion.nombreCategoria} — Básico: ${fmtMoneda(liquidacion.basico)} — Horas extra promedio (6 meses): {liquidacion.horasExtraPromedio.toFixed(2)} hs/mes
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Mes</th><th>Días</th><th>Antig. %</th><th>Horas Extra</th><th>Antig. $</th><th>Total mensual</th><th>Por día</th>
                  <th>Vacaciones</th><th>Plus Vac.</th><th>Antig. Plus Vac.</th><th>Bruto</th>
                  <th>Jubil.</th><th>Ley 19032</th><th>Obra Soc.</th><th>ANSSAL</th><th>Sindical</th><th>Sepelio</th><th>Neto</th>
                </tr>
              </thead>
              <tbody>
                {liquidacion.tramos.map((t) => (
                  <tr key={t.anioMes}>
                    <td>{t.anioMes}</td>
                    <td className="num">{t.dias}</td>
                    <td className="num">{t.antiguedadPct}%</td>
                    <td className="num">{fmtMoneda(t.montoHorasExtra)}</td>
                    <td className="num">{fmtMoneda(t.montoAntiguedad)}</td>
                    <td className="num">{fmtMoneda(t.totalMensual)}</td>
                    <td className="num">{fmtMoneda(t.porDia)}</td>
                    <td className="num">{fmtMoneda(t.vacacionesBase)}</td>
                    <td className="num">{fmtMoneda(t.plusVacacional)}</td>
                    <td className="num">{fmtMoneda(t.antiguedadPlusVacacional)}</td>
                    <td className="num">{fmtMoneda(t.bruto)}</td>
                    <td className="num">{fmtMoneda(t.descuentoJubilacion)}</td>
                    <td className="num">{fmtMoneda(t.descuentoLey19032)}</td>
                    <td className="num">{fmtMoneda(t.descuentoObraSocial)}</td>
                    <td className="num">{fmtMoneda(t.descuentoAnsal)}</td>
                    <td className="num">{fmtMoneda(t.descuentoCuotaSindical)}</td>
                    <td className="num">{fmtMoneda(t.descuentoSeguroSepelio)}</td>
                    <td className="num" style={{ fontWeight: 700 }}>{fmtMoneda(t.neto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row" style={{ marginTop: 10, alignItems: 'center' }}>
            <div style={{ fontWeight: 700 }}>Neto total del período: ${fmtMoneda(liquidacion.neto)}</div>
            <button className="small secondary" onClick={() => setLiquidacion(null)}>Cerrar</button>
          </div>
        </>
      )}
    </div>
  );
}
