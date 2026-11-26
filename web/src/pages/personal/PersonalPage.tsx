import { useEffect, useState } from 'react';
import { pb } from '../../lib/pb';
import { useToast } from '../../lib/ToastContext';
import { useConfirm } from '../../lib/ConfirmContext';
import { fechaSola } from '../../lib/format';
import { hhmmAMinutos, fmtDur, MOTIVOS_BAJA } from '../fichadas/motor';
import { cambiarBasicoLegajo } from '../../lib/basicoHistorial';
import { ChoferesTab } from './ChoferesTab';
import type { Chofer, DiaHorario, FichadasCategoria, FichadasEmpresa, FichadasHorario, FichadasLegajo, HoraExtraFija, SueldosBasicoHistorial } from '../../types';

const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const SUB_TABS = [
  { id: 'empleados', label: 'Empleados' },
  { id: 'horario_personal', label: 'Horario personalizado' },
  { id: 'horas_fijas', label: 'Horas extra fijas' },
  { id: 'plantillas', label: 'Plantillas de horario' },
  { id: 'areas', label: 'Áreas' },
] as const;
type SubTabId = typeof SUB_TABS[number]['id'];

export function PersonalPage() {
  const [subTab, setSubTab] = useState<SubTabId>('empleados');
  const [empresas, setEmpresas] = useState<FichadasEmpresa[]>([]);
  const [horarios, setHorarios] = useState<FichadasHorario[]>([]);
  const [legajos, setLegajos] = useState<FichadasLegajo[]>([]);
  const [categorias, setCategorias] = useState<FichadasCategoria[]>([]);
  const [tick, setTick] = useState(0);
  const refrescar = () => setTick((t) => t + 1);
  const toast = useToast();

  useEffect(() => {
    (async () => {
      try {
        const [e, h, l, c] = await Promise.all([
          pb.collection('fichadas_empresas').getFullList<FichadasEmpresa>({ sort: 'nombre' }),
          pb.collection('fichadas_horarios').getFullList<FichadasHorario>({ sort: 'nombre' }),
          pb.collection('fichadas_legajos').getFullList<FichadasLegajo>({ sort: 'nombre' }),
          pb.collection('fichadas_categorias').getFullList<FichadasCategoria>({ sort: 'nombre' }),
        ]);
        setEmpresas(e); setHorarios(h); setLegajos(l); setCategorias(c);
      } catch (err) {
        toast('No se pudo cargar Personal: ' + (err instanceof Error ? err.message : ''), 'err');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  return (
    <main>
      <div className="card">
        <h2>Personal</h2>
        <div className="hint">Empleados nuevos, cambios de horario, plantillas y áreas — sin depender de un nuevo export de CINTIA.</div>
        <div className="row" style={{ marginTop: 12 }}>
          {SUB_TABS.map((t) => (
            <button key={t.id} className={subTab === t.id ? 'small' : 'small secondary'} onClick={() => setSubTab(t.id)}>{t.label}</button>
          ))}
        </div>
        <div style={{ marginTop: 14 }}>
          {subTab === 'empleados' && <EmpleadosSub empresas={empresas} horarios={horarios} legajos={legajos} categorias={categorias} version={tick} onChanged={refrescar} />}
          {subTab === 'horario_personal' && <HorarioPersonalSub legajos={legajos} onChanged={refrescar} />}
          {subTab === 'horas_fijas' && <HorasFijasSub legajos={legajos} onChanged={refrescar} />}
          {subTab === 'plantillas' && <PlantillasSub horarios={horarios} legajos={legajos} onChanged={refrescar} />}
          {subTab === 'areas' && <AreasSub empresas={empresas} legajos={legajos} onChanged={refrescar} />}
        </div>
      </div>
    </main>
  );
}

// ---------- Empleados ----------

function EmpleadosSub({ empresas, horarios, legajos, categorias, version, onChanged }: { empresas: FichadasEmpresa[]; horarios: FichadasHorario[]; legajos: FichadasLegajo[]; categorias: FichadasCategoria[]; version: number; onChanged: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [nroLegajo, setNroLegajo] = useState('');
  const [nroTarjeta, setNroTarjeta] = useState('');
  const [nombre, setNombre] = useState('');
  const [empresa, setEmpresa] = useState(empresas[0]?.id || '');
  const [horario, setHorario] = useState(horarios[0]?.id || '');
  const [fechaAlta, setFechaAlta] = useState('');
  const [idEnBaja, setIdEnBaja] = useState<string | null>(null);
  const [fechaBaja, setFechaBaja] = useState('');
  const [motivoBaja, setMotivoBaja] = useState('');
  const [idEnReingreso, setIdEnReingreso] = useState<string | null>(null);
  const [fechaAltaNueva, setFechaAltaNueva] = useState('');
  const [idCambiandoCategoria, setIdCambiandoCategoria] = useState<string | null>(null);
  const [categoriaNueva, setCategoriaNueva] = useState('');
  const [vigenciaDesde, setVigenciaDesde] = useState('');
  const [guardandoCategoria, setGuardandoCategoria] = useState(false);
  const [idViendoHistorial, setIdViendoHistorial] = useState<string | null>(null);
  const [historialTramos, setHistorialTramos] = useState<SueldosBasicoHistorial[]>([]);
  const [choferes, setChoferes] = useState<Chofer[]>([]);
  const [tipoFiltro, setTipoFiltro] = useState<'todos' | 'administrativos' | 'choferes'>('todos');

  useEffect(() => { if (!empresa && empresas[0]) setEmpresa(empresas[0].id); }, [empresas, empresa]);
  useEffect(() => { if (!horario && horarios[0]) setHorario(horarios[0].id); }, [horarios, horario]);
  // Para distinguir Administrativo/Chofer en la tabla -- un legajo es
  // "chofer" si algún choferes.legajo apunta a él (ver
  // docs/superpowers/specs/2026-11-25-choferes-vinculo-legajo-design.md).
  useEffect(() => {
    pb.collection('choferes').getFullList<Chofer>()
      .then(setChoferes)
      .catch((e) => toast('No se pudieron cargar los choferes: ' + (e instanceof Error ? e.message : ''), 'err'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const legajosDeChofer = new Set(choferes.map((c) => c.legajo).filter(Boolean));
  const legajosFiltrados = legajos.filter((l) => {
    if (tipoFiltro === 'todos') return true;
    const esChofer = legajosDeChofer.has(l.id);
    return tipoFiltro === 'choferes' ? esChofer : !esChofer;
  });

  async function agregar() {
    if (!nroTarjeta.trim() || !nombre.trim()) { toast('Completá al menos N° Tarjeta y Nombre.', 'warn'); return; }
    try {
      await pb.collection('fichadas_legajos').create({
        nro_legajo: nroLegajo.trim(), nro_tarjeta: nroTarjeta.trim(), nombre: nombre.trim().toUpperCase(),
        empresa: empresa || null, horario: horario || null, estado: true, fecha_alta: fechaAlta || null,
      });
      setNroLegajo(''); setNroTarjeta(''); setNombre(''); setFechaAlta('');
      onChanged();
      toast('Empleado agregado.', 'ok');
    } catch (e) {
      toast('Error: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }

  // El primer tramo de vigencia de básico de un legajo arranca en su
  // fecha_alta (backfill o primera asignación de categoría en Personal) --
  // si después se corrige la fecha_alta, ese primer tramo queda
  // desincronizado si no se actualiza acá. Nunca toca un tramo posterior
  // (un cambio de categoría real, no relacionado con la fecha de alta).
  async function sincronizarPrimerTramo(legajoId: string, nuevaFechaAlta: string) {
    let tramos: SueldosBasicoHistorial[] = [];
    try {
      tramos = await pb.collection('sueldos_basico_historial').getFullList<SueldosBasicoHistorial>({
        filter: pb.filter('legajo = {:l}', { l: legajoId }),
        sort: 'vigencia_desde',
      });
    } catch { /* sin historial todavía */ }
    if (!tramos.length) return;
    const [primero, segundo] = tramos;
    if (primero.vigencia_desde === nuevaFechaAlta) return;
    if (segundo && nuevaFechaAlta >= segundo.vigencia_desde) {
      toast('La fecha de alta no se movió en el historial de básico porque cae después de un cambio de categoría ya cargado — revisalo en "Ver historial" si hace falta.', 'warn');
      return;
    }
    try {
      await pb.collection('sueldos_basico_historial').update(primero.id, { vigencia_desde: nuevaFechaAlta });
    } catch (e) {
      toast('No se pudo actualizar el historial de básico: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }

  async function editar(id: string, campo: string, valor: string | boolean) {
    if (campo === 'fecha_alta' && typeof valor === 'string' && valor) {
      const legajo = legajos.find((l) => l.id === id);
      if (legajo?.fecha_baja && valor > legajo.fecha_baja) {
        toast('La fecha de alta no puede ser posterior a la fecha de baja de este legajo.', 'warn');
        return;
      }
    }
    try {
      await pb.collection('fichadas_legajos').update(id, { [campo]: valor });
      if (campo === 'fecha_alta' && typeof valor === 'string' && valor) {
        await sincronizarPrimerTramo(id, valor);
      }
      onChanged();
    } catch (e) {
      toast('Error: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }

  async function abrirHistorial(legajoId: string) {
    setIdViendoHistorial(legajoId);
    setHistorialTramos([]);
    try {
      const tramos = await pb.collection('sueldos_basico_historial').getFullList<SueldosBasicoHistorial>({
        filter: pb.filter('legajo = {:l}', { l: legajoId }),
        sort: '-vigencia_desde',
      });
      setHistorialTramos(tramos);
    } catch (e) {
      toast('No se pudo cargar el historial: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }

  function abrirBaja(id: string) {
    setIdEnBaja(id);
    setFechaBaja('');
    setMotivoBaja('');
  }

  async function confirmarBaja() {
    if (!idEnBaja) return;
    if (!fechaBaja || !motivoBaja) { toast('Completá fecha y motivo de la baja.', 'warn'); return; }
    const hoyIso = new Date().toISOString().slice(0, 10);
    if (fechaBaja > hoyIso) { toast('La fecha de baja no puede ser futura — cargala el día que sea efectiva.', 'warn'); return; }
    const legajo = legajos.find((l) => l.id === idEnBaja);
    if (legajo?.fecha_alta && fechaBaja <= legajo.fecha_alta) {
      toast('La fecha de baja tiene que ser posterior a la fecha de alta de este legajo.', 'warn');
      return;
    }
    try {
      await pb.collection('fichadas_legajos').update(idEnBaja, { fecha_baja: fechaBaja, motivo_baja: motivoBaja, estado: false });
      setIdEnBaja(null);
      onChanged();
      toast('Baja registrada.', 'ok');
    } catch (e) {
      toast('Error: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }

  function abrirReingreso(id: string) {
    setIdEnReingreso(id);
    setFechaAltaNueva('');
  }

  async function confirmarReingreso() {
    if (!idEnReingreso) return;
    if (!fechaAltaNueva) { toast('Completá la fecha de alta del reingreso.', 'warn'); return; }
    const legajo = legajos.find((l) => l.id === idEnReingreso);
    if (!legajo) return;
    // la fecha nueva tiene que ser posterior a la baja que se está cerrando --
    // si no, las dos etapas se superpondrían y el motor contaría esos días
    // dos veces (una por cada etapa).
    if (legajo.fecha_baja && fechaAltaNueva <= legajo.fecha_baja) {
      toast('La fecha de alta del reingreso tiene que ser posterior a la fecha de baja anterior.', 'warn');
      return;
    }
    try {
      // guarda la etapa que se cierra (fecha_alta/fecha_baja/motivo_baja
      // actuales) antes de pisarlos con los datos del reingreso -- si no,
      // se pierde el egreso viejo del historial de Rotación. Un legajo
      // legacy sin fecha_baja cargada (de antes de que este campo
      // existiera) no tiene ningún egreso real que guardar -- se salta el
      // historial y se abre la etapa nueva directo, igual que hacía el
      // botón de un clic de antes.
      if (legajo.fecha_baja && legajo.motivo_baja) {
        // si ya existe una fila de historial para esta misma baja (ej: un
        // reintento después de que la escritura de más abajo fallara a
        // mitad de camino la vez anterior), no la duplicamos.
        let yaExiste = false;
        try {
          await pb.collection('fichadas_legajo_historial').getFirstListItem(
            pb.filter('legajo = {:l} && fecha_baja = {:b}', { l: idEnReingreso, b: legajo.fecha_baja })
          );
          yaExiste = true;
        } catch { /* no existía */ }
        if (!yaExiste) {
          await pb.collection('fichadas_legajo_historial').create({
            legajo: idEnReingreso,
            fecha_alta: legajo.fecha_alta || null,
            fecha_baja: legajo.fecha_baja,
            motivo_baja: legajo.motivo_baja,
          });
        }
      }
      await pb.collection('fichadas_legajos').update(idEnReingreso, {
        fecha_alta: fechaAltaNueva, fecha_baja: null, motivo_baja: null, estado: true,
      });
      setIdEnReingreso(null);
      onChanged();
      toast('Reingreso registrado.', 'ok');
    } catch (e) {
      toast('Error: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }

  function abrirCambioCategoria(l: FichadasLegajo) {
    setIdCambiandoCategoria(l.id);
    setCategoriaNueva(l.categoria || '');
    setVigenciaDesde(l.categoria ? '' : (l.fecha_alta || ''));
  }

  async function confirmarCambioCategoria() {
    if (!idCambiandoCategoria) return;
    if (!categoriaNueva) { toast('Elegí una categoría.', 'warn'); return; }
    if (!vigenciaDesde) { toast('Completá la fecha de vigencia.', 'warn'); return; }
    const categoria = categorias.find((c) => c.id === categoriaNueva);
    setGuardandoCategoria(true);
    try {
      const resultado = await cambiarBasicoLegajo({
        legajoId: idCambiandoCategoria, categoriaId: categoriaNueva,
        basicoSugerido: categoria?.basico_sugerido, vigenciaDesde,
      });
      if (!resultado.ok) { toast(resultado.error, 'warn'); return; }
      setIdCambiandoCategoria(null);
      onChanged();
      toast('Categoría y básico actualizados.', 'ok');
    } catch (e) {
      toast('Error: ' + (e instanceof Error ? e.message : ''), 'err');
    } finally {
      setGuardandoCategoria(false);
    }
  }

  async function eliminar(id: string) {
    if (!(await confirm('¿Eliminar este empleado? Mejor usar "Dar de baja" si solo dejó de trabajar, para no perder su historial de fichadas.', 'Eliminar empleado'))) return;
    try {
      await pb.collection('fichadas_legajos').delete(id);
      onChanged();
      toast('Eliminado.', 'ok');
    } catch (e) {
      toast('Error: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }

  const legajoEnBaja = legajos.find((l) => l.id === idEnBaja);
  const legajoEnReingreso = legajos.find((l) => l.id === idEnReingreso);

  return (
    <>
      <h3 style={{ fontSize: 13, color: 'var(--accent)', margin: '0 0 8px' }}>Agregar empleado nuevo</h3>
      <div className="row">
        <div className="field"><label>N° Legajo</label><input value={nroLegajo} onChange={(e) => setNroLegajo(e.target.value)} /></div>
        <div className="field"><label>N° Tarjeta</label><input value={nroTarjeta} onChange={(e) => setNroTarjeta(e.target.value)} placeholder="Suele ser igual al legajo" /></div>
        <div className="field" style={{ flex: 2 }}><label>Nombre</label><input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="APELLIDO NOMBRE" /></div>
        <div className="field"><label>Área</label><select value={empresa} onChange={(e) => setEmpresa(e.target.value)}>{empresas.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}</select></div>
        <div className="field"><label>Horario</label><select value={horario} onChange={(e) => setHorario(e.target.value)}>{horarios.map((h) => <option key={h.id} value={h.id}>{h.nombre}</option>)}</select></div>
        <div className="field"><label>Fecha de alta</label><input type="date" value={fechaAlta} onChange={(e) => setFechaAlta(e.target.value)} /></div>
        <button onClick={agregar}>Agregar</button>
      </div>

      {legajoEnBaja && (
        <>
          <h3 style={{ fontSize: 13, color: 'var(--accent)', margin: '18px 0 8px' }}>Dar de baja a "{legajoEnBaja.nombre}"</h3>
          <div className="row">
            <div className="field"><label>Fecha de baja</label><input type="date" value={fechaBaja} onChange={(e) => setFechaBaja(e.target.value)} /></div>
            <div className="field">
              <label>Motivo</label>
              <select value={motivoBaja} onChange={(e) => setMotivoBaja(e.target.value)}>
                <option value="">Elegir…</option>
                {MOTIVOS_BAJA.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <button onClick={confirmarBaja}>Confirmar baja</button>
            <button className="secondary" onClick={() => setIdEnBaja(null)}>Cancelar</button>
          </div>
        </>
      )}

      {legajoEnReingreso && (
        <>
          <h3 style={{ fontSize: 13, color: 'var(--accent)', margin: '18px 0 8px' }}>Reincorporar a "{legajoEnReingreso.nombre}"</h3>
          <div className="hint">Se guarda la etapa anterior (con su fecha de baja y motivo) en el historial de esa persona, y arranca una nueva con la fecha que pongas acá.</div>
          <div className="row" style={{ marginTop: 6 }}>
            <div className="field"><label>Fecha de alta (nueva)</label><input type="date" value={fechaAltaNueva} onChange={(e) => setFechaAltaNueva(e.target.value)} /></div>
            <button onClick={confirmarReingreso}>Confirmar reingreso</button>
            <button className="secondary" onClick={() => setIdEnReingreso(null)}>Cancelar</button>
          </div>
        </>
      )}

      {idCambiandoCategoria && (() => {
        const l = legajos.find((x) => x.id === idCambiandoCategoria);
        return (
          <>
            <h3 style={{ fontSize: 13, color: 'var(--accent)', margin: '18px 0 8px' }}>
              {l?.categoria ? 'Cambiar categoría de' : 'Asignar categoría a'} "{l?.nombre}"
            </h3>
            <div className="hint">El básico se toma automáticamente del "Básico sugerido" de la categoría elegida (Sueldos → Categorías) — ya no se edita a mano.</div>
            <div className="row" style={{ marginTop: 6 }}>
              <div className="field">
                <label>Categoría</label>
                <select value={categoriaNueva} onChange={(e) => setCategoriaNueva(e.target.value)}>
                  <option value="">Elegir…</option>
                  {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
              <div className="field"><label>Vigente desde</label><input type="date" value={vigenciaDesde} onChange={(e) => setVigenciaDesde(e.target.value)} /></div>
              <button onClick={confirmarCambioCategoria} disabled={guardandoCategoria}>{guardandoCategoria ? 'Guardando…' : 'Confirmar'}</button>
              <button className="secondary" onClick={() => setIdCambiandoCategoria(null)}>Cancelar</button>
            </div>
          </>
        );
      })()}

      {idViendoHistorial && (() => {
        const l = legajos.find((x) => x.id === idViendoHistorial);
        return (
          <>
            <h3 style={{ fontSize: 13, color: 'var(--accent)', margin: '18px 0 8px' }}>Historial de básico de "{l?.nombre}"</h3>
            <div className="table-wrap" style={{ maxHeight: 220 }}>
              <table>
                <thead><tr><th>Categoría</th><th className="num">Básico</th><th>Vigente desde</th><th>Vigente hasta</th></tr></thead>
                <tbody>
                  {historialTramos.map((t) => (
                    <tr key={t.id}>
                      <td>{categorias.find((c) => c.id === t.categoria)?.nombre || '—'}</td>
                      <td className="num">{t.basico.toLocaleString('es-AR')}</td>
                      <td>{fechaSola(t.vigencia_desde)}</td>
                      <td>{t.vigencia_hasta ? fechaSola(t.vigencia_hasta) : 'Actual'}</td>
                    </tr>
                  ))}
                  {!historialTramos.length && <tr><td colSpan={4} style={{ color: 'var(--muted)' }}>Sin historial todavía.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="row" style={{ marginTop: 8 }}>
              <button className="secondary" onClick={() => setIdViendoHistorial(null)}>Cerrar</button>
            </div>
          </>
        );
      })()}

      <h3 style={{ fontSize: 13, color: 'var(--accent)', margin: '18px 0 8px' }}>Empleados cargados ({legajosFiltrados.length})</h3>
      <div className="row" style={{ marginBottom: 8 }}>
        <div className="field">
          <label>Tipo</label>
          <select value={tipoFiltro} onChange={(e) => setTipoFiltro(e.target.value as typeof tipoFiltro)}>
            <option value="todos">Todos</option>
            <option value="administrativos">Administrativos</option>
            <option value="choferes">Choferes</option>
          </select>
        </div>
      </div>
      <div className="table-wrap" style={{ maxHeight: '50vh' }}>
        <table>
          <thead><tr><th>Legajo</th><th>Tarjeta</th><th>Nombre</th><th>Tipo</th><th>Área</th><th>Horario</th><th>Fecha alta</th><th>Categoría</th><th>Básico</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            {legajosFiltrados.map((l) => (
              <tr key={l.id} className={!l.estado ? 'inactivo' : ''}>
                <td>{l.nro_legajo}</td>
                <td>{l.nro_tarjeta}</td>
                <td className="admin-name">{l.nombre}</td>
                <td>{legajosDeChofer.has(l.id) ? 'Chofer' : 'Administrativo'}</td>
                <td>
                  <select value={l.empresa || ''} onChange={(e) => editar(l.id, 'empresa', e.target.value)}>
                    {empresas.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                  </select>
                </td>
                <td>
                  <select value={l.horario || ''} onChange={(e) => editar(l.id, 'horario', e.target.value)}>
                    {horarios.map((h) => <option key={h.id} value={h.id}>{h.nombre}</option>)}
                  </select>
                </td>
                <td>
                  <input type="date" value={l.fecha_alta || ''} onChange={(e) => editar(l.id, 'fecha_alta', e.target.value)} />
                </td>
                <td>
                  {categorias.find((c) => c.id === l.categoria)?.nombre || 'Sin categoría'}{' '}
                  <button className="small secondary" onClick={() => abrirCambioCategoria(l)}>
                    {l.categoria ? 'Cambiar' : 'Asignar'}
                  </button>{' '}
                  <button className="small secondary" onClick={() => abrirHistorial(l.id)}>Ver historial</button>
                </td>
                <td className="num">{l.basico != null ? l.basico.toLocaleString('es-AR') : '—'}</td>
                <td>
                  {l.estado
                    ? <button className="small secondary" onClick={() => abrirBaja(l.id)}>Dar de baja</button>
                    : (
                      <span title={l.fecha_baja ? `${l.motivo_baja || ''} — ${fechaSola(l.fecha_baja)}` : ''}>
                        Inactivo <button className="small secondary" onClick={() => abrirReingreso(l.id)}>Reactivar</button>
                      </span>
                    )}
                </td>
                <td><button className="small danger" onClick={() => eliminar(l.id)}>Eliminar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 24 }}>
        <ChoferesTab version={version} onChanged={onChanged} />
      </div>
    </>
  );
}

// ---------- edición de 7 días (compartida por Horario personalizado y Plantillas) ----------

function EditorDias({ diasIniciales, onGuardar, guardando }: { diasIniciales: DiaHorario[]; onGuardar: (dias: DiaHorario[]) => void; guardando: boolean }) {
  const toast = useToast();
  const [libre, setLibre] = useState<boolean[]>(() => DIAS_SEMANA.map((_, i) => {
    const f = diasIniciales.find((d) => d.dia === i + 1);
    return !f || !f.trabaja || !f.pares.length;
  }));
  const [cortado, setCortado] = useState<boolean[]>(() => DIAS_SEMANA.map((_, i) => {
    const f = diasIniciales.find((d) => d.dia === i + 1);
    return (f?.pares.length ?? 0) > 1;
  }));
  const [entrada, setEntrada] = useState<string[]>(() => DIAS_SEMANA.map((_, i) => {
    const f = diasIniciales.find((d) => d.dia === i + 1);
    return f?.pares[0] ? fmtDur(f.pares[0][0]) : '';
  }));
  const [salida, setSalida] = useState<string[]>(() => DIAS_SEMANA.map((_, i) => {
    const f = diasIniciales.find((d) => d.dia === i + 1);
    return f?.pares[0] ? fmtDur(f.pares[0][1]) : '';
  }));
  const [entrada2, setEntrada2] = useState<string[]>(() => DIAS_SEMANA.map((_, i) => {
    const f = diasIniciales.find((d) => d.dia === i + 1);
    return f?.pares[1] ? fmtDur(f.pares[1][0]) : '';
  }));
  const [salida2, setSalida2] = useState<string[]>(() => DIAS_SEMANA.map((_, i) => {
    const f = diasIniciales.find((d) => d.dia === i + 1);
    return f?.pares[1] ? fmtDur(f.pares[1][1]) : '';
  }));

  function guardar() {
    const dias: DiaHorario[] = [];
    for (let i = 0; i < 7; i++) {
      if (libre[i]) { dias.push({ dia: i + 1, trabaja: false, pares: [] }); continue; }
      const e = hhmmAMinutos(entrada[i]);
      const s = hhmmAMinutos(salida[i]);
      if (e === null || s === null) { toast(`Revisá el horario del ${DIAS_SEMANA[i]} (formato HH:MM).`, 'warn'); return; }
      const pares: [number, number][] = [[e, s]];
      if (cortado[i]) {
        const e2 = hhmmAMinutos(entrada2[i]);
        const s2 = hhmmAMinutos(salida2[i]);
        if (e2 === null || s2 === null) { toast(`Revisá el segundo turno del ${DIAS_SEMANA[i]} (formato HH:MM).`, 'warn'); return; }
        pares.push([e2, s2]);
      }
      dias.push({ dia: i + 1, trabaja: true, pares });
    }
    onGuardar(dias);
  }

  return (
    <>
      {DIAS_SEMANA.map((nombre, i) => (
        <div key={nombre} style={{ marginBottom: 10 }}>
          <div className="row" style={{ alignItems: 'center' }}>
            <div style={{ flex: '0 0 90px', fontWeight: 600, fontSize: 12 }}>{nombre}</div>
            <div className="field"><label>Entrada</label><input value={entrada[i]} disabled={libre[i]} placeholder="HH:MM" onChange={(e) => setEntrada((a) => a.map((v, idx) => idx === i ? e.target.value : v))} /></div>
            <div className="field"><label>Salida</label><input value={salida[i]} disabled={libre[i]} placeholder="HH:MM" onChange={(e) => setSalida((a) => a.map((v, idx) => idx === i ? e.target.value : v))} /></div>
            <label style={{ fontSize: 12, fontWeight: 400 }}>
              <input type="checkbox" checked={libre[i]} onChange={(e) => setLibre((a) => a.map((v, idx) => idx === i ? e.target.checked : v))} /> No trabaja
            </label>
            {!libre[i] && (
              <label style={{ fontSize: 12, fontWeight: 400 }}>
                <input type="checkbox" checked={cortado[i]} onChange={(e) => setCortado((a) => a.map((v, idx) => idx === i ? e.target.checked : v))} /> Turno cortado
              </label>
            )}
          </div>
          {!libre[i] && cortado[i] && (
            <div className="row" style={{ alignItems: 'center', marginTop: 4 }}>
              <div style={{ flex: '0 0 90px' }} />
              <div className="field"><label>Entrada (2)</label><input value={entrada2[i]} placeholder="HH:MM" onChange={(e) => setEntrada2((a) => a.map((v, idx) => idx === i ? e.target.value : v))} /></div>
              <div className="field"><label>Salida (2)</label><input value={salida2[i]} placeholder="HH:MM" onChange={(e) => setSalida2((a) => a.map((v, idx) => idx === i ? e.target.value : v))} /></div>
            </div>
          )}
        </div>
      ))}
      <button onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar días'}</button>
      <div className="hint" style={{ marginTop: 6 }}>"Turno cortado" agrega un segundo Entrada/Salida ese día (ej: entra a la mañana, sale, vuelve a la tarde).</div>
    </>
  );
}

// ---------- Horario personalizado (por empleado) ----------

function HorarioPersonalSub({ legajos, onChanged }: { legajos: FichadasLegajo[]; onChanged: () => void }) {
  const toast = useToast();
  const [idLegajo, setIdLegajo] = useState(legajos[0]?.id || '');
  const [guardando, setGuardando] = useState(false);
  useEffect(() => { if (!idLegajo && legajos[0]) setIdLegajo(legajos[0].id); }, [legajos, idLegajo]);

  const legajo = legajos.find((l) => l.id === idLegajo);
  const diasActuales = legajo?.dias_personalizados ?? legajo?.expand?.horario?.dias ?? [];

  async function guardar(dias: DiaHorario[]) {
    setGuardando(true);
    try {
      await pb.collection('fichadas_legajos').update(idLegajo, { dias_personalizados: dias });
      toast('Horario guardado.', 'ok');
      onChanged();
    } catch (e) {
      toast('Error: ' + (e instanceof Error ? e.message : ''), 'err');
    } finally {
      setGuardando(false);
    }
  }

  async function quitarPersonalizado() {
    setGuardando(true);
    try {
      await pb.collection('fichadas_legajos').update(idLegajo, { dias_personalizados: null });
      toast('Vuelve a usar el horario de la plantilla.', 'ok');
      onChanged();
    } catch (e) {
      toast('Error: ' + (e instanceof Error ? e.message : ''), 'err');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <>
      <div className="row">
        <div className="field" style={{ flex: 2 }}>
          <label>Empleado</label>
          <select value={idLegajo} onChange={(e) => setIdLegajo(e.target.value)}>
            {legajos.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
          </select>
        </div>
        {legajo?.dias_personalizados != null && (
          <div className="field" style={{ flex: '0 0 auto', alignSelf: 'end' }}>
            <button className="small secondary" onClick={quitarPersonalizado} disabled={guardando}>Volver a usar la plantilla</button>
          </div>
        )}
      </div>
      {legajo && (
        <div style={{ marginTop: 14 }} key={idLegajo}>
          <EditorDias diasIniciales={diasActuales} onGuardar={guardar} guardando={guardando} />
        </div>
      )}
    </>
  );
}

// ---------- Horas extra fijas (por empleado) ----------

function HorasFijasSub({ legajos, onChanged }: { legajos: FichadasLegajo[]; onChanged: () => void }) {
  const toast = useToast();
  const [idLegajo, setIdLegajo] = useState(legajos[0]?.id || '');
  const [guardando, setGuardando] = useState(false);
  useEffect(() => { if (!idLegajo && legajos[0]) setIdLegajo(legajos[0].id); }, [legajos, idLegajo]);

  const legajo = legajos.find((l) => l.id === idLegajo);

  async function guardar(horas: HoraExtraFija[], desde: string) {
    setGuardando(true);
    try {
      await pb.collection('fichadas_legajos').update(idLegajo, {
        horas_extra_fijas: horas.length ? horas : null,
        horas_extra_fijas_desde: desde || null,
      });
      toast('Horas extra fijas guardadas.', 'ok');
      onChanged();
    } catch (e) {
      toast('Error: ' + (e instanceof Error ? e.message : ''), 'err');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <>
      <div className="hint">Un monto de horas que se suma siempre a las horas extra calculadas de esa persona, para el día de la semana elegido — haya fichado ese día o no. Dejar un día en blanco significa que no tiene nada fijo ese día.</div>
      <div className="row" style={{ marginTop: 10 }}>
        <div className="field" style={{ flex: 2 }}>
          <label>Empleado</label>
          <select value={idLegajo} onChange={(e) => setIdLegajo(e.target.value)}>
            {legajos.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
          </select>
        </div>
      </div>
      {legajo && (
        <div style={{ marginTop: 14 }} key={idLegajo}>
          <EditorHorasFijas horasIniciales={legajo.horas_extra_fijas || []} desdeInicial={legajo.horas_extra_fijas_desde || ''} onGuardar={guardar} guardando={guardando} />
        </div>
      )}
    </>
  );
}

function EditorHorasFijas({ horasIniciales, desdeInicial, onGuardar, guardando }: { horasIniciales: HoraExtraFija[]; desdeInicial: string; onGuardar: (horas: HoraExtraFija[], desde: string) => void; guardando: boolean }) {
  const toast = useToast();
  const [valores, setValores] = useState<string[]>(() => DIAS_SEMANA.map((_, i) => {
    const f = horasIniciales.find((h) => h.dia === i + 1);
    return f ? String(f.horas).replace('.', ',') : '';
  }));
  const [desde, setDesde] = useState(desdeInicial);

  function guardar() {
    const horas: HoraExtraFija[] = [];
    for (let i = 0; i < 7; i++) {
      const txt = valores[i].trim();
      if (!txt) continue;
      const n = Number(txt.replace(',', '.'));
      if (!isFinite(n) || n <= 0 || n > 24) { toast(`Revisá las horas del ${DIAS_SEMANA[i]}.`, 'warn'); return; }
      horas.push({ dia: i + 1, horas: n });
    }
    onGuardar(horas, desde);
  }

  return (
    <>
      <div className="field" style={{ marginBottom: 10, maxWidth: 200 }}>
        <label>Vigente desde</label>
        <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
      </div>
      <div className="hint" style={{ marginBottom: 10 }}>Vacío: las horas fijas se aplican siempre, sin fecha de corte (igual que antes de este campo).</div>
      {DIAS_SEMANA.map((nombre, i) => (
        <div key={nombre} className="row" style={{ alignItems: 'center', marginBottom: 6 }}>
          <div style={{ flex: '0 0 90px', fontWeight: 600, fontSize: 12 }}>{nombre}</div>
          <div className="field" style={{ flex: '0 0 100px' }}>
            <input
              value={valores[i]}
              placeholder="0"
              onChange={(e) => setValores((a) => a.map((v, idx) => idx === i ? e.target.value : v))}
            />
          </div>
          <div className="hint" style={{ margin: 0 }}>horas</div>
        </div>
      ))}
      <button onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar horas fijas'}</button>
    </>
  );
}

// ---------- Plantillas de horario ----------

function PlantillasSub({ horarios, legajos, onChanged }: { horarios: FichadasHorario[]; legajos: FichadasLegajo[]; onChanged: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [nombreNueva, setNombreNueva] = useState('');
  const [editando, setEditando] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function crear() {
    if (!nombreNueva.trim()) { toast('Ponele un nombre a la plantilla.', 'warn'); return; }
    try {
      const rec = await pb.collection('fichadas_horarios').create<FichadasHorario>({
        nombre: nombreNueva.trim(),
        dias: Array.from({ length: 7 }, (_, i) => ({ dia: i + 1, trabaja: false, pares: [] })),
      });
      setNombreNueva('');
      onChanged();
      setEditando(rec.id);
    } catch (e) {
      toast('Error: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }

  async function eliminar(id: string, usados: number) {
    if (usados > 0) { toast(`No se puede eliminar: ${usados} empleado(s) todavía usan esta plantilla. Reasignalos primero desde Empleados.`, 'warn'); return; }
    if (!(await confirm('¿Eliminar esta plantilla de horario?', 'Eliminar plantilla'))) return;
    try {
      await pb.collection('fichadas_horarios').delete(id);
      onChanged();
      toast('Eliminada.', 'ok');
    } catch (e) {
      toast('Error: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }

  async function guardarDias(dias: DiaHorario[]) {
    if (!editando) return;
    setGuardando(true);
    try {
      await pb.collection('fichadas_horarios').update(editando, { dias });
      toast('Plantilla guardada.', 'ok');
      onChanged();
    } catch (e) {
      toast('Error: ' + (e instanceof Error ? e.message : ''), 'err');
    } finally {
      setGuardando(false);
    }
  }

  const horarioEditando = horarios.find((h) => h.id === editando);

  return (
    <>
      <h3 style={{ fontSize: 13, color: 'var(--accent)', margin: '0 0 8px' }}>Nueva plantilla</h3>
      <div className="row">
        <div className="field" style={{ flex: 2 }}><label>Nombre</label><input value={nombreNueva} onChange={(e) => setNombreNueva(e.target.value)} placeholder="Ej: Corrido - Entrada 09:00" /></div>
        <button onClick={crear}>Crear (después definís los días)</button>
      </div>

      <h3 style={{ fontSize: 13, color: 'var(--accent)', margin: '18px 0 8px' }}>Plantillas ({horarios.length})</h3>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Nombre</th><th>Empleados que la usan</th><th></th></tr></thead>
          <tbody>
            {horarios.map((h) => {
              const usados = legajos.filter((l) => l.horario === h.id).length;
              return (
                <tr key={h.id}>
                  <td className="admin-name">{h.nombre}</td>
                  <td>{usados}</td>
                  <td>
                    <button className="small secondary" onClick={() => setEditando(editando === h.id ? null : h.id)}>{editando === h.id ? 'Cerrar' : 'Editar días'}</button>
                    <button className="small danger" onClick={() => eliminar(h.id, usados)}>Eliminar</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {horarioEditando && (
        <div style={{ marginTop: 14 }} key={horarioEditando.id}>
          <h3 style={{ fontSize: 13, color: 'var(--accent)' }}>Días de "{horarioEditando.nombre}"</h3>
          <EditorDias diasIniciales={horarioEditando.dias} onGuardar={guardarDias} guardando={guardando} />
        </div>
      )}
    </>
  );
}

// ---------- Áreas ----------

function AreasSub({ empresas, legajos, onChanged }: { empresas: FichadasEmpresa[]; legajos: FichadasLegajo[]; onChanged: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [nombreNueva, setNombreNueva] = useState('');

  async function crear() {
    if (!nombreNueva.trim()) { toast('Ponele un nombre al área.', 'warn'); return; }
    try {
      await pb.collection('fichadas_empresas').create({ nombre: nombreNueva.trim() });
      setNombreNueva('');
      onChanged();
    } catch (e) {
      toast('Error: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }

  async function renombrar(id: string, nombre: string) {
    try {
      await pb.collection('fichadas_empresas').update(id, { nombre });
      onChanged();
    } catch (e) {
      toast('Error: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }

  async function eliminar(id: string, usados: number) {
    if (usados > 0) { toast(`No se puede eliminar: ${usados} empleado(s) pertenecen a esta área. Reasignalos primero desde Empleados.`, 'warn'); return; }
    if (!(await confirm('¿Eliminar esta área?', 'Eliminar área'))) return;
    try {
      await pb.collection('fichadas_empresas').delete(id);
      onChanged();
      toast('Eliminada.', 'ok');
    } catch (e) {
      toast('Error: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }

  return (
    <>
      <h3 style={{ fontSize: 13, color: 'var(--accent)', margin: '0 0 8px' }}>Nueva área</h3>
      <div className="row">
        <div className="field" style={{ flex: 2 }}><label>Nombre</label><input value={nombreNueva} onChange={(e) => setNombreNueva(e.target.value)} placeholder="Ej: DEPOSITO NUEVO" /></div>
        <button onClick={crear}>Agregar</button>
      </div>
      <h3 style={{ fontSize: 13, color: 'var(--accent)', margin: '18px 0 8px' }}>Áreas ({empresas.length})</h3>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Nombre</th><th>Empleados</th><th></th></tr></thead>
          <tbody>
            {empresas.map((a) => {
              const usados = legajos.filter((l) => l.empresa === a.id).length;
              return (
                <tr key={a.id}>
                  <td><input defaultValue={a.nombre} onBlur={(e) => { if (e.target.value.trim() && e.target.value !== a.nombre) renombrar(a.id, e.target.value.trim()); }} /></td>
                  <td>{usados}</td>
                  <td><button className="small danger" onClick={() => eliminar(a.id, usados)}>Eliminar</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
