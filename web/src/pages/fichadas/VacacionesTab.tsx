import { useEffect, useMemo, useState } from 'react';
import { pb } from '../../lib/pb';
import { useToast } from '../../lib/ToastContext';
import { useConfirm } from '../../lib/ConfirmContext';
import { calcularResumenVacaciones, detectarSolapamientoGrupo } from './motor';
import type { FichadasEmpresa, FichadasGrupoRestriccion, FichadasLegajo, FichadasVacacion } from '../../types';

type Vista = 'lista' | 'por_legajo';

function fmtDias(n: number | null): string {
  if (n === null) return '—';
  const r = Math.round(n * 10) / 10;
  return r % 1 === 0 ? String(r) : r.toFixed(1);
}

function diasDelPeriodo(desde: string, hasta: string): number {
  return Math.round((new Date(hasta + 'T00:00:00Z').getTime() - new Date(desde + 'T00:00:00Z').getTime()) / 86400000) + 1;
}

export function VacacionesTab() {
  const toast = useToast();
  const confirm = useConfirm();
  const [vista, setVista] = useState<Vista>('lista');
  const [anio, setAnio] = useState(() => new Date().getFullYear());
  const [legajos, setLegajos] = useState<FichadasLegajo[]>([]);
  const [empresas, setEmpresas] = useState<FichadasEmpresa[]>([]);
  const [vacaciones, setVacaciones] = useState<FichadasVacacion[]>([]);
  const [grupos, setGrupos] = useState<FichadasGrupoRestriccion[]>([]);
  const [areaFiltro, setAreaFiltro] = useState('');
  const [tick, setTick] = useState(0);
  const refrescar = () => setTick((t) => t + 1);

  const [idLegajoNuevo, setIdLegajoNuevo] = useState('');
  const [desdeNuevo, setDesdeNuevo] = useState('');
  const [hastaNuevo, setHastaNuevo] = useState('');
  const [comentarioNuevo, setComentarioNuevo] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [l, e, v, g] = await Promise.all([
          pb.collection('fichadas_legajos').getFullList<FichadasLegajo>({ sort: 'nombre' }),
          pb.collection('fichadas_empresas').getFullList<FichadasEmpresa>({ sort: 'nombre' }),
          pb.collection('fichadas_vacaciones').getFullList<FichadasVacacion>({ sort: 'desde' }),
          pb.collection('fichadas_grupos_restriccion').getFullList<FichadasGrupoRestriccion>(),
        ]);
        setLegajos(l); setEmpresas(e); setVacaciones(v); setGrupos(g);
      } catch (err) {
        toast('No se pudo cargar Vacaciones: ' + (err instanceof Error ? err.message : ''), 'err');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  useEffect(() => { if (!idLegajoNuevo && legajos[0]) setIdLegajoNuevo(legajos[0].id); }, [legajos, idLegajoNuevo]);

  const empresaNombrePorId = useMemo(() => new Map(empresas.map((e) => [e.id, e.nombre])), [empresas]);
  const legajoPorId = useMemo(() => new Map(legajos.map((l) => [l.id, l])), [legajos]);

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

  return (
    <div className="card">
      <h2>Vacaciones</h2>
      <div className="hint">Días por antigüedad, asignación de períodos y control de notificación — reemplaza los Excel de licencias que arma RRHH a mano.</div>

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
                      <td><button className="small danger" onClick={() => eliminarPeriodo(v.id)}>Eliminar</button></td>
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
    </div>
  );
}
